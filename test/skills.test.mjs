import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildCatalog,
  collectShadowNames,
  createSkillProvider,
  parseFrontmatter,
  PROVIDER_NAME,
  readSkillFile,
} from '../lib/skills.js'

function temp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ccswitch-hub-skills-'))
}

function writeSkill(root, name, body) {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), body)
  return dir
}

function root(id, dir, label = id) {
  return { id, label, path: dir, source: id === 'ccswitch' ? 'cc-switch' : id, controllable: true }
}

test('parses quoted, folded, and literal frontmatter', () => {
  const parsed = parseFrontmatter(`---
name: alpha-skill
description: >-
  A short description
  over two lines.
whenToUse: "when testing"
disable-model-invocation: false
user-invocable: true
---
# Alpha

Body text.
`)
  assert.ok(parsed)
  assert.equal(parsed.data.name, 'alpha-skill')
  assert.equal(parsed.data.description, 'A short description over two lines.')
  assert.equal(parsed.data.whenToUse, 'when testing')
  assert.equal(parsed.data['disable-model-invocation'], false)
  assert.match(parsed.body, /# Alpha/)

  const block = parseFrontmatter(`---
name: beta
description: |
  line one
  line two
---
body
`)
  assert.equal(block.data.description, 'line one\nline two\n')
})

test('scans directory and flat skills, dedupes paths, and flags shadowed names', () => {
  const dir = temp()
  const cc = path.join(dir, 'cc-switch')
  const claude = path.join(dir, 'claude')
  const agents = path.join(dir, 'agents')
  writeSkill(cc, 'alpha', `---
name: alpha
description: Alpha description
---
Alpha body.
`)
  fs.mkdirSync(claude, { recursive: true })
  fs.writeFileSync(path.join(claude, 'beta.md'), `---
name: beta
description: Beta description
---
Beta body.
`)
  writeSkill(cc, 'Gamma', `---
name: Gamma_Skill
description: Invalid name
---
nope
`)
  writeSkill(cc, 'gamma', `---
name: gamma
description: Gamma description
---
Gamma body.
`)
  writeSkill(agents, 'gamma', `---
name: gamma
description: Shared gamma
---
shared
`)

  const catalog = buildCatalog(
    [root('ccswitch', cc), root('claude', claude)],
    collectShadowNames([{ id: 'agents', label: 'agents', path: agents }]),
  )
  const names = catalog.skills.map((skill) => skill.name)
  assert.deepEqual(names, ['alpha', 'beta', 'gamma'])
  assert.equal(catalog.skills.find((skill) => skill.name === 'alpha').description, 'Alpha description')
  assert.equal(catalog.skills.find((skill) => skill.name === 'beta').rootId, 'claude')
  const gamma = catalog.skills.find((skill) => skill.name === 'gamma')
  assert.equal(gamma.controllable, false)
  assert.match(gamma.readonlyReason, /同名技能/)
  assert.ok(catalog.warnings.some((warning) => warning.includes('Gamma_Skill')))
})

test('skill provider lists only enabled, controllable skills and loads bodies', async () => {
  const dir = temp()
  const cc = path.join(dir, 'cc-switch')
  writeSkill(cc, 'alpha', `---
name: alpha
description: Alpha description
whenToUse: testing
---
Alpha body with resource.
`)
  writeSkill(cc, 'beta', `---
name: beta
description: Beta description
---
Beta body.
`)
  const catalog = buildCatalog([root('ccswitch', cc)])
  const provider = createSkillProvider({
    getCatalog: async () => catalog,
    isEnabled: (name) => name === 'alpha',
    isMasterEnabled: () => true,
  })
  assert.equal(provider.name, PROVIDER_NAME)
  const candidates = await provider.list({})
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].name, 'alpha')
  assert.equal(candidates[0].rank, 450)
  assert.equal(candidates[0].whenToUse, 'testing')
  assert.equal(candidates[0].resourceBase.kind, 'directory')
  const loaded = await provider.get(candidates[0])
  assert.equal(loaded.name, 'alpha')
  assert.match(loaded.content, /Alpha body/)
  assert.equal(loaded.provider, PROVIDER_NAME)

  const disabled = createSkillProvider({
    getCatalog: async () => catalog,
    isEnabled: () => false,
    isMasterEnabled: () => true,
  })
  assert.deepEqual(await disabled.list({}), [])

  const masterOff = createSkillProvider({
    getCatalog: async () => catalog,
    isEnabled: (name) => name === 'alpha',
    isMasterEnabled: () => false,
  })
  assert.deepEqual(await masterOff.list({}), [])
})

test('readSkillFile falls back to the directory name and rejects bad names', () => {
  const dir = temp()
  const file = path.join(dir, 'example-skill.md')
  fs.writeFileSync(file, `---
description: No name here
---
body
`)
  const parsed = readSkillFile(file, 'example-skill')
  assert.equal(parsed.skill.name, 'example-skill')
  assert.equal(parsed.skill.description, 'No name here')

  const bad = path.join(dir, 'bad.md')
  fs.writeFileSync(bad, `---
name: Not_Valid
description: nope
---
body
`)
  const rejected = readSkillFile(bad, 'bad')
  assert.match(rejected.error, /kebab-case/)
})
