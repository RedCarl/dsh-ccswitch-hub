import assert from 'node:assert/strict'
import test from 'node:test'
import { removeMcpClientRow } from '../lib/harness-config.js'

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

test('does not remove a row with a different id or another plugin', () => {
  assert.deepEqual(removeMcpClientRow(sample, 'missing'), { removed: false, text: sample })
  const result = removeMcpClientRow(sample, 'unrelated')
  assert.equal(result.removed, false)
})
