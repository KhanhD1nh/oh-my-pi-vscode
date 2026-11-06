/**
 * Commands that wait for a person at the keyboard (passphrase, password, sudo, "yes/no", an interactive
 * shell). omp runs them without a terminal you can type into, so they hang or fail; the chat offers to run
 * them in a VS Code terminal instead. Pure detection lives here so it can be tested without VS Code.
 */

/** Output that means "a human has to type something now". */
const PROMPTS: [RegExp, string][] = [
  [/enter passphrase for (key|.*id_[a-z0-9]+)/iu, 'SSH key passphrase'],
  [/\bpassphrase\b.*:\s*$/imu, 'passphrase'],
  [/\[sudo\] password for/iu, 'sudo password'],
  [/(^|\s)password( for [^:]+)?:\s*$/imu, 'password'],
  [/are you sure you want to continue connecting \(yes\/no/iu, 'confirm SSH host key'],
  [/\(y\/n\)|\[y\/n\]|\(yes\/no\)/iu, 'yes/no answer'],
  [/username for 'https?:/iu, 'git username'],
  [/permission denied \(publickey/iu, 'SSH key (load it with ssh-add)'],
]

/** Command shapes that are interactive by themselves (an ssh session with no remote command, sudo, passwd…). */
const COMMANDS: [RegExp, string][] = [
  [/^\s*ssh-add\b/u, 'ssh-add asks for the key passphrase'],
  [/^\s*sudo\b(?!.*\s-n\b)/u, 'sudo asks for your password'],
  [/^\s*(passwd|su)\b/u, 'asks for a password'],
  [/^\s*(mysql|psql)\b.*\s-p\s*$/u, 'asks for a database password'],
]

/**
 * @param command - the shell command omp ran.
 * @param output - what it printed so far (may be empty while it hangs).
 * @param pty - omp asked for a pseudo-terminal (it expects to interact).
 * @returns why a person is needed, or undefined.
 */
export function needsInput(command: string, output = '', pty = false): string | undefined {
  const tail = output.slice(-2000)
  for (const [re, why] of PROMPTS) if (re.test(tail)) return why
  for (const [re, why] of COMMANDS) if (re.test(command)) return why
  // `ssh host` with no remote command is an interactive login; BatchMode=yes means "never prompt".
  if (/^\s*ssh\b/u.test(command) && !/BatchMode=yes/iu.test(command) && !sshHasRemoteCommand(command)) return pty ? 'interactive SSH session' : undefined
  return undefined
}

/** Does `ssh … host <cmd>` carry a remote command? (options that take a value are skipped) */
function sshHasRemoteCommand(command: string): boolean {
  const words = command.trim().split(/\s+/u).slice(1)
  const withValue = new Set(['-p', '-i', '-o', '-l', '-F', '-J', '-L', '-R', '-D', '-b', '-c', '-E', '-e', '-m', '-O', '-Q', '-S', '-W', '-w', '-B'])
  let host = false
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!
    if (!host) {
      if (withValue.has(w)) { i++; continue }
      if (w.startsWith('-')) continue
      host = true
      continue
    }
    return true
  }
  return false
}
