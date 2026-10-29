import assert from 'node:assert/strict'
import test from 'node:test'
import { parseKeyValueLines } from '../index.js'
import { listMcpToolServers, runtimeServerName, summarizeMcp, toMcpClientConfig } from '../lib/mcp.js'

test('runtime names are namespaced, grammar-safe, and stable', () => {
  const github = runtimeServerName('id-1', 'GitHub')
  assert.match(github, /^csh-github-[a-f0-9]{6}$/)
  const first = runtimeServerName('id-2', 'My Server / v2')
  const second = runtimeServerName('id-2', 'My Server / v2')
  assert.equal(first, second)
  assert.match(first, /^csh-my-server-v2-[a-f0-9]{6}$/)
  assert.ok(first.length <= 32)
  assert.notEqual(first, runtimeServerName('id-3', 'My Server / v2'))
  assert.match(runtimeServerName('id-4', '数据库 / DB'), /^csh-(mcp|db)-[a-f0-9]{6}$/)
})

test('discovers Harness MCP servers from the tool registry', () => {
  const servers = listMcpToolServers([
    { name: 'mcp__dbx__query' },
    { name: 'mcp__dbx__list' },
    { name: 'mcp__csh-github-abc123__search' },
    { name: 'read' },
  ], ['CSH-GITHUB-ABC123'])
  assert.deepEqual(servers, [{ serverName: 'dbx', toolCount: 2 }])
  assert.deepEqual(listMcpToolServers([{ name: 'mcp__one__a' }, { name: 'filtered' }], ['one']), [])
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
