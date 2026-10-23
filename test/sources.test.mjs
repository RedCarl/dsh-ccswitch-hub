import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import {
  collectMcpServers,
  readCcSwitchDb,
  toPublicServer,
} from '../lib/sources.js'

function temp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ccswitch-hub-sources-'))
}

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2))
}

function createDb(file) {
  const db = new DatabaseSync(file)
  db.exec(`
    CREATE TABLE mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      server_config TEXT NOT NULL,
      description TEXT,
      homepage TEXT,
      docs TEXT,
      tags TEXT,
      enabled_claude INTEGER NOT NULL DEFAULT 0,
      enabled_codex INTEGER NOT NULL DEFAULT 0,
      enabled_gemini INTEGER NOT NULL DEFAULT 0,
      enabled_grokbuild INTEGER NOT NULL DEFAULT 0,
      enabled_opencode INTEGER NOT NULL DEFAULT 0,
      enabled_hermes INTEGER NOT NULL DEFAULT 0,
      enabled_mcode INTEGER NOT NULL DEFAULT 0,
      enabled_pi INTEGER NOT NULL DEFAULT 0,
      enabled_agy INTEGER NOT NULL DEFAULT 0,
      enabled_kimi INTEGER NOT NULL DEFAULT 0
    )
  `)
  const insert = db.prepare(`
    INSERT INTO mcp_servers (id, name, server_config, description, tags, enabled_claude, enabled_codex)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  insert.run('shared-id', 'shared', JSON.stringify({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'shared-package'],
    env: { API_KEY: 'secret-value', REGION: 'us' },
  }), 'Shared server', JSON.stringify(['dev']), 1, 1)
  insert.run('http-id', 'http-server', JSON.stringify({
    type: 'http',
    url: 'https://mcp.example.com/mcp?token=secret',
    headers: { Authorization: 'Bearer secret' },
  }), null, '[]', 0, 0)
  insert.run('sse-id', 'sse-server', JSON.stringify({
    type: 'sse',
    url: 'https://sse.example.com/events',
  }), null, '[]', 0, 0)
  db.close()
}

test('readCcSwitchDb reads MCP rows without writing the database', async () => {
  const dir = temp()
  const dbFile = path.join(dir, 'cc-switch.db')
  createDb(dbFile)
  const before = hash(dbFile)
  const mtime = fs.statSync(dbFile).mtimeMs
  const result = await readCcSwitchDb(dbFile)
  assert.equal(result.error, undefined)
  assert.equal(result.servers.length, 3)
  assert.equal(hash(dbFile), before)
  assert.equal(fs.statSync(dbFile).mtimeMs, mtime)
  const shared = result.servers.find((server) => server.name === 'shared')
  assert.deepEqual(shared.apps, ['claude', 'codex'])
  assert.equal(shared.transport, 'stdio')
  assert.deepEqual(shared.envKeys, ['API_KEY', 'REGION'])
  assert.equal(shared.config.env.API_KEY, 'secret-value')
  const sse = result.servers.find((server) => server.name === 'sse-server')
  assert.equal(sse.transport, 'sse')
  assert.match(sse.unsupported, /SSE/)
})

test('public projection never exposes secret values', async () => {
  const dir = temp()
  const dbFile = path.join(dir, 'cc-switch.db')
  createDb(dbFile)
  const result = await readCcSwitchDb(dbFile)
  const shared = result.servers.find((server) => server.name === 'shared')
  const publicRow = toPublicServer(shared)
  const serialized = JSON.stringify(publicRow)
  assert.equal(serialized.includes('secret-value'), false)
  assert.equal('config' in publicRow, false)
  assert.deepEqual(publicRow.envKeys, ['API_KEY', 'REGION'])
  const http = result.servers.find((server) => server.name === 'http-server')
  assert.equal(JSON.stringify(toPublicServer(http)).includes('Bearer secret'), false)
  assert.match(http.summary, /https:\/\/mcp\.example\.com\/mcp$/)
})

test('merges MCP sources by display name and keeps the highest-priority config', async () => {
  const dir = temp()
  const dbFile = path.join(dir, 'cc-switch.db')
  createDb(dbFile)
  const claudeConfig = path.join(dir, 'claude.json')
  writeJson(claudeConfig, {
    mcpServers: {
      shared: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'shared-package'],
        env: { API_KEY: 'secret-value', REGION: 'us' },
      },
      'claude-only': { type: 'stdio', command: 'uvx', args: ['claude-mcp'] },
      'http-server': {
        type: 'http',
        url: 'https://other.example.com/mcp',
      },
    },
  })
  const codexConfig = path.join(dir, 'config.toml')
  fs.writeFileSync(codexConfig, `
[mcp_servers.codex-mcp]
command = "node"
args = ["server.js"]
env = { CODEX_TOKEN = "secret" }

[mcp_servers.remote]
url = "https://codex.example.com/mcp"
http_headers = { "X-Key" = "secret" }
`)
  const geminiConfig = path.join(dir, 'settings.json')
  writeJson(geminiConfig, {
    mcpServers: {
      'gemini-mcp': { command: 'npx', args: ['-y', 'gemini-package'] },
    },
  })

  const result = await collectMcpServers({
    ccSwitchDb: dbFile,
    claudeConfig,
    codexConfig,
    geminiConfig,
  })
  const names = result.servers.map((server) => server.name).sort()
  assert.deepEqual(names, ['claude-only', 'codex-mcp', 'gemini-mcp', 'http-server', 'remote', 'shared', 'sse-server'])
  const shared = result.servers.find((server) => server.name === 'shared')
  assert.deepEqual(shared.origins.sort(), ['cc-switch', 'claude'])
  assert.equal(shared.key, 'ccswitch:shared-id')
  const http = result.servers.find((server) => server.name === 'http-server')
  assert.deepEqual(http.origins.sort(), ['cc-switch', 'claude'])
  assert.equal(http.conflict, true)
  const codex = result.servers.find((server) => server.name === 'codex-mcp')
  assert.equal(codex.transport, 'stdio')
  assert.deepEqual(codex.envKeys, ['CODEX_TOKEN'])
  const remote = result.servers.find((server) => server.name === 'remote')
  assert.equal(remote.transport, 'http')
  assert.deepEqual(remote.headerKeys, ['X-Key'])
  assert.ok(result.warnings.some((warning) => warning.includes('sse-server')))
})

test('missing sources stay quiet and malformed sources warn', async () => {
  const dir = temp()
  const claudeConfig = path.join(dir, 'claude.json')
  fs.writeFileSync(claudeConfig, '{not json')
  const result = await collectMcpServers({
    ccSwitchDb: path.join(dir, 'absent.db'),
    claudeConfig,
    codexConfig: path.join(dir, 'absent.toml'),
    geminiConfig: path.join(dir, 'absent.json'),
  })
  assert.equal(result.servers.length, 0)
  assert.ok(result.warnings.some((warning) => warning.includes('无法解析')))
  assert.equal(result.sources.find((source) => source.id === 'ccswitch').exists, false)
})
