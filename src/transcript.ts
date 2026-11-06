/**
 * Pure fold of ACP `session/update` payloads into chat items. Streaming chunks extend the last item of the
 * same kind; tool calls are keyed by `toolCallId` and updated in place. No VS Code or process access here.
 */
import type { AskSchema,  ChatItem, ToolCard } from './types.ts'

type Update = Record<string, unknown>

/** Text of an ACP content block (text only; images are ignored for display). */
function textOf(content: unknown): string {
  const c = content as { type?: string; text?: string } | undefined
  return c?.type === 'text' && typeof c.text === 'string' ? c.text : ''
}

/** Text carried by a tool update's `content` and `rawOutput.content`, deduplicated. */
export function toolOutput(update: Update): string {
  const texts: string[] = []
  const take = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return
    for (const b of blocks as Array<Record<string, unknown>>) {
      const inner = (b.type === 'content' ? b.content : b) as Record<string, unknown> | undefined
      if (inner?.type === 'text' && typeof inner.text === 'string') texts.push(inner.text)
    }
  }
  take(update.content)
  take((update.rawOutput as { content?: unknown } | undefined)?.content)
  return [...new Set(texts)].join('\n').slice(0, 20_000)
}

/** Diff from a tool update (`content[].type === 'diff'` or omp's `rawOutput.details`). */
export function toolDiff(update: Update): ToolCard['diff'] | undefined {
  if (Array.isArray(update.content)) {
    for (const b of update.content as Array<Record<string, unknown>>) {
      if (b.type === 'diff' && typeof b.path === 'string' && typeof b.newText === 'string') {
        return { path: b.path, oldText: typeof b.oldText === 'string' ? b.oldText : '', newText: b.newText }
      }
    }
  }
  const d = (update.rawOutput as { details?: Record<string, unknown> } | undefined)?.details
  if (d && typeof d.path === 'string' && typeof d.newText === 'string') {
    return { path: d.path, oldText: typeof d.oldText === 'string' ? d.oldText : '', newText: d.newText }
  }
  return undefined
}

/** Transcript state with the folding rules. */
export class Transcript {
  readonly items: ChatItem[] = []
  private seq = 0
  private readonly tools = new Map<string, ToolCard>()

  private nextId(): string { this.seq += 1; return `i${this.seq}` }

  /** Append the user's prompt. */
  user(text: string): ChatItem {
    const item: ChatItem = { type: 'user', id: this.nextId(), text }
    this.items.push(item)
    return item
  }

  /** Append a question form from omp's `ask` tool. */
  ask(message: string, schema: AskSchema): ChatItem {
    const item: ChatItem = { type: 'ask', id: this.nextId(), message, schema }
    this.items.push(item)
    return item
  }

  /** Append an error line. */
  error(text: string): ChatItem {
    const item: ChatItem = { type: 'error', id: this.nextId(), text }
    this.items.push(item)
    return item
  }

  /**
   * Fold one update.
   * @param update - ACP `params.update`.
   * @returns the item that changed (to send to the webview), or undefined.
   */
  apply(update: Update): ChatItem | undefined {
    switch (update.sessionUpdate) {
      case 'agent_message_chunk': return this.stream('assistant', textOf(update.content))
      case 'agent_thought_chunk': return this.stream('thought', textOf(update.content))
      case 'user_message_chunk': return this.stream('user', textOf(update.content))
      case 'tool_call': case 'tool_call_update': return this.tool(update)
      default: return undefined
    }
  }

  private stream(type: 'assistant' | 'thought' | 'user', text: string): ChatItem | undefined {
    if (text === '') return undefined
    const last = this.items[this.items.length - 1]
    if (last !== undefined && last.type === type) {
      last.text += text
      return last
    }
    const item = { type, id: this.nextId(), text } as ChatItem
    this.items.push(item)
    return item
  }

  private tool(update: Update): ChatItem {
    const id = String(update.toolCallId)
    let card = this.tools.get(id)
    if (card === undefined) {
      card = { id, kind: String(update.kind ?? 'other'), name: String(update.name ?? 'tool'), title: String(update.title ?? update.name ?? 'tool'), status: 'pending' }
      this.tools.set(id, card)
      this.items.push({ type: 'tool', id: `t-${id}`, card })
    }
    if (typeof update.title === 'string') card.title = update.title
    if (typeof update.kind === 'string') card.kind = update.kind
    if (typeof update.status === 'string') card.status = update.status as ToolCard['status']
    const locations = update.locations as Array<{ path?: unknown }> | undefined
    if (typeof locations?.[0]?.path === 'string') card.path = locations[0].path
    if (update.rawInput !== undefined && card.input === undefined) {
      const raw = JSON.stringify(update.rawInput)
      card.input = raw.length > 4000 ? `${raw.slice(0, 4000)}…` : raw
    }
    const out = toolOutput(update)
    if (out !== '') card.output = out
    const diff = toolDiff(update)
    if (diff !== undefined) { card.diff = diff; card.path ??= diff.path }
    return { type: 'tool', id: `t-${id}`, card }
  }

  /** Tool card by id (for opening its diff). */
  card(id: string): ToolCard | undefined { return this.tools.get(id) }

  /** Start from a copy of `other` (used when forking a session). */
  copyFrom(other: Transcript): void {
    this.items.push(...structuredClone(other.items))
    this.seq = other.seq
    for (const it of this.items) if (it.type === 'tool') this.tools.set(it.card.id, it.card)
  }
}
