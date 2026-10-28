/**
 * Durable native MCP store.
 *
 * Version 2 keeps the servers the user added in the panel, including their
 * env/header values (the file is owner-only). Skill state is filesystem-based
 * and intentionally not stored here.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { stringValue } from './paths.js'

export const STATE_VERSION = 2

/** Fresh state: MCP master enabled, no servers. */
export function defaultState() {
  return {
    version: STATE_VERSION,
    mcp: { master: true, items: {} },
    sources: { ccSwitchDir: null },
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringMap(value) {
  if (!isRecord(value)) return {}
  const result = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof key === 'string' && key !== '' && typeof entry === 'string') result[key] = entry
  }
  return result
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []
}

function normalizeSource(value) {
  if (!isRecord(value) || value.type !== 'ccswitch') return null
  return {
    type: 'ccswitch',
    id: typeof value.id === 'string' ? value.id : '',
    name: typeof value.name === 'string' ? value.name : '',
  }
}

function normalizeItem(id, raw) {
  if (!isRecord(raw)) return undefined
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name === '') return undefined
  const transport = raw.transport === 'http' ? 'http' : raw.transport === 'stdio' ? 'stdio' : undefined
  if (transport === undefined) return undefined
  const timeout = typeof raw.toolCallTimeoutMs === 'number' && Number.isFinite(raw.toolCallTimeoutMs)
    ? Math.max(1000, Math.min(600_000, Math.round(raw.toolCallTimeoutMs)))
    : 60_000
  const base = {
    id,
    name,
    transport,
    enabled: raw.enabled === true,
    toolCallTimeoutMs: timeout,
    source: normalizeSource(raw.source),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  }
  if (transport === 'stdio') {
    const command = typeof raw.command === 'string' ? raw.command.trim() : ''
    if (command === '') return undefined
    return {
      ...base,
      command,
      args: stringArray(raw.args),
      env: stringMap(raw.env),
      cwd: stringValue(raw.cwd) ?? '',
    }
  }
  const url = typeof raw.url === 'string' ? raw.url.trim() : ''
  if (!/^https?:\/\//i.test(url)) return undefined
  return {
    ...base,
    url,
    headers: stringMap(raw.headers),
  }
}

/** Normalize an on-disk state document and migrate older versions. */
export function normalizeState(raw) {
  const warnings = []
  const state = defaultState()
  if (!isRecord(raw)) {
    warnings.push('state file is not a JSON object; using defaults')
    return { state, warnings }
  }
  if (isRecord(raw.sources)) {
    const dir = stringValue(raw.sources.ccSwitchDir)
    if (dir !== undefined) state.sources.ccSwitchDir = dir
  }
  if (raw.version !== STATE_VERSION) {
    warnings.push(`state version ${String(raw.version ?? 'legacy')} was reset to ${STATE_VERSION}; native servers were not imported from the old external-source toggles`)
    return { state, warnings }
  }
  if (raw.mcp?.master === false) state.mcp.master = false
  if (isRecord(raw.mcp?.items)) {
    for (const [id, value] of Object.entries(raw.mcp.items)) {
      if (typeof id !== 'string' || id === '') continue
      const item = normalizeItem(id, value)
      if (item === undefined) {
        warnings.push(`state item ${JSON.stringify(id)} is invalid and was dropped`)
        continue
      }
      state.mcp.items[id] = item
    }
  }
  return { state, warnings }
}

/** Read the state file; malformed documents are preserved beside it. */
export function loadState(stateFile) {
  let text
  try {
    text = fs.readFileSync(stateFile, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { state: defaultState(), warnings: [], existed: false }
    return {
      state: defaultState(),
      warnings: [`cannot read ${stateFile}: ${error?.message ?? String(error)}`],
      existed: false,
    }
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    const backup = `${stateFile}.invalid-${Date.now()}`
    try {
      fs.renameSync(stateFile, backup)
    } catch {
      // The original message still explains the problem.
    }
    return {
      state: defaultState(),
      warnings: [`state file was invalid JSON (${error?.message ?? String(error)}); preserved as ${backup}`],
      existed: true,
    }
  }
  const normalized = normalizeState(parsed)
  return { ...normalized, existed: true }
}

/** Write atomically with owner-only permissions. */
export async function saveState(stateDir, stateFile, state) {
  await fsp.mkdir(stateDir, { recursive: true, mode: 0o700 })
  const body = `${JSON.stringify(state, null, 2)}\n`
  const temporary = path.join(stateDir, `.state.${process.pid}.${Date.now()}.tmp`)
  await fsp.writeFile(temporary, body, { mode: 0o600 })
  await fsp.rename(temporary, stateFile)
  if (process.platform !== 'win32') await fsp.chmod(stateFile, 0o600).catch(() => {})
}

/** Apply a validated CC Switch directory override. */
export function setCcSwitchDir(state, value) {
  if (value !== null && typeof value !== 'string') throw new Error('ccSwitchDir must be a string or null')
  state.sources.ccSwitchDir = stringValue(value) ?? null
  return state
}
