/** Session file fold: costs, prompts, lines changed; omp folder key. */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { folderKey, foldSession } from '../src/stats.ts'

test('folderKey matches omp layout', () => {
  assert.equal(folderKey('D:\\WorkSpace\\XE-VN'), '--D--WorkSpace-XE-VN--')
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
