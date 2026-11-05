# Oh My Pi for VS Code

Chat with the [omp](https://github.com/can1357/oh-my-pi) coding agent in the VS Code sidebar. omp does all
the work (tools, prompts, model routing, memory, advisor) with your `~/.omp/agent/config.yml`; this
extension renders its stream and wires it into the editor.

- Streaming replies with collapsible thinking
- Tool calls as cards; edits show an inline diff and open in VS Code's diff view
- Model, thinking level and plan mode pickers; `/` command suggestions from omp
- Session history (omp sessions for the current folder) and resume
- Settings tab: every omp setting, with dropdowns / multi-pickers where values are known
- `Ctrl+Alt+K` adds the editor selection to the prompt; `Ctrl+Alt+P` focuses the chat
- Paste images into the prompt

omp is used from PATH or `~/.bun/bin`; if missing, the latest release is downloaded and checksum-verified.

## Build

```sh
pnpm install
node build.mjs
node node_modules/@vscode/vsce/vsce package --no-dependencies
code --install-extension oh-my-pi-0.1.0.vsix
```
