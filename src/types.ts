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
  contextWindow?: number
  /** USD per million tokens. */
  cost?: { input: number; output: number }
  /** omp role names (default, task, plan…) this model is assigned to. */
  roles?: string[]
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
  /** omp `todo` tool: the full list after this call. */
  todo?: TodoPhase[]
}

/** One phase of omp's todo list. */
export interface TodoPhase { name: string; tasks: { content: string; status: 'pending' | 'in_progress' | 'completed' | 'abandoned' | string }[] }

/** One transcript item. */
export type ChatItem =
  | { type: 'user'; id: string; text: string; images?: { mimeType: string; data: string }[] }
  | { type: 'assistant'; id: string; text: string }
  | { type: 'thought'; id: string; text: string }
  | { type: 'tool'; id: string; card: ToolCard }
  | { type: 'error'; id: string; text: string }
  | { type: 'permission'; id: string; title: string; options: { optionId: string; name: string; kind: string }[]; chosen?: string }
  | { type: 'ask'; id: string; message: string; schema: AskSchema; answer?: { action: 'accept' | 'decline' | 'cancel'; content?: Record<string, AskValue> } }

/** Value of one answered form field. */
export type AskValue = string | number | boolean | string[]
/** JSON-schema subset omp sends with `elicitation/create` (form mode). */
export interface AskSchema {
  properties?: Record<string, { type: string; title?: string | null; description?: string | null; enum?: string[] | null; oneOf?: { const: string; title: string; description?: string | null }[] | null; items?: { enum?: string[]; anyOf?: { const: string; title: string; description?: string | null }[] }; default?: AskValue | null }>
  required?: string[] | null
}

/** Session row in history. */
export interface SessionRow { sessionId: string; title?: string; cwd: string; updatedAt?: string; stats?: SessionStats }

/** Totals read from an omp session file. */
export interface SessionStats {
  cost: number
  input: number
  output: number
  cacheRead: number
  /** Time spent waiting on the model, ms. */
  apiMs: number
  /** First to last event, ms. */
  wallMs?: number
  prompts: number
  tools: number
  added: number
  removed: number
  model?: string
  cacheWrite?: number
  /** Model generation time (duration minus time-to-first-token), ms. */
  genMs?: number
}

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
  /** Totals for this session read from omp's session file. */
  stats?: SessionStats
  /** Workspace folder name, git branch and tab open time (ms) for the status line. */
  folder?: string
  branch?: string
  startedAt?: number
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
  | { type: 'insert'; text: string; inline?: boolean; replace?: boolean; images?: { mimeType: string; data: string }[] }
  | { type: 'files'; query: string; files: string[] }
  | { type: 'approval'; value: string }
  | { type: 'agentSteps'; toolId: string; name: string; steps: { tool?: string; label: string; status: 'running' | 'done' | 'failed' }[]; model?: string; cost: number }

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
  | { type: 'editFrom'; tab: string; itemId: string; rewindCode?: boolean }
  | { type: 'setApproval'; value: string }
  | { type: 'agentSteps'; tab: string; toolId: string; name: string }
  | { type: 'addSelection' }
  | { type: 'mentionPaths'; paths: string[] }
  | { type: 'exportChat'; tab: string; markdown: string }
  | { type: 'permit'; tab: string; itemId: string; optionId?: string }
  | { type: 'answer'; tab: string; itemId: string; action: 'accept' | 'decline' | 'cancel'; content?: Record<string, AskValue> }
  | { type: 'rewind'; tab: string; itemId: string }
