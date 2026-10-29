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
    Fragment: Symbol.for('react.fragment'),
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
    version: 2,
    pluginVersion: '2.1.0',
    stateFile: '/tmp/dsh/ccswitch-hub/state.json',
    config: { ccSwitchDir: null },
    paths: {
      skillsDir: '/tmp/dsh/skills',
      disabledSkillsDir: '/tmp/dsh/ccswitch-hub/disabled-skills',
      ccSwitchDir: '/home/me/.cc-switch',
      ccSwitchDb: '/home/me/.cc-switch/cc-switch.db',
    },
    mcp: {
      master: true,
      items: [{
        id: 'mcp-1',
        name: 'GitHub',
        transport: 'stdio',
        summary: 'stdio · npx · 2 args',
        runtimeName: 'github',
        enabled: true,
        master: true,
        status: 'ready',
        toolCount: 3,
        error: undefined,
        serverName: 'github',
        envKeys: ['GITHUB_TOKEN'],
        headerKeys: [],
        source: null,
        updatedAt: 1,
        pending: false,
      }],
    },
    skills: {
      items: [{
        name: 'alpha',
        description: 'Alpha skill',
        enabled: true,
        kind: 'directory',
        entryName: 'alpha',
        entryPath: '/tmp/dsh/skills/alpha',
        path: '/tmp/dsh/skills/alpha/SKILL.md',
      }],
    },
    warnings: [],
    ...overrides,
  }
}

function importPayload() {
  return {
    ok: true,
    status: {
      dir: '/home/me/.cc-switch',
      dbPath: '/home/me/.cc-switch/cc-switch.db',
      dbExists: true,
      skillsPath: '/home/me/.cc-switch/skills',
      skillsExists: true,
      mcpError: undefined,
    },
    mcp: [{
      id: 'ccswitch-1',
      name: 'Remote tools',
      description: 'Imported server',
      summary: 'http · https://example.com/mcp',
      transport: 'http',
      apps: ['claude'],
      envKeys: [],
      headerKeys: ['Authorization'],
      unsupported: undefined,
      imported: false,
      conflict: false,
    }],
    skills: [{
      name: 'beta',
      description: 'Beta skill',
      kind: 'directory',
      installed: false,
    }],
    warnings: [],
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
  if (typeof node.type === 'symbol') return node.children.map((child) => renderTree(child))
  if (typeof node.type === 'function') {
    const props = node.children.length > 0 ? { ...node.props, children: node.children } : node.props
    return renderTree(node.type(props))
  }
  return { type: node.type, props: node.props, children: node.children.map((child) => renderTree(child)) }
}

const baseState = (tab = 'mcp') => [
  snapshot(), '', '', '', false, '', tab, '', null, '', '', null, false, '', '', '',
]

test('renders the native MCP tab and CSS', () => {
  const { main, panel } = loadClient(makeReact(baseState('mcp')))
  const rendered = renderTree(main())
  const text = JSON.stringify(rendered)
  assert.match(text, /csh-page/)
  assert.match(text, /GitHub/)
  assert.match(text, /mcp__github__/)
  assert.ok(text.includes('csh-btn.primary { background: var(--dsw-alias-button-primary-fill)'))
  assert.ok(text.includes('csh-switch[aria-checked'))
  assert.equal(text.includes('color: #fff'), false)
  const icon = panel({ size: 18, active: false })
  assert.equal(icon.type, 'svg')
})

test('renders the skills tab and the MCP editor', () => {
  const { main } = loadClient(makeReact(baseState('skills')))
  const skills = JSON.stringify(renderTree(main()))
  assert.match(skills, /Alpha skill/)
  assert.match(skills, /skillEnabled/)

  const withEditor = baseState('mcp')
  withEditor[8] = { mode: 'new', detail: undefined }
  const editor = JSON.stringify(renderTree(loadClient(makeReact(withEditor)).main()))
  assert.match(editor, /addMcp/)
  assert.match(editor, /csh-editor/)
})

test('renders the CC Switch import tab', () => {
  const state = baseState('import')
  state[11] = importPayload()
  const { main } = loadClient(makeReact(state))
  const text = JSON.stringify(renderTree(main()))
  assert.match(text, /Remote tools/)
  assert.match(text, /Beta skill/)
  assert.match(text, /importOne/)
})

test('renders the update banner and update errors', () => {
  const state = baseState('mcp')
  state[16] = {
    ok: true,
    current: '2.1.0',
    latest: '2.2.0',
    updateAvailable: true,
    release: { url: 'https://github.com/RedCarl/dsh-ccswitch-hub/releases/tag/v2.2.0' },
    installable: true,
  }
  const banner = JSON.stringify(renderTree(loadClient(makeReact(state)).main()))
  assert.match(banner, /newVersion/)
  assert.match(banner, /2\.2\.0/)

  const failed = baseState('mcp')
  failed[16] = { ok: false, current: '2.1.0', updateAvailable: false, installable: true }
  failed[19] = 'network down'
  const error = JSON.stringify(renderTree(loadClient(makeReact(failed)).main()))
  assert.match(error, /updateFailed/)
  assert.match(error, /network down/)
})

test('renders a pending restart without offering the same update again', () => {
  const state = baseState('mcp')
  state[16] = {
    ok: true,
    current: '2.1.1',
    installed: '2.1.2',
    latest: '2.1.2',
    updateAvailable: false,
    restartRequired: true,
    installable: true,
  }
  const text = JSON.stringify(renderTree(loadClient(makeReact(state)).main()))
  assert.match(text, /restartRequired/)
  assert.match(text, /restartHint/)
  assert.equal(text.includes('updateTo'), false)
})

test('renders the empty state and the fatal error shell', () => {
  const empty = baseState('mcp')
  empty[0] = snapshot({ mcp: { master: true, items: [] }, skills: { items: [] } })
  const emptyText = JSON.stringify(renderTree(loadClient(makeReact(empty)).main()))
  assert.match(emptyText, /emptyMcp/)

  const failed = [null, 'boom', '', '', false, '', 'mcp', '', null, '', '', null, false, '', '', '']
  const errorText = JSON.stringify(renderTree(loadClient(makeReact(failed)).main()))
  assert.match(errorText, /loadFailed/)
  assert.match(errorText, /boom/)
})
