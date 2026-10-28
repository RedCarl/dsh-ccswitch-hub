/**
 * Native Harness skills under `$DSH_HOME/skills`.
 *
 * The preset's filesystem provider already scans that directory, so this
 * module manages the directory itself: disabling moves an entry outside the
 * scanned root, enabling moves it back, and deleted entries go to a trash
 * directory instead of being destroyed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { readSkillFile } from './frontmatter.js'

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

function readEntries(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function entryDescriptor(root, entry) {
  const full = path.join(root, entry.name)
  if (entry.isDirectory() || (entry.isSymbolicLink() && isDirectory(full))) {
    const file = path.join(full, 'SKILL.md')
    return isFile(file) ? { kind: 'directory', entryPath: full, file } : undefined
  }
  if (entry.isFile() || (entry.isSymbolicLink() && isFile(full))) {
    return entry.name.toLowerCase().endsWith('.md') ? { kind: 'file', entryPath: full, file: full } : undefined
  }
  return undefined
}

function scanRoot(root, enabled) {
  const items = []
  const warnings = []
  for (const entry of readEntries(root)) {
    if (entry.name.startsWith('.')) continue
    const descriptor = entryDescriptor(root, entry)
    if (descriptor === undefined) continue
    const fallback = descriptor.kind === 'directory'
      ? entry.name
      : path.basename(entry.name, path.extname(entry.name))
    const parsed = readSkillFile(descriptor.file, fallback)
    if (parsed.error !== undefined) {
      warnings.push(parsed.error)
      continue
    }
    items.push({
      name: parsed.skill.name,
      description: parsed.skill.description,
      whenToUse: parsed.skill.whenToUse,
      enabled,
      kind: descriptor.kind,
      entryName: entry.name,
      entryPath: descriptor.entryPath,
      path: descriptor.file,
    })
  }
  return { items, warnings }
}

/** List native skills, including disabled ones. */
export function scanSkills(paths) {
  const warnings = []
  const enabled = scanRoot(paths.skillsDir, true)
  const disabled = scanRoot(paths.disabledSkillsDir, false)
  warnings.push(...enabled.warnings, ...disabled.warnings)
  const byName = new Map()
  for (const item of [...enabled.items, ...disabled.items]) {
    const existing = byName.get(item.name)
    if (existing !== undefined) {
      if (existing.enabled !== item.enabled) {
        warnings.push(`技能「${item.name}」同时存在于启用和停用目录，已使用启用目录中的副本。`)
      }
      continue
    }
    byName.set(item.name, item)
  }
  return {
    items: [...byName.values()].sort((left, right) => left.name.localeCompare(right.name)),
    warnings,
  }
}

function movePath(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  try {
    fs.renameSync(source, target)
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error
    fs.cpSync(source, target, { recursive: true, errorOnExist: true, force: false, dereference: true })
    fs.rmSync(source, { recursive: true, force: true })
  }
}

/** Enable or disable one native skill by moving it in or out of the scanned root. */
export function setSkillEnabled(paths, name, enabled) {
  const scanned = scanSkills(paths)
  const item = scanned.items.find((entry) => entry.name === name)
  if (item === undefined) throw new Error('找不到该技能')
  if (item.enabled === enabled) return item
  const targetRoot = enabled ? paths.skillsDir : paths.disabledSkillsDir
  const target = path.join(targetRoot, item.entryName)
  if (fs.existsSync(target)) throw new Error(`目标位置已存在同名条目：${target}`)
  movePath(item.entryPath, target)
  return { ...item, enabled, entryPath: target, path: item.kind === 'directory' ? path.join(target, 'SKILL.md') : target }
}

/** Remove one skill from both managed roots, keeping a recoverable copy. */
export function deleteSkill(paths, name) {
  const scanned = scanSkills(paths)
  const item = scanned.items.find((entry) => entry.name === name)
  if (item === undefined) throw new Error('找不到该技能')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const nonce = Math.random().toString(36).slice(2, 6)
  const target = path.join(paths.trashSkillsDir, `${stamp}-${nonce}-${item.entryName}`)
  movePath(item.entryPath, target)
  return { name, trashedTo: target }
}

/** Copy one CC Switch skill into the native enabled root. */
export function importSkill(paths, name, sourcePath) {
  const scanned = scanSkills(paths)
  if (scanned.items.some((entry) => entry.name === name)) throw new Error('同名技能已存在')
  fs.mkdirSync(paths.skillsDir, { recursive: true })
  const suffix = `.import-${name}-${Date.now().toString(36)}`
  if (isDirectory(sourcePath)) {
    const target = path.join(paths.skillsDir, name)
    if (fs.existsSync(target)) throw new Error('目标位置已存在同名条目')
    const temporary = path.join(paths.skillsDir, suffix)
    try {
      fs.cpSync(sourcePath, temporary, { recursive: true, errorOnExist: true, force: false, dereference: true })
      fs.renameSync(temporary, target)
    } catch (error) {
      fs.rmSync(temporary, { recursive: true, force: true })
      throw error
    }
    return target
  }
  if (isFile(sourcePath)) {
    const target = path.join(paths.skillsDir, `${name}.md`)
    if (fs.existsSync(target)) throw new Error('目标位置已存在同名条目')
    const temporary = path.join(paths.skillsDir, `${suffix}.md`)
    try {
      fs.copyFileSync(sourcePath, temporary)
      fs.renameSync(temporary, target)
    } catch (error) {
      fs.rmSync(temporary, { force: true })
      throw error
    }
    return target
  }
  throw new Error('技能来源不存在')
}
