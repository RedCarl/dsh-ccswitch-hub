import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  deleteSkill,
  importSkill,
  scanSkills,
  setSkillEnabled,
} from '../lib/native-skills.js'

function temp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ccswitch-hub-native-'))
}

function layout() {
  const root = temp()
  const paths = {
    skillsDir: path.join(root, 'skills'),
    disabledSkillsDir: path.join(root, 'disabled'),
    trashSkillsDir: path.join(root, 'trash'),
  }
  fs.mkdirSync(paths.skillsDir, { recursive: true })
  fs.mkdirSync(paths.disabledSkillsDir, { recursive: true })
  return { root, paths }
}

function writeSkill(dir, name, description = `${name} skill`) {
  const target = path.join(dir, name)
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, 'SKILL.md'), `---
name: ${name}
description: ${description}
---
# ${name}
`)
  return target
}

test('scans enabled and disabled native skills', () => {
  const { paths } = layout()
  writeSkill(paths.skillsDir, 'alpha')
  writeSkill(paths.disabledSkillsDir, 'beta')
  fs.writeFileSync(path.join(paths.skillsDir, 'flat.md'), `---
name: flat
description: Flat skill
---
body
`)
  const result = scanSkills(paths)
  assert.deepEqual(result.items.map((item) => [item.name, item.enabled]), [
    ['alpha', true],
    ['beta', false],
    ['flat', true],
  ])
  assert.equal(result.items.find((item) => item.name === 'alpha').kind, 'directory')
  assert.equal(result.items.find((item) => item.name === 'flat').kind, 'file')
})

test('enabling and disabling moves the skill outside the scanned root', () => {
  const { paths } = layout()
  writeSkill(paths.skillsDir, 'alpha')
  const disabled = setSkillEnabled(paths, 'alpha', false)
  assert.equal(disabled.enabled, false)
  assert.equal(fs.existsSync(path.join(paths.skillsDir, 'alpha')), false)
  assert.equal(fs.existsSync(path.join(paths.disabledSkillsDir, 'alpha', 'SKILL.md')), true)
  assert.equal(scanSkills(paths).items.find((item) => item.name === 'alpha').enabled, false)

  setSkillEnabled(paths, 'alpha', true)
  assert.equal(fs.existsSync(path.join(paths.skillsDir, 'alpha', 'SKILL.md')), true)
  assert.equal(fs.existsSync(path.join(paths.disabledSkillsDir, 'alpha')), false)
})

test('imports a CC Switch skill as an independent copy', () => {
  const { root, paths } = layout()
  const source = writeSkill(path.join(root, 'ccswitch'), 'alpha', 'Imported alpha')
  fs.writeFileSync(path.join(source, 'resource.txt'), 'resource\n')
  const target = importSkill(paths, 'alpha', source)
  assert.equal(target, path.join(paths.skillsDir, 'alpha'))
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8').includes('Imported alpha'), true)
  assert.equal(fs.readFileSync(path.join(target, 'resource.txt'), 'utf8'), 'resource\n')
  assert.throws(() => importSkill(paths, 'alpha', source), /同名技能已存在/)
})

test('imports flat skill files and rejects missing sources', () => {
  const { root, paths } = layout()
  const flat = path.join(root, 'flat.md')
  fs.writeFileSync(flat, `---
name: flat
description: Flat
---
body
`)
  const target = importSkill(paths, 'flat', flat)
  assert.equal(target, path.join(paths.skillsDir, 'flat.md'))
  assert.equal(fs.existsSync(target), true)
  assert.throws(() => importSkill(paths, 'missing', path.join(root, 'nope.md')), /来源不存在/)
})

test('deleting moves the skill to a recoverable trash directory', () => {
  const { paths } = layout()
  writeSkill(paths.skillsDir, 'alpha')
  const result = deleteSkill(paths, 'alpha')
  assert.equal(fs.existsSync(path.join(paths.skillsDir, 'alpha')), false)
  assert.equal(fs.existsSync(path.join(result.trashedTo, 'SKILL.md')), true)
  assert.equal(scanSkills(paths).items.length, 0)
})
