// lineOps lives in the webview bundle (plain JS); load it from source and check it rebuilds both sides.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const js = readFileSync('webview/20-tools.js', 'utf8')
const lineOps = new Function(`${js.slice(js.indexOf('function lineOps'), js.indexOf('/** Words that changed'))}; return lineOps`)() as (a: string[], b: string[]) => [string, string][]

test('lineOps: removals before additions, both sides rebuild', () => {
  const a = ['a', 'b', 'c', 'd', 'e'], b = ['a', 'B', 'c', 'x', 'd', 'e']
  const ops = lineOps(a, b)
  assert.deepEqual(ops.filter(o => o[0] !== '+').map(o => o[1]), a)
  assert.deepEqual(ops.filter(o => o[0] !== '-').map(o => o[1]), b)
  assert.deepEqual(ops.slice(1, 3), [['-', 'b'], ['+', 'B']])
})
