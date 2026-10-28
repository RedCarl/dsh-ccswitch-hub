/**
 * Path resolution for the native MCP/skills manager.
 *
 * Harness-native skills live under `$DSH_HOME/skills`. Disabled skills and
 * deleted skills are moved outside that scanned root, so the preset's own
 * filesystem provider stops loading them without any preset changes.
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

/**
 * Resolve every path this plugin owns or reads.
 * @param config - row config plus state overrides.
 * @param profile - `{ dshHome, homeDir }` from the running profile.
 */
export function resolvePaths(config = {}, profile = {}) {
  const home = profile.homeDir ?? os.homedir()
  const dshHome = profile.dshHome ?? stringValue(process.env.DSH_HOME) ?? path.join(home, '.dsh')
  const override = stringValue(config.ccSwitchDir)
  const ccSwitchDir = resolvePath(override, home, home) ?? path.join(home, '.cc-switch')
  const stateDir = path.join(dshHome, 'ccswitch-hub')
  return {
    home,
    dshHome,
    stateDir,
    stateFile: path.join(stateDir, 'state.json'),
    skillsDir: path.join(dshHome, 'skills'),
    disabledSkillsDir: path.join(stateDir, 'disabled-skills'),
    trashSkillsDir: path.join(stateDir, 'trash', 'skills'),
    ccSwitchDir,
    ccSwitchDb: path.join(ccSwitchDir, 'cc-switch.db'),
    ccSwitchSkills: path.join(ccSwitchDir, 'skills'),
  }
}
