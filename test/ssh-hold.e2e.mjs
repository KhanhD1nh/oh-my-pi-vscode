// End-to-end against real `omp acp`: an ssh call fails for want of a key → omp must hold its turn (blocking ask)
// until the key is loaded; the extension then releases it and omp retries and finishes. No real key or server
// is touched: "ssh" is a script that prints the publickey error until a marker file exists.
// Run: esbuild test/ssh-hold.e2e.mjs --bundle --platform=node --format=esm --outfile=/tmp/sh.mjs && node /tmp/sh.mjs <emptyDir>
import { existsSync, writeFileSync } from 'node:fs'
import { OmpHost } from '../src/agent.ts'
const [dir] = process.argv.slice(2)
writeFileSync(`${dir}/fake-ssh.sh`, `#!/bin/sh\nif [ -f "${dir}/key-loaded" ]; then echo vps-prod-1; else echo "admin@10.0.0.1: Permission denied (publickey)." >&2; exit 255; fi\n`)
const t0 = Date.now(), at = () => Math.round((Date.now() - t0) / 1000) + 's'
setTimeout(() => { console.log('TIMEOUT'); process.exit(2) }, 400_000)
let held = false, s
const ev = {
  item: (_s, it) => {
    if (it.type === 'notice') console.log(at(), 'notice:', it.text)
    if (it.type === 'ask' && it.hold === 'ssh' && !it.answer && !held) {
      held = true; console.log(at(), 'omp holds its turn (ask):', it.message.slice(0, 80), JSON.stringify(it.schema).slice(0, 400))
      // you type the passphrase 20 s later
      setTimeout(() => { writeFileSync(`${dir}/key-loaded`, ''); console.log(at(), 'key loaded → released:', s.keyLoaded()) }, 20_000)
    }
  },
  reset: () => {}, state: () => {}, log: () => {}, permission: async () => undefined,
}
const host = new OmpHost(async () => 'omp', () => dir, ev)
s = await host.create()
s.prompt('Run this bash command: sh ./fake-ssh.sh   (it is our ssh login check for the server). Then tell me the hostname it printed.')
await new Promise(r => { const t = setInterval(() => { if (!s.busy && !s.queue.length) { clearInterval(t); r() } }, 1000) })
const reply = [...s.transcript.items].reverse().find(i => i.type === 'assistant')?.text ?? ''
console.log(at(), 'turn ended | held:', held, '| reply:', reply.slice(0, 140).replace(/\n/g, ' '))
console.log(held && existsSync(`${dir}/key-loaded`) && /vps-prod-1/u.test(reply) ? 'PASS' : 'FAIL')
host.dispose(); process.exit(0)
