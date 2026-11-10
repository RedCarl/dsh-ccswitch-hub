import assert from 'node:assert/strict'
import test from 'node:test'
import { removeMcpClientRow, setMcpClientRowDisabled } from '../lib/harness-config.js'

const sample = `# profile patch
- id: dbx
  name: "@deepseek-ai/dsh-mcp-client"
  config:
    transport: stdio
    serverName: dbx
    command: dbx-mcp-server
- id: other
  name: "@deepseek-ai/dsh-mcp-client"
  config:
    transport: stdio
    serverName: other
    command: other-mcp
- id: unrelated
  name: "@deepseek-ai/dsh-client-ui-settings-general"
`

test('removes only the matching mcp-client row', () => {
  const result = removeMcpClientRow(sample, 'dbx')
  assert.equal(result.removed, true)
  assert.equal(result.text.includes('id: dbx'), false)
  assert.equal(result.text.includes('id: other'), true)
  assert.equal(result.text.includes('id: unrelated'), true)
  assert.equal(result.text.includes('# profile patch'), true)
})

test('handles nested insert lists', () => {
  const nested = `- insert:
    - id: dbx
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: dbx
        command: dbx-mcp-server
    - id: keep
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: keep
        command: keep-mcp
`
  const result = removeMcpClientRow(nested, 'dbx')
  assert.equal(result.removed, true)
  assert.equal(result.text.includes('serverName: dbx'), false)
  assert.equal(result.text.includes('serverName: keep'), true)
})

test('adds or replaces disabled on the matching mcp-client row', () => {
  const disabled = setMcpClientRowDisabled(sample, 'dbx', true)
  assert.equal(disabled.updated, true)
  assert.match(disabled.text, /- id: dbx\n  disabled: true\n  name:/)
  const enabled = setMcpClientRowDisabled(disabled.text, 'dbx', false)
  assert.equal(enabled.updated, true)
  assert.match(enabled.text, /- id: dbx\n  disabled: false\n  name:/)
  assert.equal(enabled.text.includes('id: other'), true)
  assert.deepEqual(setMcpClientRowDisabled(sample, 'missing', true), { updated: false, text: sample })
})

test('sets disabled inside a nested insert list', () => {
  const nested = `- insert:
    - id: dbx
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: dbx
    - id: keep
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: keep
`
  const result = setMcpClientRowDisabled(nested, 'dbx', true)
  assert.equal(result.updated, true)
  assert.match(result.text, /    - id: dbx\n      disabled: true\n      name:/)
  assert.equal(result.text.includes('serverName: keep'), true)
})

test('does not remove a row with a different id or another plugin', () => {
  assert.deepEqual(removeMcpClientRow(sample, 'missing'), { removed: false, text: sample })
  const result = removeMcpClientRow(sample, 'unrelated')
  assert.equal(result.removed, false)
})
