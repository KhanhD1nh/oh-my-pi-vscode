/**
 * omp over ACP with several concurrent sessions. One `omp acp` child ({@link OmpHost}) serves many
 * {@link OmpSession}s; each session owns its own transcript, busy flag, model, thinking and mode, so the
 * UI can show one tab per session and keep them all running. omp does all agent work; this only relays.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { Readable as NodeReadable, Writable as NodeWritable } from 'node:stream'
import { client as createAcpClientApp, methods, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'
import { ompEnv } from './binary.ts'
import { Transcript } from './transcript.ts'
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
  queue: { text: string; images: { mimeType: string; data: string }[]; shown?: boolean }[] = []

  constructor(private readonly host: OmpHost, readonly id: string, private readonly events: SessionEvents) {}

  /** @internal Fold one ACP update for this session. */
  onUpdate(update: Record<string, unknown>): void {
    switch (update.sessionUpdate) {
      case 'usage_update': {
        const cost = (update.cost as { amount?: number } | undefined)?.amount
        this.usage = { ...typeof update.used === 'number' ? { used: update.used } : {}, ...typeof update.size === 'number' ? { size: update.size } : {}, ...typeof cost === 'number' ? { cost } : {} }
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
        if (item !== undefined) this.events.item(this, item)
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
      if (!next.shown) this.events.item(this, this.transcript.user(next.text, next.images))
      this.busy = true
      this.events.state(this)
      try {
        const prompt = [{ type: 'text', text: next.text }, ...next.images.map(i => ({ type: 'image', mimeType: i.mimeType, data: i.data }))]
        const r = await this.host.rpc().request(methods.agent.session.prompt, { sessionId: this.id, prompt }) as { stopReason?: string }
        if (r?.stopReason === 'refusal') this.events.item(this, this.transcript.error('omp refused this request.'))
      } catch (error) {
        this.events.item(this, this.transcript.error(String((error as Error)?.message ?? error)))
      } finally {
        this.busy = false
        this.events.state(this)
      }
      if (!this.named && this.queue.length === 0) void this.nameSession()
    }
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
  ask(message: string, schema: AskSchema): Promise<{ action: 'accept' | 'decline' | 'cancel'; content?: Record<string, AskValue> }> {
    const item = this.transcript.ask(message, schema)
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
    for (const id of [...this.asks.keys()]) this.answer(id, 'cancel')
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

  /** @internal Mark the session dead after the omp process exits. */
  fail(reason: string): void {
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
        const chosen = await this.events.permission(this.sessions.get(params.sessionId), title, params.options.map(o => ({ optionId: o.optionId, name: o.name, kind: o.kind })))
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
      await this.rpc().request(methods.agent.session.load, { sessionId: session.id, cwd: this.cwd(), mcpServers: [] }).catch(() => {})
    }
  }

  /**
   * Start a fresh omp session.
   * @param carry - model / thinking to apply (keeps the user's picks across tabs).
   * @returns the session.
   */
  async create(carry: { model?: string; thinking?: string } = {}): Promise<OmpSession> {
    await this.ensure()
    const created = await this.rpc().request(methods.agent.session.new, { cwd: this.cwd(), mcpServers: [] }) as { sessionId: string; configOptions?: ConfigOption[] }
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
    const r = await this.rpc().request(methods.agent.session.load, { sessionId: row.sessionId, cwd: row.cwd || this.cwd(), mcpServers: [] }) as { configOptions?: ConfigOption[] }
    session.readConfig(r?.configOptions ?? [])
    this.events.state(session)
    // Untitled session that already has a conversation: name it now, not after the next prompt.
    if (session.transcript.items.some(i => i.type === 'user')) session.ensureNamed()
    return session
  }

  /** Fork `source` into a new omp session (omp's own `session/fork`); the transcript is copied. */
  async fork(source: OmpSession): Promise<OmpSession> {
    await this.ensure()
    const r = await this.rpc().request(methods.agent.session.fork, { sessionId: source.id, cwd: this.cwd(), mcpServers: [] }) as { sessionId: string; configOptions?: ConfigOption[] }
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
