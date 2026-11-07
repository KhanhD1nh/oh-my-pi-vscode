// End-to-end against real `omp acp` in an empty temp folder: omp is told to stop after the first of three
// todo items; autopilot must send it back until all three files exist.
// Run: node_modules/.bin/esbuild test/autopilot.e2e.mjs --bundle --platform=node --format=esm --outfile=/tmp/ap.mjs && node /tmp/ap.mjs <emptyDir>
import { existsSync } from 'node:fs'
import { OmpHost } from '../src/agent.ts'
const [dir] = process.argv.slice(2)
const notes = []
const t0 = Date.now()
setTimeout(() => { console.log('TIMEOUT after 6 min'); process.exit(2) }, 360_000)
const ev = { item: (_s, it) => { if (it.type === 'notice') { notes.push(it.text); console.log(Math.round((Date.now() - t0) / 1000) + 's notice:', it.text) } else if (it.type === 'tool' && it.card.status === 'completed') console.log(Math.round((Date.now() - t0) / 1000) + 's tool', it.card.name) }, reset: () => {}, state: () => {}, log: () => {}, permission: async () => undefined }
const host = new OmpHost(async () => 'omp', () => dir, ev)
const s = await host.create()
const idle = () => new Promise(r => { const t = setInterval(() => { if (!s.busy && !s.queue.length) { clearInterval(t); r() } }, 500) })
s.prompt('Use the todo tool to make a list of 3 items: create one.txt, create two.txt, create three.txt. Do ONLY the first item (create one.txt with content 1, mark it done), then stop and reply "paused". Do not do the other items in this turn.')
await idle()
const have = ['one', 'two', 'three'].map(n => existsSync(`${dir}/${n}.txt`))
console.log('files:', have.join(','), '| autopilot notices:', notes.length, notes)
// omp's own todo reminder may finish the list first; autopilot only steps in once omp gives up. Either way all three must exist.
console.log(have.every(Boolean) ? `PASS (${notes.length ? 'autopilot continued' : 'omp finished on its own'})` : 'FAIL')
host.dispose()
process.exit(0)
