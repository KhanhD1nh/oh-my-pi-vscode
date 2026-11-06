// Bundle the extension host into dist/extension.js (vscode stays external).
import { readdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { build, context } from 'esbuild'

const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
}

/** The webview is plain browser JS split by feature in webview/; concatenated in name order into one script. */
function buildWebview() {
  const files = readdirSync('webview').filter(f => f.endsWith('.js')).sort()
  writeFileSync('media/chat.js', '// Generated from webview/*.js by build.mjs — edit those files, not this one.\n' + files.map(f => readFileSync(`webview/${f}`, 'utf8')).join('\n'))
  console.log(`  media/chat.js  ${files.length} parts`)
}

buildWebview()
if (process.argv.includes('--watch')) {
  watch('webview', () => { try { buildWebview() } catch (error) { console.error(error) } })
  await (await context(options)).watch()
} else await build(options)
