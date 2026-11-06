# OMP for VS Code

Chat with the [omp](https://github.com/can1357/oh-my-pi) coding agent inside VS Code, laid out like Claude Code.
omp does the work (tools, prompts, model routing, memory, subagents) with your own `~/.omp/agent` setup; this
extension runs `omp acp` and renders it in the editor.

## Features

**Chats**
- Every chat is an editor tab; run several in parallel, split them, and they reopen after a reload.
- Type while omp works: the message is steered into the running turn.
- Steps on a timeline: Bash with IN/OUT boxes, edits with inline diffs (open in VS Code's diff view), copy buttons on code.
- Subagent cards with each agent's live steps; background jobs; todo list pinned above the input.
- Permission requests, `ask` questions and plan approval answered in the chat.
- Fork a conversation, rewind file edits from a message, export a chat to Markdown, find in chat (`Ctrl+F`).

**Input**
- `+` menu (images, files, editor selection), `@` file mentions, `/` omp commands, drag & drop files.
- Model menu with context size and price, effort, and Mode (omp approval modes and Plan) — `Shift+Tab` cycles.
- `↑` / `↓` recall prompts from the chat.

**Sidebar and status**
- Usage for the folder (cost, API/wall time, tokens, code changes) and sessions with model, prompts, cost and ±lines.
- Status line: context, tokens in/out, cache, tok/s and cost, read from omp's session files.
- Settings view for every omp setting, with pickers where the values are known.

**Notifications and updates**
- A toast when a chat finishes in a tab you are not looking at (`ohMyPi.notifyOnDone`).
- Daily check for a newer release on GitHub, installed on request (`ohMyPi.autoUpdate`, `OMP: Check for Updates`).

omp is used from PATH or `~/.bun/bin`; if missing, the latest release is downloaded and checksum-verified.

## Develop

```sh
pnpm install
node build.mjs            # dist/extension.js + media/chat.js (from webview/*.js)
node node_modules/@vscode/vsce/vsce package --no-dependencies
code --install-extension oh-my-pi-<version>.vsix
```

- `src/` — extension host (TypeScript): omp ACP connection, tabs, settings, session stats, updater.
- `webview/` — the chat UI as plain browser JS, one file per feature, concatenated in name order into
  `media/chat.js`. Edit `webview/`, not `media/chat.js`.
- Tests: `node_modules/.bin/esbuild test/<name>.test.ts --bundle --platform=node --outfile=/tmp/t.cjs && node --test /tmp/t.cjs`

## Release

```sh
node release.mjs 0.20.0 "one-line notes"
```

Bumps the version, builds, packages, tags, and publishes a GitHub release with the `.vsix`; installed copies
offer the update.
