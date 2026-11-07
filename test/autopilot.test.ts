import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { continuePrompt, longWait, nudgePrompt, openTodos, shouldNudge } from '../src/autopilot.ts'
import type { ChatItem } from '../src/types.ts'

const todo = (statuses: string[]): ChatItem => ({ type: 'tool', id: 't-todo', card: { id: 'todo', kind: 'other', name: 'todo', title: 'todo', status: 'completed', todo: [{ name: 'p', tasks: statuses.map((s, i) => ({ content: 'task ' + i, status: s })) }] } })

test('openTodos reads the newest list only', () => {
  assert.deepEqual(openTodos([todo(['pending']), todo(['completed', 'in_progress', 'pending'])]), ['task 1', 'task 2'])
  assert.deepEqual(openTodos([todo(['completed', 'abandoned'])]), [])
  assert.deepEqual(openTodos([]), [])
  assert.ok(continuePrompt(['a', 'b']).includes('- a\n- b'))
})

test('longWait finds a running wait past the threshold', () => {
  const now = 1_000_000
  const wait = (startedAt: number, status = 'in_progress'): ChatItem => ({ type: 'tool', id: 't-w', card: { id: 'w', kind: 'other', name: 'wait', title: 'wait', status: status as 'in_progress', startedAt } })
  assert.equal(longWait([wait(now - 200_000)], now, 180_000)?.id, 'w')
  assert.equal(longWait([wait(now - 60_000)], now, 180_000), undefined)
  assert.equal(longWait([wait(now - 900_000, 'completed')], now, 180_000), undefined)
})

test('shouldNudge: at once with no job running, otherwise only past the hard limit', () => {
  const w = { id: 'w', kind: 'other', name: 'wait', title: 'w', status: 'in_progress' as const, startedAt: 0 }
  assert.equal(shouldNudge(w, 0, 200_000, 900_000), true)
  assert.equal(shouldNudge(w, 2, 200_000, 900_000), false)
  assert.equal(shouldNudge(w, 2, 950_000, 900_000), true)
  assert.match(nudgePrompt(0, 20), /no background job is running/u)
})
