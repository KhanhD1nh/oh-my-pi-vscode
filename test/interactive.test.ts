/** Which commands need a person at the keyboard. */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { needsInput } from '../src/interactive.ts'

test('prompts in the output', () => {
  assert.equal(needsInput('ssh -p 2222 admin@h', "Enter passphrase for key '/home/u/.ssh/id_ed25519': "), 'SSH key passphrase')
  assert.equal(needsInput('sudo apt update', '[sudo] password for khanh: '), 'sudo password')
  assert.equal(needsInput('ssh h ls', 'Are you sure you want to continue connecting (yes/no/[fingerprint])? '), 'confirm SSH host key')
  assert.match(needsInput('ssh -o BatchMode=yes h ls', 'admin@h: Permission denied (publickey).') ?? '', /ssh-add/u)
})

test('interactive command shapes', () => {
  assert.ok(needsInput('ssh-add ~/.ssh/id_ed25519'))
  assert.ok(needsInput('sudo systemctl restart nginx'))
  assert.equal(needsInput('sudo -n true'), undefined)
  // the case from the screenshot: ssh login with no remote command, run with pty
  assert.equal(needsInput('ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 -o ConnectTimeout=15 -p 2222 admin@161.248.80.37', '', true), 'interactive SSH session')
})

test('ordinary commands are left alone', () => {
  assert.equal(needsInput('ssh -o BatchMode=yes -p 2222 admin@h "hostname && whoami"'), undefined)
  assert.equal(needsInput('ssh -p 2222 admin@h hostname', 'vps-1'), undefined)
  assert.equal(needsInput('pnpm test', 'Tests 14 passed'), undefined)
  assert.equal(needsInput('git status', 'nothing to commit'), undefined)
})

test('ssh-agent without keys, env-prefixed commands', () => {
  assert.match(needsInput('SSH_AUTH_SOCK=/tmp/a.sock ssh-add -l', 'Error connecting to agent: No such file or directory') ?? '', /ssh-add/u)
  assert.match(needsInput('ssh-add -l', 'The agent has no identities.') ?? '', /ssh-add/u)
  assert.ok(needsInput('SSH_AUTH_SOCK=/tmp/a.sock ssh-add ~/.ssh/id_ed25519'))
})
