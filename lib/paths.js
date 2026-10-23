/**
 * Path resolution shared by the CC Switch bridge.
 *
 * All defaults follow the tools' documented locations, and every path can be
 * overridden from the page's advanced section (persisted in the plugin state
 * file) or from the Loader row config.
 */
import os from 'node:os'
import path from 'node:path'

/** Expand a leading `~` and trim surrounding whitespace. */
export function expandHome(value, home = os.homedir()) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (trimmed === '~') return home
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) return path.join(home, trimmed.slice(2))
  return trimmed
}

/** Resolve a possibly-relative path against a base directory. */
export function resolvePath(value, base, home) {
  const expanded = expandHome(value, home)
  if (expanded === undefined) return undefined
  return path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(base, expanded)
}

/** Coerce a config value to a non-empty string, or undefined. */
export function stringValue(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** Coerce a config value to a list of non-empty strings. */
export function stringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stringValue(item)).filter((item) => item !== undefined)
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter((item) => item !== '')
  }
  return []
}

/**
 * Resolve every source path for one scan.
 *
 * `config` is the merged row config plus state overrides. `profile` supplies
 * the running profile's DSH home when the caller has that service.
 */
export function resolveSourcePaths(config = {}, profile = {}) {
  const home = profile.homeDir ?? os.homedir()
  const dshHome = profile.dshHome ?? stringValue(process.env.DSH_HOME) ?? path.join(home, '.dsh')
  const agentsHome = stringValue(process.env.DSH_AGENTS_HOME) ?? path.join(home, '.agents')
  const claudeDir = path.join(home, '.claude')
  const codexDir = path.join(home, '.codex')
  const geminiDir = path.join(home, '.gemini')

  const ccSwitchDir = resolvePath(stringValue(config.ccSwitchDir), home, home) ?? path.join(home, '.cc-switch')
  const claudeConfig = resolvePath(stringValue(config.claudeConfig), home, home) ?? path.join(home, '.claude.json')
  const codexConfig = resolvePath(stringValue(config.codexConfig), home, home) ?? path.join(codexDir, 'config.toml')
  const geminiConfig = resolvePath(stringValue(config.geminiConfig), home, home) ?? path.join(geminiDir, 'settings.json')

  const extraSkillDirs = stringList(config.skillDirs)
    .map((value) => resolvePath(value, home, home))
    .filter((value) => value !== undefined)

  return {
    home,
    dshHome,
    agentsHome,
    ccSwitchDir,
    ccSwitchDb: path.join(ccSwitchDir, 'cc-switch.db'),
    ccSwitchSkills: path.join(ccSwitchDir, 'skills'),
    claudeConfig,
    claudeSkills: path.join(claudeDir, 'skills'),
    codexConfig,
    codexSkills: path.join(codexDir, 'skills'),
    geminiConfig,
    geminiSkills: path.join(geminiDir, 'skills'),
    agentsSkills: path.join(agentsHome, 'skills'),
    dshSkills: path.join(dshHome, 'skills'),
    extraSkillDirs,
  }
}

/**
 * Skill roots in precedence order. The shared agents root and the DSH user
 * root are tracked separately because the Harness preset already scans them:
 * this plugin can list those skills but cannot hide them.
 */
export function skillRoots(paths) {
  const roots = [
    { id: 'ccswitch', label: 'CC Switch', path: paths.ccSwitchSkills, source: 'cc-switch', controllable: true },
    { id: 'claude', label: 'Claude Code', path: paths.claudeSkills, source: 'claude', controllable: true },
    { id: 'codex', label: 'Codex', path: paths.codexSkills, source: 'codex', controllable: true },
    { id: 'gemini', label: 'Gemini CLI', path: paths.geminiSkills, source: 'gemini', controllable: true },
  ]
  for (const [index, dir] of paths.extraSkillDirs.entries()) {
    roots.push({ id: `custom-${index + 1}`, label: dir, path: dir, source: 'custom', controllable: true })
  }
  return roots
}

/** Roots whose skills the Harness already loads through its own providers. */
export function shadowRoots(paths) {
  return [
    { id: 'agents', label: '~/.agents', path: paths.agentsSkills },
    { id: 'dsh', label: '$DSH_HOME', path: paths.dshSkills },
  ]
}
