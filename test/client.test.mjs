import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const clientFile = path.join(here, '..', 'client.js')

function element(type, props, children) {
  return {
    type,
    props: props ?? {},
    children: children.flat().filter((child) => child !== null && child !== undefined && child !== false),
  }
}

function makeReact(stateValues) {
  let index = 0
  return {
    createElement: (type, props, ...children) => element(type, props, children),
    useState: (initial) => {
      const value = index < stateValues.length ? stateValues[index] : initial
      index += 1
      return [value, () => {}]
    },
    useCallback: (callback) => callback,
    useEffect: () => {},
    useRef: (initial) => ({ current: initial }),
  }
}

function snapshot(overrides = {}) {
  return {
    ok: true,
    panel: 'ccswitch-hub',
    stateFile: '/tmp/dsh/ccswitch-hub/state.json',
    config: { ccSwitchDir: null, skillDirs: [] },
    resolved: {
      ccSwitchDir: '/home/me/.cc-switch',
      ccSwitchDb: '/home/me/.cc-switch/cc-switch.db',
      agentsSkills: '/home/me/.agents/skills',
    },
    sources: [
      { id: 'ccswitch', kind: 'mcp', exists: true },
      { id: 'ccswitch', kind: 'skills', exists: true },
    ],
    warnings: ['fixture warning'],
    mcp: {
      master: true,
      items: [{
        key: 'ccswitch:github',
        name: 'GitHub',
        description: 'GitHub tools',
        tags: ['dev'],
        origins: ['cc-switch', 'claude'],
        apps: ['claude'],
        transport: 'stdio',
        runtimeName: 'github',
        summary: 'stdio · npx · 2 args',
        conflict: false,
        unsupported: undefined,
        envKeys: ['GITHUB_TOKEN'],
        headerKeys: [],
        enabled: true,
        master: true,
        status: 'ready',
        toolCount: 3,
        serverName: 'github',
        pending: false,
      }],
    },
    skills: {
      master: true,
      items: [{
        name: 'alpha',
        description: 'Alpha skill',
        path: '/home/me/.cc-switch/skills/alpha/SKILL.md',
        source: 'cc-switch',
        rootLabel: 'CC Switch',
        controllable: true,
        enabled: true,
        inRegistry: true,
        missing: false,
      }],
    },
    ...overrides,
  }
}

function loadClient(react) {
  let definition
  const sandbox = {
    window: { __ModuleLoader__: { load: (value) => { definition = value } } },
    console,
    setTimeout,
    clearTimeout,
    fetch: async () => { throw new Error('fetch is not used during render') },
  }
  vm.runInNewContext(fs.readFileSync(clientFile, 'utf8'), sandbox, { filename: clientFile })
  assert.ok(definition, 'client module did not call __ModuleLoader__.load')
  assert.equal(definition.id, '@local/dsh-ccswitch-hub')
  let main
  let panel
  const plugin = definition.factory(() => react)
  plugin.apply({
    effect: (callback) => { callback() },
    locale: {
      register: () => {},
      bind: () => (key) => key,
    },
    slots: {
      inject: (_name, callback) => { callback() },
      register: (options, component) => {
        if (options.name === 'main') main = component
        if (options.name === 'sidebar.panellist') panel = component
        return () => {}
      },
    },
  })
  assert.equal(typeof main, 'function')
  assert.equal(typeof panel, 'function')
  return { main, panel }
}

function renderTree(node) {
  if (node === null || node === undefined || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map((child) => renderTree(child))
  if (typeof node.type === 'function') {
    const props = node.children.length > 0 ? { ...node.props, children: node.children } : node.props
    return renderTree(node.type(props))
  }
  return { type: node.type, props: node.props, children: node.children.map((child) => renderTree(child)) }
}

test('client page renders a populated MCP and skills snapshot', () => {
  const { main, panel } = loadClient(makeReact([
    snapshot(), '', '', false, '', 'mcp', '', '', '', false, '',
  ]))
  const tree = main()
  assert.equal(tree.type, 'div')
  const rendered = renderTree(tree)
  const text = JSON.stringify(rendered)
  assert.match(text, /csh-page/)
  assert.match(text, /GitHub/)
  assert.match(text, /mcp__github__/)
  assert.ok(text.includes('csh-btn.primary { background: var(--dsw-alias-button-primary-fill)'))
  assert.ok(text.includes('csh-switch[aria-checked'))
  assert.ok(text.includes('state-business-primary'))
  assert.equal(text.includes('color: #fff'), false)
  assert.match(text, /fixture warning/)

  const skills = loadClient(makeReact([
    snapshot(), '', '', false, '', 'skills', '', '', '', false, '',
  ]))
  const skillsText = JSON.stringify(renderTree(skills.main()))
  assert.match(skillsText, /Alpha skill/)
  assert.match(skillsText, /inRegistry/)

  const icon = panel({ size: 18, active: false })
  assert.equal(icon.type, 'svg')
})

test('client page renders the empty and error shells', () => {
  const empty = loadClient(makeReact([
    snapshot({ sources: [], warnings: [], mcp: { master: true, items: [] }, skills: { master: true, items: [] } }),
    '', '', false, '', 'skills', '', '', '', false, '',
  ]))
  const emptyTree = renderTree(empty.main())
  assert.match(JSON.stringify(emptyTree), /emptySkills/)

  const failed = loadClient(makeReact([null, 'boom', '', false, '', 'mcp', '', '', '', false, '']))
  const errorTree = renderTree(failed.main())
  assert.match(JSON.stringify(errorTree), /loadFailed/)
  assert.match(JSON.stringify(errorTree), /boom/)
})
