import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  defaultState,
  loadState,
  normalizeState,
  saveState,
  setCcSwitchDir,
} from '../lib/state.js'

function temp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ccswitch-hub-state-'))
}

function sampleItem(overrides = {}) {
  return {
    id: 'mcp-one',
    name: 'GitHub',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'github-mcp'],
    env: { GITHUB_TOKEN: 'secret' },
    cwd: '',
    enabled: true,
    toolCallTimeoutMs: 60000,
    source: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

test('default state keeps the MCP master on and starts empty', () => {
  const state = defaultState()
  assert.equal(state.version, 2)
  assert.equal(state.mcp.master, true)
  assert.deepEqual(state.mcp.items, {})
  assert.deepEqual(state.sources, { ccSwitchDir: null })
})

test('saves and reloads native MCP items with owner-only permissions', async () => {
  const dir = temp()
  const file = path.join(dir, 'state.json')
  const state = defaultState()
  state.mcp.items['mcp-one'] = sampleItem()
  state.mcp.master = false
  await saveState(dir, file, state)
  const loaded = loadState(file)
  assert.equal(loaded.warnings.length, 0)
  assert.equal(loaded.state.mcp.master, false)
  assert.equal(loaded.state.mcp.items['mcp-one'].env.GITHUB_TOKEN, 'secret')
  assert.equal(loaded.state.mcp.items['mcp-one'].args[1], 'github-mcp')
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  }
})

test('invalid items are dropped and HTTP items keep headers', () => {
  const { state, warnings } = normalizeState({
    version: 2,
    mcp: {
      master: true,
      items: {
        good: {
          name: 'Remote',
          transport: 'http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer x' },
          enabled: false,
          toolCallTimeoutMs: 9000,
        },
        bad: { name: '', transport: 'stdio', command: 'x' },
        incomplete: { name: 'No command', transport: 'stdio' },
      },
    },
    sources: { ccSwitchDir: '  ~/custom  ' },
  })
  assert.equal(Object.keys(state.mcp.items).length, 1)
  const item = state.mcp.items.good
  assert.equal(item.transport, 'http')
  assert.equal(item.headers.Authorization, 'Bearer x')
  assert.equal(item.toolCallTimeoutMs, 9000)
  assert.equal(state.sources.ccSwitchDir, '~/custom')
  assert.equal(warnings.length, 2)
})

test('legacy state is reset with a warning', () => {
  const { state, warnings } = normalizeState({
    version: 1,
    mcp: { master: false, items: { 'ccswitch:one': { enabled: true } } },
    skills: { items: { alpha: { enabled: true } } },
    sources: { ccSwitchDir: '/opt/cc-switch' },
  })
  assert.equal(state.version, 2)
  assert.deepEqual(state.mcp.items, {})
  assert.equal(state.mcp.master, true)
  assert.equal(state.sources.ccSwitchDir, '/opt/cc-switch')
  assert.ok(warnings.some((warning) => warning.includes('reset')))
})

test('malformed state is preserved and defaults are used', () => {
  const dir = temp()
  const file = path.join(dir, 'state.json')
  fs.writeFileSync(file, '{oops')
  const loaded = loadState(file)
  assert.equal(loaded.state.mcp.master, true)
  assert.equal(loaded.warnings.length, 1)
  assert.equal(fs.readdirSync(dir).some((name) => name.startsWith('state.json.invalid-')), true)
})

test('CC Switch directory overrides validate and reset', () => {
  const state = defaultState()
  setCcSwitchDir(state, '/opt/cc-switch')
  assert.equal(state.sources.ccSwitchDir, '/opt/cc-switch')
  setCcSwitchDir(state, '')
  assert.equal(state.sources.ccSwitchDir, null)
  assert.throws(() => setCcSwitchDir(state, 42), /string or null/)
})
