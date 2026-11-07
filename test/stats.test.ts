/** Session file fold: costs, prompts, lines changed; omp folder key. */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { Fold, folderKey, foldSession, foldSteps } from '../src/stats.ts'

test('folderKey matches omp layout', () => {
  assert.equal(folderKey('D:\\code\\app'), '--D--code-app--')
})

test('foldSession sums cost, counts prompts and diff lines', () => {
  const lines = [
    JSON.stringify({ type: 'message', timestamp: '2026-11-05T09:00:00Z', message: { role: 'user', attribution: 'user' } }),
    JSON.stringify({ type: 'message', timestamp: '2026-11-05T09:00:05Z', message: { role: 'assistant', model: 'cx/gpt', duration: 4000, content: [{ type: 'toolCall' }], usage: { input: 10, output: 5, cost: { total: 0.5 } } } }),
    JSON.stringify({ type: 'model_usage', timestamp: '2026-11-05T09:00:06Z', usage: { input: 1, output: 1, cost: { total: 0.25 } } }),
    JSON.stringify({ type: 'message', timestamp: '2026-11-05T09:01:00Z', message: { role: 'toolResult', details: { diff: ' 1|a\n-2|b\n+2|c\n+3|d' } } }),
    'not json',
  ]
  const s = foldSession(lines)
  assert.equal(s.cost, 0.75)
  assert.equal(s.prompts, 1)
  assert.equal(s.tools, 1)
  assert.deepEqual([s.added, s.removed], [2, 1])
  assert.equal(s.wallMs, 60_000)
  assert.equal(s.model, 'cx/gpt')
})

test('foldSteps pairs tool calls with results', () => {
  const lines = [
    JSON.stringify({ type: 'message', message: { role: 'assistant', model: 'cx/luna', content: [{ type: 'toolCall', id: 'a', name: 'read', arguments: { i: 'Read routes' } }, { type: 'toolCall', id: 'b', name: 'grep', arguments: { pattern: 'Route' } }] } }),
    JSON.stringify({ type: 'message', message: { role: 'toolResult', toolCallId: 'a' } }),
    JSON.stringify({ type: 'message', message: { role: 'toolResult', toolCallId: 'b', isError: true } }),
    JSON.stringify({ type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: 'Found 12 routes\nmore' }] } }),
  ]
  const r = foldSteps(lines)
  assert.deepEqual(r.steps.map(s => [s.tool, s.label, s.status]), [['read', 'Read routes', 'done'], ['grep', 'Route', 'failed'], [undefined, 'Found 12 routes', 'done']])
  assert.equal(r.model, 'cx/luna')
})

test('Fold is incremental: feeding lines in two batches equals one pass', () => {
  const a = JSON.stringify({ type: 'message', message: { role: 'assistant', usage: { input: 10, output: 2, cost: { total: 0.5 } } } })
  const b = JSON.stringify({ type: 'message', message: { role: 'user', attribution: 'user' } })
  const f = new Fold(); f.line(a); const mid = f.stats(); f.line(b); f.line(a)
  assert.equal(mid.cost, 0.5)
  assert.deepEqual(f.stats(), foldSession([a, b, a]))
})

test('foldConversation keeps the assignment, thinking, replies and tool input/output in order', async () => {
  const { foldConversation } = await import('../src/stats.ts')
  const lines = [
    JSON.stringify({ type: 'message', timestamp: '2026-11-07T03:00:00Z', message: { role: 'user', content: [{ type: 'text', text: '# Target\nattendance' }] } }),
    JSON.stringify({ type: 'message', message: { role: 'assistant', model: 'cc/sonnet', content: [{ type: 'thinking', thinking: 'look at service' }, { type: 'toolCall', id: 'a', name: 'bash', arguments: { i: 'Run tests', command: 'pnpm test' } }], usage: { cost: { total: 0.5 } } } }),
    JSON.stringify({ type: 'message', message: { role: 'toolResult', toolCallId: 'a', content: [{ type: 'text', text: '14 passed' }] } }),
    JSON.stringify({ type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: 'BE done.' }] } }),
  ]
  const r = foldConversation(lines)
  assert.deepEqual(r.entries.map(e => e.kind), ['prompt', 'thinking', 'tool', 'text'])
  const tool = r.entries[2] as { input: string; output: string; status: string }
  assert.deepEqual([tool.input, tool.output, tool.status], ['pnpm test', '14 passed', 'done'])
  assert.equal(r.model, 'cc/sonnet'); assert.equal(r.cost, 0.5)
})

test('foldJobs: started by the tool result, finished by omp\'s delivery notice', async () => {
  const { foldJobs } = await import('../src/stats.ts')
  const lines = [
    JSON.stringify({ type: 'message', timestamp: '2026-11-07T03:00:00Z', message: { role: 'toolResult', content: [{ type: 'text', text: 'Backgrounded as job bg_3 (no deadline)' }], details: { async: { state: 'running', jobId: 'bg_3', type: 'bash' } } } }),
    JSON.stringify({ type: 'message', message: { role: 'toolResult', content: [{ type: 'text', text: 'Backgrounded as job bg_4' }], details: { async: { jobId: 'bg_4', type: 'bash' } } } }),
    JSON.stringify({ type: 'custom_message', customType: 'async-result', content: '<system-notice>\nBackground job bg_3 has completed. Resume your work using the result below.\n\n> tsc --noEmit\nok\n</system-notice>', details: { jobs: [{ jobId: 'bg_3', type: 'bash', status: 'completed', label: 'npm run typecheck', durationMs: 607 }] } }),
  ]
  const r = foldJobs(lines)
  assert.deepEqual(r.map(j => [j.jobId, j.status]), [['bg_3', 'completed'], ['bg_4', 'running']])
  assert.equal(r[0]!.output, '> tsc --noEmit\nok')
  assert.equal(r[0]!.durationMs, 607)
  assert.equal(r[0]!.label, 'npm run typecheck')
})

test('foldJobs reads job reports: completed output in a fence, failed output after "Error:"', async () => {
  const { foldJobs } = await import('../src/stats.ts')
  const report = '## Completed (2)\n\n### bg_22 [bash] — completed\nLabel: npm run typecheck\nDelivery: not auto-delivered\n```\n> tsc --noEmit\n```\n\n### bg_21 [bash] — failed\nLabel: npm test\nDelivery: not auto-delivered\nError: \nsrc/auth.ts(54,19): error TS2339\n\n## Still Running (0)'
  const r = foldJobs([JSON.stringify({ type: 'message', message: { role: 'toolResult', content: [{ type: 'text', text: report }] } })])
  assert.deepEqual(r.map(j => [j.jobId, j.status, j.output]), [['bg_22', 'completed', '> tsc --noEmit'], ['bg_21', 'failed', 'src/auth.ts(54,19): error TS2339']])
})

test('foldSession keeps your prompts for history search', () => {
  const line = (text: string) => JSON.stringify({ type: 'message', timestamp: '2026-11-07T00:00:00Z', message: { role: 'user', attribution: 'user', content: [{ type: 'text', text }] } })
  const s = foldSession([line('sửa chấm công'), line('kiểm tra quyền')])
  assert.ok(s.text?.includes('chấm công') && s.text.includes('kiểm tra quyền'))
})
