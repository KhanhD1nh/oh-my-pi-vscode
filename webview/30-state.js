// Webview state (S) and per-tab accessors.
// ───────────── state ─────────────
/** 'panel' = one chat in an editor tab; 'sidebar' = history + settings. */
const MODE = document.body.dataset.mode ?? 'panel'
if (document.body.dataset.session) vscode.setState?.({ sessionId: decodeURIComponent(document.body.dataset.session), cwd: decodeURIComponent(document.body.dataset.cwd ?? '') })
const S = {
  view: MODE === 'sidebar' ? 'history' : 'chat', tabs: [], active: undefined, models: [], cwd: '', transcripts: {},
  sessions: [], settings: { status: 'idle', settings: [], models: [], failed: {} },
  query: '', group: 'model', open: new Set(), images: [], menu: null, sessionQuery: '', modelQuery: '',
  files: [], fileQuery: null, menuIndex: 0, drafts: {}, window: {},
}
const tab = () => S.tabs.find(t => t.id === S.active) ?? { busy: false, queued: 0, thinkingLevels: [], modes: [], commands: [], usage: {} }
const items = () => S.transcripts[S.active] ?? []
