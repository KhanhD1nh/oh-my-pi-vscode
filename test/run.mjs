// Run every test/*.test.ts: bundle each with esbuild (TS + ESM), then node --test. Exit non-zero on any failure.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSync } from 'esbuild'

const out = mkdtempSync(join(tmpdir(), 'omp-tests-'))
const files = readdirSync('test').filter(f => f.endsWith('.test.ts')).sort()
const bundles = files.map(f => {
  const outfile = join(out, f.replace(/\.ts$/u, '.mjs'))
  buildSync({ entryPoints: [join('test', f)], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning', external: ['vscode'] })
  return outfile
})
try {
  execFileSync(process.execPath, ['--test', ...bundles], { stdio: 'inherit' })
} catch {
  process.exit(1)
}
