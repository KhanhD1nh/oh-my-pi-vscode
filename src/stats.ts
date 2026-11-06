/**
 * Session stats read from omp's own session files (~/.omp/agent/sessions/<folder>/<ts>_<id>.jsonl):
 * cost, tokens, API time, wall time, prompts, tool calls, lines changed, model. Cached per file mtime.
 */
import { createReadStream, promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { SessionStats } from './types.ts'

const cache = new Map<string, { mtime: number; stats: SessionStats }>()

/** omp's folder key: `D:\WorkSpace\XE-VN` → `--D--WorkSpace-XE-VN--`. */
export function folderKey(cwd: string): string {
  return `--${cwd.replace(/[\\/]+$/u, '').replace(/[:\\/]/gu, '-')}--`
}

/** Fold one session file. Pure over its lines so it can be tested without disk. */
export function foldSession(lines: Iterable<string>): SessionStats {
  const s: SessionStats = { cost: 0, input: 0, output: 0, cacheRead: 0, apiMs: 0, prompts: 0, tools: 0, added: 0, removed: 0 }
  let first: number | undefined
  let last: number | undefined
  for (const line of lines) {
    if (line.length < 2 || line[0] !== '{') continue
    let e: Record<string, unknown>
    try { e = JSON.parse(line) as Record<string, unknown> } catch { continue }
    const ts = typeof e.timestamp === 'string' ? Date.parse(e.timestamp) : NaN
    if (!Number.isNaN(ts)) { first ??= ts; last = ts }
    const usage = (e.usage ?? (e.message as { usage?: unknown } | undefined)?.usage) as { input?: number; output?: number; cacheRead?: number; cost?: { total?: number } } | undefined
    if (e.type === 'model_usage' || (e.type === 'message' && (e.message as { role?: string }).role === 'assistant')) {
      s.cost += usage?.cost?.total ?? 0
      s.input += usage?.input ?? 0
      s.output += usage?.output ?? 0
      s.cacheRead += usage?.cacheRead ?? 0
    }
    if (e.type !== 'message') continue
    const m = e.message as { role?: string; attribution?: string; duration?: number; model?: string; content?: unknown; details?: { diff?: string } }
    if (m.role === 'user' && m.attribution === 'user') s.prompts++
    if (m.role === 'assistant') {
      s.apiMs += m.duration ?? 0
      if (m.model) s.model = m.model
      if (Array.isArray(m.content)) s.tools += m.content.filter((c: { type?: string }) => c.type === 'toolCall').length
    }
    if (m.role === 'toolResult' && typeof m.details?.diff === 'string') {
      for (const l of m.details.diff.split('\n')) {
        if (l.startsWith('+') && !l.startsWith('+++')) s.added++
        else if (l.startsWith('-') && !l.startsWith('---')) s.removed++
      }
    }
  }
  if (first !== undefined && last !== undefined) s.wallMs = last - first
  return s
}

async function readStats(file: string): Promise<SessionStats> {
  const lines: string[] = []
  const rl = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
  for await (const line of rl) lines.push(line)
  return foldSession(lines)
}

/**
 * Stats for every session of `cwd`, keyed by session id.
 * @param cwd - workspace folder.
 * @param ids - only these sessions (files are matched by the id suffix).
 */
export async function sessionStats(cwd: string, ids: Set<string>): Promise<Record<string, SessionStats>> {
  const dir = join(homedir(), '.omp', 'agent', 'sessions', folderKey(cwd))
  let names: string[]
  try { names = await fs.readdir(dir) } catch { return {} }
  const out: Record<string, SessionStats> = {}
  await Promise.all(names.filter(n => n.endsWith('.jsonl')).map(async (name) => {
    const id = name.slice(name.indexOf('_') + 1, -'.jsonl'.length)
    if (!ids.has(id)) return
    const file = join(dir, name)
    const { mtimeMs } = await fs.stat(file)
    const hit = cache.get(file)
    if (hit?.mtime === mtimeMs) { out[id] = hit.stats; return }
    const stats = await readStats(file).catch(() => undefined)
    if (stats === undefined) return
    cache.set(file, { mtime: mtimeMs, stats })
    out[id] = stats
  }))
  return out
}
