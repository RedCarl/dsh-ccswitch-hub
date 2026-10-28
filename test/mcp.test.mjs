import assert from 'node:assert/strict'
import test from 'node:test'
import { parseKeyValueLines } from '../index.js'
import { runtimeServerName, summarizeMcp, toMcpClientConfig } from '../lib/mcp.js'

test('runtime names are grammar-safe and stable', () => {
  assert.equal(runtimeServerName('id-1', 'GitHub'), 'GitHub')
  const first = runtimeServerName('id-2', 'My Server / v2')
  const second = runtimeServerName('id-2', 'My Server / v2')
  assert.equal(first, second)
  assert.match(first, /^[A-Za-z0-9_-]{1,32}$/)
  assert.notEqual(first, runtimeServerName('id-3', 'My Server / v2'))
})

test('summaries never include arguments or URL queries', () => {
  assert.equal(summarizeMcp('x', 'stdio', { command: 'npx', args: ['-y', 'secret-token'] }), 'stdio · npx · 2 args')
  assert.equal(summarizeMcp('x', 'http', { url: 'https://example.com/mcp?token=secret' }), 'http · https://example.com/mcp')
})

test('builds stdio and HTTP client configs', () => {
  const stdio = toMcpClientConfig({
    runtimeName: 'github',
    transport: 'stdio',
    config: { command: 'npx', args: ['-y'], env: { A: '1' }, cwd: '/tmp', toolCallTimeoutMs: 5000 },
  })
  assert.equal(stdio.transport, 'stdio')
  assert.equal(stdio.command, 'npx')
  assert.deepEqual(stdio.args, ['-y'])
  assert.deepEqual(stdio.env, { A: '1' })
  assert.equal(stdio.cwd, '/tmp')
  assert.equal(stdio.toolCallTimeoutMs, 5000)
  assert.equal(stdio.failOnStartupError, true)

  const http = toMcpClientConfig({
    runtimeName: 'remote',
    transport: 'http',
    config: { url: 'https://example.com/mcp', headers: { Authorization: 'Bearer x' } },
  })
  assert.equal(http.transport, 'streamable-http')
  assert.equal(http.url, 'https://example.com/mcp')
  assert.deepEqual(http.headers, { Authorization: 'Bearer x' })
  assert.equal(http.toolCallTimeoutMs, 60000)

  assert.throws(() => toMcpClientConfig({ runtimeName: 'x', transport: 'sse', config: {} }), /不支持/)
})

test('parses env/header lines and rejects malformed or duplicate keys', () => {
  assert.deepEqual(parseKeyValueLines('A=1\nB=two=three\n# comment\n\n'), { A: '1', B: 'two=three' })
  assert.deepEqual(parseKeyValueLines('EMPTY='), { EMPTY: '' })
  assert.throws(() => parseKeyValueLines('NOVALUE'), /无效的键值行/)
  assert.throws(() => parseKeyValueLines('A=1\nA=2'), /重复的键/)
})
