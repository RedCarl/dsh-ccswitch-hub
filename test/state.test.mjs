import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  defaultState,
  isItemEnabled,
  loadState,
  normalizeState,
  saveState,
  setItemEnabled,
  setSources,
} from '../lib/state.js'

function temp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ccswitch-hub-state-'))
}

test('default state enables categories and leaves items off', () => {
  const state = defaultState()
  assert.equal(state.mcp.master, true)
  assert.equal(state.skills.master, true)
  assert.deepEqual(state.mcp.items, {})
  assert.equal(isItemEnabled(state, 'mcp', 'missing'), false)
})

test('saves and reloads choices atomically with owner-only permissions', async () => {
  const dir = temp()
  const file = path.join(dir, 'state.json')
  const state = defaultState()
  state.mcp.master = false
  setItemEnabled(state, 'mcp', 'ccswitch:one', true)
  setItemEnabled(state, 'skills', 'alpha', true)
  await saveState(dir, file, state)
  const loaded = loadState(file)
  assert.equal(loaded.warnings.length, 0)
  assert.equal(loaded.state.mcp.master, false)
  assert.equal(isItemEnabled(loaded.state, 'mcp', 'ccswitch:one'), true)
  assert.equal(isItemEnabled(loaded.state, 'skills', 'alpha'), true)
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  }
})

test('malformed state is preserved and defaults are used', () => {
  const dir = temp()
  const file = path.join(dir, 'state.json')
  fs.writeFileSync(file, '{oops')
  const loaded = loadState(file)
  assert.equal(loaded.state.mcp.master, true)
  assert.equal(loaded.warnings.length, 1)
  const backups = fs.readdirSync(dir).filter((name) => name.startsWith('state.json.invalid-'))
  assert.equal(backups.length, 1)
  assert.equal(fs.readFileSync(path.join(dir, backups[0]), 'utf8'), '{oops')
})

test('normalizes unknown fields and migrates old versions', () => {
  const { state, warnings } = normalizeState({
    version: 0,
    mcp: { master: 0, items: { a: { enabled: true }, b: 'yes' } },
    skills: { master: true, items: {} },
    sources: { ccSwitchDir: '  ~/custom  ', skillDirs: 'a, b\nc' },
  })
  assert.equal(state.mcp.master, true)
  assert.equal(isItemEnabled(state, 'mcp', 'a'), true)
  assert.equal(isItemEnabled(state, 'mcp', 'b'), false)
  assert.equal(state.sources.ccSwitchDir, '~/custom')
  assert.deepEqual(state.sources.skillDirs, ['a', 'b', 'c'])
  assert.ok(warnings.some((warning) => warning.includes('migrated')))
})

test('source overrides validate types and reset with empty values', () => {
  const state = defaultState()
  setSources(state, { ccSwitchDir: '/opt/cc-switch', skillDirs: ['/a', '/b'] })
  assert.equal(state.sources.ccSwitchDir, '/opt/cc-switch')
  assert.deepEqual(state.sources.skillDirs, ['/a', '/b'])
  setSources(state, { ccSwitchDir: '', skillDirs: [] })
  assert.equal(state.sources.ccSwitchDir, null)
  assert.deepEqual(state.sources.skillDirs, [])
  assert.throws(() => setSources(state, { ccSwitchDir: 42 }), /string or null/)
})
