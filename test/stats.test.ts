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
