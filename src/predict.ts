/**
 * Next-message predictions (like omp's `composer.predictions` in its TUI): after a turn, ask a small model what
 * you will most likely type next and show it as ghost text in the empty input. One `omp -p` call on the "smol"
 * role, no tools, no session, with only the tail of the conversation — cheap, and it never touches the chat.
 */
import { execFile } from 'node:child_process'
import { ompEnv } from './binary.ts'
import type { ChatItem } from './types.ts'

/** The last few prompts and replies, clipped, as plain text. */
export function predictContext(items: readonly ChatItem[], budget = 6000): string {
  const parts: string[] = []
  let used = 0
  for (let i = items.length - 1; i >= 0 && used < budget; i--) {
    const it = items[i]!
    if (it.type !== 'user' && it.type !== 'assistant') continue
    const text = it.text.trim(); if (!text) continue
    const clip = text.length > 1500 ? `${text.slice(0, 700)}\n…\n${text.slice(-700)}` : text
    parts.unshift(`${it.type === 'user' ? 'USER' : 'ASSISTANT'}: ${clip}`)
    used += clip.length
  }
  return parts.join('\n\n')
}

export function predictPrompt(context: string): string {
  return [
    'Below is the end of a chat between a USER and a coding ASSISTANT.',
    'Predict the single next message the USER will most likely type. Write it in the same language and tone the USER uses (short, direct).',
    'Reply with ONLY that message on one line — no quotes, no explanation. If there is no likely next message, reply with exactly: -',
    '', '---', context, '---',
  ].join('\n')
}

/** Model output → suggestion, or '' when it is empty, a refusal, or too long to be a typed message. */
export function cleanPrediction(raw: string): string {
  const line = raw.split('\n').map(l => l.trim()).filter(l => l && l !== 'Working...').pop() ?? ''
  const t = line.replace(/^(USER:\s*)/iu, '').replace(/^["'“”]+|["'“”]+$/gu, '').trim()
  return !t || t === '-' || t.length > 200 ? '' : t
}

/**
 * @param command - omp executable.
 * @param cwd - chat folder (omp reads its config from there).
 * @param model - role or model for the call ("smol" by default).
 */
export function predictNext(command: string, cwd: string, items: readonly ChatItem[], model = 'smol', signal?: AbortSignal): Promise<string> {
  const ctx = predictContext(items)
  if (!ctx) return Promise.resolve('')
  const args = ['-p', '--no-session', '--no-tools', '--no-skills', '--no-rules', '--no-context-files', '--no-extensions', '--no-lsp', '--no-title', `--model=${model}`, '--thinking=off', predictPrompt(ctx)]
  return new Promise(resolve => {
    execFile(command, args, { cwd, env: ompEnv(), timeout: 45_000, windowsHide: true, maxBuffer: 1 << 20, ...signal ? { signal } : {} },
      (err, stdout) => resolve(err ? '' : cleanPrediction(stdout))).stdin?.end()
  })
}
