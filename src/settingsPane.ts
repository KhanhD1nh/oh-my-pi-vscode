/** The sidebar's Settings view: loads omp's config through the CLI and writes changes one at a time. */
import type { OmpConfigCli } from './settings.ts'
import type { AgentModelChoice, AgentSetting, HostMessage } from './types.ts'

export class SettingsPane {
  private settings: AgentSetting[] = []
  private failed: Record<string, string> = {}
  private writes: Promise<void> = Promise.resolve()

  /**
   * @param post - send to the sidebar webview.
   * @param models - current model list (shared with the chats).
   * @param setModels - the settings load also refreshes the model list.
   */
  constructor(
    private readonly cli: OmpConfigCli,
    private readonly post: (m: HostMessage) => void,
    private readonly models: () => AgentModelChoice[],
    private readonly setModels: (m: AgentModelChoice[]) => void,
  ) {}

  private send(status: 'loading' | 'ready' | 'error', error?: string): void {
    this.post({ type: 'settings', status, ...error ? { error } : {}, settings: this.settings, models: this.models(), failed: this.failed })
  }

  async refresh(): Promise<void> {
    this.send('loading')
    try {
      const [settings, models] = await Promise.all([this.cli.list(), this.cli.models()])
      this.settings = settings
      this.setModels(models)
      this.send('ready')
    } catch (error) {
      this.send('error', String((error as Error)?.message ?? error))
    }
  }

  /** Writes run one at a time in the background; the UI updates immediately (optimistic). */
  write(key: string, value: AgentSetting['value']): void {
    const setting = this.settings.find(s => s.key === key)
    if (setting === undefined) return
    const previous = setting.value
    setting.value = value
    this.failed = { ...this.failed, [key]: '' }
    this.send('ready')
    this.writes = this.writes.then(() => this.cli.set(setting, value)).catch((error: unknown) => {
      setting.value = previous
      this.failed = { ...this.failed, [key]: String((error as Error)?.message ?? error) }
      this.send('ready')
    })
  }

  reset(key: string): void {
    this.writes = this.writes.then(async () => {
      await this.cli.reset(key)
      // Defaults are only known to omp; re-read once after the reset.
      this.settings = await this.cli.list()
      this.send('ready')
    }).catch((error: unknown) => {
      this.failed = { ...this.failed, [key]: String((error as Error)?.message ?? error) }
      this.send('ready')
    })
  }
}
