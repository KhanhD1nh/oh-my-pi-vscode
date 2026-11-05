// End-to-end: drive OmpAgent against a real `omp acp` without VS Code.
import { OmpAgent } from '../src/agent.ts'
const cwd = process.argv[2]
const items = new Map()
const agent = new OmpAgent(async () => 'omp', cwd, {
  item: i => items.set(i.id, i), reset: () => items.clear(), state: () => {}, usage: (u, s) => { if (s) console.log('usage', u, '/', s) },
  permission: async (_t, opts) => opts.find(o => o.kind.startsWith('allow'))?.optionId, log: () => {},
})
await agent.ensure()
console.log('model', agent.model, 'thinking', agent.thinking, 'levels', agent.thinkingLevels.join(','), 'modes', agent.modes.map(m => m.id).join(','))
await agent.prompt('List the files here with a tool, then create note.txt containing "hi", then reply: done.')
for (const i of items.values()) console.log(i.type, i.type === 'tool' ? `${i.card.kind} ${i.card.status} ${i.card.title}${i.card.diff ? ' [diff]' : ''}` : JSON.stringify(i.text).slice(0, 80))
const sessions = await agent.listSessions()
console.log('sessions in folder:', sessions.length, sessions[0]?.sessionId === agent.sessionId)
agent.dispose(); process.exit(0)
