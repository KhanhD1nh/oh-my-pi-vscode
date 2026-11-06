/** Version compare used by the self-updater. */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { newer } from '../src/version.ts'

test('newer compares dotted versions numerically', () => {
  assert.equal(newer('0.19.1', '0.19.0'), true)
  assert.equal(newer('0.20.0', '0.19.9'), true)
  assert.equal(newer('v1.0.0', '0.99.99'), true)
  assert.equal(newer('0.19.0', '0.19.0'), false)
  assert.equal(newer('0.9.0', '0.10.0'), false)
})
