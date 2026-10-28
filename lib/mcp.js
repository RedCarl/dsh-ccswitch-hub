/**
 * Runtime MCP mounts.
 *
 * Each enabled CC Switch server becomes one child `dsh-mcp-client` plugin, so
 * the shipped bridge owns transport, discovery, reconnect, and tool naming.
 * This module only decides what should be mounted, mounts it, and records a
 * status the page can show.
 */
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { errorMessage, truncate } from './util.js'

export const BRIDGE_PACKAGE = '@deepseek-ai/dsh-mcp-client'

const VALID_RUNTIME_NAME = /^[A-Za-z0-9_-]{1,32}$/

/** Stable, grammar-safe MCP namespace for one native server. */
export function runtimeServerName(id, name) {
  const text = typeof name === 'string' && name.trim() !== '' ? name.trim() : 'mcp'
  if (VALID_RUNTIME_NAME.test(text)) return text
  const base = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 24) || 'mcp'
  const hash = crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 6)
  return `${base}-${hash}`.slice(0, 32)
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

/** Human summary that never includes secrets. */
export function summarizeMcp(name, transport, config) {
  if (transport === 'stdio') {
    const count = Array.isArray(config.args) ? config.args.length : 0
    return `stdio · ${config.command || name}${count > 0 ? ` · ${count} args` : ''}`
  }
  if (transport === 'http') return `http · ${safeUrl(config.url)}`
  return '配置不完整'
}
const DEFAULT_TOOL_TIMEOUT_MS = 60_000
const MOUNT_TIMEOUT_MS = 75_000
let cachedBridge;

/** Translate one normalized row into the bridge's config. */
export function toMcpClientConfig(row) {
  const base = {
    serverName: row.runtimeName,
    toolCallTimeoutMs: row.config?.toolCallTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
    failOnStartupError: true,
  }
  if (row.transport === 'stdio') {
    return {
      ...base,
      transport: 'stdio',
      command: row.config.command,
      args: Array.isArray(row.config.args) ? row.config.args : [],
      env: row.config.env ?? {},
      ...(typeof row.config.cwd === 'string' && row.config.cwd !== '' ? { cwd: row.config.cwd } : {}),
    }
  }
  if (row.transport === 'http') {
    return {
      ...base,
      transport: 'streamable-http',
      url: row.config.url,
      headers: row.config.headers ?? {},
    }
  }
  throw new Error(row.unsupported ?? `不支持的传输方式：${String(row.transport)}`)
}

function normalizeModule(namespace) {
  const candidate = namespace?.default?.apply !== undefined ? namespace.default : namespace
  if (typeof candidate?.apply !== 'function') throw new Error('MCP 桥接模块没有 apply 导出')
  return candidate
}

/**
 * Resolve the shipped MCP bridge without adding it as a package dependency.
 * The loader's interception (then the profile package table, then a resolution
 * anchored at the launched CLI) keeps the same module instance as the Host.
 */
export async function loadBridge(ctx, logger) {
  if (cachedBridge !== undefined) return cachedBridge
  const attempts = []

  try {
    if (typeof ctx.loader?.import === 'function') {
      const loaded = normalizeModule(await ctx.loader.import(BRIDGE_PACKAGE))
      cachedBridge = loaded
      return loaded
    }
  } catch (error) {
    attempts.push(`loader: ${errorMessage(error)}`)
  }

  try {
    const packages = ctx.get?.('pluginPackages')
    const baseUrl = ctx.loader?.ctx?.baseUrl ?? ctx.baseUrl
    const pkg = packages?.packageOf?.(BRIDGE_PACKAGE, baseUrl)
    if (pkg?.dir !== undefined) {
      const main = typeof pkg.manifest?.main === 'string' ? pkg.manifest.main : 'lib/index.js'
      const loaded = normalizeModule(await import(pathToFileURL(path.join(pkg.dir, main)).href))
      cachedBridge = loaded
      return loaded
    }
  } catch (error) {
    attempts.push(`pluginPackages: ${errorMessage(error)}`)
  }

  try {
    const anchor = typeof process.argv[1] === 'string' ? process.argv[1] : import.meta.url
    const require = createRequire(anchor)
    const resolved = require.resolve(BRIDGE_PACKAGE)
    const loaded = normalizeModule(await import(pathToFileURL(resolved).href))
    cachedBridge = loaded
    return loaded
  } catch (error) {
    attempts.push(`require: ${errorMessage(error)}`)
  }

  try {
    const loaded = normalizeModule(await import(BRIDGE_PACKAGE))
    cachedBridge = loaded
    return loaded
  } catch (error) {
    attempts.push(`import: ${errorMessage(error)}`)
  }

  const detail = attempts.join('; ')
  logger?.error?.(`[ccswitch-hub] cannot load ${BRIDGE_PACKAGE}: ${detail}`)
  throw new Error(`无法加载 MCP 桥接 ${BRIDGE_PACKAGE}（${truncate(detail, 240)}）`)
}

function withTimeout(promise, ms) {
  let timer
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`MCP 连接超过 ${Math.round(ms / 1000)} 秒未完成`)), ms)
      timer.unref?.()
    }),
  ]).finally(() => clearTimeout(timer))
}

function signature(row) {
  return JSON.stringify({ serverName: row.runtimeName, transport: row.transport, config: row.config })
}

/** Sequential runtime manager for enabled MCP servers. */
export class McpRuntime {
  constructor({ ctx, logger }) {
    this.ctx = ctx
    this.logger = logger
    this.entries = new Map()
    this.statuses = new Map()
    this.queue = Promise.resolve()
    this.disposed = false
  }

  /** Serialize every mutation so toggles, rescans, and retries cannot interleave. */
  enqueue(task) {
    const run = this.queue.then(task, task)
    this.queue = run.then(() => {}, () => {})
    return run
  }

  statusOf(key) {
    return this.statuses.get(key) ?? { status: 'off', toolCount: 0 }
  }

  countTools(serverName) {
    try {
      const schemas = this.ctx.get?.('tools')?.schemas?.() ?? []
      const prefix = `mcp__${serverName}__`
      return schemas.filter((schema) => typeof schema?.name === 'string' && schema.name.startsWith(prefix)).length
    } catch {
      return 0
    }
  }

  async start(row) {
    const previous = this.entries.get(row.key)
    if (previous !== undefined) {
      this.entries.delete(row.key)
      await previous.fiber.dispose().catch(() => {})
    }
    if (this.disposed) return
    this.statuses.set(row.key, { status: 'connecting', toolCount: 0, serverName: row.runtimeName })
    let fiber
    try {
      const bridge = await loadBridge(this.ctx, this.logger)
      const config = toMcpClientConfig(row)
      fiber = this.ctx.plugin(bridge, config)
      await withTimeout(fiber, MOUNT_TIMEOUT_MS)
      if (this.disposed) {
        await fiber.dispose().catch(() => {})
        this.statuses.set(row.key, { status: 'off', toolCount: 0, serverName: row.runtimeName })
        return
      }
      this.entries.set(row.key, { fiber, signature: signature(row), serverName: row.runtimeName })
      const toolCount = this.countTools(row.runtimeName)
      this.statuses.set(row.key, {
        status: 'ready',
        toolCount,
        serverName: row.runtimeName,
        at: Date.now(),
      })
      this.logger?.info?.(`[ccswitch-hub] MCP ${row.name} connected (${toolCount} tools)`)
    } catch (error) {
      if (fiber !== undefined) await fiber.dispose().catch(() => {})
      this.statuses.set(row.key, {
        status: 'error',
        toolCount: 0,
        serverName: row.runtimeName,
        error: truncate(errorMessage(error), 600),
        at: Date.now(),
      })
      this.logger?.warn?.(`[ccswitch-hub] MCP ${row.name} failed: ${errorMessage(error)}`)
    }
  }

  async stop(key) {
    const entry = this.entries.get(key)
    this.entries.delete(key)
    if (entry !== undefined) await entry.fiber.dispose().catch(() => {})
    this.statuses.set(key, { status: 'off', toolCount: 0 })
  }

  /** Mount exactly the given rows, keeping unchanged mounts alive. */
  reconcile(rows) {
    return this.enqueue(async () => {
      if (this.disposed) return
      const desired = new Map(rows.map((row) => [row.key, row]))
      for (const [key, entry] of [...this.entries]) {
        const row = desired.get(key)
        if (row === undefined || entry.signature !== signature(row)) await this.stop(key)
      }
      for (const row of rows) {
        if (this.disposed) return
        if (!this.entries.has(row.key)) await this.start(row)
      }
      for (const key of [...this.statuses.keys()]) {
        if (!desired.has(key)) this.statuses.set(key, { status: 'off', toolCount: 0 })
      }
    })
  }

  retry(row) {
    return this.enqueue(async () => {
      await this.stop(row.key)
      await this.start(row)
    })
  }

  async disposeAll() {
    this.disposed = true
    await this.enqueue(async () => {
      for (const [key, entry] of [...this.entries]) {
        this.entries.delete(key)
        await entry.fiber.dispose().catch(() => {})
        this.statuses.set(key, { status: 'off', toolCount: 0 })
      }
    })
  }
}
