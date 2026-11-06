# Manual test in VS Code

Preview and unit tests cover the webview and pure logic; these need a real VS Code window with omp. Run them
after a release, in a scratch git repo (not real work). Tick each one; anything that fails, note what you saw.

Setup: `Developer: Reload Window`, open a scratch folder that is a git repo with a couple of files.

## Chats and tabs
- [ ] `Ctrl+Alt+P` opens a chat beside the editor; the π button on an editor title bar does the same.
- [ ] `+` on the chat's title bar opens a second chat; both can run at once.
- [ ] Reload the window: open chat tabs come back with their history.
- [ ] Status bar shows "OMP", a spinner with a count while chats run, a dot when one finished unseen.
- [ ] A chat that finishes while you are in another tab shows a notification; "Open" jumps to it.

## Sending and steering
- [ ] Type while omp works: the message goes into the running turn and omp answers it without waiting.
- [ ] `↑` / `↓` in an empty input recall earlier prompts.
- [ ] Drag a file from the Explorer into the input holding **Shift**: it becomes `@path`.
- [ ] Right-click in an editor → **Send to OMP** → each entry (selection, function, problems, git diff, open tabs, workspace problems) fills the input.
- [ ] Right-click a file in the Explorer → **Send to OMP** adds `@path`.
- [ ] `Ctrl+Alt+O` sends the selection, `Ctrl+Alt+D` the file's problems.

## Steps and cards
- [ ] Bash shows IN/OUT; Copy copies the full command/output.
- [ ] An edit shows an inline diff; **Open diff** opens VS Code's diff view.
- [ ] A subagent card expands and its step list scrolls without jumping back to the top.
- [ ] The todo bar appears above the input while omp has open todos.

## Permissions (set Mode to **Manual** first, back to Auto after)
- [ ] A Bash command shows a permission card; `1` allows, `Esc` cancels.
- [ ] Out of sight, a toast says omp needs permission; **Show** opens the chat.

## Goal
- [ ] `/goal create a.txt, b.txt, c.txt one per turn` runs several turns by itself and ends **Done** with evidence.
- [ ] **Pause** stops after the current turn; **Resume** continues; **Stop** ends it.

## Fork and rewind
- [ ] On a past prompt: **Fork conversation from here** removes it and what follows, and puts it back in the input.
- [ ] **Rewind code to here** reverts omp's edits after that prompt (check `git diff`).

## Updates
- [ ] `OMP: Check for Updates` says up to date (or offers the newer release).
