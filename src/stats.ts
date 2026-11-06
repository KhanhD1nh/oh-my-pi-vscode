/**
 * Session stats read from omp's own session files (~/.omp/agent/sessions/<folder>/<ts>_<id>.jsonl):
 * cost, tokens, API time, wall time, prompts, tool calls, lines changed, model. Cached per file mtime.
 */
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SessionStats } from './types.ts'

/** Per file: bytes already folded, the running fold, and its timestamps, so a 30 MB session is read once. */
const cache = new Map<string, { size: number; mtime: number; fold: Fold }>()

/** omp's folder key: `D:\code\app` → `--D--code-app--`. */
export function folderKey(cwd: string): string {
  return `--${cwd.replace(/[\\/]+$/u, '').replace(/[:\\/]/gu, '-')}--`
}

/** Running totals over a session file; feed lines in order, read with `stats()`. */
export class Fold {
  private s: SessionStats = { cost: 0, input: 0, output: 0, cacheRead: 0, apiMs: 0, prompts: 0, tools: 0, added: 0, removed: 0, cacheWrite: 0, genMs: 0 }
  private first: number | undefined
  private last: number | undefined

  line(line: string): void {
    const s = this.s
    if (line.length < 2 || line[0] !== '{') return
    let e: Record<string, unknown>
    try { e = JSON.parse(line) as Record<string, unknown> } catch { return }
    const ts = typeof e.timestamp === 'string' ? Date.parse(e.timestamp) : NaN
    if (!Number.isNaN(ts)) { this.first ??= ts; this.last = ts }
    const usage = (e.usage ?? (e.message as { usage?: unknown } | undefined)?.usage) as { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; cost?: { total?: number } } | undefined
    if (e.type === 'model_usage' || (e.type === 'message' && (e.message as { role?: string }).role === 'assistant')) {
      s.cost += usage?.cost?.total ?? 0
      s.input += usage?.input ?? 0
      s.output += usage?.output ?? 0
      s.cacheRead += usage?.cacheRead ?? 0
      s.cacheWrite = (s.cacheWrite ?? 0) + (usage?.cacheWrite ?? 0)
    }
    if (e.type !== 'message') return
    const m = e.message as { role?: string; attribution?: string; duration?: number; ttft?: number; model?: string; content?: unknown; details?: { diff?: string } }
    if (m.role === 'user' && m.attribution === 'user') s.prompts++
    if (m.role === 'assistant') {
      s.apiMs += m.duration ?? 0
      if (m.duration && m.duration > (m.ttft ?? 0)) s.genMs = (s.genMs ?? 0) + (m.duration - (m.ttft ?? 0))
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

  stats(): SessionStats {
    return { ...this.s, ...this.first !== undefined && this.last !== undefined ? { wallMs: this.last - this.first } : {} }
  }
}

/** Fold one session file. Pure over its lines so it can be tested without disk. */
export function foldSession(lines: Iterable<string>): SessionStats {
  const f = new Fold()
  for (const line of lines) f.line(line)
  return f.stats()
}

/** Fold bytes [from, size) of `file` into `fold`; returns the offset of the last complete line read. */
async function readFrom(file: string, from: number, size: number, fold: Fold): Promise<number> {
  const fh = await fs.open(file, 'r')
  try {
    const buf = Buffer.alloc(size - from)
    await fh.read(buf, 0, buf.length, from)
    const end = buf.lastIndexOf(0x0a) // only whole lines; a half-written tail is read next time
    if (end < 0) return from
    for (const line of buf.subarray(0, end).toString('utf8').split('\n')) fold.line(line)
    return from + end + 1
  } finally { await fh.close() }
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
    const { mtimeMs, size } = await fs.stat(file)
    let hit = cache.get(file)
    // Rewritten or truncated (omp rewrites the title line in place): start over.
    if (hit === undefined || size < hit.size) hit = { size: 0, mtime: 0, fold: new Fold() }
    if (hit.mtime !== mtimeMs || hit.size !== size) {
      try { hit.size = await readFrom(file, hit.size, size, hit.fold) } catch { return }
      hit.mtime = mtimeMs
      cache.set(file, hit)
    }
    out[id] = hit.fold.stats()
  }))
  return out
}

/** One step a subagent took (tool call or its final text). */
export interface AgentStep { tool?: string; label: string; status: 'running' | 'done' | 'failed' }

/**
 * Steps of subagent `name` in omp session `sessionId`: omp keeps each subagent's own session at
 * <sessions>/<folder>/<ts>_<sessionId>/<name>.jsonl.
 */
export async function agentSteps(cwd: string, sessionId: string, name: string): Promise<{ steps: AgentStep[]; model?: string; cost: number } | undefined> {
  const dir = join(homedir(), '.omp', 'agent', 'sessions', folderKey(cwd))
  let names: string[]
  try { names = await fs.readdir(dir) } catch { return undefined }
  const sessionDir = names.find(n => n.endsWith(`_${sessionId}`) && !n.endsWith('.jsonl'))
  if (sessionDir === undefined || !/^[\w.-]+$/u.test(name)) return undefined
  let text: string
  try { text = await fs.readFile(join(dir, sessionDir, `${name}.jsonl`), 'utf8') } catch { return undefined }
  return foldSteps(text.split('\n'))
}

/** Pure fold of a subagent session file into a step list. */
export function foldSteps(lines: Iterable<string>): { steps: AgentStep[]; model?: string; cost: number } {
  const steps: AgentStep[] = []
  const byCall = new Map<string, AgentStep>()
  let model: string | undefined
  let cost = 0
  for (const line of lines) {
    if (line[0] !== '{') continue
    let e: { type?: string; usage?: { cost?: { total?: number } }; message?: { role?: string; model?: string; content?: unknown; toolCallId?: string; isError?: boolean; usage?: { cost?: { total?: number } } } }
    try { e = JSON.parse(line) } catch { continue }
    if (e.type === 'model_usage') cost += e.usage?.cost?.total ?? 0
    if (e.type !== 'message' || !e.message) continue
    const m = e.message
    if (m.role === 'assistant') {
      cost += m.usage?.cost?.total ?? 0
      if (m.model) model = m.model
      for (const c of (Array.isArray(m.content) ? m.content : []) as { type?: string; id?: string; name?: string; text?: string; arguments?: Record<string, unknown> }[]) {
        if (c.type === 'toolCall') {
          const a = c.arguments ?? {}
          const target = [a.path, a.command, a.query, a.pattern, a.url].find(v => typeof v === 'string') as string | undefined
          const step: AgentStep = { tool: c.name, label: String(a.i ?? target ?? c.name ?? 'tool').slice(0, 140), status: 'running' }
          steps.push(step)
          if (c.id) byCall.set(c.id, step)
        } else if (c.type === 'text' && c.text?.trim()) {
          steps.push({ label: c.text.trim().split('\n')[0]!.slice(0, 140), status: 'done' })
        }
      }
    }
    if (m.role === 'toolResult' && m.toolCallId) {
      const s = byCall.get(m.toolCallId)
      if (s) s.status = m.isError ? 'failed' : 'done'
    }
  }
  return { steps, ...model ? { model } : {}, cost }
}
