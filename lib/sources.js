/**
 * Read-only source adapters for CC Switch, Claude Code, Codex, and Gemini CLI.
 *
 * Every adapter normalizes its MCP entries into the same public row shape.
 * Secret values (env and header values) live only in `row.config`; the HTTP
 * state serializer picks explicit public fields and never spreads a row.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import { readCodexMcpServers } from './toml.js'

const VALID_RUNTIME_NAME = /^[A-Za-z0-9_-]{1,32}$/

const CC_SWITCH_APPS = [
  'claude',
  'codex',
  'gemini',
  'grokbuild',
  'opencode',
  'hermes',
  'mcode',
  'pi',
  'agy',
  'kimi',
]

/** Stable, grammar-safe MCP namespace for one source identity. */
export function runtimeServerName(key, name) {
  const text = typeof name === 'string' && name.trim() !== '' ? name.trim() : 'mcp'
  if (VALID_RUNTIME_NAME.test(text)) return text
  const base = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 24) || 'mcp'
  const hash = crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 6)
  return `${base}-${hash}`.slice(0, 32)
}

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

/**
 * Normalize a CC Switch / Claude / Gemini / Codex server spec.
 * @returns a transport-tagged config plus a human-readable unsupported reason.
 */
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
      config: { command, args, ...(env !== undefined ? { env } : {}), ...(cwd !== undefined ? { cwd } : {}), ...(toolCallTimeoutMs !== undefined ? { toolCallTimeoutMs } : {}) },
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
        unsupported: 'Harness 不支持 SSE 传输；请在 CC Switch 中把它改成 HTTP，或改用本地 stdio 服务。',
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

function safeUrl(value) {
  const text = String(value ?? '')
  try {
    const url = new URL(text)
    return `${url.origin}${url.pathname}`
  } catch {
    return text.split('?')[0].split('#')[0]
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

/** Build one public row from a normalized spec. */
export function makeServerRow({ key, name, description, tags, spec, origin, apps }) {
  const normalized = normalizeSpec(spec)
  return {
    key,
    name,
    description: typeof description === 'string' ? description : undefined,
    tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string') : [],
    origins: [origin],
    apps: Array.isArray(apps) ? [...new Set(apps.filter((app) => typeof app === 'string'))] : [],
    transport: normalized.transport,
    runtimeName: runtimeServerName(key, name),
    summary: summarize(name, normalized.transport, normalized.config),
    unsupported: normalized.unsupported,
    conflict: false,
    envKeys: normalized.envKeys,
    headerKeys: normalized.headerKeys,
    config: normalized.config,
  }
}

function parseJsonFile(file) {
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8')) }
  } catch (error) {
    if (error?.code === 'ENOENT') return { missing: true }
    return { error: error?.message ?? String(error) }
  }
}

/** Read CC Switch's SQLite MCP table through a read-only connection. */
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
      const apps = CC_SWITCH_APPS.filter((app) => row[`enabled_${app}`] === 1 || row[`enabled_${app}`] === true)
      const id = typeof row.id === 'string' && row.id !== '' ? row.id : String(row.name ?? '')
      const name = typeof row.name === 'string' && row.name !== '' ? row.name : id
      servers.push(makeServerRow({
        key: `ccswitch:${id}`,
        name,
        description: row.description,
        tags,
        spec,
        origin: 'cc-switch',
        apps,
      }))
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

/** Read `mcpServers` from a Claude Code or Gemini CLI JSON file. */
export function readJsonMcpServers(file, origin) {
  const parsed = parseJsonFile(file)
  if (parsed.missing) return { servers: [], error: undefined, missing: true }
  if (parsed.error !== undefined) return { servers: [], error: `无法解析 ${file}：${parsed.error}`, missing: false }
  const source = isRecord(parsed.value) ? parsed.value : {}
  const table = isRecord(source.mcpServers) ? source.mcpServers : undefined
  if (table === undefined) return { servers: [], error: undefined, missing: false }
  const servers = []
  for (const [name, spec] of Object.entries(table)) {
    if (!isRecord(spec)) continue
    servers.push(makeServerRow({
      key: `${origin}:${name}`,
      name,
      description: typeof spec.description === 'string' ? spec.description : undefined,
      tags: [],
      spec,
      origin,
      apps: [],
    }))
  }
  return { servers, error: undefined, missing: false }
}

/** Read Codex's `[mcp_servers.*]` tables. */
export function readCodexConfig(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { servers: [], error: undefined, missing: true }
    return { servers: [], error: `无法读取 ${file}：${error?.message ?? String(error)}`, missing: false }
  }
  const parsed = readCodexMcpServers(text)
  if (parsed.error !== undefined) return { servers: [], error: `${file}: ${parsed.error}`, missing: false }
  return {
    servers: parsed.servers.map(({ name, spec }) => makeServerRow({
      key: `codex:${name}`,
      name,
      tags: [],
      spec,
      origin: 'codex',
      apps: [],
    })),
    error: undefined,
    missing: false,
  }
}

/** Every server field safe for the browser; secret values are omitted. */
export function toPublicServer(row) {
  return {
    key: row.key,
    name: row.name,
    description: row.description ?? '',
    tags: row.tags,
    origins: row.origins,
    apps: row.apps,
    transport: row.transport,
    runtimeName: row.runtimeName,
    summary: row.summary,
    conflict: row.conflict,
    unsupported: row.unsupported,
    envKeys: row.envKeys,
    headerKeys: row.headerKeys,
  }
}

function sameConfig(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function mergeServers(primary, secondary) {
  for (const origin of secondary.origins) {
    if (!primary.origins.includes(origin)) primary.origins.push(origin)
  }
  for (const app of secondary.apps) {
    if (!primary.apps.includes(app)) primary.apps.push(app)
  }
  if (primary.description === undefined && secondary.description !== undefined) primary.description = secondary.description
  if (!sameConfig(primary.config, secondary.config)) primary.conflict = true
}

/**
 * Collect and merge MCP servers from all available sources.
 * @returns `{ servers, sources, warnings }`; `sources` is display metadata only.
 */
export async function collectMcpServers(paths) {
  const warnings = []
  const sources = []
  const order = []
  const byName = new Map()

  const add = (result, meta) => {
    sources.push({
      id: meta.id,
      label: meta.label,
      path: meta.path,
      exists: !result.missing,
      count: result.servers.length,
      error: result.error,
      kind: 'mcp',
    })
    if (result.error !== undefined) warnings.push(result.error)
    for (const row of result.servers) {
      order.push(row)
    }
  }

  add(await readCcSwitchDb(paths.ccSwitchDb), {
    id: 'ccswitch',
    label: 'CC Switch 数据库',
    path: paths.ccSwitchDb,
  })
  add(readJsonMcpServers(paths.claudeConfig, 'claude'), {
    id: 'claude',
    label: 'Claude Code',
    path: paths.claudeConfig,
  })
  add(readCodexConfig(paths.codexConfig), {
    id: 'codex',
    label: 'Codex',
    path: paths.codexConfig,
  })
  add(readJsonMcpServers(paths.geminiConfig, 'gemini'), {
    id: 'gemini',
    label: 'Gemini CLI',
    path: paths.geminiConfig,
  })

  for (const row of order) {
    const existing = byName.get(row.name)
    if (existing === undefined) {
      byName.set(row.name, row)
    } else {
      mergeServers(existing, row)
    }
  }

  const servers = [...byName.values()].sort((left, right) => left.name.localeCompare(right.name))
  for (const server of servers) {
    if (server.conflict) warnings.push(`MCP 服务器「${server.name}」在不同来源中的配置不一致，已使用优先级最高的配置。`)
    if (server.unsupported !== undefined) warnings.push(`MCP 服务器「${server.name}」：${server.unsupported}`)
  }
  return { servers, sources, warnings }
}

/** Presence metadata for a skill directory. */
export function skillSourceInfo(root) {
  let exists = false
  let count = 0
  try {
    const stat = fs.statSync(root.path)
    exists = stat.isDirectory()
    if (exists) count = fs.readdirSync(root.path).length
  } catch {
    exists = false
  }
  return {
    id: root.id,
    label: root.label,
    path: root.path,
    exists,
    count,
    kind: 'skills',
    controllable: root.controllable !== false,
  }
}
