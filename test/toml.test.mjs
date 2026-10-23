import assert from 'node:assert/strict'
import test from 'node:test'
import { parseToml, readCodexMcpServers } from '../lib/toml.js'

test('parses Codex MCP tables, arrays, inline tables, and quoted names', () => {
  const parsed = parseToml(`
# comment
model = "gpt-5"

[mcp_servers.fetch]
command = "uvx"
args = [
  "mcp-server-fetch",
  "--flag",
]
env = { LOG_LEVEL = "info", "QUOTED_KEY" = "value" }
tool_timeout_sec = 30

[mcp_servers.remote]
url = "https://example.com/mcp"
http_headers = { Authorization = "Bearer token # not a comment" }

[mcp_servers."my server"]
command = "node"
args = ["server.js"]

[mcp_servers.fetch.env]
EXTRA = "yes"
`)
  assert.equal(parsed.model, 'gpt-5')
  assert.deepEqual(parsed.mcp_servers.fetch.args, ['mcp-server-fetch', '--flag'])
  assert.equal(parsed.mcp_servers.fetch.env.LOG_LEVEL, 'info')
  assert.equal(parsed.mcp_servers.fetch.env.QUOTED_KEY, 'value')
  assert.equal(parsed.mcp_servers.fetch.env.EXTRA, 'yes')
  assert.equal(parsed.mcp_servers.remote.http_headers.Authorization, 'Bearer token # not a comment')
  assert.equal(parsed.mcp_servers['my server'].command, 'node')
})

test('extracts MCP servers and maps bearer token env variables', () => {
  process.env.CC_TEST_TOKEN = 'abc123'
  try {
    const result = readCodexMcpServers(`
[mcp_servers.remote]
url = "https://example.com/mcp"
bearer_token_env_var = "CC_TEST_TOKEN"
tool_timeout_sec = 12

[mcp_servers.local]
command = "npx"
args = ["-y", "pkg"]
cwd = "/tmp"
`)
    assert.equal(result.error, undefined)
    assert.equal(result.servers.length, 2)
    const remote = result.servers.find((server) => server.name === 'remote')
    assert.equal(remote.spec.type, 'http')
    assert.equal(remote.spec.headers.Authorization, 'Bearer abc123')
    assert.equal(remote.spec.toolCallTimeoutMs, 12_000)
    const local = result.servers.find((server) => server.name === 'local')
    assert.equal(local.spec.command, 'npx')
    assert.deepEqual(local.spec.args, ['-y', 'pkg'])
    assert.equal(local.spec.cwd, '/tmp')
  } finally {
    delete process.env.CC_TEST_TOKEN
  }
})

test('skips disabled servers and reports malformed documents', () => {
  const skipped = readCodexMcpServers(`
[mcp_servers.off]
command = "node"
enabled = false
`)
  assert.equal(skipped.servers.length, 0)
  const broken = readCodexMcpServers('[mcp_servers.nope')
  assert.match(broken.error, /invalid Codex TOML/)
})
