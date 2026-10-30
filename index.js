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
import { applyUpdate, checkForUpdate, readPackageVersion, resolveInstall, scheduleReload } from './lib/update.js'
import { errorMessage, isRecord, truncate } from './lib/util.js'

/** Loader entry name used by diagnostics. */
export const name = 'ccswitch-hub'

/** The browser page needs the Host HTTP carrier. */
export const inject = ['webServer']

const BASE = '/plugins/ccswitch-hub'
const BODY_LIMIT = 256 * 1024
const DEFAULT_TIMEOUT_MS = 60_000
const PACKAGE_NAME = '@local/dsh-ccswitch-hub'
const PLUGIN_VERSION = readPackageVersion(import.meta.url) ?? '0.0.0'

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

  function isMcpClientEntry(entry) {
    try {
      const moduleName = entry?.options?.name
      return moduleName === '@deepseek-ai/dsh-mcp-client'
        || moduleName === 'mcp-client'
        || entry?.moduleNamespace?.name === 'mcp-client'
    } catch {
      return false
    }
  }

  /** Discover every MCP configured in Harness, including profile-managed and preset-owned rows. */
  function harnessMcpServers() {
    const own = ownRuntimeNames()
    const canManage = (() => {
      try {
        return typeof ctx.get?.('pluginManager')?.setPluginEnabled === 'function'
      } catch {
        return false
      }
    })()
    const servers = new Map()
    const add = (candidate) => {
      const name = stringValue(candidate?.serverName)
      if (name === undefined || own.has(name.toLowerCase())) return
      const key = name.toLowerCase()
      const next = { ...candidate, serverName: name, toolCount: candidate.toolCount ?? 0 }
      const current = servers.get(key)
      if (current === undefined) {
        servers.set(key, next)
        return
      }
      current.toolCount = Math.max(current.toolCount, next.toolCount)
      if (next.manageable === true) {
        servers.set(key, { ...current, ...next, toolCount: current.toolCount })
      } else if (current.manageable !== true && next.source === 'preset' && current.source === 'tools') {
        servers.set(key, { ...next, toolCount: current.toolCount })
      }
    }

    const configOf = (entry) => (isRecord(entry?.options?.config) ? entry.options.config : undefined)
    const transportOf = (config) => config?.transport === 'stdio'
      ? 'stdio'
      : config?.transport === 'streamable-http' ? 'http' : 'unknown'

    try {
      const editor = ctx.get?.('configEditor')
      if (editor && typeof editor.entries === 'function') {
        for (const entry of editor.entries()) {
          if (!isMcpClientEntry(entry)) continue
          const config = configOf(entry)
          const serverName = stringValue(config?.serverName)
          if (serverName === undefined) continue
          const transport = transportOf(config)
          add({
            serverName,
            toolCount: 0,
            transport,
            summary: summarizeMcp(serverName, transport, config),
            envKeys: Object.keys(isRecord(config?.env) ? config.env : {}),
            headerKeys: Object.keys(isRecord(config?.headers) ? config.headers : {}),
            enabled: entry.disabled !== true,
            manageable: canManage,
            editable: canManage && entry.disabled !== true && entry.fiber?.state === 2,
            entryId: typeof entry.id === 'string' ? entry.id : undefined,
            source: 'profile',
          })
        }
      }
    } catch {
      // Profile discovery is best effort.
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
            if (!isMcpClientEntry(entry)) continue
            const config = configOf(entry)
            const serverName = stringValue(config?.serverName)
            if (serverName === undefined) continue
            const transport = transportOf(config)
            add({
              serverName,
              toolCount: 0,
              transport,
              summary: summarizeMcp(serverName, transport, config),
              envKeys: Object.keys(isRecord(config?.env) ? config.env : {}),
              headerKeys: Object.keys(isRecord(config?.headers) ? config.headers : {}),
              enabled: entry.disabled !== true,
              manageable: false,
              editable: false,
              source: 'preset',
            })
          } catch {
            // A broken entry must not break the panel.
          }
        }
      } catch {
        // Loader discovery is best effort.
      }
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
        for (const server of listMcpToolServers(schemas, [...own])) {
          add({
            serverName: server.serverName,
            toolCount: server.toolCount,
            transport: 'unknown',
            summary: '',
            enabled: true,
            manageable: false,
            editable: false,
            source: 'tools',
          })
        }
      } catch {
        // Tool discovery is best effort.
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

  function updateInstallable() {
    try {
      const manager = ctx.get?.('pluginManager')
      return Boolean(manager && typeof manager.installBundle === 'function')
    } catch {
      return false
    }
  }

  async function updateInfo(force) {
    const install = resolveInstall({ metaUrl: import.meta.url, packageName: PACKAGE_NAME })
    return checkForUpdate({
      packageName: PACKAGE_NAME,
      currentVersion: PLUGIN_VERSION,
      installedVersion: readPackageVersion(install.packageDir),
      mode: install.mode,
      installable: updateInstallable(),
      force,
      userAgent: `dsh-ccswitch-hub/${PLUGIN_VERSION}`,
    })
  }

  function findItem(id) {
    return typeof id === 'string' ? state.mcp.items[id] : undefined
  }

  function findHarnessEntry(entryId) {
    if (typeof entryId !== 'string' || entryId === '') return undefined
    try {
      const editor = ctx.get?.('configEditor')
      for (const entry of editor?.entries?.() ?? []) {
        if (isMcpClientEntry(entry) && String(entry.id) === entryId) return entry
      }
    } catch {
      // Profile entries may be unavailable.
    }
    return undefined
  }

  function harnessMcpDetail(entry) {
    const config = isRecord(entry.options?.config) ? entry.options.config : {}
    const transport = config.transport === 'streamable-http' ? 'http' : 'stdio'
    return {
      entryId: String(entry.id),
      name: stringValue(config.serverName) ?? '',
      transport,
      enabled: entry.disabled !== true,
      editable: entry.disabled !== true && entry.fiber?.state === 2,
      command: typeof config.command === 'string' ? config.command : '',
      args: Array.isArray(config.args) ? config.args.filter((value) => typeof value === 'string') : [],
      cwd: typeof config.cwd === 'string' ? config.cwd : '',
      url: typeof config.url === 'string' ? config.url : '',
      toolCallTimeoutMs: typeof config.toolCallTimeoutMs === 'number' ? config.toolCallTimeoutMs : DEFAULT_TIMEOUT_MS,
      envKeys: Object.keys(isRecord(config.env) ? config.env : {}),
      headerKeys: Object.keys(isRecord(config.headers) ? config.headers : {}),
      source: { type: 'harness', id: String(entry.id), name: stringValue(config.serverName) ?? '' },
    }
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
        throw new Error(`当前 Host 不支持一键更新；请在终端运行 dsh plugin --profile <name> add ${PACKAGE_NAME}@latest`)
      }
      const info = await updateInfo(true)
      if (info.ok !== true) throw new Error(info.error ?? '检查更新失败')
      const install = resolveInstall({ metaUrl: import.meta.url, packageName: PACKAGE_NAME })
      const respondInstalled = (installedVersion, extra = {}) => {
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
          respondInstalled(info.installed ?? readPackageVersion(install.packageDir))
          return
        }
        throw new Error(`已是最新版本 v${info.current}`)
      }
      let result
      try {
        result = await applyUpdate({
          packageName: PACKAGE_NAME,
          targetVersion: info.latest,
          mode: install.mode,
          packageDir: install.packageDir,
          pluginManager: manager,
          tarballUrl: info.tarball,
        })
      } catch (error) {
        if (error?.code === 'already-installed' || error?.error?.code === 'already-installed'
          || String(errorMessage(error)).includes('already-installed')) {
          respondInstalled(readPackageVersion(install.packageDir))
          return
        }
        throw error
      }
      if (result.method === 'git') scheduleReload(ctx, PACKAGE_NAME)
      sendJson(res, 200, {
        ok: result.application !== 'failed',
        current: PLUGIN_VERSION,
        latest: info.latest,
        result: {
          application: result.application ?? (result.restartRequired ? 'restart-required' : 'applied'),
          stage: result.stage,
          version: result.to,
          installedVersion: result.to,
          reloadRequired: result.restartRequired,
          restartReason: result.restartReason,
          warnings: result.warnings,
          pendingBuilds: result.pendingBuilds,
          error: result.error,
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
      const harnessConflict = harnessMcpServers().find((server) => server.serverName.toLowerCase() === values.name.toLowerCase())
      if (harnessConflict !== undefined && (!existing || existing.name.toLowerCase() !== values.name.toLowerCase())) {
        throw new Error(`Harness 已有同名 MCP：${harnessConflict.serverName}`)
      }
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

  route(`${BASE}/harness-mcp-detail`, async (req, res) => {
    if (!readOnly(req, res)) return
    try {
      const entryId = new URL(String(req.url), 'http://localhost').searchParams.get('entryId') ?? ''
      const entry = findHarnessEntry(entryId)
      if (entry === undefined) throw new Error('找不到该 Harness MCP 条目')
      sendJson(res, 200, { ok: true, item: harnessMcpDetail(entry) })
    } catch (error) {
      sendJson(res, 404, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/harness-mcp-toggle`, async (req, res) => {
    if (!writeOnly(req, res)) return
    try {
      const body = await readJsonBody(req)
      const entry = findHarnessEntry(body.entryId)
      if (entry === undefined) throw new Error('找不到该 Harness MCP 条目')
      const manager = ctx.get?.('pluginManager')
      if (!manager || typeof manager.setPluginEnabled !== 'function') {
        throw new Error('当前 Host 不支持修改 Harness 配置')
      }
      const result = await manager.setPluginEnabled(String(entry.id), body.enabled === true)
      if (result?.application === 'failed') {
        throw new Error(result.error?.diagnostic ?? result.error?.code ?? '修改 Harness MCP 状态失败')
      }
      sendJson(res, 200, statePayload())
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 800) })
    }
  })

  route(`${BASE}/harness-mcp-save`, async (req, res) => {
    if (!writeOnly(req, res)) return
    try {
      const body = await readJsonBody(req)
      const entry = findHarnessEntry(body.entryId)
      if (entry === undefined) throw new Error('找不到该 Harness MCP 条目')
      if (entry.disabled === true) throw new Error('请先启用该 Harness MCP，再编辑配置')
      const editor = ctx.get?.('configEditor')
      if (!editor || typeof editor.edit !== 'function') throw new Error('当前 Host 不支持编辑 Harness 配置')
      const current = isRecord(entry.options?.config) ? entry.options.config : {}
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) throw new Error('serverName 必须是 1-32 位字母、数字、下划线或短横线')
      const currentName = (stringValue(current.serverName) ?? '').toLowerCase()
      const pluginConflict = Object.values(state.mcp.items).find((item) => item.name.toLowerCase() === name.toLowerCase()
        && item.name.toLowerCase() !== currentName)
      if (pluginConflict !== undefined) throw new Error(`已存在同名插件 MCP：${pluginConflict.name}`)
      const externalConflict = harnessMcpServers().find((server) => server.entryId !== String(entry.id)
        && server.serverName.toLowerCase() === name.toLowerCase())
      if (externalConflict !== undefined) throw new Error(`Harness 里已存在同名 MCP：${externalConflict.serverName}`)
      const transport = body.transport === 'http' ? 'http' : body.transport === 'stdio' ? 'stdio' : undefined
      if (transport === undefined) throw new Error('传输方式必须是 stdio 或 http')
      const timeout = Number(body.toolCallTimeoutMs)
      const toolCallTimeoutMs = Number.isFinite(timeout)
        ? Math.max(1000, Math.min(600_000, Math.round(timeout)))
        : DEFAULT_TIMEOUT_MS
      const common = {
        transport: transport === 'http' ? 'streamable-http' : 'stdio',
        serverName: name,
        toolCallTimeoutMs,
        failOnStartupError: current.failOnStartupError !== false,
        ...(typeof current.maxInstructionBytes === 'number' ? { maxInstructionBytes: current.maxInstructionBytes } : {}),
        ...(current.reconnect !== undefined ? { reconnect: current.reconnect } : {}),
      }
      let next
      if (transport === 'stdio') {
        const command = typeof body.command === 'string' ? body.command.trim() : ''
        if (command === '') throw new Error('stdio 必须填写 command')
        next = {
          ...common,
          command,
          args: parseArgs(body.argsText),
          env: mergeSecrets(parseKeyValueLines(body.envText), isRecord(current.env) ? current.env : {}),
          cwd: typeof body.cwd === 'string' ? body.cwd.trim() : '',
        }
      } else {
        const url = typeof body.url === 'string' ? body.url.trim() : ''
        if (!/^https?:\/\//i.test(url)) throw new Error('HTTP 必须填写 http(s) 地址')
        next = {
          ...common,
          url,
          headers: mergeSecrets(parseKeyValueLines(body.headersText), isRecord(current.headers) ? current.headers : {}),
        }
      }
      await editor.edit(entry, () => next)
      sendJson(res, 200, statePayload())
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 800) })
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
