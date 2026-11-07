/** Webview → host messages: one handler per message type, all run against the chat provider. */
import * as vscode from 'vscode'
import type { ChatProvider } from './chats.ts'
import { agentConversation, agentSteps, sessionJobs } from './stats.ts'
import { sshKeys, unlockKey } from './sshUnlock.ts'
import type { HostMessage, WebviewMessage } from './types.ts'
import { exportChat, findFiles, mentionText, openDiff, openFile, revertEditsAfter } from './workspace.ts'

/** omp's global tool-approval setting, shown as the composer's Mode menu. */
export const APPROVAL_KEY = 'tools.approvalMode'
const APPROVAL_MODES = ['always-ask', 'always-ask-cached', 'write', 'yolo'] as const

/** omp refuses some moves while a turn runs; ask, then stop the turn and wait for it to settle. */
async function stopFirst(p: ChatProvider, tabId: string, question: string, button: string): Promise<boolean> {
  const t = p.tab(tabId)
  if (t === undefined) return false
  if (!t.session.busy) return true
  const pick = await vscode.window.showWarningMessage(question, { modal: true }, button)
  if (pick !== button) return false
  t.session.cancel()
  for (let i = 0; i < 50 && t.session.busy; i++) await new Promise(r => setTimeout(r, 100))
  return true
}

/**
 * Handle one message from a webview.
 * @param from - tab id of the sending chat panel; undefined for the sidebar.
 */
export async function handleMessage(p: ChatProvider, m: WebviewMessage, from: string | undefined): Promise<void> {
  const reply = (msg: HostMessage) => { if (from === undefined) p.post(msg); else p.postTab(from, msg) }
  const cwdOf = (tabId: string | undefined) => p.tab(tabId)?.cwd ?? p.currentFolder()
  switch (m.type) {
    case 'ready': {
      void p.loadModels()
      void p.cli.get(APPROVAL_KEY).then(value => reply({ type: 'approval', value }), () => {})
      p.postTabs()
      const t = p.tab(from)
      if (t) reply({ type: 'reset', tab: t.session.id, items: t.session.transcript.items })
      else reply({ type: 'sessions', rows: await p.sessionRows() })
      return
    }
    case 'newTab': await p.newTab(); return
    case 'closeTab': p.tab(m.tab)?.panel.dispose(); return
    case 'activate': p.tab(m.tab)?.panel.reveal(); return
    case 'prompt': {
      const t = p.tab(m.tab)
      if (t === undefined) return
      await p.host(t.cwd).ready(t.session)
      t.session.prompt(m.text, m.images ?? [])
      return
    }
    case 'cancel': p.tab(m.tab)?.session.cancel(); return
    case 'setModel': await p.tab(m.tab)?.session.setOption('model', m.value); return
    case 'setThinking': await p.tab(m.tab)?.session.setOption('thinking', m.value); return
    case 'setMode': await p.tab(m.tab)?.session.setMode(m.value); return
    case 'autopilot': { const t = p.tab(m.tab); if (t) { t.session.autopilot.enabled = m.on; t.session.autopilot.pinned = true; p.refreshTab(t.session.id) } return }
    case 'openFile': await openFile(cwdOf(p.active), m.path, m.line); return
    case 'openDiff': await openDiff(p.tab(m.tab)?.session.transcript.card(m.toolId), m.toolId, p.diffBefore); return
    case 'listSessions': reply({ type: 'sessions', rows: await p.sessionRows() }); return
    case 'loadSession': await p.openSession(m.sessionId); return
    case 'goal': {
      const cfg = vscode.workspace.getConfiguration('ohMyPi')
      p.tab(m.tab)?.session.setGoal(m.action, { ...m.objective !== undefined ? { objective: m.objective } : {}, maxTurns: m.maxTurns ?? cfg.get<number>('goal.maxTurns', 50), maxCost: m.maxCost ?? cfg.get<number>('goal.maxCost', 0) })
      return
    }
    case 'editFrom': {
      const t = p.tab(m.tab)
      if (t === undefined || !await stopFirst(p, m.tab, 'omp is still working in this chat. Stop it and go back to this message?', 'Stop and go back')) return
      if (m.rewindCode) await revertEditsAfter(t.session.transcript.items, m.itemId, true)
      const prompt = await t.session.rewindTo(m.itemId)
      p.postTab(m.tab, { type: 'insert', text: prompt.text, replace: true, images: prompt.images })
      return
    }
    case 'fork': {
      const t = p.tab(m.tab)
      if (t === undefined || !await stopFirst(p, m.tab, 'omp is still working in this chat. Stop the current turn and fork?', 'Stop and fork')) return
      p.openPanel(await p.host(t.cwd).fork(t.session), t.cwd)
      return
    }
    case 'setApproval':
      await p.cli.set({ key: APPROVAL_KEY, type: 'enum', options: [...APPROVAL_MODES] }, m.value)
      for (const x of p.tabs) p.postTab(x.session.id, { type: 'approval', value: m.value })
      return
    case 'addSelection': p.addSelection(); return
    case 'mentionPaths': reply({ type: 'insert', inline: true, text: mentionText(m.paths) }); return
    case 'exportChat': { const t = p.tab(m.tab); await exportChat(t?.session.title, cwdOf(m.tab), m.markdown); return }
    case 'permit': p.tab(m.tab)?.session.choose(m.itemId, m.optionId); return
    case 'answer': p.tab(m.tab)?.session.answer(m.itemId, m.action, m.content); return
    case 'rewind': { const t = p.tab(m.tab); if (t) await revertEditsAfter(t.session.transcript.items, m.itemId); return }
    case 'sshKeys': reply({ type: 'sshKeys', keys: await sshKeys() }); return
    case 'unlockKey': {
      const r = await unlockKey(m.key, m.passphrase, p.storage)
      reply({ type: 'unlocked', key: m.key, ...r })
      // the key is in the agent now: tell the running turn (or the next one) to try again
      if (r.ok) { const t = p.tab(m.tab); if (t && !t.session.keyLoaded()) { const msg = `I loaded the SSH key ${m.key.split(/[\\/]/u).pop()} into ssh-agent. Retry the ssh/git command that failed and continue.`; if (t.session.busy) t.session.nudge(msg, 'SSH key loaded — told omp to retry'); else t.session.prompt(msg) } }
      return
    }
    case 'runInTerminal': {
      const t = p.tab(m.tab)
      const card = t?.session.transcript.card(m.toolId)
      let command = ''
      try { command = String(JSON.parse(card?.input ?? '{}').command ?? '') } catch { command = '' }
      if (!t || !command) return
      // omp's bash tool takes cwd relative to the session folder
      let cwd = t.cwd
      try { const c = JSON.parse(card?.input ?? '{}').cwd; if (typeof c === 'string' && c) cwd = /^[A-Za-z]:[\\/]|^\//u.test(c) ? c : vscode.Uri.joinPath(vscode.Uri.file(t.cwd), c).fsPath } catch { /* keep tab folder */ }
      const term = vscode.window.createTerminal({ name: `OMP: ${command.split(/\s+/u)[0]}`, cwd, iconPath: new vscode.ThemeIcon('terminal') })
      term.show()
      // Typed, not executed: you see exactly what will run and press Enter yourself.
      term.sendText(command, false)
      return
    }
    case 'jobs': { const t = p.tab(m.tab); if (t) reply({ type: 'jobs', tab: m.tab, jobs: await sessionJobs(t.cwd, t.session.id) }); return }
    case 'agentConversation': {
      const t = p.tab(m.tab)
      const got = t ? await agentConversation(t.cwd, t.session.id, m.name) : undefined
      reply(got ? { type: 'agentConversation', toolId: m.toolId, name: m.name, ...got } : { type: 'agentConversation', toolId: m.toolId, name: m.name, entries: [], cost: 0, missing: true })
      return
    }
    case 'agentSteps': {
      const t = p.tab(m.tab)
      const got = t ? await agentSteps(t.cwd, t.session.id, m.name) : undefined
      if (got) reply({ type: 'agentSteps', toolId: m.toolId, name: m.name, ...got })
      return
    }
    case 'loadSettings': await p.settingsPane.refresh(); return
    case 'setSetting': p.settingsPane.write(m.key, m.value); return
    case 'resetSetting': p.settingsPane.reset(m.key); return
    case 'findFiles': reply({ type: 'files', query: m.query, files: await findFiles(m.query, cwdOf(from)) }); return
  }
}

/** JSON-RPC errors carry the real reason in `data`; show it instead of a bare "Internal error". */
export function errorText(error: unknown): string {
  const e = error as { message?: string; data?: unknown }
  const detail = typeof e?.data === 'string' ? e.data : typeof (e?.data as { message?: unknown })?.message === 'string' ? (e.data as { message: string }).message : e?.data ? JSON.stringify(e.data) : ''
  return [String(e?.message ?? error), detail].filter(Boolean).join(': ')
}
