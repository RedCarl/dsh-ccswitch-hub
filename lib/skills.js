/**
 * Skill discovery for CC Switch-managed skills.
 *
 * The provider is intentionally read-only: it lists only enabled skills from
 * the configured roots and loads their bodies on demand. It never mutates a
 * skill directory or the CC Switch database.
 */
import fs from 'node:fs'
import path from 'node:path'
import { errorMessage, isRecord } from './util.js'

export const PROVIDER_NAME = 'ccswitch-hub'
export const SKILL_RANK = 450
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Parse the small YAML frontmatter subset skills use. */
export function parseFrontmatter(raw) {
  const text = String(raw).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (!text.startsWith('---\n')) return undefined
  const lines = text.split('\n')
  let closing = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].replace(/\s+$/, '') === '---') {
      closing = index
      break
    }
  }
  if (closing < 0) return undefined
  const data = parseYamlSubset(lines.slice(1, closing))
  return { data, body: lines.slice(closing + 1).join('\n') }
}

function unquote(value) {
  const text = value.trim()
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text)
    } catch {
      return text.slice(1, -1)
    }
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'")
  }
  return text
}

function parseYamlSubset(lines) {
  const data = {}
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    if (/^\s/.test(line)) continue
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (match === null) continue
    const key = match[1]
    let rest = match[2].trim()

    if (rest === '|' || rest === '|-' || rest === '|+' || rest === '>' || rest === '>-' || rest === '>+') {
      const block = []
      while (index + 1 < lines.length && (/^\s+/.test(lines[index + 1]) || lines[index + 1].trim() === '')) {
        index += 1
        block.push(lines[index])
      }
      const indents = block.filter((entry) => entry.trim() !== '').map((entry) => /^\s*/.exec(entry)[0].length)
      const indent = indents.length > 0 ? Math.min(...indents) : 0
      const content = block.map((entry) => entry.slice(indent)).join('\n')
      const folded = rest.startsWith('>')
      const value = folded ? content.replace(/\n(?!\n)/g, ' ') : content
      data[key] = rest.endsWith('-') ? value.replace(/\s+$/, '') : `${value.replace(/\s+$/, '')}\n`
      continue
    }

    // Drop a YAML comment that starts after whitespace and is outside quotes.
    if (!rest.startsWith('"') && !rest.startsWith("'")) {
      const comment = rest.search(/\s#/)
      if (comment >= 0) rest = rest.slice(0, comment).trim()
    }
    if (rest === 'true') data[key] = true
    else if (rest === 'false') data[key] = false
    else data[key] = unquote(rest)
  }
  return data
}

function stringField(data, key) {
  const value = data[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function booleanField(data, key) {
  const value = data[key]
  if (value === true || value === 1 || value === '1' || value === 'true' || value === 'yes' || value === 'on') return true
  if (value === false || value === 0 || value === '0' || value === 'false' || value === 'no' || value === 'off') return false
  return undefined
}

function invocationPolicy(data) {
  return {
    modelInvocable: booleanField(data, 'disable-model-invocation') !== true,
    userInvocable: booleanField(data, 'user-invocable') !== false,
  }
}

/** Read and validate one skill file. */
export function readSkillFile(file, fallbackName) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    return { error: `无法读取 ${file}：${error?.message ?? String(error)}` }
  }
  const parsed = parseFrontmatter(text)
  const data = parsed?.data ?? {}
  const rawName = stringField(data, 'name') ?? fallbackName
  const name = typeof rawName === 'string' ? rawName.trim().toLowerCase() : ''
  if (!SKILL_NAME.test(name)) {
    return { error: `${file} 的技能名「${String(rawName)}」不是 kebab-case，已忽略。` }
  }
  return {
    skill: {
      name,
      description: stringField(data, 'description') ?? '',
      whenToUse: stringField(data, 'whenToUse') ?? stringField(data, 'when_to_use'),
      invocation: invocationPolicy(data),
      content: (parsed?.body ?? text).trim(),
      metadata: isRecord(data.metadata) ? data.metadata : undefined,
    },
  }
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

function isDirectory(file) {
  try {
    return fs.statSync(file).isDirectory()
  } catch {
    return false
  }
}

function entryFile(rootPath, entry) {
  const full = path.join(rootPath, entry.name)
  if (entry.isDirectory() || (entry.isSymbolicLink() && isDirectory(full))) {
    const file = path.join(full, 'SKILL.md')
    return isFile(file) ? file : undefined
  }
  if (entry.isFile() || (entry.isSymbolicLink() && isFile(full))) {
    return entry.name.toLowerCase().endsWith('.md') ? full : undefined
  }
  return undefined
}

/** Scan one root, returning parsed skills and warnings. Exported for tests. */
export function scanRoot(root, options = {}) {
  const skills = []
  const warnings = []
  if (!isDirectory(root.path)) return { skills, warnings }
  const seen = options.seen ?? new Set()
  for (const entry of safeReaddir(root.path)) {
    if (entry.name.startsWith('.')) continue
    const file = entryFile(root.path, entry)
    if (file === undefined) continue
    let real
    try {
      real = fs.realpathSync(file)
    } catch {
      continue
    }
    if (seen.has(real)) continue
    seen.add(real)
    const fallbackName = root.flatName ?? path.basename(entry.name, path.extname(entry.name))
    const parsed = readSkillFile(real, fallbackName)
    if (parsed.error !== undefined) {
      warnings.push(parsed.error)
      continue
    }
    skills.push({
      ...parsed.skill,
      path: real,
      dir: path.dirname(real),
      source: root.source,
      rootId: root.id,
      rootLabel: root.label,
      controllable: root.controllable !== false,
    })
  }
  return { skills, warnings }
}

/**
 * Build the catalog from precedence-ordered roots.
 *
 * `shadowNames` are skill names the Harness already loads through another
 * provider; those rows stay visible but cannot be toggled here.
 */
export function buildCatalog(roots, shadowNames = new Set()) {
  const warnings = []
  const seenPaths = new Set()
  const byName = new Map()
  for (const root of roots) {
    const scanned = scanRoot(root, { seen: seenPaths })
    warnings.push(...scanned.warnings)
    for (const skill of scanned.skills) {
      const existing = byName.get(skill.name)
      if (existing !== undefined) {
        if (existing.path !== skill.path) {
          warnings.push(`技能「${skill.name}」同时存在于 ${existing.rootLabel} 与 ${skill.rootLabel}，使用前者。`)
        }
        continue
      }
      byName.set(skill.name, skill)
    }
  }

  for (const skill of byName.values()) {
    if (shadowNames.has(skill.name)) {
      skill.controllable = false
      skill.readonlyReason = '~/.agents/skills 或 $DSH_HOME/skills 中已有同名技能，Harness 会直接加载它；切换此开关不会隐藏它。'
    }
  }

  const skills = [...byName.values()].sort((left, right) => left.name.localeCompare(right.name))
  return { skills, warnings, shadowNames }
}

/** Collect only names from roots the Harness itself scans. */
export function collectShadowNames(roots) {
  const names = new Set()
  const seen = new Set()
  for (const root of roots) {
    const scanned = scanRoot(root, { seen })
    for (const skill of scanned.skills) names.add(skill.name)
  }
  return names
}

/**
 * Create the registry provider.
 *
 * `getCatalog` returns the cached scan; `isEnabled` reads the live state so a
 * toggle takes effect after `invalidate()` without re-registering.
 */
export function createSkillProvider({ getCatalog, isEnabled, isMasterEnabled, logger }) {
  return {
    name: PROVIDER_NAME,
    async list(options = {}) {
      options.signal?.throwIfAborted()
      try {
        const catalog = await getCatalog()
        if (!isMasterEnabled()) return []
        const candidates = []
        for (const skill of catalog.skills) {
          if (!skill.controllable) continue
          if (!isEnabled(skill.name)) continue
          candidates.push({
            name: skill.name,
            description: skill.description,
            ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
            invocation: skill.invocation,
            source: skill.source,
            provider: PROVIDER_NAME,
            rank: SKILL_RANK,
            locator: { path: skill.path, dir: skill.dir, name: skill.name },
            path: skill.path,
            resourceBase: { kind: 'directory', path: skill.dir },
          })
        }
        return candidates
      } catch (error) {
        logger?.warn?.(`[ccswitch-hub] skill catalog failed: ${errorMessage(error)}`)
        return { candidates: [], complete: false }
      }
    },
    async get(candidate) {
      const locator = candidate?.locator
      if (!isRecord(locator) || typeof locator.path !== 'string') return undefined
      const parsed = readSkillFile(locator.path, locator.name)
      if (parsed.skill === undefined) {
        logger?.warn?.(`[ccswitch-hub] ${parsed.error}`)
        return undefined
      }
      const skill = parsed.skill
      return {
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
        invocation: skill.invocation,
        source: candidate.source,
        provider: PROVIDER_NAME,
        path: locator.path,
        resourceBase: { kind: 'directory', path: locator.dir ?? path.dirname(locator.path) },
        ...(skill.metadata !== undefined ? { metadata: skill.metadata } : {}),
        content: skill.content,
      }
    },
  }
}

/** Watch skill roots and invalidate on changes. Best-effort only. */
export function watchSkillRoots(roots, onChange, logger) {
  const watchers = []
  let timer
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        onChange()
      } catch (error) {
        logger?.warn?.(`[ccswitch-hub] skill invalidation failed: ${error?.message ?? String(error)}`)
      }
    }, 350)
    timer.unref?.()
  }
  for (const root of roots) {
    if (!isDirectory(root.path)) continue
    try {
      const watcher = fs.watch(root.path, { recursive: true }, () => schedule())
      watcher.on('error', () => {})
      watchers.push(watcher)
    } catch {
      try {
        const watcher = fs.watch(root.path, () => schedule())
        watcher.on('error', () => {})
        watchers.push(watcher)
      } catch {
        // Watching is optional; the manual Refresh button still rescans.
      }
    }
  }
  return {
    dispose() {
      clearTimeout(timer)
      for (const watcher of watchers) {
        try {
          watcher.close()
        } catch {
          // Already closed.
        }
      }
    },
  }
}
