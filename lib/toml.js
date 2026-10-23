/**
 * Small TOML reader for Codex's `[mcp_servers.<name>]` configuration.
 *
 * It intentionally supports the subset Codex writes for MCP servers: tables,
 * dotted and quoted keys, basic/literal strings, numbers, booleans, arrays,
 * and inline tables. Anything outside that subset is left as a raw string so
 * one unusual value cannot make the whole table unreadable.
 */

function stripComment(line) {
  let quote = ''
  let escaped = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quote !== '') {
      if (quote === '"' && escaped) {
        escaped = false
        continue
      }
      if (quote === '"' && char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '#') return line.slice(0, index)
  }
  return line
}

function depthDelta(text) {
  let quote = ''
  let escaped = false
  let delta = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== '') {
      if (quote === '"' && escaped) {
        escaped = false
        continue
      }
      if (quote === '"' && char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '[' || char === '{') delta += 1
    else if (char === ']' || char === '}') delta -= 1
  }
  return delta
}

function parseQuoted(text) {
  const quote = text[0]
  const body = text.slice(1, -1)
  if (quote === "'") return body
  return body.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (_match, escape) => {
    if (escape.length > 1 && (escape[0] === 'u' || escape[0] === 'U')) {
      return String.fromCodePoint(Number.parseInt(escape.slice(1), 16))
    }
    switch (escape) {
      case 'b': return '\b'
      case 't': return '\t'
      case 'n': return '\n'
      case 'f': return '\f'
      case 'r': return '\r'
      case '"': return '"'
      case '\\': return '\\'
      default: return escape
    }
  })
}

/** Parse one TOML key segment (bare or quoted). */
export function parseKeySegment(raw) {
  const text = raw.trim()
  if (text.startsWith('"') && text.endsWith('"')) return parseQuoted(text)
  if (text.startsWith("'") && text.endsWith("'")) return parseQuoted(text)
  return text
}

/** Split a dotted key path outside quotes. */
export function splitKeyPath(raw) {
  const parts = []
  let current = ''
  let quote = ''
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]
    if (quote !== '') {
      current += char
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '.') {
      parts.push(parseKeySegment(current))
      current = ''
      continue
    }
    current += char
  }
  if (current.trim() !== '') parts.push(parseKeySegment(current))
  return parts
}

function splitTopLevel(text, separator) {
  const parts = []
  let current = ''
  let depth = 0
  let quote = ''
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== '') {
      current += char
      if (quote === '"' && escaped) {
        escaped = false
        continue
      }
      if (quote === '"' && char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '[' || char === '{') depth += 1
    else if (char === ']' || char === '}') depth -= 1
    if (char === separator && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  parts.push(current)
  return parts
}

/** Parse a TOML value into the closest JavaScript shape. */
export function parseValue(raw) {
  const text = raw.trim()
  if (text === '') return ''
  if ((text.startsWith('"') && text.endsWith('"') && text.length >= 2)) return parseQuoted(text)
  if ((text.startsWith("'") && text.endsWith("'") && text.length >= 2)) return parseQuoted(text)
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim()
    if (inner === '') return []
    return splitTopLevel(inner, ',').map((part) => parseValue(part)).filter((part) => part !== '')
  }
  if (text.startsWith('{') && text.endsWith('}')) {
    const inner = text.slice(1, -1).trim()
    const result = {}
    if (inner === '') return result
    for (const part of splitTopLevel(inner, ',')) {
      const assignment = splitAssignment(part.trim())
      if (assignment === undefined) continue
      const path = splitKeyPath(assignment.key)
      if (path.length === 0) continue
      let cursor = result
      for (const segment of path.slice(0, -1)) {
        if (typeof cursor[segment] !== 'object' || cursor[segment] === null) cursor[segment] = {}
        cursor = cursor[segment]
      }
      cursor[path[path.length - 1]] = parseValue(assignment.value)
    }
    return result
  }
  if (text === 'true') return true
  if (text === 'false') return false
  if (/^[+-]?\d+$/.test(text)) return Number.parseInt(text, 10)
  if (/^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(text)) return Number.parseFloat(text)
  return text
}

function splitAssignment(text) {
  let depth = 0
  let quote = ''
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== '') {
      if (quote === '"' && escaped) {
        escaped = false
        continue
      }
      if (quote === '"' && char === '\\') {
        escaped = true
        continue
      }
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '[' || char === '{') depth += 1
    else if (char === ']' || char === '}') depth -= 1
    if (char === '=' && depth === 0) {
      return { key: text.slice(0, index).trim(), value: text.slice(index + 1).trim() }
    }
  }
  return undefined
}

function assignPath(target, path, value) {
  let cursor = target
  for (const segment of path.slice(0, -1)) {
    if (typeof cursor[segment] !== 'object' || cursor[segment] === null || Array.isArray(cursor[segment])) {
      cursor[segment] = {}
    }
    cursor = cursor[segment]
  }
  cursor[path[path.length - 1]] = value
}

/** Parse a TOML document into a plain object. Throws only on structural errors. */
export function parseToml(source) {
  const root = {}
  let current = root
  let currentPath = []
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n')
  let logical = ''
  let depth = 0

  const flush = (line) => {
    const text = line.trim()
    if (text === '') return
    if (text.startsWith('[') && text.endsWith(']')) {
      const isArray = text.startsWith('[[')
      const body = isArray ? text.slice(2, -2) : text.slice(1, -1)
      const path = splitKeyPath(body)
      if (path.length === 0) throw new Error('empty TOML table name')
      let cursor = root
      for (const segment of path.slice(0, -1)) {
        if (typeof cursor[segment] !== 'object' || cursor[segment] === null || Array.isArray(cursor[segment])) {
          cursor[segment] = {}
        }
        cursor = cursor[segment]
      }
      const last = path[path.length - 1]
      if (isArray) {
        if (!Array.isArray(cursor[last])) cursor[last] = []
        const table = {}
        cursor[last].push(table)
        current = table
      } else {
        if (typeof cursor[last] !== 'object' || cursor[last] === null || Array.isArray(cursor[last])) cursor[last] = {}
        current = cursor[last]
      }
      currentPath = path
      return
    }
    const assignment = splitAssignment(text)
    if (assignment === undefined) return
    const path = splitKeyPath(assignment.key)
    if (path.length === 0) return
    assignPath(current, path, parseValue(assignment.value))
  }

  for (const rawLine of lines) {
    const line = stripComment(rawLine).trim()
    if (line === '' && logical === '') continue
    logical = logical === '' ? line : `${logical} ${line}`
    depth += depthDelta(line)
    if (depth <= 0) {
      flush(logical)
      logical = ''
      depth = 0
    }
  }
  if (depth > 0) throw new Error('unterminated table or value at end of document')
  if (logical.trim() !== '') flush(logical)
  return root
}

function stringRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const result = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') result[key] = entry
    else if (entry !== undefined && entry !== null) result[key] = String(entry)
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function stringArray(value) {
  if (!Array.isArray(value)) return undefined
  const result = value.filter((entry) => typeof entry === 'string')
  return result.length > 0 ? result : undefined
}

/**
 * Extract MCP server definitions from Codex TOML text.
 * @returns `{ servers, error }`; malformed input yields an error and no servers.
 */
export function readCodexMcpServers(text) {
  let tree
  try {
    tree = parseToml(text)
  } catch (error) {
    return { servers: [], error: `invalid Codex TOML: ${error?.message ?? String(error)}` }
  }
  const table = tree?.mcp_servers
  if (table === null || typeof table !== 'object' || Array.isArray(table)) return { servers: [], error: undefined }
  const servers = []
  for (const [name, value] of Object.entries(table)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
    if (value.enabled === false) continue
    const env = stringRecord(value.env)
    const headers = stringRecord(value.http_headers) ?? stringRecord(value.headers)
    const bearerEnv = typeof value.bearer_token_env_var === 'string' ? value.bearer_token_env_var : undefined
    const mergedHeaders = headers ? { ...headers } : {}
    if (bearerEnv !== undefined && mergedHeaders.Authorization === undefined) {
      const token = process.env[bearerEnv]
      if (typeof token === 'string' && token !== '') mergedHeaders.Authorization = `Bearer ${token}`
    }
    const args = stringArray(value.args)
    const spec = {
      type: typeof value.url === 'string' && value.url !== '' ? 'http' : 'stdio',
      ...(typeof value.command === 'string' ? { command: value.command } : {}),
      ...(args !== undefined ? { args } : {}),
      ...(env !== undefined ? { env } : {}),
      ...(typeof value.cwd === 'string' ? { cwd: value.cwd } : {}),
      ...(typeof value.url === 'string' ? { url: value.url } : {}),
      ...(Object.keys(mergedHeaders).length > 0 ? { headers: mergedHeaders } : {}),
      ...(typeof value.tool_timeout_sec === 'number' && Number.isFinite(value.tool_timeout_sec)
        ? { toolCallTimeoutMs: Math.max(1000, Math.round(value.tool_timeout_sec * 1000)) }
        : {}),
    }
    servers.push({ name: String(name), spec })
  }
  return { servers, error: undefined }
}
