/**
 * @local/dsh-ccswitch-hub — native MCP and skill manager for DeepSeek Harness.
 *
 * The panel owns a small MCP store and manages the Harness `skills/` directory
 * directly. CC Switch is only read by the import screen: importing copies a
 * definition or skill into Harness as an independent native entry.
 */
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { scanCcSwitch } from './lib/ccswitch.js'
import { McpRuntime, listMcpToolServers, runtimeServerName, summarizeMcp } from './lib/mcp.js'
import { deleteSkill, importSkill, scanSkills, setSkillEnabled } from './lib/native-skills.js'
import { resolvePaths, stringValue } from './lib/paths.js'
import { defaultState, loadState, saveState, setCcSwitchDir } from './lib/state.js'
import { REPO_URL, compareVersions, evaluateUpdate, fetchLatestRelease, readPackageVersion, releaseTarballAsset } from './lib/update.js'
import { errorMessage, isRecord, truncate } from './lib/util.js'

/** Loader entry name used by diagnostics. */
export const name = 'ccswitch-hub'

/** The browser page needs the Host HTTP carrier. */
export const inject = ['webServer']

const BASE = '/plugins/ccswitch-hub'
const BODY_LIMIT = 256 * 1024
const DEFAULT_TIMEOUT_MS = 60_000
const PLUGIN_VERSION = readPackageVersion(import.meta.url)
const UPDATE_TTL_MS = 5 * 60_000

function namedLogger(ctx) {
  try {
    return typeof ctx.logger === 'function' ? ctx.logger('ccswitch-hub') : ctx.logger
  } catch {
    return undefined
  }
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

function isLoopback(req) {
  const address = req.socket?.remoteAddress
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > BODY_LIMIT) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  const parsed = JSON.parse(text)
  if (!isRecord(parsed)) throw new Error('request body must be a JSON object')
  return parsed
}

/** Parse `KEY=value` lines. A blank value means "keep the stored value" on edit. */
export function parseKeyValueLines(text) {
  const result = {}
  if (typeof text !== 'string') return result
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index <= 0) throw new Error(`无效的键值行：${line}（应为 KEY=value）`)
    const key = line.slice(0, index).trim()
    if (key === '') throw new Error('键不能为空')
    if (Object.hasOwn(result, key)) throw new Error(`重复的键：${key}`)
    result[key] = line.slice(index + 1).trim()
  }
  return result
}

function parseArgs(text) {
  if (typeof text !== 'string') return []
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')
}

function mergeSecrets(next, previous) {
  const merged = {}
  for (const [key, value] of Object.entries(next)) {
    merged[key] = value === '' && typeof previous?.[key] === 'string' ? previous[key] : value
  }
  return merged
}

function publicMcpItem(item, status, master, shadowedBy) {
  const runtimeName = runtimeServerName(item.id, item.name)
  const shadowed = typeof shadowedBy === 'string' && shadowedBy !== ''
  return {
    id: item.id,
    name: item.name,
    transport: item.transport,
    summary: summarizeMcp(item.name, item.transport, item),
    runtimeName,
    enabled: item.enabled === true,
    master,
    status: shadowed ? 'off' : status.status,
    toolCount: shadowed ? 0 : (status.toolCount ?? 0),
    error: shadowed ? undefined : status.error,
    serverName: status.serverName ?? runtimeName,
    envKeys: Object.keys(item.env ?? {}),
    headerKeys: Object.keys(item.headers ?? {}),
    source: item.source,
    updatedAt: item.updatedAt,
    shadowedBy: shadowed ? shadowedBy : undefined,
    pending: !shadowed && item.enabled === true && master && status.status === 'off',
  }
}

function runtimeRow(item) {
  const config = item.transport === 'stdio'
    ? {
        command: item.command,
        args: item.args ?? [],
        env: item.env ?? {},
        ...(item.cwd ? { cwd: item.cwd } : {}),
      }
    : {
        url: item.url,
        headers: item.headers ?? {},
      }
  return {
    key: item.id,
    name: item.name,
    transport: item.transport,
    runtimeName: runtimeServerName(item.id, item.name),
    config: { ...config, toolCallTimeoutMs: item.toolCallTimeoutMs ?? DEFAULT_TIMEOUT_MS },
  }
}

function mcpDetail(item) {
  return {
    id: item.id,
    name: item.name,
    transport: item.transport,
    enabled: item.enabled === true,
    command: item.command ?? '',
    args: item.args ?? [],
    cwd: item.cwd ?? '',
    url: item.url ?? '',
    toolCallTimeoutMs: item.toolCallTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    envKeys: Object.keys(item.env ?? {}),
    headerKeys: Object.keys(item.headers ?? {}),
    source: item.source,
  }
}

/**
 * Mount the native store, the Harness skill directory manager, and the CC
 * Switch import surface.
 * @param ctx - Host Cordis context.
 * @param rawConfig - Loader row config.
 */
export function apply(ctx, rawConfig) {
  const logger = namedLogger(ctx)
  const profileContext = ctx.get?.('profileContext')
  const dshHome = stringValue(profileContext?.home) ?? stringValue(process.env.DSH_HOME) ?? path.join(os.homedir(), '.dsh')
  const rowConfig = isRecord(rawConfig) ? rawConfig : {}
  const loaded = loadState(path.join(dshHome, 'ccswitch-hub', 'state.json'))
  const state = loaded.state ?? defaultState()
  const warnings = [...loaded.warnings]

  function paths() {
    return resolvePaths({
      ...rowConfig,
      ...(stringValue(state.sources?.ccSwitchDir) ? { ccSwitchDir: state.sources.ccSwitchDir } : {}),
    }, { dshHome, homeDir: os.homedir() })
  }

  const runtime = new McpRuntime({ ctx, logger })
  let mutationQueue = Promise.resolve()

  function serialize(task) {
    const run = mutationQueue.then(task, task)
    mutationQueue = run.then(() => {}, () => {})
    return run
  }

  async function persist() {
    const resolved = paths()
    await saveState(resolved.stateDir, resolved.stateFile, state)
    for (let index = warnings.length - 1; index >= 0; index -= 1) {
      if (warnings[index].startsWith('state version')) warnings.splice(index, 1)
    }
  }

  function ownRuntimeNames() {
    return new Set(Object.values(state.mcp.items).map((item) => runtimeServerName(item.id, item.name).toLowerCase()))
  }

  /** Discover MCP servers owned by Harness itself, without exposing their configs or secrets. */
  function harnessMcpServers() {
    const own = ownRuntimeNames()
    const servers = new Map()
    const add = (serverName, toolCount, source) => {
      if (typeof serverName !== 'string' || serverName === '') return
      if (own.has(serverName.toLowerCase())) return
      const current = servers.get(serverName.toLowerCase())
      if (current === undefined) {
        servers.set(serverName.toLowerCase(), { serverName, toolCount, source })
        return
      }
      current.toolCount = Math.max(current.toolCount, toolCount)
      if (current.toolCount > 0) current.source = 'tools'
    }
    const toolServices = []
    try {
      const rootTools = ctx.get?.('tools')
      if (rootTools !== undefined) toolServices.push(rootTools)
    } catch {
      // Root tool discovery is best effort.
    }
    try {
      for (const agent of ctx.get?.('agents')?.list?.() ?? []) {
        try {
          const scoped = agent?.ctx?.get?.('tools')
          if (scoped !== undefined) toolServices.push(scoped)
        } catch {
          // An agent may be tearing down.
        }
      }
    } catch {
      // Agent discovery is best effort.
    }
    for (const service of toolServices) {
      try {
        const schemas = service.schemas?.() ?? []
        for (const server of listMcpToolServers(schemas, [...own])) add(server.serverName, server.toolCount, 'tools')
      } catch {
        // Tool discovery is best effort.
      }
    }
    const entrySources = []
    try {
      if (ctx.loader !== undefined) entrySources.push(ctx.loader)
    } catch {
      // Optional loader access.
    }
    for (const serviceName of ['loader', 'configEditor']) {
      try {
        const service = ctx.get?.(serviceName)
        if (service !== undefined) entrySources.push(service)
      } catch {
        // Optional service access.
      }
    }
    for (const service of entrySources) {
      try {
        if (typeof service.entries !== 'function') continue
        for (const entry of service.entries()) {
          try {
            const moduleName = entry?.options?.name
            const namespace = entry?.moduleNamespace?.name
            if (moduleName !== '@deepseek-ai/dsh-mcp-client'
              && moduleName !== 'mcp-client'
              && namespace !== 'mcp-client') continue
            if (entry.disabled === true) continue
            const config = entry.options?.config
            const serverName = stringValue(config?.serverName)
            if (serverName !== undefined) add(serverName, 0, 'loader')
          } catch {
            // A broken entry must not break the panel.
          }
        }
      } catch {
        // Loader discovery is best effort.
      }
    }
    return [...servers.values()].sort((left, right) => left.serverName.localeCompare(right.serverName))
  }

  function shadowedBy(item, harnessNames) {
    return harnessNames.get(item.name.toLowerCase())
      ?? harnessNames.get(runtimeServerName(item.id, item.name).toLowerCase())
  }

  function enabledRows() {
    if (state.mcp.master !== true) return []
    const harnessNames = new Map(harnessMcpServers().map((server) => [server.serverName.toLowerCase(), server.serverName]))
    return Object.values(state.mcp.items)
      .filter((item) => item.enabled === true && shadowedBy(item, harnessNames) === undefined)
      .map((item) => runtimeRow(item))
  }

  async function reconcile() {
    await runtime.reconcile(enabledRows())
  }

  function nativeSkillItems() {
    return scanSkills(paths())
  }

  function statePayload() {
    const resolved = paths()
    const master = state.mcp.master === true
    const harness = harnessMcpServers()
    const harnessNames = new Map(harness.map((server) => [server.serverName.toLowerCase(), server.serverName]))
    const items = Object.values(state.mcp.items)
      .map((item) => publicMcpItem(item, runtime.statusOf(item.id), master, shadowedBy(item, harnessNames)))
      .sort((left, right) => left.name.localeCompare(right.name))
    const skills = nativeSkillItems()
    return {
      ok: true,
      version: state.version,
      pluginVersion: PLUGIN_VERSION,
      stateFile: resolved.stateFile,
      config: { ccSwitchDir: state.sources?.ccSwitchDir ?? null },
      paths: {
        skillsDir: resolved.skillsDir,
        disabledSkillsDir: resolved.disabledSkillsDir,
        ccSwitchDir: resolved.ccSwitchDir,
        ccSwitchDb: resolved.ccSwitchDb,
      },
      mcp: { master, items, harness },
      skills: { items: skills.items },
      warnings: [...new Set([...warnings, ...skills.warnings])],
    }
  }

  let updateCache = { at: 0, info: null }

  function updateInstallable() {
    try {
      const manager = ctx.get?.('pluginManager')
      return Boolean(manager && typeof manager.installBundle === 'function')
    } catch {
      return false
    }
  }

  async function updateInfo(force) {
    const now = Date.now()
    const ttl = updateCache.info?.ok === false ? 60_000 : UPDATE_TTL_MS
    if (force !== true && updateCache.info !== null && now - updateCache.at < ttl) return updateCache.info
    let info
    const installed = readPackageVersion(import.meta.url)
    try {
      const release = await fetchLatestRelease({ userAgent: `dsh-ccswitch-hub/${PLUGIN_VERSION}` })
      const decision = evaluateUpdate(PLUGIN_VERSION, installed, release.version)
      info = {
        ok: true,
        current: PLUGIN_VERSION,
        installed,
        latest: release.version,
        ...decision,
        release,
        installable: updateInstallable(),
        checkedAt: new Date().toISOString(),
      }
    } catch (error) {
      info = {
        ok: false,
        current: PLUGIN_VERSION,
        installed,
        latest: null,
        updateAvailable: false,
        restartRequired: compareVersions(installed, PLUGIN_VERSION) > 0,
        error: truncate(errorMessage(error), 600),
        installable: updateInstallable(),
        checkedAt: new Date().toISOString(),
      }
    }
    updateCache = { at: now, info }
    return info
  }

  function findItem(id) {
    return typeof id === 'string' ? state.mcp.items[id] : undefined
  }

  function nameConflict(name, exceptId) {
    const needle = name.toLowerCase()
    return Object.values(state.mcp.items).some((item) => item.id !== exceptId && item.name.toLowerCase() === needle)
  }

  function validateMcp(body, existing) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (name === '') throw new Error('名称不能为空')
    if (name.length > 128) throw new Error('名称不能超过 128 个字符')
    if (nameConflict(name, existing?.id)) throw new Error('已存在同名 MCP 服务器')
    const transport = body.transport === 'http' ? 'http' : body.transport === 'stdio' ? 'stdio' : undefined
    if (transport === undefined) throw new Error('传输方式必须是 stdio 或 http')
    const timeout = Number(body.toolCallTimeoutMs)
    const toolCallTimeoutMs = Number.isFinite(timeout)
      ? Math.max(1000, Math.min(600_000, Math.round(timeout)))
      : DEFAULT_TIMEOUT_MS
    const enabled = body.enabled === true
    if (transport === 'stdio') {
      const command = typeof body.command === 'string' ? body.command.trim() : ''
      if (command === '') throw new Error('stdio 必须填写 command')
      return {
        name,
        transport,
        enabled,
        toolCallTimeoutMs,
        command,
        args: parseArgs(body.argsText),
        env: mergeSecrets(parseKeyValueLines(body.envText), existing?.env),
        cwd: typeof body.cwd === 'string' ? body.cwd.trim() : '',
      }
    }
    const url = typeof body.url === 'string' ? body.url.trim() : ''
    if (!/^https?:\/\//i.test(url)) throw new Error('HTTP 必须填写 http(s) 地址')
    return {
      name,
      transport,
      enabled,
      toolCallTimeoutMs,
      url,
      headers: mergeSecrets(parseKeyValueLines(body.headersText), existing?.headers),
    }
  }

  function ccSwitchPayload(scanned) {
    const nativeNames = new Set(Object.values(state.mcp.items).map((item) => item.name.toLowerCase()))
    const harness = harnessMcpServers()
    const harnessNames = new Set(harness.map((server) => server.serverName.toLowerCase()))
    const importedIds = new Set(
      Object.values(state.mcp.items)
        .map((item) => (item.source?.type === 'ccswitch' ? item.source.id : undefined))
        .filter((value) => typeof value === 'string'),
    )
    const skills = nativeSkillItems()
    const installedSkills = new Set(skills.items.map((item) => item.name))
    const resolved = paths()
    return {
      ok: true,
      status: {
        dir: resolved.ccSwitchDir,
        dbPath: resolved.ccSwitchDb,
        dbExists: scanned.mcp.exists,
        skillsPath: resolved.ccSwitchSkills,
        skillsExists: scanned.skills.exists,
        mcpError: scanned.mcp.error,
      },
      mcp: scanned.mcp.servers.map((server) => ({
        id: server.id,
        name: server.name,
        description: server.description,
        summary: server.summary,
        transport: server.transport,
        apps: server.apps,
        envKeys: server.envKeys,
        headerKeys: server.headerKeys,
        unsupported: server.unsupported,
        imported: importedIds.has(server.id),
        external: !importedIds.has(server.id) && harnessNames.has(server.name.toLowerCase()),
        conflict: !importedIds.has(server.id)
          && (harnessNames.has(server.name.toLowerCase()) || nativeNames.has(server.name.toLowerCase())),
      })),
      skills: scanned.skills.items.map((item) => ({
        name: item.name,
        description: item.description,
        kind: item.kind,
        installed: installedSkills.has(item.name),
      })),
      warnings: [...new Set([...warnings, ...scanned.warnings])],
    }
  }

  function importMcp(server) {
    if (server.unsupported !== undefined) throw new Error(server.unsupported)
    if (nameConflict(server.name)) throw new Error(`已存在同名 MCP 服务器：${server.name}`)
    if (harnessMcpServers().some((entry) => entry.serverName.toLowerCase() === server.name.toLowerCase())) {
      throw new Error(`Harness 已有同名 MCP：${server.name}`)
    }
    const id = `mcp-${crypto.randomUUID().slice(0, 8)}`
    const now = Date.now()
    const base = {
      id,
      name: server.name,
      transport: server.transport,
      enabled: false,
      toolCallTimeoutMs: server.config.toolCallTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      source: { type: 'ccswitch', id: server.id, name: server.name },
      createdAt: now,
      updatedAt: now,
    }
    state.mcp.items[id] = server.transport === 'stdio'
      ? {
          ...base,
          command: server.config.command,
          args: server.config.args ?? [],
          env: server.config.env ?? {},
          cwd: server.config.cwd ?? '',
        }
      : {
          ...base,
          url: server.config.url,
          headers: server.config.headers ?? {},
        }
  }

  async function importOneMcp(id) {
    const scanned = await scanCcSwitch(paths())
    const server = scanned.mcp.servers.find((entry) => entry.id === id)
    if (server === undefined) throw new Error('找不到该 CC Switch MCP 服务器')
    const already = Object.values(state.mcp.items).some((item) => item.source?.type === 'ccswitch' && item.source.id === id)
    if (already) throw new Error('该服务器已导入')
    importMcp(server)
    await persist()
    await reconcile()
  }

  async function importOneSkill(name) {
    const scanned = await scanCcSwitch(paths())
    const item = scanned.skills.items.find((entry) => entry.name === name)
    if (item === undefined) throw new Error('找不到该 CC Switch 技能')
    importSkill(paths(), name, item.sourcePath)
  }

  // ── startup ────────────────────────────────────────────────────────────────
  reconcile().catch((error) => {
    warnings.push(`启动 MCP 失败：${errorMessage(error)}`)
    logger?.warn?.(`[ccswitch-hub] startup reconcile failed: ${errorMessage(error)}`)
  })

  const discoveryTimers = [1500, 5000].map((delay) => setTimeout(() => {
    reconcile().catch((error) => {
      logger?.warn?.(`[ccswitch-hub] discovery reconcile failed: ${errorMessage(error)}`)
    })
  }, delay))
  for (const timer of discoveryTimers) timer.unref?.()

  ctx.effect(() => {
    return async () => {
      for (const timer of discoveryTimers) clearTimeout(timer)
      await runtime.disposeAll()
    }
  }, 'ccswitch-hub: runtime')

  // ── HTTP API ───────────────────────────────────────────────────────────────
  const authorized = (req, res) => {
    try {
      const connection = ctx.get?.('connection')
      if (typeof connection?.requestRejection === 'function') {
        const rejection = connection.requestRejection(req)
        if (rejection !== undefined) {
          res.writeHead(rejection).end()
          return false
        }
        return true
      }
    } catch {
      // Fall through to the loopback fence.
    }
    if (!isLoopback(req)) {
      res.writeHead(403).end()
      return false
    }
    return true
  }

  const route = (pathname, handler) => {
    ctx.effect(
      () => ctx.webServer.register({ kind: 'exact', path: pathname, handler }),
      `ccswitch-hub: ${pathname}`,
    )
  }

  const readOnly = (req, res) => {
    if (!authorized(req, res)) return false
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return false
    }
    return true
  }

  const writeOnly = (req, res) => {
    if (!authorized(req, res)) return false
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return false
    }
    return true
  }

  route(`${BASE}/state`, async (req, res) => {
    if (!readOnly(req, res)) return
    try {
      sendJson(res, 200, statePayload())
    } catch (error) {
      sendJson(res, 500, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/update`, async (req, res) => {
    if (!authorized(req, res)) return
    if (req.method === 'GET' || req.method === 'HEAD') {
      try {
        const force = new URL(String(req.url), 'http://localhost').searchParams.get('refresh') === '1'
        sendJson(res, 200, await updateInfo(force))
      } catch (error) {
        sendJson(res, 500, { ok: false, error: truncate(errorMessage(error), 600) })
      }
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    try {
      const manager = ctx.get?.('pluginManager')
      if (!manager || typeof manager.installBundle !== 'function') {
        throw new Error('当前 Host 不支持一键更新；请在终端运行 dsh plugin add ' + REPO_URL)
      }
      const info = await updateInfo(true)
      if (info.ok !== true) throw new Error(info.error ?? '检查更新失败')
      const respondInstalled = (installedVersion, extra = {}) => {
        updateCache = { at: 0, info: null }
        sendJson(res, 200, {
          ok: true,
          current: PLUGIN_VERSION,
          latest: info.latest,
          result: {
            application: 'restart-required',
            installedVersion,
            reloadRequired: true,
            alreadyInstalled: true,
            ...extra,
          },
        })
      }
      if (info.updateAvailable !== true) {
        if (info.restartRequired === true) {
          respondInstalled(info.installed ?? readPackageVersion(import.meta.url))
          return
        }
        throw new Error(`已是最新版本 v${info.current}`)
      }
      const asset = releaseTarballAsset(info.release)
      let result
      try {
        result = await manager.installBundle(asset?.url ?? REPO_URL, { saveExact: false })
      } catch (error) {
        if (error?.code === 'already-installed' || error?.error?.code === 'already-installed'
          || String(errorMessage(error)).includes('already-installed')) {
          respondInstalled(readPackageVersion(import.meta.url))
          return
        }
        throw error
      }
      if (result?.error?.code === 'already-installed') {
        respondInstalled(readPackageVersion(import.meta.url))
        return
      }
      updateCache = { at: 0, info: null }
      const application = typeof result?.application === 'string' ? result.application : 'unknown'
      const failure = result?.error
        ? (typeof result.error.message === 'string' ? result.error.message : truncate(JSON.stringify(result.error), 600))
        : undefined
      const installedVersion = typeof result?.version === 'string'
        ? result.version
        : readPackageVersion(import.meta.url)
      const reloadRequired = application === 'restart-required'
        || compareVersions(installedVersion, PLUGIN_VERSION) > 0
      sendJson(res, 200, {
        ok: application !== 'failed' && application !== 'cancelled',
        current: PLUGIN_VERSION,
        latest: info.latest,
        result: {
          application,
          stage: result?.stage,
          version: result?.version,
          installedVersion,
          reloadRequired,
          restartReason: result?.restartReason,
          warnings: result?.warnings,
          pendingBuilds: result?.pendingBuilds,
          error: failure,
        },
      })
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 800) })
    }
  })

  route(`${BASE}/mcp-detail`, async (req, res) => {
    if (!readOnly(req, res)) return
    try {
      const id = new URL(String(req.url), 'http://localhost').searchParams.get('id') ?? ''
      const item = findItem(id)
      if (item === undefined) throw new Error('找不到该 MCP 服务器')
      sendJson(res, 200, { ok: true, item: mcpDetail(item) })
    } catch (error) {
      sendJson(res, 404, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/mcp-save`, async (req, res) => {
    if (!writeOnly(req, res)) return
    try {
      const body = await readJsonBody(req)
      const id = typeof body.id === 'string' && body.id !== '' ? body.id : undefined
      const existing = id === undefined ? undefined : findItem(id)
      if (id !== undefined && existing === undefined) throw new Error('找不到该 MCP 服务器')
      const values = validateMcp(body, existing)
      const nextId = existing?.id ?? `mcp-${crypto.randomUUID().slice(0, 8)}`
      const now = Date.now()
      const previous = existing ?? {}
      const base = {
        id: nextId,
        name: values.name,
        transport: values.transport,
        enabled: values.enabled,
        toolCallTimeoutMs: values.toolCallTimeoutMs,
        source: previous.source ?? null,
        createdAt: previous.createdAt ?? now,
        updatedAt: now,
      }
      state.mcp.items[nextId] = values.transport === 'stdio'
        ? { ...base, command: values.command, args: values.args, env: values.env, cwd: values.cwd }
        : { ...base, url: values.url, headers: values.headers }
      await persist()
      await reconcile()
      sendJson(res, 200, statePayload())
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/mcp-toggle`, async (req, res) => {
    if (!writeOnly(req, res)) return
    try {
      const body = await readJsonBody(req)
      const item = findItem(body.id)
      if (item === undefined) throw new Error('找不到该 MCP 服务器')
      if (typeof body.enabled !== 'boolean') throw new Error('enabled must be a boolean')
      item.enabled = body.enabled
      item.updatedAt = Date.now()
      await persist()
      await reconcile()
      sendJson(res, 200, statePayload())
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/mcp-master`, async (req, res) => {
    if (!writeOnly(req, res)) return
    try {
      const body = await readJsonBody(req)
      if (typeof body.enabled !== 'boolean') throw new Error('enabled must be a boolean')
      state.mcp.master = body.enabled
      await persist()
      await reconcile()
      sendJson(res, 200, statePayload())
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/mcp-delete`, async (req, res) => {
    if (!writeOnly(req, res)) return
    try {
      const body = await readJsonBody(req)
      const item = findItem(body.id)
      if (item === undefined) throw new Error('找不到该 MCP 服务器')
      delete state.mcp.items[item.id]
      await persist()
      await reconcile()
      sendJson(res, 200, statePayload())
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/mcp-retry`, async (req, res) => {
    if (!writeOnly(req, res)) return
    try {
      const body = await readJsonBody(req)
      const item = findItem(body.id)
      if (item === undefined) throw new Error('找不到该 MCP 服务器')
      if (!state.mcp.master) throw new Error('MCP 总开关已关闭')
      if (!item.enabled) throw new Error('请先启用该服务器')
      const harnessNames = new Map(harnessMcpServers().map((server) => [server.serverName.toLowerCase(), server.serverName]))
      const shadow = shadowedBy(item, harnessNames)
      if (shadow !== undefined) throw new Error(`Harness 已有同名 MCP（${shadow}），已跳过该重复条目`)
      await runtime.retry(runtimeRow(item))
      sendJson(res, 200, statePayload())
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/skills-toggle`, async (req, res) => {
    if (!writeOnly(req, res)) return
    try {
      const body = await readJsonBody(req)
      if (typeof body.name !== 'string' || typeof body.enabled !== 'boolean') throw new Error('name and enabled are required')
      setSkillEnabled(paths(), body.name, body.enabled)
      sendJson(res, 200, statePayload())
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/skills-delete`, async (req, res) => {
    if (!writeOnly(req, res)) return
    try {
      const body = await readJsonBody(req)
      if (typeof body.name !== 'string') throw new Error('name is required')
      const result = deleteSkill(paths(), body.name)
      sendJson(res, 200, { ...statePayload(), trashedTo: result.trashedTo })
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/ccswitch`, async (req, res) => {
    if (!readOnly(req, res)) return
    try {
      const scanned = await scanCcSwitch(paths())
      sendJson(res, 200, ccSwitchPayload(scanned))
    } catch (error) {
      sendJson(res, 500, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/import-mcp`, async (req, res) => {
    if (!writeOnly(req, res)) return
    try {
      const body = await readJsonBody(req)
      if (typeof body.id !== 'string') throw new Error('id is required')
      await serialize(() => importOneMcp(body.id))
      sendJson(res, 200, statePayload())
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/import-skill`, async (req, res) => {
    if (!writeOnly(req, res)) return
    try {
      const body = await readJsonBody(req)
      if (typeof body.name !== 'string') throw new Error('name is required')
      await serialize(() => importOneSkill(body.name))
      sendJson(res, 200, statePayload())
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/import-all`, async (req, res) => {
    if (!writeOnly(req, res)) return
    try {
      const body = await readJsonBody(req)
      if (body.kind !== 'mcp' && body.kind !== 'skill') throw new Error('kind must be mcp or skill')
      const errors = []
      let imported = 0
      await serialize(async () => {
        if (body.kind === 'mcp') {
          const scanned = await scanCcSwitch(paths())
          for (const server of scanned.mcp.servers) {
            if (server.unsupported !== undefined) continue
            if (Object.values(state.mcp.items).some((item) => item.source?.type === 'ccswitch' && item.source.id === server.id)) continue
            if (nameConflict(server.name)) continue
            try {
              importMcp(server)
              imported += 1
            } catch (error) {
              errors.push(`${server.name}: ${errorMessage(error)}`)
            }
          }
          await persist()
          await reconcile()
        } else {
          const scanned = await scanCcSwitch(paths())
          const installed = new Set(nativeSkillItems().items.map((item) => item.name))
          for (const item of scanned.skills.items) {
            if (installed.has(item.name)) continue
            try {
              importSkill(paths(), item.name, item.sourcePath)
              installed.add(item.name)
              imported += 1
            } catch (error) {
              errors.push(`${item.name}: ${errorMessage(error)}`)
            }
          }
        }
      })
      sendJson(res, 200, { ...statePayload(), imported, errors })
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/config`, async (req, res) => {
    if (!writeOnly(req, res)) return
    try {
      const body = await readJsonBody(req)
      setCcSwitchDir(state, body.ccSwitchDir)
      await persist()
      sendJson(res, 200, statePayload())
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  // Republishing refreshes the client-module row so an open page can pick up
  // the panel without a Host restart.
  try {
    const clientModules = ctx.get?.('clientModules')
    if (clientModules && typeof clientModules.rebuilt === 'function') {
      setTimeout(() => {
        try {
          clientModules.rebuilt('@local/dsh-ccswitch-hub')
        } catch {
          // Headless hosts have no client module table.
        }
      }, 0).unref?.()
    }
  } catch {
    // Optional integration only.
  }

  logger?.info?.(`[ccswitch-hub] ready (${Object.keys(state.mcp.items).length} native MCP, ${paths().skillsDir})`)
}
