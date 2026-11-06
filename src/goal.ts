/**
 * Goal mode over ACP. omp's own goal mode only auto-continues in its TUI/RPC modes, so the extension drives it:
 * after each turn it sends a continuation prompt until the agent reports the goal done *with evidence*, a turn
 * or cost limit is hit, or you pause/stop. Pure parts live here so they can be tested without VS Code.
 */

/** Goal state for one chat. */
export interface Goal {
  objective: string
  status: 'active' | 'paused' | 'done' | 'stopped' | 'limit'
  turns: number
  maxTurns: number
  /** USD; 0 = no cost limit. */
  maxCost: number
  /** Session cost when the goal started, so the limit counts only this goal. */
  costAtStart: number
  /** Why it ended (shown in the bar). */
  reason?: string
}

/** Marker the agent must put on its last line; the evidence line follows it. */
export const DONE = 'GOAL_STATUS: DONE'
export const BLOCKED = 'GOAL_STATUS: BLOCKED'

/** First message: the objective plus the rules for reporting. */
export function startPrompt(objective: string): string {
  return [
    `Goal: ${objective}`,
    '',
    'Work on this goal until it is fully achieved. You will be asked to continue after each turn, so it is fine to stop mid-way.',
    'Before you claim it is done, verify it (run the tests or checks, read the result back).',
    `Only when it is achieved and verified, end your reply with a line "${DONE}" followed by one line "Evidence: <what you checked>".`,
    `If you cannot continue without the user (missing access, a decision only they can make), end with "${BLOCKED}" and one line "Need: <what you need>".`,
    'Otherwise end normally and keep going next turn.',
  ].join('\n')
}

/** Sent after a turn that did not finish the goal. */
export function continuePrompt(g: Goal): string {
  return [
    `Continue working toward the goal: ${g.objective}`,
    `(turn ${g.turns + 1} of at most ${g.maxTurns}). Pick the next concrete step and do it; do not repeat finished work.`,
    `End with "${DONE}" + "Evidence: …" only when it is achieved and verified, or "${BLOCKED}" + "Need: …" if you are stuck on the user.`,
  ].join(' ')
}

/** What the last reply says about the goal. */
export function judge(reply: string): { status: 'done' | 'blocked' | 'continue'; note?: string } {
  // Markdown around the marker (**…**, `…`, list bullets) is ignored; only the last few lines count.
  const tail = reply.trim().split('\n').map(l => l.trim().replace(/^[\s*_`>#-]+|[\s*_`]+$/gu, '')).slice(-6)
  const marker = (kind: string) => tail.findIndex(l => new RegExp(`^GOAL_STATUS\\s*:\\s*${kind}\\b`, 'iu').test(l))
  const field = (from: number, name: string) => tail.slice(from + 1).map(l => new RegExp(`^${name}\\s*:\\s*(.*)$`, 'iu').exec(l)?.[1]?.trim()).find(Boolean)
  const doneAt = marker('DONE')
  if (doneAt >= 0) {
    const ev = field(doneAt, 'evidence')
    // A "done" without evidence is not trusted: ask once more to verify.
    return ev && ev.length >= 8 ? { status: 'done', note: ev } : { status: 'continue', note: 'claimed done without evidence' }
  }
  const blockedAt = marker('BLOCKED')
  if (blockedAt >= 0) return { status: 'blocked', note: field(blockedAt, 'need') ?? 'needs your input' }
  return { status: 'continue' }
}

/** Decide the next step after a turn ended. */
export function next(g: Goal, reply: string, cost: number, cancelled: boolean): { goal: Goal; prompt?: string } {
  if (g.status !== 'active') return { goal: g }
  if (cancelled) return { goal: { ...g, status: 'paused', reason: 'stopped by you' } }
  const turns = g.turns + 1
  const v = judge(reply)
  if (v.status === 'done') return { goal: { ...g, turns, status: 'done', reason: v.note } }
  if (v.status === 'blocked') return { goal: { ...g, turns, status: 'paused', reason: `blocked: ${v.note}` } }
  if (turns >= g.maxTurns) return { goal: { ...g, turns, status: 'limit', reason: `reached ${g.maxTurns} turns` } }
  if (g.maxCost > 0 && cost - g.costAtStart >= g.maxCost) return { goal: { ...g, turns, status: 'limit', reason: `spent $${(cost - g.costAtStart).toFixed(2)} of $${g.maxCost}` } }
  const goal = { ...g, turns }
  return { goal, prompt: v.note === 'claimed done without evidence' ? `${continuePrompt(goal)} You said it is done but gave no evidence: verify it now and report.` : continuePrompt(goal) }
}
