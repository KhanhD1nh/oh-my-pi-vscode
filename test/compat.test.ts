/** Bundled omp extensions install/update rules and the session-format check, against a temp HOME. */
import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const home = mkdtempSync(join(tmpdir(), 'omp-compat-'))
process.env.USERPROFILE = home
process.env.HOME = home
// Loaded after HOME is pointed at the temp dir, so ~/.omp resolves there.
const load = () => import('../src/compat.ts')

const src = mkdtempSync(join(tmpdir(), 'omp-src-'))
writeFileSync(join(src, 'vsc-rewind.ts'), 'export default function () {}\n')
writeFileSync(join(src, 'task-arg-sanitize.ts'), 'export default function () { /* sanitize */ }\n')
const target = join(home, '.omp', 'agent', 'extensions')

test('installs missing files, then does nothing when current', async () => {
  assert.deepEqual((await (await load()).installOmpExtensions(src, '1.0.0')).sort(), ['task-arg-sanitize.ts', 'vsc-rewind.ts'])
  assert.match(readFileSync(join(target, 'vsc-rewind.ts'), 'utf8'), /^\/\/ @omp-vscode-managed 1\.0\.0\n/u)
  assert.deepEqual(await (await load()).installOmpExtensions(src, '1.0.0'), [])
})

test('updates its own copy on a new version, never a file the user wrote', async () => {
  writeFileSync(join(target, 'task-arg-sanitize.ts'), '// my own tweak\nexport default function () {}\n')
  assert.deepEqual(await (await load()).installOmpExtensions(src, '1.1.0'), ['vsc-rewind.ts'])
  assert.match(readFileSync(join(target, 'task-arg-sanitize.ts'), 'utf8'), /my own tweak/u)
})

test('adopts a hand-installed copy that matches the bundled code', async () => {
  writeFileSync(join(target, 'task-arg-sanitize.ts'), 'export default function () { /* sanitize */ }\r\n')
  assert.deepEqual(await (await load()).installOmpExtensions(src, '1.1.0'), ['task-arg-sanitize.ts'])
})

test('session format: fine, changed, or nothing to check', async () => {
  const dir = join(home, 'sessions'); mkdirSync(dir, { recursive: true })
  assert.equal(await (await load()).checkSessionFormat(join(home, 'missing')), undefined)
  writeFileSync(join(dir, 'a.jsonl'), [
    JSON.stringify({ type: 'session', id: 'x' }),
    JSON.stringify({ type: 'message', message: { role: 'assistant', usage: { input: 1, output: 2, cost: { total: 0.1 } } } }),
  ].join('\n'))
  assert.equal(await (await load()).checkSessionFormat(dir), undefined)
  writeFileSync(join(dir, 'b.jsonl'), [JSON.stringify({ type: 'session', id: 'y' }), JSON.stringify({ type: 'message', message: { role: 'assistant', tokens: 3 } })].join('\n'))
  assert.match(await (await load()).checkSessionFormat(dir) ?? '', /no usage/u)
})
