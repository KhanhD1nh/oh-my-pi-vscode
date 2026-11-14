import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { mergeServers } from '../src/mcpConfig.ts'

test('mergeServers: project overrides user, disabled servers dropped', () => {
  const user = { mcpServers: { aipm: { type: 'http', url: 'https://a/mcp' }, playwright: { command: 'npx' }, off: { command: 'x', enabled: false } } }
  const project = { mcpServers: { aipm: { type: 'http', url: 'https://b/mcp' } }, disabledServers: ['playwright'] }
  const got = Object.fromEntries(mergeServers([user, project]))
  assert.deepEqual(Object.keys(got), ['aipm'])
  assert.equal(got.aipm?.url, 'https://b/mcp')
})
