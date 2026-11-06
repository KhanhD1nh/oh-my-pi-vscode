// Strip empty optional fields from `task` tool calls before omp validates them.
// Why: some models (GPT via 9router) fill every schema field, sending `sourceSession: ""` and `model: []`
// on each task. omp 18.13.3 rejects any `sourceSession` present on a non-`seance` agent, even an empty one,
// so every subagent call failed with "`sourceSession` is only accepted for the `seance` agent."
// Remove this file once omp ignores empty values there.
// Only optional fields. `solutionSpace` is required in tasks[]: an empty one is a real error, let omp report it.
const OPTIONAL = ['sourceSession', 'model', 'tools', 'effort']

const empty = (v: unknown) => v === '' || v === null || (Array.isArray(v) && v.length === 0)

export default function (pi): void {
  pi.on('tool_call', (event) => {
    if (event.toolName !== 'task') return
    const input = event.input
    if (!input || typeof input !== 'object' || !Array.isArray(input.tasks)) return
    let changed = false
    const tasks = input.tasks.map((t: Record<string, unknown>) => {
      if (!t || typeof t !== 'object') return t
      const copy = { ...t }
      for (const k of OPTIONAL) if (k in copy && empty(copy[k])) { delete copy[k]; changed = true }
      return copy
    })
    return changed ? { input: { ...input, tasks } } : undefined
  })
}
