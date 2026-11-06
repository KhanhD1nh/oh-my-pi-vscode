/**
 * Things this extension relies on that live outside it:
 * - two small omp extensions (bundled in omp-extensions/), installed into ~/.omp/agent/extensions;
 * - omp's session files, whose shape the usage/status features read.
 * Checked at startup so a change in omp turns a feature off with a clear message instead of wrong numbers.
 */
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Bundled omp extensions: file name → why it is needed. */
export const BUNDLED = {
  'vsc-rewind.ts': 'Fork conversation from here (/vsc-rewind)',
  'task-arg-sanitize.ts': 'subagents with GPT models (empty sourceSession, omp issue #16122)',
} as const

/** Marker the extension writes on the first line, so a user-edited copy is never overwritten. */
const MARK = '// @omp-vscode-managed '

/**
 * Copy the bundled omp extensions into ~/.omp/agent/extensions when missing or older.
 * A file without our marker is the user's own: left untouched.
 * @returns names installed or updated now.
 */
export async function installOmpExtensions(sourceDir: string, version: string): Promise<string[]> {
  const target = join(homedir(), '.omp', 'agent', 'extensions')
  await fs.mkdir(target, { recursive: true })
  const changed: string[] = []
  for (const name of Object.keys(BUNDLED)) {
    const body = await fs.readFile(join(sourceDir, name), 'utf8')
    const wanted = `${MARK}${version}\n${body}`
    let current: string | undefined
    try { current = await fs.readFile(join(target, name), 'utf8') } catch { current = undefined }
    if (current === wanted) continue
    if (current !== undefined && !current.startsWith(MARK) && !sameCode(current, body)) continue // user's own version
    await fs.writeFile(join(target, name), wanted)
    changed.push(name)
  }
  return changed
}

/** Ignore line endings and our marker when comparing a file the user installed by hand with the bundled one. */
function sameCode(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/^\/\/ @omp-vscode-managed .*\n/u, '').replace(/\r\n/gu, '\n').trim()
  return norm(a) === norm(b)
}

/**
 * Whether omp's session files still look like what the usage/status features parse.
 * Reads the newest session of `folderDir` and checks the fields those features use.
 * @returns undefined when fine (or nothing to check yet), else a short reason.
 */
export async function checkSessionFormat(folderDir: string): Promise<string | undefined> {
  let names: string[]
  try { names = (await fs.readdir(folderDir)).filter(n => n.endsWith('.jsonl')) } catch { return undefined }
  if (names.length === 0) return undefined
  const stats = await Promise.all(names.map(async n => ({ n, t: (await fs.stat(join(folderDir, n))).mtimeMs })))
  const newest = stats.sort((a, b) => b.t - a.t)[0]!.n
  const fh = await fs.open(join(folderDir, newest), 'r')
  let head: string
  try { const buf = Buffer.alloc(256 * 1024); const { bytesRead } = await fh.read(buf, 0, buf.length, 0); head = buf.subarray(0, bytesRead).toString('utf8') } finally { await fh.close() }
  let session = false, assistant = false, usage = false
  for (const line of head.split('\n')) {
    if (line[0] !== '{') continue
    let e: { type?: string; id?: unknown; message?: { role?: string; usage?: { input?: unknown; output?: unknown; cost?: { total?: unknown } } } }
    try { e = JSON.parse(line) } catch { continue }
    if (e.type === 'session' && typeof e.id === 'string') session = true
    if (e.type === 'message' && e.message?.role === 'assistant') {
      assistant = true
      const u = e.message.usage
      if (typeof u?.input === 'number' && typeof u.output === 'number' && typeof u.cost?.total === 'number') usage = true
    }
  }
  if (!session) return 'no session header'
  if (assistant && !usage) return 'assistant messages carry no usage/cost'
  return undefined
}
