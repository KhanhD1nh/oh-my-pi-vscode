/**
 * omp configuration through omp's own CLI (`omp config list|set|reset`, `omp models ls --json`),
 * so the desktop Settings page edits exactly what the omp TUI edits: `~/.omp/agent/config.yml`.
 * Parsing is pure and tested; process calls are thin.
 */
import { execFile } from 'node:child_process'
import { choicesFor, discoverSkills } from './choices.ts'

import type { AgentModelChoice, AgentSetting, AgentSettingValue } from './types.ts'

export type OmpSetting = AgentSetting
export type OmpSettingType = AgentSetting['type']
export type OmpModel = AgentModelChoice

/**
 * Merge `omp config list` (groups, enum options) with `omp config list --json` (types, values, descriptions).
 * @param text - plain listing.
 * @param json - JSON listing.
 * @returns settings ordered as omp lists them.
 */
export function parseSettings(text: string, json: Record<string, { type: string; value?: unknown; description?: string; redacted?: boolean }>): OmpSetting[] {
  const out: OmpSetting[] = []
  let group = 'general'
  for (const line of text.split(/\r?\n/u)) {
    const head = /^\[([^\]]+)\]\s*$/u.exec(line)
    if (head) { group = head[1]!; continue }
    const row = /^ {2}([A-Za-z0-9_.-]+) = .* \(([^()]*)\)\s*$/u.exec(line)
    if (!row) continue
    const key = row[1]!
    const meta = json[key]
    if (meta === undefined) continue
    const type = meta.type as OmpSettingType
    const setting: OmpSetting = { key, group, type, description: meta.description ?? '', ...meta.value === undefined ? {} : { value: meta.value as AgentSettingValue } }
    if (type === 'enum') setting.options = row[2]!.split('|')
    if (meta.redacted) setting.redacted = true
    out.push(setting)
  }
  return out
}

/**
 * Text for `omp config set <key> <value>`; containers go as JSON.
 * @param setting - target setting.
 * @param value - new value from the UI.
 * @returns CLI argument.
 */
export function encodeValue(setting: Pick<OmpSetting, 'type' | 'options'>, value: unknown): string {
  switch (setting.type) {
    case 'boolean':
      if (typeof value !== 'boolean') throw new Error('expected true or false')
      return String(value)
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(n)) throw new Error('expected a number')
      return String(n)
    }
    case 'enum':
      if (typeof value !== 'string' || !(setting.options ?? []).includes(value)) throw new Error('not one of the allowed values')
      return value
    case 'array':
    case 'record':
      return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value)
    default:
      return String(value)
  }
}

/** Models from `omp models ls --json`. */
export function parseModels(json: string): OmpModel[] {
  const parsed = JSON.parse(json) as { models?: Array<Record<string, unknown>> }
  return (parsed.models ?? [])
    .filter(m => m.kind === undefined || m.kind === 'chat')
    .map(m => ({
      selector: String(m.selector ?? `${String(m.provider)}/${String(m.id)}`),
      provider: String(m.provider),
      id: String(m.id),
      name: String(m.name ?? m.id),
      reasoning: m.reasoning === true || (m.thinking !== null && m.thinking !== undefined),
    }))
}

function run(command: string, args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).trim().slice(0, 500)))
      else resolve(stdout)
    })
  })
}

/** Thin wrapper over the omp CLI for one executable path. */
export class OmpConfigCli {
  constructor(private readonly command: () => Promise<string>) {}

  async list(): Promise<OmpSetting[]> {
    const exe = await this.command()
    const [text, json, models] = await Promise.all([
      run(exe, ['config', 'list']), run(exe, ['config', 'list', '--json']), this.models().catch(() => [] as OmpModel[]),
    ])
    const dynamic = {
      providers: [...new Set(models.map(m => m.provider))].sort(),
      models: models.map(m => m.selector),
      skills: discoverSkills(),
    }
    return parseSettings(text, JSON.parse(json) as never).map((s) => {
      const choices = choicesFor(s.key, dynamic)
      if (choices === undefined) return s
      // Keep values already stored even if they are not in the known set (custom themes, new skills…).
      const current = Array.isArray(s.value) ? s.value.map(String) : typeof s.value === 'string' && s.value !== '' ? [s.value] : []
      return { ...s, choices: { kind: choices.kind, values: [...new Set([...choices.values, ...current])] } }
    })
  }

  async set(setting: Pick<OmpSetting, 'key' | 'type' | 'options'>, value: unknown): Promise<void> {
    const exe = await this.command()
    await run(exe, ['config', 'set', setting.key, encodeValue(setting, value)])
  }

  async reset(key: string): Promise<void> {
    const exe = await this.command()
    await run(exe, ['config', 'reset', key])
  }

  async models(): Promise<OmpModel[]> {
    const exe = await this.command()
    return parseModels(await run(exe, ['models', 'ls', '--json'], 120_000))
  }
}
