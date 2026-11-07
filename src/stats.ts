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

/** One entry of a subagent's own conversation, already folded for display. */
export type AgentEntry =
  | { kind: 'prompt'; text: string; at?: number }
  | { kind: 'thinking'; text: string; at?: number }
  | { kind: 'text'; text: string; at?: number }
  | { kind: 'tool'; name: string; label: string; input?: string; output?: string; status: 'running' | 'done' | 'failed'; at?: number }

/**
 * The whole conversation of subagent `name`: its assignment, its thinking and replies, every tool call with
 * input and output. Text is capped per entry so a huge log stays cheap to send.
 */
export async function agentConversation(cwd: string, sessionId: string, name: string): Promise<{ entries: AgentEntry[]; model?: string; cost: number } | undefined> {
  const dir = join(homedir(), '.omp', 'agent', 'sessions', folderKey(cwd))
  let names: string[]
  try { names = await fs.readdir(dir) } catch { return undefined }
  const sessionDir = names.find(n => n.endsWith(`_${sessionId}`) && !n.endsWith('.jsonl'))
  if (sessionDir === undefined || !/^[\w.-]+$/u.test(name)) return undefined
  let text: string
  try { text = await fs.readFile(join(dir, sessionDir, `${name}.jsonl`), 'utf8') } catch { return undefined }
  return foldConversation(text.split('\n'))
}

/** Pure fold of a subagent session file into conversation entries. */
export function foldConversation(lines: Iterable<string>, cap = 6000): { entries: AgentEntry[]; model?: string; cost: number } {
  const entries: AgentEntry[] = []
  const byCall = new Map<string, Extract<AgentEntry, { kind: 'tool' }>>()
  const clip = (s: string) => s.length > cap ? `${s.slice(0, cap)}\n… (${s.length - cap} more characters)` : s
  let model: string | undefined
  let cost = 0
  for (const line of lines) {
    if (line[0] !== '{') continue
    let e: { type?: string; timestamp?: string; usage?: { cost?: { total?: number } }; message?: { role?: string; attribution?: string; model?: string; content?: unknown; toolCallId?: string; isError?: boolean; usage?: { cost?: { total?: number } } } }
    try { e = JSON.parse(line) } catch { continue }
    if (e.type === 'model_usage') { cost += e.usage?.cost?.total ?? 0; continue }
    if (e.type !== 'message' || !e.message) continue
    const m = e.message
    const at = e.timestamp ? Date.parse(e.timestamp) : undefined
    const parts = (Array.isArray(m.content) ? m.content : typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : []) as { type?: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: Record<string, unknown> }[]
    if (m.role === 'user') {
      const t = parts.filter(c => c.type === 'text').map(c => c.text ?? '').join('\n').trim()
      if (t) entries.push({ kind: 'prompt', text: clip(t), ...at ? { at } : {} })
    } else if (m.role === 'assistant') {
      cost += m.usage?.cost?.total ?? 0
      if (m.model) model = m.model
      for (const c of parts) {
        if (c.type === 'thinking' && c.thinking?.trim()) entries.push({ kind: 'thinking', text: clip(c.thinking.trim()), ...at ? { at } : {} })
        else if (c.type === 'text' && c.text?.trim()) entries.push({ kind: 'text', text: clip(c.text.trim()), ...at ? { at } : {} })
        else if (c.type === 'toolCall') {
          const a = c.arguments ?? {}
          const target = [a.path, a.command, a.query, a.pattern, a.url, a.code].find(v => typeof v === 'string') as string | undefined
          const tool = { kind: 'tool' as const, name: String(c.name ?? 'tool'), label: String(a.i ?? target ?? c.name ?? 'tool').slice(0, 160), input: clip(typeof a.command === 'string' ? a.command : typeof a.code === 'string' ? a.code : JSON.stringify(a)), status: 'running' as const, ...at ? { at } : {} }
          entries.push(tool)
          if (c.id) byCall.set(c.id, tool)
        }
      }
    } else if (m.role === 'toolResult' && m.toolCallId) {
      const t = byCall.get(m.toolCallId)
      if (t === undefined) continue
      ;(t as { status: string }).status = m.isError ? 'failed' : 'done'
      const out = parts.filter(c => c.type === 'text').map(c => c.text ?? '').join('\n').trim()
      if (out) t.output = clip(out)
    }
  }
  return { entries, ...model ? { model } : {}, cost }
}

/** A background job omp started in this session (bash `async`, or a subagent) and what came of it. */
export interface JobInfo { jobId: string; type: string; label: string; status: 'running' | 'completed' | 'failed' | string; durationMs?: number; output?: string; at?: number }

/** Background jobs of session `sessionId`, from omp's own delivery notices in the session file. */
export async function sessionJobs(cwd: string, sessionId: string): Promise<JobInfo[]> {
  const dir = join(homedir(), '.omp', 'agent', 'sessions', folderKey(cwd))
  let names: string[]
  try { names = await fs.readdir(dir) } catch { return [] }
  const file = names.find(n => n.endsWith(`_${sessionId}.jsonl`))
  if (file === undefined) return []
  const path = join(dir, file)
  try {
    // polled every few seconds while a turn runs: fold again only when the file changed
    const { size, mtimeMs } = await fs.stat(path)
    const hit = jobCache.get(path)
    if (hit && hit.size === size && hit.mtime === mtimeMs) return hit.jobs
    const jobs = foldJobs((await fs.readFile(path, 'utf8')).split('\n'))
    jobCache.set(path, { size, mtime: mtimeMs, jobs })
    return jobs
  } catch { return [] }
}
const jobCache = new Map<string, { size: number; mtime: number; jobs: JobInfo[] }>()

/** Pure fold: "Backgrounded as job bg_N" tool results start a job, "background job delivery" notices end it. */
export function foldJobs(lines: Iterable<string>, cap = 20_000): JobInfo[] {
  const jobs = new Map<string, JobInfo>()
  const commands = new Map<string, string>()
  for (const line of lines) {
    if (line[0] !== '{' || !/Backgrounded as job|"async-result"|### bg_\S+ \[|"toolCall"/u.test(line)) continue
    let e: { type?: string; customType?: string; timestamp?: string; content?: unknown; details?: { jobs?: { jobId?: string; type?: string; status?: string; label?: string; durationMs?: number }[]; async?: { jobId?: string; type?: string } }; message?: { role?: string; toolCallId?: string; content?: { type?: string; text?: string; id?: string; name?: string; arguments?: { command?: string; i?: string } }[]; details?: { async?: { jobId?: string; type?: string } } } }
    try { e = JSON.parse(line) } catch { continue }
    const at = e.timestamp ? Date.parse(e.timestamp) : undefined
    // remember each bash call's command, to label the job it starts
    if (e.message?.role === 'assistant') {
      for (const c of e.message.content ?? []) if (c.type === 'toolCall' && c.id && c.name === 'bash' && c.arguments?.command) commands.set(c.id, c.arguments.i ?? c.arguments.command)
      continue
    }
    const started = e.message?.role === 'toolResult' ? e.message.details?.async : undefined
    if (started?.jobId) {
      const label = (e.message?.toolCallId && commands.get(e.message.toolCallId)) || (e.message?.content ?? []).map(c => c.text ?? '').join(' ').replace(/Backgrounded as job[\s\S]*/u, '').trim() || started.jobId
      jobs.set(started.jobId, { jobId: started.jobId, type: started.type ?? 'bash', label: label.slice(0, 160), status: 'running', ...at ? { at } : {} })
      continue
    }
    // a job report the model asked for ("### bg_21 [bash] — failed … ``` output ```"): the only result for jobs
    // omp did not deliver on its own
    if (e.message?.role === 'toolResult') {
      const body = (e.message.content ?? []).map(c => c.text ?? '').join('\n')
      // each "### id [type] — status" section runs to the next one or the next "## " heading
      for (const m of body.matchAll(/### (\S+) \[(\w+)\] — (\w+)\n(?:Label: ([^\n]*)\n)?([\s\S]*?)(?=\n### \S+ \[|\n## |$)/gu)) {
        const prev = jobs.get(m[1]!)
        const section = m[5]!
        // completed jobs carry their output in a ``` block; failed ones after "Error:"
        const out = (/```\n?([\s\S]*?)```/u.exec(section)?.[1] ?? /Error:\s*([\s\S]*)$/u.exec(section)?.[1] ?? '').trim()
        jobs.set(m[1]!, { ...prev, jobId: m[1]!, type: m[2]!, label: prev?.label && prev.label !== m[1] ? prev.label : (m[4] ?? m[1]!), status: m[3]!, ...out ? { output: out.length > cap ? `${out.slice(0, cap)}\n… (${out.length - cap} more characters)` : out } : {}, ...prev?.at ?? at ? { at: prev?.at ?? at } : {} })
      }
      continue
    }
    if (e.type === 'custom_message' && e.customType === 'async-result') {
      const body = typeof e.content === 'string' ? e.content : ''
      for (const j of e.details?.jobs ?? []) {
        if (!j.jobId) continue
        // the notice body is "<system-notice>\nBackground job X has completed. …\n<output>\n</system-notice>"
        const out = body.replace(/^<system-notice>\s*/u, '').replace(/\s*<\/system-notice>\s*$/u, '').replace(/^Background job \S+ has \w+\.[^\n]*\n?/u, '').trim()
        const prev = jobs.get(j.jobId)
        jobs.set(j.jobId, { ...prev, jobId: j.jobId, type: j.type ?? prev?.type ?? 'bash', label: j.label ?? prev?.label ?? j.jobId, status: j.status ?? 'completed', ...j.durationMs !== undefined ? { durationMs: j.durationMs } : {}, ...out ? { output: out.length > cap ? `${out.slice(0, cap)}\n… (${out.length - cap} more characters)` : out } : {}, ...prev?.at ?? at ? { at: prev?.at ?? at } : {} })
      }
    }
  }
  return [...jobs.values()]
}
