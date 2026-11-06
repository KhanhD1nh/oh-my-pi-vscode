**Title:** task: empty `sourceSession` / `model` on non-seance items rejects the whole call

**omp version:** 18.13.3 (Windows, ACP mode and TUI)

**What happens**

Models that fill every schema field (seen with GPT-6.1 Terra through an OpenAI-compatible router) send each task item with the optional fields present but empty:

```json
{ "tasks": [ { "name": "Frontend", "agent": "scout", "task": "…", "sourceSession": "", "model": [], "tools": [], "isolated": false } ] }
```

The call fails before any subagent starts:

```
`sourceSession` is only accepted for the `seance` agent.
```

**Why**

The per-item check only tests for presence:

```js
if (e !== va) {
  if (s.sourceSession !== undefined) return "`sourceSession` is only accepted for the `seance` agent."
  if (s.model !== undefined) return "`model` is only accepted for the `seance` agent."
}
```

`""` and `[]` are not `undefined`, so a field the model meant as "not set" is treated as set.

**Expected**

Treat empty values (`""`, `[]`, `null`) as absent for `sourceSession` and `model` on non-seance agents, or strip them before validation. Claude models omit the fields and never hit this; models that always emit every field fail on every `task` call.

**Workaround in use**

A `tool_call` extension that deletes empty `sourceSession` / `model` / `tools` keys from `task` items before validation fixes it.
