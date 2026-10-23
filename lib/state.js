/**
 * Durable CC Switch bridge state: only user choices and source overrides are
 * stored here. CC Switch data itself is never copied or modified.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { stringList, stringValue } from './paths.js'

export const STATE_VERSION = 1

/** Fresh state: both categories enabled, every discovered item off. */
export function defaultState() {
  return {
    version: STATE_VERSION,
    mcp: { master: true, items: {} },
    skills: { master: true, items: {} },
    sources: { ccSwitchDir: null, skillDirs: [] },
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeItems(raw) {
  const items = {}
  if (!isRecord(raw)) return items
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || key === '') continue
    if (isRecord(value) && value.enabled === true) items[key] = { enabled: true }
    else items[key] = { enabled: false }
  }
  return items
}

/** Normalize an on-disk state document, reporting fields that were repaired. */
export function normalizeState(raw) {
  const warnings = []
  const state = defaultState()
  if (!isRecord(raw)) {
    warnings.push('state file is not a JSON object; using defaults')
    return { state, warnings }
  }
  if (raw.mcp?.master === false) state.mcp.master = false
  if (raw.skills?.master === false) state.skills.master = false
  state.mcp.items = normalizeItems(raw.mcp?.items)
  state.skills.items = normalizeItems(raw.skills?.items)
  if (isRecord(raw.sources)) {
    const dir = stringValue(raw.sources.ccSwitchDir)
    if (dir !== undefined) state.sources.ccSwitchDir = dir
    const dirs = stringList(raw.sources.skillDirs)
    if (dirs.length > 0) state.sources.skillDirs = dirs
  }
  if (raw.version !== undefined && raw.version !== STATE_VERSION) {
    warnings.push(`state version ${String(raw.version)} was migrated to ${STATE_VERSION}`)
  }
  return { state, warnings }
}

/**
 * Read the state file. A malformed document is preserved beside the original
 * as `state.json.invalid-<timestamp>` before falling back to defaults.
 */
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

/** Read one item's enabled flag. */
export function isItemEnabled(state, kind, key) {
  return state?.[kind]?.items?.[key]?.enabled === true
}

/** Set one item's flag, creating the entry when needed. */
export function setItemEnabled(state, kind, key, enabled) {
  if (!state[kind] || typeof state[kind] !== 'object') state[kind] = { master: true, items: {} }
  if (!isRecord(state[kind].items)) state[kind].items = {}
  state[kind].items[key] = { enabled: enabled === true }
}

/** Apply validated source overrides. An empty value resets that override. */
export function setSources(state, body) {
  const next = { ...state.sources }
  if ('ccSwitchDir' in body) {
    if (body.ccSwitchDir !== null && typeof body.ccSwitchDir !== 'string') {
      throw new Error('ccSwitchDir must be a string or null')
    }
    const value = stringValue(body.ccSwitchDir)
    next.ccSwitchDir = value ?? null
  }
  if ('skillDirs' in body) {
    if (!Array.isArray(body.skillDirs) && typeof body.skillDirs !== 'string') {
      throw new Error('skillDirs must be an array or a comma-separated string')
    }
    next.skillDirs = stringList(body.skillDirs)
  }
  state.sources = {
    ccSwitchDir: next.ccSwitchDir ?? null,
    skillDirs: next.skillDirs ?? [],
  }
  return state
}
