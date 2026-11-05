// Bundle the extension host into dist/extension.js (vscode stays external).
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

if (process.argv.includes('--watch')) await (await context(options)).watch()
else await build(options)
