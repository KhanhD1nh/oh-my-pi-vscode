/**
 * omp over ACP with several concurrent sessions. One `omp acp` child ({@link OmpHost}) serves many
 * {@link OmpSession}s; each session owns its own transcript, busy flag, model, thinking and mode, so the
 * UI can show one tab per session and keep them all running. omp does all agent work; this only relays.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { Readable as NodeReadable, Writable as NodeWritable } from 'node:stream'
import { client as createAcpClientApp, methods, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'
import { ompEnv } from './binary.ts'
import { ompMcpServers } from './mcpConfig.ts'
import { Transcript } from './transcript.ts'
import { type Goal, next as goalNext, startPrompt } from './goal.ts'
import { continuePrompt, openTodos } from './autopilot.ts'
import type { AskSchema, AskValue, ChatItem, SessionRow } from './types.ts'

type Rpc = { request: (method: string, params: unknown) => Promise<any>; notify: (method: string, params: unknown) => Promise<void> }

/** omp session config option as ACP reports it. */
interface ConfigOption { id: string; currentValue?: string; options?: { value: string; name?: string }[] }

export interface SessionEvents {
  /** A transcript item of `session` changed. */
  item(session: OmpSession, item: ChatItem): void
  /** `session`'s transcript was replaced (loaded from history). */
  reset(session: OmpSession): void
  /** Busy flag, model, thinking, mode, commands, title or usage of `session` changed. */
  state(session: OmpSession): void
}

export interface HostEvents extends SessionEvents {
  /**
   * omp asks to run something that needs consent.
   * @returns the chosen option id, or undefined to cancel.
   */
  permission(session: OmpSession | undefined, title: string, options: { optionId: string; name: string; kind: string }[]): Promise<string | undefined>
  /** Diagnostic log line. */
  log(line: string): void
}

/** Question omp is told to ask while it waits for your SSH key. */
export const KEY_QUESTION = 'Waiting for you to unlock the SSH key — continue when it is loaded?'
function isKeyQuestion(message: string, schema: AskSchema): boolean {
  const text = [message, ...Object.values(schema.properties ?? {}).map(p => `${p.title ?? ''} ${p.description ?? ''}`)].join(' ')
  return /ssh key|unlock/iu.test(text)
}

/** One omp session (one UI tab). */
export class OmpSession {
  transcript = new Transcript()
  busy = false
  model: string | undefined
  thinking: string | undefined
  thinkingLevels: string[] = []
  mode: string | undefined
  modes: { id: string; name: string }[] = []
  commands: { name: string; description?: string }[] = []
  title: string | undefined
  usage: { used?: number; size?: number; cost?: number } = {}
  /** Prompts sent while a turn was running; omp gets them one at a time, in order. */
  queue: { text: string; images: { mimeType: string; data: string }[]; shown?: boolean; goal?: boolean; tries?: number }[] = []
  /** Active goal, driven by the extension between turns. */
  goal: Goal | undefined
  /** Autopilot: continue on its own when a turn stops with open todo items (at most `maxContinues` per request of yours). */
  autopilot = { enabled: true, maxContinues: 5, continues: 0, pinned: false }
  private cancelled = false

  constructor(private readonly host: OmpHost, readonly id: string, private readonly events: SessionEvents) {}

  /** @internal Fold one ACP update for this session. */
  onUpdate(update: Record<string, unknown>): void {
    switch (update.sessionUpdate) {
      case 'usage_update': {
        const cost = (update.cost as { amount?: number } | undefined)?.amount
        this.usage = { ...typeof update.used === 'number' ? { used: update.used } : {}, ...typeof update.size === 'number' ? { size: update.size } : {}, ...typeof cost === 'number' ? { cost } : {} }
        if (typeof cost === 'number' && this.turnStartCost !== undefined) this.turnCost = Math.max(0, cost - this.turnStartCost)
        this.events.state(this)
        return
      }
      case 'available_commands_update':
        this.commands = ((update.availableCommands as Array<{ name: string; description?: string }>) ?? []).map(c => ({ name: c.name, ...c.description ? { description: c.description } : {} }))
        this.events.state(this)
        return
      case 'current_mode_update':
        this.mode = String(update.currentModeId ?? this.mode)
        this.events.state(this)
        return
      case 'config_option_update':
        this.readConfig((update.configOptions as ConfigOption[] | undefined) ?? [])
        this.events.state(this)
        return
      case 'session_info_update':
        if (typeof update.title === 'string' && update.title) { this.title = update.title; this.events.state(this) }
        return
      default: {
        // The background `/rename` turn only echoes "Session renamed to …"; keep it out of the chat.
        if (this.renaming) return
        const item = this.transcript.apply(update)
        if (item !== undefined) { this.events.item(this, item); this.holdForKey(item) }
      }
    }
  }

  /** @internal */
  readConfig(options: ConfigOption[]): void {
    for (const o of options) {
      if (o.id === 'model') this.model = o.currentValue
      if (o.id === 'thinking') { this.thinking = o.currentValue; this.thinkingLevels = (o.options ?? []).map(x => x.value) }
      if (o.id === 'mode') { this.mode = o.currentValue; this.modes = (o.options ?? []).map(x => ({ id: x.value, name: x.name ?? x.value })) }
    }
  }

  /**
   * Send a prompt. If a turn is running it is queued and sent when that turn ends, so messages typed
   * while omp works are never lost and never race.
   */
  prompt(text: string, images: { mimeType: string; data: string }[] = []): void {
    this.autopilot.continues = 0
    this.turnStartCost = this.usage.cost ?? 0; this.turnCost = 0
    this.readOnlyTold = false
    if (this.busy && this.host.steering) { void this.steer(text, images); return }
    this.queue.push({ text, images })
    this.events.state(this)
    if (!this.busy && !this.renaming) void this.drain()
  }

  /**
   * Hand a message to the running turn so omp reads it at its next step (like typing into the omp TUI
   * while it works). Falls back to the local queue when omp has no turn to join.
   */
  private async steer(text: string, images: { mimeType: string; data: string }[]): Promise<void> {
    this.events.item(this, this.transcript.user(text, images))
    const prompt = [{ type: 'text', text }, ...images.map(i => ({ type: 'image', mimeType: i.mimeType, data: i.data }))]
    try {
      const r = await this.host.rpc().request('_session/steering', { sessionId: this.id, prompt }) as { outcome?: string; reason?: string }
      if (r?.outcome === 'promptRequired') { this.queue.push({ text, images, shown: true }); this.events.state(this); if (!this.busy) void this.drain() }
      else if (r?.outcome === 'failed') this.events.item(this, this.transcript.error(`omp could not take the message mid-turn: ${r.reason ?? 'unknown'}`))
    } catch (error) {
      this.queue.push({ text, images, shown: true }); this.events.state(this)
      if (!this.busy) void this.drain()
      void error
    }
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0 && !this.busy) {
      const next = this.queue.shift()!
      this.title ??= next.text.split('\n')[0]!.slice(0, 60)
      // Continuation prompts are bookkeeping, not something you typed: keep them out of the chat.
      if (!next.shown && !next.goal) this.events.item(this, this.transcript.user(next.text, next.images))
      this.cancelled = false
      this.busy = true
      this.events.state(this)
      try {
        const prompt = [{ type: 'text', text: next.text }, ...next.images.map(i => ({ type: 'image', mimeType: i.mimeType, data: i.data }))]
        const r = await this.host.rpc().request(methods.agent.session.prompt, { sessionId: this.id, prompt }) as { stopReason?: string }
        if (r?.stopReason === 'refusal') this.events.item(this, this.transcript.error('omp refused this request.'))
      } catch (error) {
        const msg = String((error as Error)?.message ?? error)
        // omp started a turn of its own (a background job finished, a todo reminder) just as we sent this:
        // hand the message to that turn instead of failing it, else retry once it is free
        if (/already processing|steer\(\) or followUp\(\)/iu.test(msg)) {
          const busyTurn = this.host.steering
            ? await this.host.rpc().request('_session/steering', { sessionId: this.id, prompt: [{ type: 'text', text: next.text }, ...next.images.map(i => ({ type: 'image', mimeType: i.mimeType, data: i.data }))] }).then(r => (r as { outcome?: string })?.outcome !== 'promptRequired' && (r as { outcome?: string })?.outcome !== 'failed', () => false)
            : false
          if (!busyTurn) {
            if ((next.tries ?? 0) < 5) { await new Promise(r => setTimeout(r, 2000)); this.queue.unshift({ ...next, shown: true, tries: (next.tries ?? 0) + 1 }) }
            else this.events.item(this, this.transcript.error('omp stayed busy with a turn of its own; your message was not sent. Send it again.'))
          }
        } else this.events.item(this, this.transcript.error(msg))
      } finally {
        this.busy = false
        this.waitingForKey = false
        this.events.state(this)
      }
      if (!this.named && this.queue.length === 0) void this.nameSession()
      if (this.goal?.status === 'active' && this.queue.length === 0) this.continueGoal()
      else if (this.queue.length === 0) this.continueTodos()
    }
  }

  /** Autopilot: the turn ended but its todo list is not finished — send it back to work (not after a stop). */
  private continueTodos(): void {
    const a = this.autopilot
    if (!a.enabled || this.cancelled || a.continues >= a.maxContinues) return
    const open = openTodos(this.transcript.items)
    if (!open.length) return
    a.continues++
    this.events.item(this, this.transcript.notice(`Autopilot: ${open.length} todo item${open.length > 1 ? 's' : ''} still open — continuing (${a.continues}/${a.maxContinues})`))
    this.queue.push({ text: continuePrompt(open), images: [], goal: true })
    void this.drain()
  }

  /** SSH cards already told to wait for your passphrase (once per card). */
  private readonly heldForKey = new Set<string>()
  /** @internal Show a notice line in this chat (used by the host for SSH key lifecycle). */
  events_notice(text: string): void { this.events.item(this, this.transcript.notice(text)) }

  /** omp was told to wait for your SSH passphrase; the stall watchdog leaves that wait alone. */
  waitingForKey = false
  /** The ask omp opened to hold its turn for the key, answered by `keyLoaded()`. */
  private keyAsk: string | undefined
  /** The key is in ssh-agent: release the held turn (or tell omp, if it did not hold). @returns true if a held ask was answered. */
  keyLoaded(): boolean {
    this.waitingForKey = false
    const id = this.keyAsk; this.keyAsk = undefined
    if (id === undefined || !this.asks.has(id)) return false
    const item = this.transcript.items.find(i => i.id === id)
    // answer with a value omp offered (the model names the option itself: "Loaded", "Loaded-preview"…);
    // anything else reads as a cancel on omp's side
    const [field, p] = item?.type === 'ask' ? Object.entries(item.schema.properties ?? {})[0] ?? [] : []
    const offered = p ? [...p.oneOf?.map(o => o.const) ?? [], ...p.enum ?? [], ...p.items?.anyOf?.map(o => o.const) ?? [], ...p.items?.enum ?? []] : []
    const value = offered.find(v => /load|yes|continue|done|ok/iu.test(v) && !/\bnot\b|\bno\b|chưa|không/iu.test(v)) ?? offered[0] ?? 'Loaded'
    this.answer(id, 'accept', field ? { [field]: p?.type === 'array' ? [value] : value } : undefined)
    return true
  }
  /**
   * A bash call failed for want of an unlocked SSH key: tell the running turn to wait for you instead of
   * reporting failure. The unlock box sends "key loaded" into the same turn, which ends that wait.
   */
  /** Read-only chat: the extension declines every write, delete, move and command. */
  readOnly = false
  /** omp was told this turn that nothing will be approved. */
  readOnlyTold = false
  /** @internal A tool was declined because the chat is read-only. */
  denied(title: string): void { this.events.item(this, this.transcript.notice(`Read-only chat — declined: ${title}`)) }

  /** Set by the host: keys currently in ssh-agent (to tell a locked key from a refused one). */
  agentKeys: () => Promise<string[]> = async () => []
  private holdForKey(item: ChatItem): void {
    if (item.type !== 'tool' || !this.busy || !this.host.steering) return
    const c = item.card
    if (c.status !== 'failed' && c.status !== 'completed') return
    if (!c.needsInput || !/ssh/iu.test(c.needsInput) || this.heldForKey.has(c.id)) return
    this.heldForKey.add(c.id)
    void this.agentKeys().then(keys => {
      if (!keys.length) { this.holdTurnForKey(); return }
      // a key is loaded and the server still refuses: not a passphrase problem
      delete c.needsInput; c.sshRefused = true
      this.events.item(this, item)
      this.events.item(this, this.transcript.notice(`Server refused the SSH key that is loaded (${keys.length} key${keys.length > 1 ? 's' : ''} in ssh-agent) — check user, port, or that this key's .pub is in the server's authorized_keys`))
    })
  }
  private holdTurnForKey(): void {
    if (!this.busy) return
    this.waitingForKey = true
    this.events.item(this, this.transcript.notice('SSH key locked — told omp to wait while you unlock it above the input'))
    void this.host.rpc().request('_session/steering', { sessionId: this.id, prompt: [{ type: 'text', text: [
      'The SSH command failed only because my SSH key is locked. I am unlocking it now in the editor (it asks me for the passphrase).',
      'Do NOT report the failure and do NOT end your turn. Instead call the ask tool once with exactly this question:',
      `"${KEY_QUESTION}" and one option "Loaded". That call blocks until the key is in ssh-agent.`,
      'When it returns, retry the same command with the default ssh-agent (do not set SSH_AUTH_SOCK) and continue the task.',
    ].join(' ') }] }).catch(() => {})
  }

  /** Autopilot: tell the running turn to stop a wait that will never return. */
  nudge(text: string, notice = 'Autopilot: the wait had nothing left to wait for — told omp to read the results and go on'): void {
    if (!this.busy) return
    this.events.item(this, this.transcript.notice(notice))
    if (this.host.steering) void this.host.rpc().request('_session/steering', { sessionId: this.id, prompt: [{ type: 'text', text }] }).catch(() => {})
  }

  /** After a turn: decide from the last reply whether the goal goes on, then queue the next prompt. */
  private continueGoal(): void {
    if (this.goal === undefined) return
    const items = this.transcript.items
    let i = items.length - 1; while (i >= 0 && items[i]!.type !== 'assistant') i--
    const reply = i >= 0 ? (items[i] as { text: string }).text : ''
    const r = goalNext(this.goal, reply, this.usage.cost ?? 0, this.cancelled)
    this.goal = r.goal
    this.events.state(this)
    if (r.prompt) { this.queue.push({ text: r.prompt, images: [], goal: true }); void this.drain() }
  }

  /** Start, pause, resume or stop the goal for this chat. */
  setGoal(action: 'start' | 'pause' | 'resume' | 'stop', opts: { objective?: string; maxTurns?: number; maxCost?: number } = {}): void {
    if (action === 'start') {
      if (!opts.objective?.trim()) return
      this.goal = { objective: opts.objective.trim(), status: 'active', turns: 0, maxTurns: opts.maxTurns ?? 20, maxCost: opts.maxCost ?? 0, costAtStart: this.usage.cost ?? 0 }
      this.events.state(this)
      this.queue.push({ text: startPrompt(this.goal.objective), images: [], goal: true })
      this.events.item(this, this.transcript.user(`🎯 Goal: ${this.goal.objective}`))
      if (!this.busy) void this.drain()
      return
    }
    if (this.goal === undefined) return
    if (action === 'pause') this.goal = { ...this.goal, status: 'paused', reason: 'paused by you' }
    if (action === 'stop') { this.goal = { ...this.goal, status: 'stopped', reason: 'stopped by you' }; this.queue = this.queue.filter(q => !q.goal) }
    if (action === 'resume' && this.goal.status !== 'done') {
      this.goal = { ...this.goal, status: 'active', reason: undefined, ...this.goal.status === 'limit' ? { maxTurns: this.goal.turns + Math.max(5, Math.ceil(this.goal.maxTurns / 2)) } : {} }
      if (!this.busy) { this.queue.push({ text: `Continue working toward the goal: ${this.goal.objective}`, images: [], goal: true }); void this.drain() }
    }
    this.events.state(this)
  }

  /** omp names sessions by itself only in its TUI; over ACP ask once with `/rename` (no args = generate). */
  private named = false
  private renaming = false
  private async nameSession(): Promise<void> {
    this.named = true
    this.renaming = true
    try { await this.host.rpc().request(methods.agent.session.prompt, { sessionId: this.id, prompt: [{ type: 'text', text: '/rename' }] }) } catch { /* title stays the first prompt */ }
    finally { this.renaming = false }
    if (this.queue.length > 0 && !this.busy) void this.drain()
  }

  /** Ask omp for a title if this session has none yet (no-op while a turn runs; it names itself after). */
  ensureNamed(): void { if (!this.named && !this.busy) void this.nameSession() }

  /** @internal Session already carries an omp title. */
  markNamed(): void { this.named = true }

  /** Open questions from omp's `ask` tool, keyed by transcript item id. */
  private asks = new Map<string, (r: { action: 'accept' | 'decline' | 'cancel'; content?: Record<string, AskValue> }) => void>()

  /** @internal omp asked the user something; resolves when the form is answered. */
/**
   * Move omp back to just before your prompt `itemId` (via the `/vsc-rewind` omp extension) and drop it and
   * everything after from this tab. Later turns stay in omp's session tree as an old branch.
   * @returns the prompt's text and images, to put back in the input.
   */
  async rewindTo(itemId: string): Promise<{ text: string; images: { mimeType: string; data: string }[] }> {
    const items = this.transcript.items
    const target = items.find(i => i.id === itemId)
    if (target?.type !== 'user') throw new Error('Not a prompt in this chat.')
    const n = items.filter(i => i.type === 'user').indexOf(target) + 1
    this.renaming = true // swallow the command's own notice
    try {
      await this.host.rpc().request(methods.agent.session.prompt, { sessionId: this.id, prompt: [{ type: 'text', text: `/vsc-rewind ${n}` }] })
    } finally { this.renaming = false }
    this.transcript.truncateAt(itemId)
    this.events.reset(this)
    return { text: target.text, images: target.images ?? [] }
  }

  private permits = new Map<string, (optionId: string | undefined) => void>()

  /** @internal omp needs consent for a tool; resolves with the chosen option (undefined = cancel). */
  permit(title: string, options: { optionId: string; name: string; kind: string }[]): Promise<string | undefined> {
    const item = this.transcript.permission(title, options)
    this.events.item(this, item)
    return new Promise(resolve => this.permits.set(item.id, resolve))
  }

  /** The user picked an option on permission card `itemId`. */
  choose(itemId: string, optionId: string | undefined): void {
    const resolve = this.permits.get(itemId)
    const item = this.transcript.items.find(i => i.id === itemId)
    if (resolve === undefined || item?.type !== 'permission') return
    this.permits.delete(itemId)
    item.chosen = optionId ?? 'cancelled'
    this.events.item(this, item)
    resolve(optionId)
  }

  ask(message: string, schema: AskSchema): Promise<{ action: 'accept' | 'decline' | 'cancel'; content?: Record<string, AskValue> }> {
    // read-only chat: plan mode keeps omp from writing until a plan is approved, so never approve one
    if (this.readOnly && /^Approve plan "/u.test(message)) {
      this.events.item(this, this.transcript.notice('Read-only chat — plan not approved, omp stays read-only'))
      // tell the turn why, or it re-submits the plan in a loop
      this.readOnlyTold = true
      if (this.host.steering) void this.host.rpc().request('_session/steering', { sessionId: this.id, prompt: [{ type: 'text', text: 'This chat is read-only: no plan will be approved and nothing may be written or run. Do not propose again. Answer from what you can read, say what you would change, and end your turn.' }] }).catch(() => {})
      return Promise.resolve({ action: 'decline' })
    }
    // read-only uses omp's plan mode, which makes the model end every turn with an ask; once omp has been told
    // it is read-only, decline those follow-up asks so the turn ends instead of waiting on you
    if (this.readOnly && this.readOnlyTold) return Promise.resolve({ action: 'decline' })
    const item = this.transcript.ask(message, schema)
    if (this.waitingForKey && isKeyQuestion(message, schema)) { this.keyAsk = item.id; if (item.type === 'ask') item.hold = 'ssh' }
    this.events.item(this, item)
    return new Promise(resolve => this.asks.set(item.id, resolve))
  }

  /** The user answered (or skipped) question `itemId`. */
  answer(itemId: string, action: 'accept' | 'decline' | 'cancel', content?: Record<string, AskValue>): void {
    const resolve = this.asks.get(itemId)
    const item = this.transcript.items.find(i => i.id === itemId)
    if (resolve === undefined || item?.type !== 'ask') return
    this.asks.delete(itemId)
    item.answer = { action, ...content ? { content } : {} }
    this.events.item(this, item)
    resolve(item.answer)
  }

  /** Stop the running turn and drop queued prompts. */
  cancel(): void {
    this.cancelled = true
    for (const id of [...this.asks.keys()]) this.answer(id, 'cancel')
    for (const id of [...this.permits.keys()]) this.choose(id, undefined)
    this.queue = []
    void this.host.rpc().notify(methods.agent.session.cancel, { sessionId: this.id }).catch(() => {})
    this.events.state(this)
  }

  /** Set an omp session config option (`model`, `thinking`). */
  async setOption(configId: 'model' | 'thinking', value: string): Promise<void> {
    const r = await this.host.rpc().request(methods.agent.session.setConfigOption, { sessionId: this.id, configId, value }) as { configOptions?: ConfigOption[] }
    this.readConfig(r?.configOptions ?? [])
    if (configId === 'model') this.model = value
    if (configId === 'thinking') this.thinking = value
    this.events.state(this)
  }

  /** Switch omp mode (default / plan). */
  async setMode(modeId: string): Promise<void> {
    await this.host.rpc().request(methods.agent.session.setMode, { sessionId: this.id, modeId })
    this.mode = modeId
    this.events.state(this)
  }

  /** Session cost when your last message started, and what that work has cost since (USD). */
  turnStartCost: number | undefined
  turnCost: number | undefined
  /** omp's process exited; cleared when it starts again. */
  dead = false
  /** @internal Mark the session dead after the omp process exits. */
  fail(reason: string): void {
    this.dead = true
    this.queue = []
    if (this.busy) { this.busy = false; this.events.item(this, this.transcript.error(reason)) }
    this.events.state(this)
  }
}

/** One `omp acp` process serving many sessions. */
export class OmpHost {
  private child: ChildProcess | undefined
  private client: Rpc | undefined
  private starting: Promise<void> | undefined
  readonly sessions = new Map<string, OmpSession>()
  /** omp's own MCP servers for a session in `cwd` (ACP mode connects only what the client sends). */
  private async mcp(cwd: string): Promise<Awaited<ReturnType<typeof ompMcpServers>>> {
    try { return await ompMcpServers(cwd) } catch (error) { this.events.log(`mcp config: ${String(error)}`); return [] }
  }
  /** Kill omp (if it is still running) so the next message starts a fresh process. */
  async restart(): Promise<void> {
    const child = this.child
    if (child) {
      const gone = new Promise<void>(r => child.once('exit', () => r()))
      try { child.kill() } catch { /* already gone */ }
      await Promise.race([gone, new Promise(r => setTimeout(r, 5000))])
    }
    // start omp again and reopen every session now, so the tab works before you type
    await this.ensure()
    for (const s of this.sessions.values()) await this.ready(s).catch(() => {})
  }

  /** omp accepts `_session/steering` (messages into a running turn). */
  steering = false

  constructor(private readonly command: () => Promise<string>, private readonly cwd: () => string, private readonly events: HostEvents) {}

  /** @internal Live connection (throws when omp is not running). */
  rpc(): Rpc {
    if (this.client === undefined) throw new Error('omp is not running')
    return this.client
  }

  /** Start omp once (idempotent). */
  ensure(): Promise<void> {
    if (this.client !== undefined) return Promise.resolve()
    this.starting ??= this.spawn().finally(() => { this.starting = undefined })
    return this.starting
  }

  private async spawn(): Promise<void> {
    const exe = await this.command()
    const child = spawn(exe, ['acp'], { cwd: this.cwd(), env: ompEnv(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    this.child = child
    for (const s of this.sessions.values()) if (s.dead) { s.dead = false; this.events.state(s) }
    child.stderr?.on('data', (d: Buffer) => { this.events.log(String(d).trimEnd()) })
    child.once('exit', (code) => {
      this.events.log(`omp exited (${String(code)})`)
      this.child = undefined; this.client = undefined
      for (const s of this.sessions.values()) s.fail(`omp stopped unexpectedly (exit ${String(code)}). Send a message to restart.`)
      // Sessions are omp-side state; after a crash each tab reopens its session on the next prompt.
      this.revive = new Set(this.sessions.keys())
    })
    const app = createAcpClientApp({ name: 'oh-my-pi-vscode' })
      .onNotification(methods.client.session.update, ({ params }) => {
        this.sessions.get(params.sessionId)?.onUpdate(params.update as unknown as Record<string, unknown>)
        return Promise.resolve()
      })
      .onRequest(methods.client.session.requestPermission, async ({ params }) => {
        const title = String((params.toolCall as { title?: unknown }).title ?? 'Run tool')
        const s = this.sessions.get(params.sessionId)
        const kind = String((params.toolCall as { kind?: unknown }).kind ?? '')
        // read-only chat: anything that changes files or runs a command is declined without asking you
        if (s?.readOnly && /^(edit|delete|move|execute)$/u.test(kind)) {
          s.denied(title)
          const reject = params.options.find(o => o.kind === 'reject_once') ?? params.options.find(o => o.kind?.startsWith('reject'))
          return reject ? { outcome: { outcome: 'selected' as const, optionId: reject.optionId } } : { outcome: { outcome: 'cancelled' as const } }
        }
        const chosen = await this.events.permission(s, title, params.options.map(o => ({ optionId: o.optionId, name: o.name, kind: o.kind })))
        return chosen === undefined ? { outcome: { outcome: 'cancelled' as const } } : { outcome: { outcome: 'selected' as const, optionId: chosen } }
      })
    app.onRequest(methods.client.elicitation.create, async ({ params }) => {
      const p = params as { mode?: string; sessionId?: string; message: string; requestedSchema?: AskSchema }
      const s = p.sessionId === undefined ? undefined : this.sessions.get(p.sessionId)
      if (s === undefined || p.mode !== 'form' || p.requestedSchema === undefined) return { action: 'cancel' as const }
      return await s.ask(p.message, p.requestedSchema) as never
    })
    const connection = app.connect(ndJsonStream(
      NodeWritable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
      NodeReadable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
    ))
    const rpc = connection.agent as unknown as Rpc
    const init = await rpc.request(methods.agent.initialize, { protocolVersion: PROTOCOL_VERSION, clientCapabilities: { elicitation: { form: {} } } }) as { _meta?: { steering?: { supported?: boolean } } }
    this.steering = init?._meta?.steering?.supported === true
    this.client = rpc
  }

  /** Sessions to reopen after an omp crash. */
  private revive = new Set<string>()

  /**
   * Make sure omp knows this session (reloads it after a crash).
   * @param session - tab session.
   */
  async ready(session: OmpSession): Promise<void> {
    await this.ensure()
    if (this.revive.delete(session.id)) {
      await this.rpc().request(methods.agent.session.load, { sessionId: session.id, cwd: this.cwd(), mcpServers: await this.mcp(this.cwd()) }).catch(() => {})
    }
  }

  /**
   * Start a fresh omp session.
   * @param carry - model / thinking to apply (keeps the user's picks across tabs).
   * @returns the session.
   */
  async create(carry: { model?: string; thinking?: string } = {}): Promise<OmpSession> {
    await this.ensure()
    const created = await this.rpc().request(methods.agent.session.new, { cwd: this.cwd(), mcpServers: await this.mcp(this.cwd()) }) as { sessionId: string; configOptions?: ConfigOption[] }
    const session = new OmpSession(this, created.sessionId, this.events)
    session.readConfig(created.configOptions ?? [])
    this.sessions.set(session.id, session)
    if (carry.model && carry.model !== session.model) await session.setOption('model', carry.model).catch(() => {})
    if (carry.thinking && carry.thinking !== session.thinking) await session.setOption('thinking', carry.thinking).catch(() => {})
    return session
  }

  /**
   * Reopen an omp session from history; omp replays its messages as updates.
   * @param row - history row.
   * @returns the session (already open sessions are returned as-is).
   */
  async open(row: SessionRow): Promise<OmpSession> {
    const existing = this.sessions.get(row.sessionId)
    if (existing !== undefined) return existing
    await this.ensure()
    const session = new OmpSession(this, row.sessionId, this.events)
    if (row.title) { session.title = row.title; if (!/^untitled/iu.test(row.title)) session.markNamed() }
    this.sessions.set(session.id, session)
    this.events.reset(session)
    const r = await this.rpc().request(methods.agent.session.load, { sessionId: row.sessionId, cwd: row.cwd || this.cwd(), mcpServers: await this.mcp(row.cwd || this.cwd()) }) as { configOptions?: ConfigOption[] }
    session.readConfig(r?.configOptions ?? [])
    this.events.state(session)
    // Untitled session that already has a conversation: name it now, not after the next prompt.
    if (session.transcript.items.some(i => i.type === 'user')) session.ensureNamed()
    return session
  }

  /** Fork `source` into a new omp session (omp's own `session/fork`); the transcript is copied. */
  async fork(source: OmpSession): Promise<OmpSession> {
    await this.ensure()
    const r = await this.rpc().request(methods.agent.session.fork, { sessionId: source.id, cwd: this.cwd(), mcpServers: await this.mcp(this.cwd()) }) as { sessionId: string; configOptions?: ConfigOption[] }
    const session = new OmpSession(this, r.sessionId, this.events)
    session.title = `${source.title ?? 'Chat'} (fork)`
    session.transcript.copyFrom(source.transcript)
    session.readConfig(r.configOptions ?? [])
    this.sessions.set(session.id, session)
    return session
  }

  /**
   * Close a tab: stop its turn and forget it (the omp session stays in history).
   * @param id - session id.
   */
  close(id: string): void {
    const s = this.sessions.get(id)
    if (s === undefined) return
    if (s.busy) s.cancel()
    this.sessions.delete(id)
    if (this.client !== undefined) void this.client.request(methods.agent.session.close, { sessionId: id }).catch(() => {})
  }

  /** omp sessions for this folder, newest first. */
  async list(): Promise<SessionRow[]> {
    await this.ensure()
    const r = await this.rpc().request(methods.agent.session.list, {}) as { sessions?: SessionRow[] }
    const norm = (p: string) => p.replace(/\\/gu, '/').toLowerCase()
    const here = norm(this.cwd())
    return (r.sessions ?? []).filter(s => norm(s.cwd) === here)
  }

  dispose(): void { this.child?.kill() }
}
