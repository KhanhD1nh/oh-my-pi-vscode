// Release: node release.mjs <version> "<one-line notes>"
// Bumps package.json, builds, packages the .vsix, commits, tags and creates a GitHub release with the .vsix
// attached (installed copies pick it up through "OMP: Check for Updates" / the daily check).
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const [version, notes = ''] = process.argv.slice(2)
if (!/^\d+\.\d+\.\d+$/u.test(version ?? '')) { console.error('usage: node release.mjs <x.y.z> "<notes>"'); process.exit(1) }
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
pkg.version = version
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
run('node', ['build.mjs'])
run('node', ['node_modules/@vscode/vsce/vsce', 'package', '--no-dependencies'])
const vsix = `oh-my-pi-${version}.vsix`
run('git', ['add', '-A'])
run('git', ['commit', '-m', `Release ${version}${notes ? `: ${notes}` : ''}`])
run('git', ['tag', `v${version}`])
run('git', ['push', '--follow-tags'])
run('gh', ['release', 'create', `v${version}`, vsix, '--title', `OMP ${version}`, '--notes', notes || `OMP ${version}`])
console.log(`released ${vsix}`)
