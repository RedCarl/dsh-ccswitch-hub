/**
 * Read-only CC Switch adapter used by the import screen.
 *
 * Only this module touches CC Switch data. The native manager never lists
 * CC Switch entries as live sources; importing copies a definition into the
 * plugin's own MCP store or the Harness skills directory.
 */
import fs from 'node:fs'
import path from 'node:path'
import { readSkillFile } from './frontmatter.js'

const CC_SWITCH_APPS = ['claude', 'codex', 'gemini', 'grokbuild', 'opencode', 'hermes', 'mcode', 'pi', 'agy', 'kimi']

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringRecord(value) {
  if (!isRecord(value)) return undefined
  const result = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && entry !== '') result[key] = entry
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function stringArray(value) {
  if (!Array.isArray(value)) return undefined
  const result = value.filter((entry) => typeof entry === 'string')
  return result.length > 0 ? result : undefined
}

function normalizeTimeout(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(1000, Math.min(600_000, Math.round(value)))
}

function safeUrl(value) {
  const text = String(value ?? '')
  try {
    const url = new URL(text)
    return `${url.origin}${url.pathname}`
  } catch {
    return text.split('?')[0].split('#')[0]
  }
}

/** Normalize a CC Switch server spec into the runtime shape. */
export function normalizeSpec(raw) {
  const spec = isRecord(raw) ? raw : {}
  const type = typeof spec.type === 'string' ? spec.type.toLowerCase() : ''
  const command = typeof spec.command === 'string' && spec.command.trim() !== '' ? spec.command.trim() : undefined
  const url = [spec.url, spec.httpUrl, spec.serverUrl].find((value) => typeof value === 'string' && value.trim() !== '')
  const env = stringRecord(spec.env) ?? stringRecord(spec.environment)
  const headers = stringRecord(spec.headers) ?? stringRecord(spec.http_headers) ?? stringRecord(spec.httpHeaders)
  const args = stringArray(spec.args) ?? []
  const cwd = typeof spec.cwd === 'string' && spec.cwd !== '' ? spec.cwd : undefined
  const toolCallTimeoutMs = normalizeTimeout(spec.toolCallTimeoutMs ?? spec.tool_timeout_ms)

  if (command !== undefined) {
    return {
      transport: 'stdio',
      config: {
        command,
        args,
        ...(env !== undefined ? { env } : {}),
        ...(cwd !== undefined ? { cwd } : {}),
        ...(toolCallTimeoutMs !== undefined ? { toolCallTimeoutMs } : {}),
      },
      envKeys: Object.keys(env ?? {}),
      headerKeys: [],
      unsupported: undefined,
    }
  }
  if (typeof url === 'string') {
    if (type === 'sse') {
      return {
        transport: 'sse',
        config: { url: url.trim(), ...(headers !== undefined ? { headers } : {}), ...(toolCallTimeoutMs !== undefined ? { toolCallTimeoutMs } : {}) },
        envKeys: [],
        headerKeys: Object.keys(headers ?? {}),
        unsupported: 'Harness 不支持 SSE 传输；请在 CC Switch 中改成 HTTP，或改用本地 stdio 服务。',
      }
    }
    return {
      transport: 'http',
      config: { url: url.trim(), ...(headers !== undefined ? { headers } : {}), ...(toolCallTimeoutMs !== undefined ? { toolCallTimeoutMs } : {}) },
      envKeys: [],
      headerKeys: Object.keys(headers ?? {}),
      unsupported: undefined,
    }
  }
  return {
    transport: 'invalid',
    config: {},
    envKeys: [],
    headerKeys: [],
    unsupported: '没有可用的 command 或 url。',
  }
}

function summarize(name, transport, config) {
  if (transport === 'stdio') {
    const count = Array.isArray(config.args) ? config.args.length : 0
    return `stdio · ${config.command || name}${count > 0 ? ` · ${count} args` : ''}`
  }
  if (transport === 'http') return `http · ${safeUrl(config.url)}`
  if (transport === 'sse') return `sse · ${safeUrl(config.url)}`
  return '配置不完整'
}

/** Read the CC Switch SQLite MCP table through a read-only connection. */
export async function readCcSwitchDb(dbPath) {
  if (!fs.existsSync(dbPath)) return { servers: [], error: undefined, missing: true }
  let database
  try {
    const { DatabaseSync } = await import('node:sqlite')
    database = new DatabaseSync(dbPath, { readOnly: true, timeout: 5000 })
    const rows = database.prepare('SELECT * FROM mcp_servers').all()
    const servers = []
    for (const row of rows) {
      let spec
      try {
        spec = typeof row.server_config === 'string' ? JSON.parse(row.server_config) : row.server_config
      } catch {
        spec = undefined
      }
      let tags = []
      try {
        const parsed = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags
        if (Array.isArray(parsed)) tags = parsed
      } catch {
        tags = []
      }
      const id = typeof row.id === 'string' && row.id !== '' ? row.id : String(row.name ?? '')
      const name = typeof row.name === 'string' && row.name !== '' ? row.name : id
      const normalized = normalizeSpec(spec)
      const apps = CC_SWITCH_APPS.filter((app) => row[`enabled_${app}`] === 1 || row[`enabled_${app}`] === true)
      servers.push({
        id,
        name,
        description: typeof row.description === 'string' ? row.description : '',
        tags,
        apps,
        transport: normalized.transport,
        config: normalized.config,
        envKeys: normalized.envKeys,
        headerKeys: normalized.headerKeys,
        unsupported: normalized.unsupported,
        summary: summarize(name, normalized.transport, normalized.config),
      })
    }
    return { servers, error: undefined, missing: false }
  } catch (error) {
    return {
      servers: [],
      error: `无法读取 CC Switch 数据库 ${dbPath}：${error?.message ?? String(error)}`,
      missing: false,
    }
  } finally {
    try {
      database?.close()
    } catch {
      // A read-only handle can already be closed by a failed constructor path.
    }
  }
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

function isFile(target) {
  try {
    return fs.statSync(target).isFile()
  } catch {
    return false
  }
}

/** List CC Switch skills, following the same bundle rules as native skills. */
export function scanCcSwitchSkills(root) {
  const items = []
  const warnings = []
  let entries = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return { items, warnings, missing: true }
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(root, entry.name)
    let file
    let kind
    if (entry.isDirectory() || (entry.isSymbolicLink() && isDirectory(full))) {
      file = path.join(full, 'SKILL.md')
      kind = 'directory'
      if (!isFile(file)) continue
    } else if (entry.isFile() || (entry.isSymbolicLink() && isFile(full))) {
      if (!entry.name.toLowerCase().endsWith('.md')) continue
      file = full
      kind = 'file'
    } else {
      continue
    }
    const fallback = kind === 'directory' ? entry.name : path.basename(entry.name, path.extname(entry.name))
    const parsed = readSkillFile(file, fallback)
    if (parsed.error !== undefined) {
      warnings.push(parsed.error)
      continue
    }
    items.push({
      name: parsed.skill.name,
      description: parsed.skill.description,
      path: file,
      sourcePath: kind === 'directory' ? full : full,
      kind,
    })
  }
  const seen = new Set()
  const unique = []
  for (const item of items) {
    if (seen.has(item.name)) {
      warnings.push(`CC Switch 中技能「${item.name}」重复，已忽略后来的副本。`)
      continue
    }
    seen.add(item.name)
    unique.push(item)
  }
  return { items: unique.sort((left, right) => left.name.localeCompare(right.name)), warnings, missing: false }
}

/** Read both CC Switch sources plus display status. */
export async function scanCcSwitch(paths) {
  const db = await readCcSwitchDb(paths.ccSwitchDb)
  const skills = scanCcSwitchSkills(paths.ccSwitchSkills)
  const warnings = []
  if (db.error !== undefined) warnings.push(db.error)
  warnings.push(...skills.warnings)
  return {
    mcp: { servers: db.servers, error: db.error, exists: !db.missing },
    skills: { items: skills.items, missing: skills.missing ?? false, exists: !skills.missing },
    warnings,
  }
}
