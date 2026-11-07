/**
 * Load an SSH key into the ssh-agent with a passphrase typed in the chat, so omp's ssh/git calls work.
 * The passphrase goes only into the ssh-add child's environment, read back by a tiny askpass script
 * (SSH_ASKPASS_REQUIRE=force). Nothing secret is written to disk or logged.
 */
import { execFile } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const WIN = process.platform === 'win32'
/** Windows OpenSSH talks to the Windows ssh-agent service (the one omp's ssh uses after the PATH fix). */
const sshAdd = () => WIN && existsSync('C:\\Windows\\System32\\OpenSSH\\ssh-add.exe') ? 'C:\\Windows\\System32\\OpenSSH\\ssh-add.exe' : 'ssh-add'

/** Remove `key` from ssh-agent (by its private key path; Windows ssh-agent refuses removal by .pub). */
export function lockKey(key: string): Promise<boolean> {
  return new Promise(resolve => { execFile(sshAdd(), ['-d', key], { timeout: 10_000, windowsHide: true }, err => resolve(!err)).stdin?.end() })
}

/** Private keys in ~/.ssh: files that have a matching .pub. */
export async function sshKeys(): Promise<string[]> {
  const dir = join(homedir(), '.ssh')
  let names: string[]
  try { names = await fs.readdir(dir) } catch { return [] }
  const keys = names.filter(n => names.includes(`${n}.pub`)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  return keys.map(n => join(dir, n))
}
const rank = (n: string) => n === 'id_ed25519' ? 0 : n === 'id_rsa' ? 1 : n.startsWith('id_') ? 2 : 3

/** Askpass script that prints $OMP_ASKPASS. Written once into `dir`; holds no secret. */
async function askpass(dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true })
  const file = join(dir, WIN ? 'omp-askpass.cmd' : 'omp-askpass.sh')
  // cmd: delayed expansion prints the value verbatim (& ^ % ! are not re-parsed); sh: printf %s.
  const body = WIN ? '@echo off\r\nsetlocal EnableDelayedExpansion\r\necho(!OMP_ASKPASS!\r\n' : '#!/bin/sh\nprintf \'%s\\n\' "$OMP_ASKPASS"\n'
  await fs.writeFile(file, body, { mode: 0o700 })
  return file
}

/**
 * @param key - private key path (must be one of `sshKeys()`).
 * @param passphrase - typed by you in the chat.
 * @param storage - extension storage folder for the askpass script.
 */
export async function unlockKey(key: string, passphrase: string, storage: string): Promise<{ ok: boolean; message: string }> {
  if (!(await sshKeys()).includes(key)) return { ok: false, message: 'Unknown key.' }
  const script = await askpass(storage)
  return new Promise(resolve => {
    execFile(sshAdd(), [key], {
      env: { ...process.env, SSH_ASKPASS: script, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: process.env.DISPLAY ?? 'omp', OMP_ASKPASS: passphrase },
      timeout: 20_000, windowsHide: true,
    }, (err, stdout, stderr) => {
      const out = `${stdout}${stderr}`.trim()
      if (!err) { resolve({ ok: true, message: out || 'Key added.' }); return }
      // a wrong passphrase: ssh-add asks again until it gives up, then exits 1 with only "Command failed"
      resolve({ ok: false, message: /could not open a connection|agent refused|error connecting/iu.test(out) ? `ssh-agent is not running: ${out}` : 'Wrong passphrase — try again.' })
    }).stdin?.end()
  })
}
