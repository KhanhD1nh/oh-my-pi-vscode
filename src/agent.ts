/**
 * One long-lived `omp acp` child per workspace folder. Owns the ACP connection, the current omp session,
 * and the transcript; emits changes to the UI through callbacks. omp does all agent work (tools, prompts,
 * routing, memory, advisor); this class only relays.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { Readable as NodeReadable, Writable as NodeWritable } from 'node:stream'
import { client as createAcpClientApp, methods, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'
import { Transcript } from './transcript.ts'
import type { ChatItem, SessionRow } from './types.ts'

type Rpc = { request: (method: string, params: unknown) => Promise<any>; notify: (method: string, params: unknown) => Promise<void> }

/** omp session config option as ACP reports it. */
interface ConfigOption { id: string; currentValue?: string; options?: { value: string; name?: string }[] }

export interface AgentEvents {
  /** A transcript item changed. */
  item(item: ChatItem): void
  /** The whole transcript was replaced (new / loaded session). */
  reset(items: ChatItem[]): void
  /** Busy flag, model, thinking level, mode or command list changed. */
  state(): void
  /** Context usage and cost. */
  usage(used: number | undefined, size: number | undefined, cost: number | undefined): void
  /**
   * omp asks to run something that needs consent.
   * @returns the chosen option id, or undefined to cancel.
   */
  permission(title: string, options: { optionId: string; name: string; kind: string }[]): Promise<string | undefined>
  /** Diagnostic log line. */
  log(line: string): void
}

export class OmpAgent {
  private child: ChildProcess | undefined
  private rpc: Rpc | undefined
  private starting: Promise<void> | undefined
  transcript = new Transcript()
  sessionId: string | undefined
  busy = false
  model: string | undefined
  thinking: string | undefined
  thinkingLevels: string[] = []
  mode: string | undefined
  modes: { id: string; name: string }[] = []
  commands: { name: string; description?: string }[] = []

  constructor(private readonly command: () => Promise<string>, private readonly cwd: string, private readonly events: AgentEvents) {}

  /** Start the child and an initial session (idempotent). */
  async ensure(): Promise<void> {
    if (this.rpc !== undefined && this.sessionId !== undefined) return
    this.starting ??= this.start().finally(() => { this.starting = undefined })
    return this.starting
  }

  private async start(): Promise<void> {
    if (this.rpc === undefined) await this.spawn()
    if (this.sessionId === undefined) await this.newSession()
  }

  private async spawn(): Promise<void> {
    const exe = await this.command()
    const child = spawn(exe, ['acp'], { cwd: this.cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    this.child = child
    child.stderr?.on('data', (d: Buffer) => { this.events.log(String(d).trimEnd()) })
    child.once('exit', (code) => {
      this.events.log(`omp exited (${String(code)})`)
      this.child = undefined; this.rpc = undefined; this.sessionId = undefined
      if (this.busy) { this.busy = false; this.events.item(this.transcript.error(`omp stopped unexpectedly (exit ${String(code)}).`)); this.events.state() }
    })
    const app = createAcpClientApp({ name: 'oh-my-pi-vscode' })
      .onNotification(methods.client.session.update, ({ params }) => {
        if (params.sessionId === this.sessionId) this.onUpdate(params.update as unknown as Record<string, unknown>)
        return Promise.resolve()
      })
      .onRequest(methods.client.session.requestPermission, async ({ params }) => {
        const title = String((params.toolCall as { title?: unknown }).title ?? 'Run tool')
        const chosen = await this.events.permission(title, params.options.map(o => ({ optionId: o.optionId, name: o.name, kind: o.kind })))
        return chosen === undefined ? { outcome: { outcome: 'cancelled' as const } } : { outcome: { outcome: 'selected' as const, optionId: chosen } }
      })
    const connection = app.connect(ndJsonStream(
      NodeWritable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
      NodeReadable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
    ))
    this.rpc = connection.agent as unknown as Rpc
    await this.rpc.request(methods.agent.initialize, { protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} })
  }

  private onUpdate(update: Record<string, unknown>): void {
    switch (update.sessionUpdate) {
      case 'usage_update': {
        const cost = (update.cost as { amount?: number } | undefined)?.amount
        this.events.usage(update.used as number | undefined, update.size as number | undefined, cost)
        return
      }
      case 'available_commands_update':
        this.commands = ((update.availableCommands as Array<{ name: string; description?: string }>) ?? []).map(c => ({ name: c.name, ...c.description ? { description: c.description } : {} }))
        this.events.state()
        return
      case 'current_mode_update':
        this.mode = String(update.currentModeId ?? this.mode)
        this.events.state()
        return
      case 'config_option_update':
        this.readConfig((update.configOptions as ConfigOption[] | undefined) ?? [])
        this.events.state()
        return
      default: {
        const item = this.transcript.apply(update)
        if (item !== undefined) this.events.item(item)
      }
    }
  }

  private readConfig(options: ConfigOption[]): void {
    for (const o of options) {
      if (o.id === 'model') this.model = o.currentValue
      if (o.id === 'thinking') { this.thinking = o.currentValue; this.thinkingLevels = (o.options ?? []).map(x => x.value) }
      if (o.id === 'mode') { this.mode = o.currentValue; this.modes = (o.options ?? []).map(x => ({ id: x.value, name: x.name ?? x.value })) }
    }
  }

  /** Start a fresh omp session in this folder. */
  async newSession(): Promise<void> {
    if (this.rpc === undefined) await this.spawn()
    const created = await this.rpc!.request(methods.agent.session.new, { cwd: this.cwd, mcpServers: [] }) as { sessionId: string; configOptions?: ConfigOption[] }
    this.sessionId = created.sessionId
    this.readConfig(created.configOptions ?? [])
    this.transcript = new Transcript()
    this.events.reset(this.transcript.items)
    this.events.state()
  }

  /** omp sessions for this folder, newest first. */
  async listSessions(): Promise<SessionRow[]> {
    if (this.rpc === undefined) await this.spawn()
    const r = await this.rpc!.request(methods.agent.session.list, {}) as { sessions?: SessionRow[] }
    const norm = (p: string) => p.replace(/\\/gu, '/').toLowerCase()
    return (r.sessions ?? []).filter(s => norm(s.cwd) === norm(this.cwd))
  }

  /** Reopen an omp session; omp replays its history as updates. */
  async loadSession(sessionId: string): Promise<void> {
    if (this.rpc === undefined) await this.spawn()
    this.transcript = new Transcript()
    this.sessionId = sessionId
    this.events.reset(this.transcript.items)
    const r = await this.rpc!.request(methods.agent.session.load, { sessionId, cwd: this.cwd, mcpServers: [] }) as { configOptions?: ConfigOption[] }
    this.readConfig(r?.configOptions ?? [])
    this.events.state()
  }

  /** Send one prompt and wait for omp to finish the turn. */
  async prompt(text: string, images: { mimeType: string; data: string }[] = []): Promise<void> {
    await this.ensure()
    this.events.item(this.transcript.user(text))
    this.busy = true
    this.events.state()
    try {
      const prompt = [
        { type: 'text', text },
        ...images.map(i => ({ type: 'image', mimeType: i.mimeType, data: i.data })),
      ]
      const r = await this.rpc!.request(methods.agent.session.prompt, { sessionId: this.sessionId, prompt }) as { stopReason?: string }
      if (r?.stopReason === 'refusal') this.events.item(this.transcript.error('omp refused this request.'))
    } catch (error) {
      this.events.item(this.transcript.error(String((error as Error)?.message ?? error)))
    } finally {
      this.busy = false
      this.events.state()
    }
  }

  /** Stop the running turn. */
  cancel(): void {
    if (this.rpc !== undefined && this.sessionId !== undefined) {
      void this.rpc.notify(methods.agent.session.cancel, { sessionId: this.sessionId }).catch(() => {})
    }
  }

  /** Set an omp session config option (`model`, `thinking`). */
  async setOption(configId: 'model' | 'thinking', value: string): Promise<void> {
    await this.ensure()
    const r = await this.rpc!.request(methods.agent.session.setConfigOption, { sessionId: this.sessionId, configId, value }) as { configOptions?: ConfigOption[] }
    this.readConfig(r?.configOptions ?? [])
    if (configId === 'model') this.model = value
    if (configId === 'thinking') this.thinking = value
    this.events.state()
  }

  /** Switch omp mode (default / plan). */
  async setMode(modeId: string): Promise<void> {
    await this.ensure()
    await this.rpc!.request(methods.agent.session.setMode, { sessionId: this.sessionId, modeId })
    this.mode = modeId
    this.events.state()
  }

  dispose(): void { this.child?.kill() }
}
