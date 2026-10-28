import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { normalizeSpec, readCcSwitchDb, scanCcSwitch, scanCcSwitchSkills } from '../lib/ccswitch.js'

function temp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ccswitch-hub-ccs-'))
}

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function createDb(file) {
  const db = new DatabaseSync(file)
  db.exec(`
    CREATE TABLE mcp_servers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, server_config TEXT NOT NULL,
      description TEXT, homepage TEXT, docs TEXT, tags TEXT,
      enabled_claude INTEGER NOT NULL DEFAULT 0, enabled_codex INTEGER NOT NULL DEFAULT 0,
      enabled_gemini INTEGER NOT NULL DEFAULT 0, enabled_grokbuild INTEGER NOT NULL DEFAULT 0,
      enabled_opencode INTEGER NOT NULL DEFAULT 0, enabled_hermes INTEGER NOT NULL DEFAULT 0,
      enabled_mcode INTEGER NOT NULL DEFAULT 0, enabled_pi INTEGER NOT NULL DEFAULT 0,
      enabled_agy INTEGER NOT NULL DEFAULT 0, enabled_kimi INTEGER NOT NULL DEFAULT 0
    )
  `)
  const insert = db.prepare(`
    INSERT INTO mcp_servers (id, name, server_config, description, tags, enabled_claude, enabled_codex)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  insert.run('shared-id', 'GitHub', JSON.stringify({
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'github-mcp'],
    env: { GITHUB_TOKEN: 'secret-value' },
  }), 'GitHub tools', JSON.stringify(['dev']), 1, 1)
  insert.run('http-id', 'Remote', JSON.stringify({
    type: 'http',
    url: 'https://mcp.example.com/mcp?token=secret',
    headers: { Authorization: 'Bearer secret' },
  }), null, '[]', 0, 0)
  insert.run('sse-id', 'SSE only', JSON.stringify({ type: 'sse', url: 'https://sse.example.com/events' }), null, '[]', 0, 0)
  db.close()
}

function writeSkill(root, name, body) {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), body)
  return dir
}

test('reads CC Switch MCP rows without writing the database', async () => {
  const dir = temp()
  const dbFile = path.join(dir, 'cc-switch.db')
  createDb(dbFile)
  const before = hash(dbFile)
  const result = await readCcSwitchDb(dbFile)
  assert.equal(result.error, undefined)
  assert.equal(result.servers.length, 3)
  assert.equal(hash(dbFile), before)
  const shared = result.servers.find((server) => server.name === 'GitHub')
  assert.equal(shared.transport, 'stdio')
  assert.deepEqual(shared.apps, ['claude', 'codex'])
  assert.deepEqual(shared.envKeys, ['GITHUB_TOKEN'])
  assert.match(shared.summary, /npx/)
  assert.equal(shared.summary.includes('secret-value'), false)
  const remote = result.servers.find((server) => server.name === 'Remote')
  assert.equal(remote.transport, 'http')
  assert.match(remote.summary, /https:\/\/mcp\.example\.com\/mcp$/)
  const sse = result.servers.find((server) => server.name === 'SSE only')
  assert.equal(sse.transport, 'sse')
  assert.match(sse.unsupported, /SSE/)
})

test('normalizes specs and rejects incomplete entries', () => {
  const stdio = normalizeSpec({ command: 'npx', args: ['-y'], env: { A: '1' } })
  assert.equal(stdio.transport, 'stdio')
  assert.deepEqual(stdio.envKeys, ['A'])
  const http = normalizeSpec({ url: 'https://example.com/mcp', headers: { Authorization: 'x' } })
  assert.equal(http.transport, 'http')
  assert.deepEqual(http.headerKeys, ['Authorization'])
  const sse = normalizeSpec({ type: 'sse', url: 'https://example.com/sse' })
  assert.equal(sse.transport, 'sse')
  assert.match(sse.unsupported, /SSE/)
  assert.equal(normalizeSpec({}).transport, 'invalid')
})

test('scans CC Switch skills and skips invalid names', () => {
  const dir = temp()
  writeSkill(dir, 'alpha', `---
name: alpha
description: Alpha skill
---
body
`)
  fs.writeFileSync(path.join(dir, 'flat.md'), `---
name: flat-skill
description: Flat skill
---
body
`)
  writeSkill(dir, 'bad', `---
name: Bad_Name
description: bad
---
body
`)
  const result = scanCcSwitchSkills(dir)
  assert.deepEqual(result.items.map((item) => item.name), ['alpha', 'flat-skill'])
  assert.ok(result.warnings.some((warning) => warning.includes('Bad_Name')))
  assert.equal(result.items.find((item) => item.name === 'alpha').kind, 'directory')
  assert.equal(result.items.find((item) => item.name === 'flat-skill').kind, 'file')
})

test('scanCcSwitch reports both sources and status', async () => {
  const dir = temp()
  const dbFile = path.join(dir, 'cc-switch.db')
  createDb(dbFile)
  const skillsDir = path.join(dir, 'skills')
  writeSkill(skillsDir, 'alpha', `---
name: alpha
description: Alpha
---
body
`)
  const scanned = await scanCcSwitch({
    ccSwitchDb: dbFile,
    ccSwitchSkills: skillsDir,
  })
  assert.equal(scanned.mcp.exists, true)
  assert.equal(scanned.skills.exists, true)
  assert.equal(scanned.mcp.servers.length, 3)
  assert.equal(scanned.skills.items.length, 1)
  assert.deepEqual(scanned.warnings, [])
})
