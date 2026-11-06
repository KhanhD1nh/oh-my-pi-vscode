// End-to-end against real `omp acp`, in two empty temp folders:
// two folders (one host each), two parallel tabs, one queued prompt; then a subagent + background tool,
// with every raw tool update written to <dirA>/updates.jsonl (used to design the subagent/background UI).
// Run: node_modules/.bin/esbuild test/agent.e2e.mjs --bundle --platform=node --format=esm --outfile=/tmp/e2e.mjs
//      node /tmp/e2e.mjs <emptyDirA> <emptyDirB>
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { OmpHost, OmpSession } from '../src/agent.ts'
const [dirA, dirB] = process.argv.slice(2)
const log = `${dirA}/updates.jsonl`
const raw = OmpSession.prototype.onUpdate
OmpSession.prototype.onUpdate = function (u) {
  if (String(u.sessionUpdate).startsWith('tool_call')) appendFileSync(log, JSON.stringify(u).slice(0, 4000) + '\n')
  return raw.call(this, u)
}
// Permission prompts are declined: the test must not approve anything on the user's behalf.
const ev = { item: () => {}, reset: () => {}, state: () => {}, log: () => {}, permission: async () => undefined }
const hostA = new OmpHost(async () => 'omp', () => dirA, ev)
const hostB = new OmpHost(async () => 'omp', () => dirB, ev)
const [a1, a2, b1] = await Promise.all([hostA.create(), hostA.create(), hostB.create()])
const idle = s => new Promise(r => { const t = setInterval(() => { if (!s.busy && !s.queue.length) { clearInterval(t); r() } }, 300) })
a1.prompt('Create alpha.txt containing "1" with a tool. Reply: ok.')
a1.prompt('Now append "2" to alpha.txt. Reply: ok.') // queued while the first runs
a2.prompt('Create bravo.txt containing "B". Reply: ok.')
b1.prompt('Create charlie.txt containing "C". Reply: ok.')
console.log('parallel busy:', a1.busy, a2.busy, b1.busy, '| a1 queued:', a1.queue.length)
await Promise.all([idle(a1), idle(a2), idle(b1)])
const rd = p => existsSync(p) ? JSON.stringify(readFileSync(p, 'utf8')) : 'MISSING'
console.log('A/alpha', rd(`${dirA}/alpha.txt`), '| A/bravo', rd(`${dirA}/bravo.txt`), '| B/charlie', rd(`${dirB}/charlie.txt`), '| A/charlie (want MISSING)', rd(`${dirA}/charlie.txt`))
a2.prompt('Spawn one subagent with the task tool to list the files in this folder and report back. In parallel start a background bash service named sleeper running: node -e "setTimeout(()=>{},15000)". Then reply: done.')
await idle(a2)
console.log('tool kinds seen:', [...new Set(a2.transcript.items.filter(i => i.type === 'tool').map(i => `${i.card.kind}/${i.card.name}`))].join(', '))
hostA.dispose(); hostB.dispose(); process.exit(0)
