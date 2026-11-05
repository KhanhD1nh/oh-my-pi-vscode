/**
 * Finite value sets for omp settings that omp stores as free text or lists, so the desktop Settings
 * page can offer dropdowns / checkbox lists instead of typing. Static sets mirror omp's own sources
 * (pinned to the omp version this app was built against); dynamic sets come from the omp CLI or disk.
 */
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** omp built-in themes (packages/tui/src/theme/defaults.json keys). */
export const THEMES = ['alabaster', 'amethyst', 'anthracite', 'basalt', 'birch', 'dark-abyss', 'dark-arctic', 'dark-aurora', 'dark-catppuccin', 'dark-cavern', 'dark-celestial', 'dark-copper', 'dark-cosmos', 'dark-cyberpunk', 'dark-dracula', 'dark-eclipse', 'dark-ember', 'dark-equinox', 'dark-forest', 'dark-github', 'dark-gruvbox', 'dark-lavender', 'dark-lunar', 'dark-midnight', 'dark-monochrome', 'dark-monokai', 'dark-nebula', 'dark-neon-noir', 'dark-nord', 'dark-ocean', 'dark-one', 'dark-poimandres', 'dark-rainforest', 'dark-reef', 'dark-retro', 'dark-rose-pine', 'dark-sakura', 'dark-slate', 'dark-solarized', 'dark-solstice']

/** Composer shapes (packages/tui/src/components/composer/types.ts). */
export const COMPOSER_SHAPES = ['box', 'band', 'claude', 'pi', 'borderless', 'rule', 'field', 'rail']

/** Status line segments (packages/tui/src/status-line/segments.ts SEGMENTS). */
export const STATUS_SEGMENTS = ['pi', 'status', 'model', 'mode', 'path', 'git', 'pr', 'subagents', 'token_in', 'token_out', 'token_total', 'token_rate', 'cost', 'context_pct', 'context_total', 'time_spent', 'time', 'session', 'hostname', 'cache_read', 'cache_write', 'cache_hit', 'cache', 'session_name', 'usage', 'collab', 'stream', 'vim']

/** Context maintenance methods (compaction.methodOrder default). */
export const COMPACTION_METHODS = ['remote', 'snapcompact', 'handoff', 'shake', 'soft']

/** Image publishing backends (blob-broker/settings.ts default). */
export const IMAGE_BACKENDS = ['provider-files', 'tailscale', 'cloudflared', 'litterbox']

/** Run modes where goals may auto-continue. */
export const GOAL_MODES = ['interactive', 'print', 'rpc']

/** Hindsight recall types. */
export const RECALL_TYPES = ['world', 'experience', 'opinion', 'observation']

/** Model roles omp resolves (modelRoles keys). */
export const MODEL_ROLES = ['default', 'slow', 'plan', 'advisor', 'task', 'tiny', 'commit', 'memory', 'vision', 'judge', 'web', 'smol']

/** Per-tool approval policy values (tools.approval). */
export const APPROVAL_POLICIES = ['allow', 'prompt', 'deny']

/** omp built-in tools (names usable in tools.approval and exempt lists). */
export const TOOL_NAMES = ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'find', 'lsp', 'ast_grep', 'ast_edit', 'web_search', 'web_fetch', 'browser', 'task', 'todo', 'ask', 'wait', 'eval', 'computer', 'learn', 'manage_skill']

/**
 * Skill names found in the usual skill roots (user + one project), deduplicated and sorted.
 * @param cwd - project directory to scan for project skills.
 * @returns skill directory names.
 */
export function discoverSkills(cwd: string = process.cwd()): string[] {
  const home = homedir()
  const roots = [
    join(home, '.omp', 'agent', 'skills'), join(home, '.omp', 'agent', 'managed-skills'),
    join(home, '.agents', 'skills'), join(home, '.claude', 'skills'),
    join(cwd, '.omp', 'skills'), join(cwd, '.agents', 'skills'), join(cwd, '.claude', 'skills'), join(cwd, '.opencode', 'skills'),
  ]
  const names = new Set<string>()
  for (const root of roots) {
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) if (entry.isDirectory()) names.add(entry.name)
    } catch { /* missing root */ }
  }
  return [...names].sort()
}

/** Choices for one setting: `select` (one value) or `multi` (ordered list of values). */
export interface SettingChoices { kind: 'select' | 'multi'; values: string[] }

/**
 * Finite choices for a setting key, or undefined when it really is free text.
 * @param key - omp setting key.
 * @param dynamic - CLI-derived sets (providers, model selectors, skills).
 * @returns choices for the UI.
 */
export function choicesFor(key: string, dynamic: { providers: string[]; models: string[]; skills: string[] }): SettingChoices | undefined {
  const multi = (values: string[]): SettingChoices => ({ kind: 'multi', values })
  const one = (values: string[]): SettingChoices => ({ kind: 'select', values })
  switch (key) {
    case 'theme.dark': case 'theme.light': return one(THEMES)
    case 'composer.shape': return one(COMPOSER_SHAPES)
    case 'computer.display': return one(['active', 'all'])
    case 'stt.language': return one(['en', 'vi', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ru'])
    case 'images.urls.bindHost': return one(['127.0.0.1', '0.0.0.0'])
    case 'prewalk.autoTarget': return one([...MODEL_ROLES.map(r => `@${r}`), ...dynamic.models])
    case 'sharpshooter.model': return one(['', ...dynamic.models])
    case 'statusLine.leftSegments': case 'statusLine.rightSegments': return multi(STATUS_SEGMENTS)
    case 'cycleOrder': return multi(MODEL_ROLES)
    case 'compaction.methodOrder': return multi(COMPACTION_METHODS)
    case 'images.urls.backends': return multi(IMAGE_BACKENDS)
    case 'goal.continuationModes': return multi(GOAL_MODES)
    case 'hindsight.recallTypes': return multi(RECALL_TYPES)
    case 'enabledProviders': case 'disabledProviders': case 'modelProviderOrder': return multi(dynamic.providers)
    case 'enabledModels': return multi(dynamic.models)
    case 'skills.includeSkills': case 'skills.ignoredSkills': return multi(dynamic.skills)
    case 'model.toolCallLoopGuard.exemptTools': return multi(TOOL_NAMES)
    default: return undefined
  }
}
