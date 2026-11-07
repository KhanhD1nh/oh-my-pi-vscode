/**
 * Autopilot: keep omp going without you. Two cases it handles, both pure here so they can be tested:
 *  - a turn ends while its todo list still has open items → send a continuation prompt (capped per request);
 *  - a `wait` call sits for minutes with no background job left to wait for (the job already failed, or only a
 *    long-running service remains) → tell the running turn so it stops waiting and reads the results.
 */
import type { ChatItem, ToolCard } from './types.ts'

/** Open items of the newest todo list in `items`. */
export function openTodos(items: readonly ChatItem[]): string[] {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!
    if (it.type === 'tool' && it.card.todo) return it.card.todo.flatMap(p => p.tasks).filter(t => t.status === 'pending' || t.status === 'in_progress').map(t => t.content)
  }
  return []
}

/** Prompt sent when a turn stopped with work left. */
export function continuePrompt(open: readonly string[]): string {
  return [
    'You stopped, but your todo list still has open items:',
    ...open.slice(0, 12).map(t => `- ${t}`),
    '',
    'Continue now and finish them. Do not ask me whether to continue. Stop only when every item is done,',
    'or when you are truly blocked on something only I can provide — then say exactly what you need.',
  ].join('\n')
}

/** A running `wait` card started more than `stallMs` ago, if any. */
export function longWait(items: readonly ChatItem[], now: number, stallMs: number): ToolCard | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!
    if (it.type !== 'tool') continue
    const c = it.card
    if (c.name === 'wait' && (c.status === 'pending' || c.status === 'in_progress') && c.startedAt !== undefined && now - c.startedAt >= stallMs) return c
  }
  return undefined
}

/**
 * Should a stalled wait be nudged? Yes when no background job is still running (nothing will ever arrive),
 * or when it has waited past `hardMs` even with jobs running.
 */
export function shouldNudge(wait: ToolCard, runningJobs: number, now: number, hardMs: number): boolean {
  return runningJobs === 0 || now - (wait.startedAt ?? now) >= hardMs
}

/** Message handed to the running turn to break a stalled wait. */
export function nudgePrompt(runningJobs: number, minutes: number): string {
  return runningJobs === 0
    ? `You have been waiting ${minutes} min, but no background job is running any more — the ones you started already finished or failed, and services never "finish". Stop waiting: read their results (proc:// or the job reports above), then continue the task.`
    : `You have been waiting ${minutes} min. Check the running jobs (proc://), decide whether they are stuck, and continue the task instead of waiting further.`
}
