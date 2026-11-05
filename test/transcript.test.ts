/** Streaming chunks merge, tool calls update in place, diffs are captured. */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { Transcript, toolDiff } from '../src/transcript.ts'

test('merges streaming chunks and keeps kinds apart', () => {
  const t = new Transcript()
  t.user('hi')
  t.apply({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'think' } })
  t.apply({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hel' } })
  t.apply({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'lo' } })
  assert.deepEqual(t.items.map(i => i.type), ['user', 'thought', 'assistant'])
  assert.equal((t.items[2] as { text: string }).text, 'Hello')
})

test('updates one tool card in place and captures output and diff', () => {
  const t = new Transcript()
  t.apply({ sessionUpdate: 'tool_call', toolCallId: 'c1', name: 'edit', title: 'Editing file', kind: 'edit', status: 'pending', rawInput: { path: 'a.txt' } })
  t.apply({
    sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'completed',
    rawOutput: { content: [{ type: 'text', text: 'ok' }], details: { path: 'D:/a.txt', oldText: 'hi', newText: 'hello' } },
  })
  assert.equal(t.items.length, 1)
  const card = t.card('c1')!
  assert.equal(card.status, 'completed')
  assert.equal(card.output, 'ok')
  assert.deepEqual(card.diff, { path: 'D:/a.txt', oldText: 'hi', newText: 'hello' })
  assert.equal(card.path, 'D:/a.txt')
})

test('reads ACP diff content blocks', () => {
  assert.deepEqual(toolDiff({ content: [{ type: 'diff', path: 'x.ts', oldText: null, newText: 'n' }] }), { path: 'x.ts', oldText: '', newText: 'n' })
  assert.equal(toolDiff({ content: [{ type: 'content', content: { type: 'text', text: 't' } }] }), undefined)
})
