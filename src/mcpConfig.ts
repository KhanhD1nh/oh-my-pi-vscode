/**
 * MCP servers for omp sessions opened over ACP. In ACP mode omp connects only the servers the client sends with
 * session/new|load|fork — it ignores its own mcp.json there. So `/mcp list` showed the servers but tools never
 * loaded ("No MCP manager available"). This reads the same files omp reads (~/.omp/agent/mcp.json, then
 * <project>/.omp/mcp.json), resolves values the way omp does ("!command" output, ${ENV}), and returns them in ACP form.
 */
import { execFile } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** One server as ACP `session/new` takes it. */
export type AcpMcpServer =
  | { name: string; command: string; args: string[]; env: { name: string; value: string }[] }
  | { type: 'http' | 'sse'; name: string; url: string; headers: { name: string; value: string }[] }

interface Entry { type?: string; command?: string; args?: unknown; env?: Record<string, unknown>; url?: string; headers?: Record<string, unknown>; enabled?: boolean; disabled?: boolean }
interface File { mcpServers?: Record<string, Entry>; disabledServers?: unknown }

async function readJson(path: string): Promise<File | undefined> {
  try { return JSON.parse(await fs.readFile(path, 'utf8')) as File } catch { return undefined }
}

/** Shell omp runs "!command" values with: its configured shellPath, else Git Bash, else the platform shell. */
async function shell(): Promise<string | undefined> {
  try {
    const m = /^shellPath:\s*(.+)$/mu.exec(await fs.readFile(join(homedir(), '.omp', 'agent', 'config.yml'), 'utf8'))
    const p = m?.[1]?.trim().replace(/^["']|["']$/gu, '')
    if (p && existsSync(p)) return p
  } catch { /* no config */ }
  const git = 'C:\\Program Files\\Git\\bin\\bash.exe'
  return process.platform === 'win32' && existsSync(git) ? git : undefined
}

const cache = new Map<string, Promise<string>>()
/** "!cmd" → the command's trimmed stdout (cached for the extension's life, like omp's own cache); "${VAR}" → env. */
async function resolve(value: unknown, sh: string | undefined): Promise<string> {
  const v = String(value ?? '')
  if (v.length > 1 && v.startsWith('!') && !v.includes('://')) {
    const cmd = v.slice(1).trim()
    let p = cache.get(cmd)
    if (!p) {
      p = new Promise<string>(ok => {
        const done = (err: Error | null, out: string) => ok(err ? '' : String(out).trim())
        if (sh) execFile(sh, ['-c', cmd], { timeout: 30_000, windowsHide: true }, done).stdin?.end()
        else execFile(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', process.platform === 'win32' ? ['/d', '/s', '/c', cmd] : ['-c', cmd], { timeout: 30_000, windowsHide: true }, done).stdin?.end()
      })
      cache.set(cmd, p)
      // a failed command is retried next time instead of being cached as empty
      void p.then(out => { if (!out) cache.delete(cmd) })
    }
    return p
  }
  return v.replace(/\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\}/gu, (_, k: string) => process.env[k] ?? '')
}

/** Pure part: merged entries (project overrides user), minus disabled ones. */
export function mergeServers(files: (File | undefined)[]): [string, Entry][] {
  const out = new Map<string, Entry>()
  const off = new Set<string>()
  for (const f of files) {
    if (!f) continue
    for (const [name, e] of Object.entries(f.mcpServers ?? {})) if (e && typeof e === 'object') out.set(name, e)
    if (Array.isArray(f.disabledServers)) for (const n of f.disabledServers) off.add(String(n))
  }
  return [...out].filter(([n, e]) => !off.has(n) && e.enabled !== false && e.disabled !== true)
}

/** omp's MCP servers for `cwd`, ready for ACP. Servers that cannot be expressed are skipped. */
export async function ompMcpServers(cwd: string): Promise<AcpMcpServer[]> {
  const files = [await readJson(join(homedir(), '.omp', 'agent', 'mcp.json')), await readJson(join(cwd, '.omp', 'mcp.json'))]
  const sh = await shell()
  const pairs = async (o: Record<string, unknown> | undefined) => Promise.all(Object.entries(o ?? {}).map(async ([name, value]) => ({ name, value: await resolve(value, sh) })))
  const out: AcpMcpServer[] = []
  for (const [name, e] of mergeServers(files)) {
    const t = e.type === 'streamable-http' ? 'http' : e.type
    if ((t === 'http' || t === 'sse') && typeof e.url === 'string') out.push({ type: t, name, url: await resolve(e.url, sh), headers: await pairs(e.headers) })
    else if (typeof e.command === 'string') out.push({ name, command: e.command, args: Array.isArray(e.args) ? e.args.map(String) : [], env: await pairs(e.env) })
  }
  return out
}
