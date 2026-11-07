// End-to-end against real `omp acp`: a job that fails at once + a service that never ends, then `wait`.
// The watchdog logic (same functions ChatProvider uses, 30 s threshold here) must break the wait.
// Run: esbuild … --outfile=/tmp/apw.mjs && node /tmp/apw.mjs <emptyDir>
import { OmpHost } from '../src/agent.ts'
import { longWait, nudgePrompt, shouldNudge } from '../src/autopilot.ts'
import { sessionJobs } from '../src/stats.ts'
const [dir] = process.argv.slice(2)
const t0 = Date.now(), at = () => Math.round((Date.now() - t0) / 1000) + 's'
setTimeout(() => { console.log('TIMEOUT'); process.exit(2) }, 420_000)
const ev = { item: (_s, it) => { if (it.type === 'notice') console.log(at(), 'notice:', it.text); else if (it.type === 'tool' && it.card.name === 'wait' && it.card.status !== 'in_progress' && it.card.status !== 'pending') console.log(at(), 'wait ended:', it.card.status, (it.card.output ?? '').slice(0, 80)) }, reset: () => {}, state: () => {}, log: () => {}, permission: async () => undefined }
const host = new OmpHost(async () => 'omp', () => dir, ev)
const s = await host.create()
s.prompt('Do exactly this, in order, one tool call per step: 1) start a background bash service named web running: node -e "setInterval(()=>{},1000)" 2) start a background bash job running: node -e "process.exit(3)" 3) call the wait tool and read what it returns 4) then call the wait tool AGAIN with no arguments and keep waiting until something new arrives. After the second wait returns, reply "finished".')
const nudged = new Set()
const dog = setInterval(async () => {
  const w = longWait(s.transcript.items, Date.now(), 30_000)
  if (!w || nudged.has(w.id)) return
  const running = (await sessionJobs(dir, s.id)).filter(j => j.status === 'running' && j.type !== 'task').length
  if (!shouldNudge(w, running, Date.now(), 150_000)) { console.log(at(), 'wait running, jobs running:', running, '— not yet'); return }
  nudged.add(w.id); console.log(at(), 'nudging (running jobs:', running + ')')
  s.nudge(nudgePrompt(running, Math.round((Date.now() - w.startedAt) / 60_000)))
}, 5_000)
await new Promise(r => { const t = setInterval(() => { if (!s.busy && !s.queue.length) { clearInterval(t); r() } }, 1000) })
clearInterval(dog)
const reply = [...s.transcript.items].reverse().find(i => i.type === 'assistant')?.text ?? ''
console.log(at(), 'turn ended | nudged:', nudged.size, '| reply:', reply.slice(0, 120).replace(/\n/g, ' '))
console.log('RESULT', nudged.size ? 'PASS (watchdog broke the wait)' : 'omp returned without a nudge')
host.dispose(); process.exit(0)
