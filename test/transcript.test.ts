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

test('copyFrom clones items so the fork can diverge', () => {
  const a = new Transcript()
  a.user('hi')
  const b = new Transcript()
  b.copyFrom(a)
  b.user('only in fork')
  assert.equal(a.items.length, 1)
  assert.equal(b.items.length, 2)
  assert.notEqual(b.items[1]!.id, a.items[0]!.id)
})

test('todo tool result carries the full list from rawOutput.details.phases', () => {
  const t = new Transcript()
  const phases = [{ name: 'Build', tasks: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }] }]
  t.apply({ sessionUpdate: 'tool_call', toolCallId: 'x', name: 'todo', title: 'Plan', status: 'pending' })
  const it = t.apply({ sessionUpdate: 'tool_call_update', toolCallId: 'x', status: 'completed', rawOutput: { content: [], details: { phases } } })
  assert.equal(it?.type, 'tool')
  assert.deepEqual(it?.type === 'tool' ? it.card.todo : null, phases)
})

test('permission items are appended with their options', () => {
  const t = new Transcript()
  const it = t.permission('Run rm -rf build', [{ optionId: 'y', name: 'Allow', kind: 'allow_once' }])
  assert.equal(it.type, 'permission')
  assert.equal(t.items.length, 1)
})

test('truncateAt drops the prompt and everything after it', () => {
  const t = new Transcript()
  t.user('one'); const two = t.user('two')
  t.apply({ sessionUpdate: 'tool_call', toolCallId: 'k', name: 'read', title: 'Read', status: 'completed' })
  t.truncateAt(two.id)
  assert.deepEqual(t.items.map(i => i.type === 'user' ? i.text : i.type), ['one'])
  assert.equal(t.card('k'), undefined)
})

test('times: prompt sent, reply start/end with the turn start, tool duration', () => {
  const t = new Transcript()
  const u = t.user('go')
  const r = t.apply({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } })
  t.apply({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: ' there' } })
  t.apply({ sessionUpdate: 'tool_call', toolCallId: 'k', name: 'read', title: 'Read', status: 'in_progress' })
  const done = t.apply({ sessionUpdate: 'tool_call_update', toolCallId: 'k', status: 'completed' })
  assert.ok(u.type === 'user' && typeof u.at === 'number')
  assert.ok(r?.type === 'assistant' && r.since === (u as { at: number }).at && typeof r.end === 'number' && r.end >= (r.at ?? 0))
  assert.ok(done?.type === 'tool' && typeof done.card.startedAt === 'number' && typeof done.card.endedAt === 'number')
})

test('bash cards waiting for a passphrase are flagged; ordinary ones are not', () => {
  const t = new Transcript()
  t.apply({ sessionUpdate: 'tool_call', toolCallId: 's', name: 'bash', kind: 'execute', title: 'ssh', status: 'in_progress', rawInput: { command: 'ssh -p 2222 admin@h', pty: true } })
  const waiting = t.apply({ sessionUpdate: 'tool_call_update', toolCallId: 's', content: [{ type: 'content', content: { type: 'text', text: "Enter passphrase for key '/home/u/.ssh/id_ed25519': " } }] })
  assert.equal(waiting?.type === 'tool' ? waiting.card.needsInput : null, 'SSH key passphrase')
  const ok = t.apply({ sessionUpdate: 'tool_call', toolCallId: 'g', name: 'bash', kind: 'execute', title: 'git', status: 'completed', rawInput: { command: 'git status' } })
  assert.equal(ok?.type === 'tool' ? ok.card.needsInput : 'x', undefined)
})
