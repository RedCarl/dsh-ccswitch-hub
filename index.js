/**
 * @local/dsh-ccswitch-hub — manage MCP servers and skills inside DeepSeek
 * Harness, with per-item and category switches. CC Switch is one optional
 * source among the local tool configurations this Host half reads.
 *
 * Host half:
 * - reads CC Switch / Claude Code / Codex / Gemini CLI MCP definitions;
 * - mounts enabled servers through the shipped `dsh-mcp-client` bridge;
 * - registers a `ctx.skills` provider that serves enabled CC Switch skills;
 * - serves `/plugins/ccswitch-hub/*` for the sidebar page.
 *
 * The CC Switch data directory is never written to.
 */
import os from 'node:os'
import path from 'node:path'
import { McpRuntime } from './lib/mcp.js'
import { resolveSourcePaths, shadowRoots, skillRoots, stringValue } from './lib/paths.js'
import {
  buildCatalog,
  collectShadowNames,
  createSkillProvider,
  watchSkillRoots,
} from './lib/skills.js'
import { collectMcpServers, skillSourceInfo, toPublicServer } from './lib/sources.js'
import {
  defaultState,
  isItemEnabled,
  loadState,
  saveState,
  setItemEnabled,
  setSources,
} from './lib/state.js'
import { errorMessage, isRecord, truncate } from './lib/util.js'

/** Loader entry name used by diagnostics. */
export const name = 'ccswitch-hub'

/** The browser page needs the Host HTTP carrier. */
export const inject = ['webServer']

const BASE = '/plugins/ccswitch-hub'
const BODY_LIMIT = 64 * 1024
const CATALOG_TTL_MS = 5_000

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

/** Public MCP row: every field is safe for the browser. */
function publicMcpItem(server, enabled, status, master) {
  return {
    ...toPublicServer(server),
    enabled,
    master,
    status: status.status,
    toolCount: status.toolCount ?? 0,
    error: status.error,
    serverName: status.serverName ?? server.runtimeName,
    pending: enabled && master && status.status === 'off',
  }
}

function missingMcpItem(key, master) {
  return {
    key,
    name: key.replace(/^[a-z-]+:/, ''),
    description: '',
    tags: [],
    origins: [],
    apps: [],
    transport: 'invalid',
    runtimeName: '',
    summary: '',
    conflict: false,
    unsupported: undefined,
    envKeys: [],
    headerKeys: [],
    enabled: true,
    master,
    status: 'missing',
    toolCount: 0,
    pending: false,
  }
}

/**
 * Mount the bridge, its routes, and its skill provider.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} rawConfig Loader row config.
 */
export function apply(ctx, rawConfig) {
  const logger = namedLogger(ctx)
  const profileContext = ctx.get?.('profileContext')
  const dshHome = stringValue(profileContext?.home) ?? stringValue(process.env.DSH_HOME) ?? path.join(os.homedir(), '.dsh')
  const stateDir = path.join(dshHome, 'ccswitch-hub')
  const stateFile = path.join(stateDir, 'state.json')

  const rowConfig = isRecord(rawConfig) ? rawConfig : {}
  const loaded = loadState(stateFile)
  const state = loaded.state ?? defaultState()
  const extraWarnings = [...loaded.warnings]

  function sourceConfig() {
    return {
      ...rowConfig,
      ...(stringValue(state.sources?.ccSwitchDir) ? { ccSwitchDir: state.sources.ccSwitchDir } : {}),
      ...(Array.isArray(state.sources?.skillDirs) && state.sources.skillDirs.length > 0
        ? { skillDirs: state.sources.skillDirs }
        : {}),
    }
  }

  function paths() {
    return resolveSourcePaths(sourceConfig(), { dshHome, homeDir: os.homedir() })
  }

  const runtime = new McpRuntime({ ctx, logger })
  let watcher
  let providerControl
  let scanPromise
  let catalog = { at: 0, value: null, sources: [], warnings: [], paths: undefined }
  let mutationQueue = Promise.resolve()

  function serialize(task) {
    const run = mutationQueue.then(task, task)
    mutationQueue = run.then(() => {}, () => {})
    return run
  }

  function invalidateCatalog(notify = true) {
    catalog = { ...catalog, at: 0, value: null }
    if (notify) providerControl?.invalidate?.()
  }

  function ensureWatcher(pathsValue) {
    try {
      watcher?.dispose()
    } catch {
      // Ignore a watcher that was already closed.
    }
    watcher = watchSkillRoots(skillRoots(pathsValue), () => invalidateCatalog(true), logger)
  }

  async function scan(force = false) {
    if (!force && catalog.value !== null && Date.now() - catalog.at < CATALOG_TTL_MS) return catalog
    if (scanPromise !== undefined) return scanPromise
    const task = (async () => {
      const resolved = paths()
      const mcp = await collectMcpServers(resolved)
      const roots = skillRoots(resolved)
      const shadows = shadowRoots(resolved)
      const shadowNames = collectShadowNames(
        shadows.map((root) => ({ ...root, source: root.id, controllable: false })),
      )
      const skills = buildCatalog(roots, shadowNames)
      const sources = [
        ...mcp.sources,
        ...roots.map(skillSourceInfo),
        ...shadows.map((root) => ({ ...skillSourceInfo({ ...root, controllable: false }), shadow: true })),
      ]
      const warnings = [...mcp.warnings, ...skills.warnings]
      catalog = {
        at: Date.now(),
        value: { paths: resolved, mcp: mcp.servers, skills: skills.skills },
        sources,
        warnings,
        paths: resolved,
      }
      return catalog
    })()
    scanPromise = task
    try {
      return await task
    } finally {
      if (scanPromise === task) scanPromise = undefined
    }
  }

  async function getCatalog(force) {
    return scan(force)
  }

  function enabledMcpRows(snapshot) {
    if (!state.mcp.master) return []
    const rows = []
    for (const server of snapshot.value.mcp) {
      if (!isItemEnabled(state, 'mcp', server.key)) continue
      if (server.unsupported !== undefined) continue
      rows.push(server)
    }
    return rows
  }

  async function reconcile() {
    const snapshot = await scan(false)
    await runtime.reconcile(enabledMcpRows(snapshot))
    return snapshot
  }

  async function persist() {
    try {
      await saveState(stateDir, stateFile, state)
    } catch (error) {
      extraWarnings.push(`无法保存状态：${errorMessage(error)}`)
      logger?.warn?.(`[ccswitch-hub] cannot save state: ${errorMessage(error)}`)
    }
  }

  async function registryInfo() {
    if (!state.skills.master) return { names: new Set(), error: undefined }
    try {
      const service = ctx.get?.('skills')
      if (service === undefined || typeof service.list !== 'function') {
        return { names: new Set(), error: 'skills service unavailable' }
      }
      const list = await service.list()
      return { names: new Set(list.map((entry) => entry.name)), error: undefined }
    } catch (error) {
      return { names: new Set(), error: errorMessage(error) }
    }
  }

  async function statePayload(force = false) {
    const snapshot = await scan(force)
    const master = state.mcp.master
    const skillsMaster = state.skills.master
    const items = []
    const known = new Set()
    for (const server of snapshot.value.mcp) {
      known.add(server.key)
      const enabled = isItemEnabled(state, 'mcp', server.key)
      let status = runtime.statusOf(server.key)
      if (server.unsupported !== undefined) {
        status = { status: 'unsupported', toolCount: 0, error: server.unsupported, serverName: server.runtimeName }
      }
      items.push(publicMcpItem(server, enabled, status, master))
    }
    for (const key of Object.keys(state.mcp.items)) {
      if (known.has(key) || !isItemEnabled(state, 'mcp', key)) continue
      items.push(missingMcpItem(key, master))
    }
    items.sort((left, right) => left.name.localeCompare(right.name))

    const registry = await registryInfo()
    const knownSkills = new Set()
    const skillItems = snapshot.value.skills.map((skill) => {
      const enabled = isItemEnabled(state, 'skills', skill.name)
      knownSkills.add(skill.name)
      return {
        name: skill.name,
        description: skill.description,
        whenToUse: skill.whenToUse,
        path: skill.path,
        source: skill.source,
        rootLabel: skill.rootLabel,
        controllable: skill.controllable,
        readonlyReason: skill.readonlyReason,
        enabled,
        master: skillsMaster,
        inRegistry: enabled && skillsMaster ? registry.names.has(skill.name) : false,
        missing: false,
      }
    })
    for (const key of Object.keys(state.skills.items)) {
      if (knownSkills.has(key) || !isItemEnabled(state, 'skills', key)) continue
      skillItems.push({
        name: key,
        description: '',
        path: '',
        source: '',
        rootLabel: '',
        controllable: false,
        readonlyReason: undefined,
        enabled: true,
        master: skillsMaster,
        inRegistry: false,
        missing: true,
      })
    }

    return {
      ok: true,
      panel: 'ccswitch-hub',
      stateFile,
      config: {
        ccSwitchDir: state.sources?.ccSwitchDir ?? null,
        skillDirs: state.sources?.skillDirs ?? [],
      },
      resolved: {
        ccSwitchDir: snapshot.paths.ccSwitchDir,
        ccSwitchDb: snapshot.paths.ccSwitchDb,
        claudeConfig: snapshot.paths.claudeConfig,
        codexConfig: snapshot.paths.codexConfig,
        geminiConfig: snapshot.paths.geminiConfig,
        agentsSkills: snapshot.paths.agentsSkills,
        dshSkills: snapshot.paths.dshSkills,
      },
      sources: snapshot.sources,
      warnings: [...new Set([...extraWarnings, ...snapshot.warnings])],
      mcp: { master, items },
      skills: { master: skillsMaster, items: skillItems },
    }
  }

  async function findServer(key) {
    const snapshot = await scan(false)
    return snapshot.value.mcp.find((server) => server.key === key)
  }

  async function findSkill(key) {
    const snapshot = await scan(false)
    return snapshot.value.skills.find((skill) => skill.name === key)
  }

  async function handleAction(body) {
    const type = typeof body.type === 'string' ? body.type : ''
    if (type === 'rescan') {
      invalidateCatalog(true)
      const snapshot = await scan(true)
      ensureWatcher(snapshot.paths)
      await runtime.reconcile(enabledMcpRows(snapshot))
      return
    }
    if (type === 'retry') {
      if (!state.mcp.master) throw new Error('MCP 总开关已关闭')
      const key = typeof body.key === 'string' ? body.key : ''
      const server = await findServer(key)
      if (server === undefined) throw new Error('找不到该 MCP 服务器')
      if (server.unsupported !== undefined) throw new Error(server.unsupported)
      if (!isItemEnabled(state, 'mcp', key)) throw new Error('请先启用该服务器再重试')
      if (server.transport === 'sse' || server.transport === 'invalid') throw new Error(server.unsupported ?? '配置不完整')
      await runtime.retry(server)
      return
    }
    if (type === 'mcp') {
      if (body.master === true) {
        if (typeof body.enabled !== 'boolean') throw new Error('enabled must be a boolean')
        state.mcp.master = body.enabled
        await persist()
        await reconcile()
        return
      }
      const key = typeof body.key === 'string' ? body.key : ''
      if (typeof body.enabled !== 'boolean') throw new Error('enabled must be a boolean')
      const server = await findServer(key)
      if (server === undefined) {
        if (body.enabled === false) {
          setItemEnabled(state, 'mcp', key, false)
          await persist()
          await reconcile()
          return
        }
        throw new Error('找不到该 MCP 服务器')
      }
      if (body.enabled === true && server.unsupported !== undefined) throw new Error(server.unsupported)
      if (body.enabled === true && (server.transport === 'sse' || server.transport === 'invalid')) {
        throw new Error(server.unsupported ?? '配置不完整')
      }
      setItemEnabled(state, 'mcp', key, body.enabled)
      await persist()
      await reconcile()
      return
    }
    if (type === 'skills') {
      if (body.master === true) {
        if (typeof body.enabled !== 'boolean') throw new Error('enabled must be a boolean')
        state.skills.master = body.enabled
        await persist()
        providerControl?.invalidate?.()
        return
      }
      const key = typeof body.key === 'string' ? body.key : ''
      if (typeof body.enabled !== 'boolean') throw new Error('enabled must be a boolean')
      const skill = await findSkill(key)
      if (skill === undefined) {
        if (body.enabled === false) {
          setItemEnabled(state, 'skills', key, false)
          await persist()
          providerControl?.invalidate?.()
          return
        }
        throw new Error('找不到该技能')
      }
      if (body.enabled === true && skill.controllable !== true) {
        throw new Error(skill.readonlyReason ?? '该技能由其他来源提供，无法在此开关')
      }
      setItemEnabled(state, 'skills', key, body.enabled)
      await persist()
      providerControl?.invalidate?.()
      return
    }
    throw new Error(`unknown action type: ${type}`)
  }

  async function handleConfig(body) {
    setSources(state, body)
    await persist()
    invalidateCatalog(true)
    const snapshot = await scan(true)
    ensureWatcher(snapshot.paths)
    await runtime.reconcile(enabledMcpRows(snapshot))
  }

  // ── skills provider ────────────────────────────────────────────────────────
  ctx.inject(['skills'], (skillsCtx) => {
    skillsCtx.effect(
      () =>
        skillsCtx.skills.registerProvider((control) => {
          providerControl = control
          return createSkillProvider({
            getCatalog: async () => (await getCatalog(false)).value,
            isEnabled: (skillName) => state.skills.master && isItemEnabled(state, 'skills', skillName),
            isMasterEnabled: () => state.skills.master,
            logger,
          })
        }),
      'ccswitch-hub: skills provider',
    )
  })

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

  route(`${BASE}/state`, async (req, res) => {
    if (!authorized(req, res)) return
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    try {
      const force = new URL(String(req.url), 'http://localhost').searchParams.get('refresh') === '1'
      const payload = await statePayload(force)
      sendJson(res, 200, payload)
    } catch (error) {
      logger?.warn?.(`[ccswitch-hub] state failed: ${errorMessage(error)}`)
      sendJson(res, 500, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/action`, async (req, res) => {
    if (!authorized(req, res)) return
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    try {
      const body = await readJsonBody(req)
      await serialize(() => handleAction(body))
      sendJson(res, 200, await statePayload(false))
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  route(`${BASE}/config`, async (req, res) => {
    if (!authorized(req, res)) return
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    try {
      const body = await readJsonBody(req)
      await serialize(() => handleConfig(body))
      sendJson(res, 200, await statePayload(true))
    } catch (error) {
      sendJson(res, 400, { ok: false, error: truncate(errorMessage(error), 600) })
    }
  })

  // ── startup ────────────────────────────────────────────────────────────────
  const boot = (async () => {
    const snapshot = await scan(true)
    ensureWatcher(snapshot.paths)
    await runtime.reconcile(enabledMcpRows(snapshot))
  })()
  boot.catch((error) => {
    extraWarnings.push(`启动扫描失败：${errorMessage(error)}`)
    logger?.warn?.(`[ccswitch-hub] startup scan failed: ${errorMessage(error)}`)
  })

  ctx.effect(() => {
    return async () => {
      watcher?.dispose()
      await runtime.disposeAll()
    }
  }, 'ccswitch-hub: runtime')

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

  logger?.info?.(`[ccswitch-hub] ready (state ${stateFile})`)
}
