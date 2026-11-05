/** Shared shapes between the extension host and the webview. */

export type AgentSettingValue = string | number | boolean | null | AgentSettingValue[] | { [key: string]: AgentSettingValue }

/** One omp setting (one `omp config` key). */
export interface AgentSetting {
  key: string
  group: string
  type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'record'
  value?: AgentSettingValue
  description: string
  options?: string[]
  choices?: { kind: 'select' | 'multi'; values: string[] }
  redacted?: boolean
}

/** One model omp can route to. */
export interface AgentModelChoice {
  selector: string
  provider: string
  id: string
  name: string
  reasoning: boolean
}

/** Tool call as the chat renders it. */
export interface ToolCard {
  id: string
  kind: string
  name: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  path?: string
  input?: string
  output?: string
  diff?: { path: string; oldText: string; newText: string }
}

/** One transcript item. */
export type ChatItem =
  | { type: 'user'; id: string; text: string }
  | { type: 'assistant'; id: string; text: string }
  | { type: 'thought'; id: string; text: string }
  | { type: 'tool'; id: string; card: ToolCard }
  | { type: 'error'; id: string; text: string }

/** Session row in history. */
export interface SessionRow { sessionId: string; title?: string; cwd: string; updatedAt?: string }

/** One open tab (omp session) as the webview shows it. */
export interface TabState {
  id: string
  title?: string
  busy: boolean
  queued: number
  model?: string
  thinking?: string
  thinkingLevels: string[]
  mode?: string
  modes: { id: string; name: string }[]
  commands: { name: string; description?: string }[]
  usage: { used?: number; size?: number; cost?: number }
  /** Unseen activity since the tab was last active. */
  unread?: boolean
}

/** Host → webview messages. Tab-scoped messages carry the session id. */
export type HostMessage =
  | { type: 'tabs'; tabs: TabState[]; active?: string; models: AgentModelChoice[]; cwd: string }
  | { type: 'tab'; tab: TabState }
  | { type: 'reset'; tab: string; items: ChatItem[] }
  | { type: 'upsert'; tab: string; item: ChatItem }
  | { type: 'sessions'; rows: SessionRow[] }
  | { type: 'settings'; status: 'loading' | 'ready' | 'error'; error?: string; settings: AgentSetting[]; models: AgentModelChoice[]; saving?: string; failed?: Record<string, string> }
  | { type: 'view'; view: 'chat' | 'history' | 'settings' }
  | { type: 'insert'; text: string }
  | { type: 'files'; query: string; files: string[] }

/** Webview → host messages. */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'prompt'; tab: string; text: string; images?: { mimeType: string; data: string }[] }
  | { type: 'cancel'; tab: string }
  | { type: 'newTab' }
  | { type: 'closeTab'; tab: string }
  | { type: 'activate'; tab: string }
  | { type: 'setModel'; tab: string; value: string }
  | { type: 'setThinking'; tab: string; value: string }
  | { type: 'setMode'; tab: string; value: string }
  | { type: 'openFile'; path: string; line?: number }
  | { type: 'openDiff'; tab: string; toolId: string }
  | { type: 'listSessions' }
  | { type: 'loadSession'; sessionId: string }
  | { type: 'loadSettings' }
  | { type: 'setSetting'; key: string; value: AgentSettingValue }
  | { type: 'resetSetting'; key: string }
  | { type: 'findFiles'; query: string }
  | { type: 'fork'; tab: string }
  | { type: 'rewind'; tab: string; itemId: string }
