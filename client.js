/**
 * Client half of @local/dsh-ccswitch-hub.
 *
 * A left-sidebar entry opens one management page: MCP servers and skills
 * discovered from CC Switch, with category and per-item switches. All text is
 * localized and all styling uses host theme tokens.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-ccswitch-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'ccswitch-hub'
    const PANEL_ID = 'ccswitch-hub'
    const STATE_ROUTE = '/plugins/ccswitch-hub/state'
    const ACTION_ROUTE = '/plugins/ccswitch-hub/action'
    const CONFIG_ROUTE = '/plugins/ccswitch-hub/config'

    const ZH = {
      panelLabel: 'MCP 技能',
      title: 'MCP 与技能',
      subtitle: '只读引用 CC Switch 的 MCP 服务器与技能。开启的 MCP 会在 Harness 中连接；开启的技能会进入技能目录。',
      refresh: '刷新',
      refreshing: '刷新中…',
      masterMcp: '启用 MCP',
      masterSkills: '启用技能',
      masterOff: '总开关已关闭，已启用的条目不会加载。',
      tabMcp: 'MCP 服务器',
      tabSkills: '技能',
      searchMcp: '搜索 MCP 服务器…',
      searchSkills: '搜索技能…',
      emptyMcp: '没有发现 MCP 服务器',
      emptySkills: '没有发现技能',
      emptySearch: '没有匹配的条目',
      emptyHint: '先在 CC Switch 中添加 MCP 或安装技能；也可以展开“高级”指定其他目录。',
      sourceReady: 'CC Switch 已连接',
      sourceMissing: '未发现 CC Switch 数据',
      sourceOther: '仅发现其他来源',
      warnings: '提示',
      advanced: '高级',
      ccSwitchDir: 'CC Switch 目录',
      ccSwitchDirHint: '留空使用默认的 ~/.cc-switch',
      skillDirs: '额外技能目录',
      skillDirsHint: '每行一个目录；用于扫描 CC Switch 之外的技能',
      saveConfig: '保存并重新扫描',
      saving: '保存中…',
      savedConfig: '已保存，正在重新扫描。',
      stateFile: '状态文件',
      dbPath: '数据库',
      agentsPath: '共享技能目录',
      tools: '个工具',
      statusOff: '未连接',
      statusConnecting: '连接中…',
      statusReady: '已连接',
      statusError: '连接失败',
      statusUnsupported: '不支持',
      statusMissing: '来源已移除',
      pending: '等待连接',
      retry: '重试',
      enabled: '已启用',
      disabled: '未启用',
      readonly: '只读',
      inRegistry: '已进入技能目录',
      notInRegistry: '尚未进入技能目录',
      source: '来源',
      apps: '同步到',
      envKeys: '环境变量',
      headerKeys: '请求头',
      conflict: '多来源配置不一致',
      loadFailed: '无法读取状态',
      retryLoad: '重新加载',
      actionFailed: '操作失败',
      missingRow: '该条目已不在来源中；关闭开关可清理。',
      configNone: '默认',
      descriptionEmpty: '（无描述）',
      openAdvanced: '来源与路径',
      mcpCount: 'MCP',
      skillCount: '技能',
      enabledCount: '已启用',
      masterNote: '关闭后保留每个条目的选择。',
      noDescription: '（无描述）',
      problem: '问题',
      sourceShadow: '由 Harness 直接加载',
      pathLabel: '路径',
    }

    const EN = {
      panelLabel: 'MCP Skills',
      title: 'MCP & Skills',
      subtitle: 'Reference CC Switch MCP servers and skills read-only. Enabled MCP servers connect inside Harness; enabled skills join the skill catalog.',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      masterMcp: 'Enable MCP',
      masterSkills: 'Enable skills',
      masterOff: 'The master switch is off; enabled items will not load.',
      tabMcp: 'MCP servers',
      tabSkills: 'Skills',
      searchMcp: 'Search MCP servers…',
      searchSkills: 'Search skills…',
      emptyMcp: 'No MCP servers found',
      emptySkills: 'No skills found',
      emptySearch: 'No matching items',
      emptyHint: 'Add MCP servers or install skills in CC Switch first; use Advanced to point at another directory.',
      sourceReady: 'CC Switch connected',
      sourceMissing: 'No CC Switch data found',
      sourceOther: 'Other sources only',
      warnings: 'Notes',
      advanced: 'Advanced',
      ccSwitchDir: 'CC Switch directory',
      ccSwitchDirHint: 'Leave blank for the default ~/.cc-switch',
      skillDirs: 'Extra skill directories',
      skillDirsHint: 'One directory per line; used for skills outside CC Switch',
      saveConfig: 'Save and rescan',
      saving: 'Saving…',
      savedConfig: 'Saved; rescanning now.',
      stateFile: 'State file',
      dbPath: 'Database',
      agentsPath: 'Shared skills directory',
      tools: 'tools',
      statusOff: 'Not connected',
      statusConnecting: 'Connecting…',
      statusReady: 'Connected',
      statusError: 'Connection failed',
      statusUnsupported: 'Unsupported',
      statusMissing: 'Source removed',
      pending: 'Waiting to connect',
      retry: 'Retry',
      enabled: 'Enabled',
      disabled: 'Disabled',
      readonly: 'Read-only',
      inRegistry: 'In the skill catalog',
      notInRegistry: 'Not in the skill catalog yet',
      source: 'Source',
      apps: 'Synced to',
      envKeys: 'Environment keys',
      headerKeys: 'Header keys',
      conflict: 'Sources disagree',
      loadFailed: 'Could not read status',
      retryLoad: 'Reload',
      actionFailed: 'Action failed',
      missingRow: 'This item is gone from its source; turn it off to clean up.',
      configNone: 'default',
      descriptionEmpty: '(no description)',
      openAdvanced: 'Sources and paths',
      mcpCount: 'MCP',
      skillCount: 'Skills',
      enabledCount: 'enabled',
      masterNote: 'Turning this off keeps each item’s choice.',
      noDescription: '(no description)',
      problem: 'Problem',
      sourceShadow: 'Loaded directly by Harness',
      pathLabel: 'Path',
    }

    let tr = (key) => ZH[key] ?? key

    const CSS = `
      .csh-page { height: 100%; overflow: auto; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
      .csh-wrap { max-width: 980px; margin: 0 auto; padding: 28px 28px 72px; box-sizing: border-box; }
      .csh-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
      .csh-title { margin: 0 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
      .csh-sub { margin: 0; max-width: 620px; font-size: 13px; line-height: 1.55; color: var(--dsw-alias-label-secondary); }
      .csh-head-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .csh-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-radius: 8px; padding: 7px 13px; font: inherit; font-size: 13px; line-height: 1.35; cursor: pointer; white-space: nowrap; }
      .csh-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
      .csh-btn:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
      .csh-btn:disabled { opacity: 0.45; cursor: default; }
      .csh-btn.primary { background: var(--dsw-alias-button-primary-fill); border-color: transparent; color: var(--dsw-alias-label-primary-foreground); }
      .csh-btn.primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
      .csh-btn.small { padding: 5px 9px; font-size: 12px; }
      .csh-card { margin-bottom: 14px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); }
      .csh-toolbar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
      .csh-master { display: flex; align-items: center; gap: 10px; min-width: 168px; }
      .csh-master-name { font-size: 13px; font-weight: 550; }
      .csh-master-note { font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .csh-search { flex: 1 1 220px; min-width: 180px; box-sizing: border-box; padding: 8px 11px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; }
      .csh-search:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 0; border-color: transparent; }
      .csh-tabs { display: flex; gap: 4px; padding: 3px; margin-bottom: 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-layer-2); width: fit-content; }
      .csh-tab { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); border-radius: 7px; padding: 6px 14px; font: inherit; font-size: 13px; cursor: pointer; }
      .csh-tab:hover { color: var(--dsw-alias-label-primary); }
      .csh-tab.active { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-weight: 550; box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
      .csh-tab:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 0; }
      .csh-list { display: flex; flex-direction: column; }
      .csh-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: start; padding: 14px 2px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .csh-row:last-child { border-bottom: 0; }
      .csh-row.is-off .csh-main { opacity: 0.6; }
      .csh-main { min-width: 0; }
      .csh-name-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .csh-name { font-size: 14px; font-weight: 600; word-break: break-word; }
      .csh-desc { margin-top: 3px; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); word-break: break-word; }
      .csh-meta { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 7px; font-size: 11px; line-height: 1.45; color: var(--dsw-alias-label-secondary); }
      .csh-code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; word-break: break-all; }
      .csh-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; font-size: 10.5px; line-height: 1.5; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .csh-badge.ok { color: var(--dsw-alias-state-success-primary); border-color: currentColor; }
      .csh-badge.warn { color: var(--dsw-alias-state-warn-primary); border-color: currentColor; }
      .csh-badge.error { color: var(--dsw-alias-state-error-primary); border-color: currentColor; }
      .csh-badge.info { color: var(--dsw-alias-state-business-primary); border-color: currentColor; }
      .csh-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; min-width: 120px; }
      .csh-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .csh-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
      .csh-status.ready { color: var(--dsw-alias-state-success-primary); }
      .csh-status.error { color: var(--dsw-alias-state-error-primary); }
      .csh-status.connecting { color: var(--dsw-alias-state-business-primary); }
      .csh-status.unsupported, .csh-status.missing { color: var(--dsw-alias-state-warn-primary); }
      .csh-error { margin-top: 7px; padding: 7px 9px; border: 1px solid var(--dsw-alias-state-error-primary); border-radius: 7px; font-size: 11px; line-height: 1.5; color: var(--dsw-alias-state-error-primary); word-break: break-word; }
      .csh-switch { position: relative; width: 38px; height: 22px; flex: none; padding: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; background: var(--dsw-alias-bg-layer-3); cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; }
      .csh-switch .csh-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-label-tertiary); transition: transform 0.15s ease, background 0.15s ease; }
      .csh-switch[aria-checked="true"] { background: var(--dsw-alias-state-business-primary); border-color: var(--dsw-alias-state-business-primary); }
      .csh-switch[aria-checked="true"] .csh-knob { transform: translateX(16px); background: var(--dsw-alias-label-primary-foreground); }
      .csh-switch:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
      .csh-switch:disabled { opacity: 0.45; cursor: default; }
      .csh-banner { display: flex; gap: 10px; margin-bottom: 14px; padding: 10px 13px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }
      .csh-banner.error { color: var(--dsw-alias-state-error-primary); border-color: currentColor; }
      .csh-banner.warn { color: var(--dsw-alias-state-warn-primary); border-color: currentColor; }
      .csh-warnings { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
      .csh-empty { padding: 26px 8px 30px; text-align: center; }
      .csh-empty-title { font-size: 14px; font-weight: 550; }
      .csh-empty-hint { margin-top: 6px; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); }
      .csh-advanced { margin-top: 16px; }
      .csh-advanced summary { cursor: pointer; font-size: 13px; color: var(--dsw-alias-label-secondary); user-select: none; }
      .csh-advanced summary:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; border-radius: 4px; }
      .csh-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; margin-top: 14px; }
      .csh-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .csh-field.wide { grid-column: 1 / -1; }
      .csh-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .csh-input { box-sizing: border-box; width: 100%; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; }
      .csh-input:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 0; border-color: transparent; }
      .csh-note { font-size: 11px; line-height: 1.45; color: var(--dsw-alias-label-secondary); }
      .csh-save-row { display: flex; align-items: center; justify-content: flex-end; gap: 10px; grid-column: 1 / -1; }
      .csh-save-note { margin-right: auto; font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .csh-footer { margin-top: 16px; font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-secondary); word-break: break-all; }
      .csh-row-actions { display: flex; align-items: center; gap: 8px; }
      @media (max-width: 720px) {
        .csh-wrap { padding: 20px 16px 56px; }
        .csh-head { flex-direction: column; }
        .csh-head-actions { justify-content: flex-start; }
        .csh-row { grid-template-columns: minmax(0, 1fr); }
        .csh-side { flex-direction: row; align-items: center; justify-content: space-between; min-width: 0; }
      }
    `

    function errorText(error) {
      return error?.message ? String(error.message) : String(error ?? 'unknown error')
    }

    async function requestJson(url, options) {
      const response = await fetch(url, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...options,
        headers: {
          ...(options && options.body ? { 'content-type': 'application/json' } : {}),
          ...(options && options.headers ? options.headers : {}),
        },
      })
      const text = await response.text()
      let payload
      try {
        payload = text ? JSON.parse(text) : {}
      } catch {
        payload = {}
      }
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`)
      }
      return payload
    }

    function originLabel(origin) {
      switch (origin) {
        case 'cc-switch': return 'CC Switch'
        case 'claude': return 'Claude Code'
        case 'codex': return 'Codex'
        case 'gemini': return 'Gemini CLI'
        case 'custom': return tr('source')
        default: return String(origin)
      }
    }

    function statusInfo(item) {
      switch (item.status) {
        case 'ready': return { className: 'ready', label: `${tr('statusReady')} · ${item.toolCount} ${tr('tools')}` }
        case 'connecting': return { className: 'connecting', label: tr('statusConnecting') }
        case 'error': return { className: 'error', label: tr('statusError') }
        case 'unsupported': return { className: 'unsupported', label: tr('statusUnsupported') }
        case 'missing': return { className: 'missing', label: tr('statusMissing') }
        default: return { className: '', label: item.enabled ? tr('pending') : tr('statusOff') }
      }
    }

    function Badge({ tone, children }) {
      return h('span', { className: `csh-badge${tone ? ` ${tone}` : ''}` }, children)
    }

    function Switch({ checked, disabled, busy, onChange, title }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked === true,
        'aria-label': title,
        title,
        className: 'csh-switch',
        disabled: disabled === true || busy === true,
        onClick: () => onChange(checked !== true),
      }, h('span', { className: 'csh-knob' }))
    }

    function McpRow({ item, busy, onToggle, onRetry }) {
      const info = statusInfo(item)
      const blocked = item.unsupported !== undefined && item.enabled !== true
      return h('div', {
        className: `csh-row${item.enabled && item.master !== false ? '' : ' is-off'}`,
      },
        h('div', { className: 'csh-main' },
          h('div', { className: 'csh-name-line' },
            h('span', { className: 'csh-name' }, item.name),
            ...(item.origins ?? []).map((origin) => h(Badge, { key: origin, tone: origin === 'cc-switch' ? 'info' : undefined }, originLabel(origin))),
            item.conflict ? h(Badge, { tone: 'warn' }, tr('conflict')) : null,
            item.apps && item.apps.length > 0
              ? h(Badge, { tone: undefined }, `${tr('apps')}: ${item.apps.join(', ')}`)
              : null,
          ),
          h('div', { className: 'csh-desc' }, item.description || item.summary || tr('noDescription')),
          h('div', { className: 'csh-meta' },
            h('span', { className: 'csh-code' }, item.summary),
            item.serverName ? h('span', { className: 'csh-code' }, `mcp__${item.serverName}__`) : null,
            item.envKeys && item.envKeys.length > 0
              ? h('span', null, `${tr('envKeys')}: ${item.envKeys.join(', ')}`)
              : null,
            item.headerKeys && item.headerKeys.length > 0
              ? h('span', null, `${tr('headerKeys')}: ${item.headerKeys.join(', ')}`)
              : null,
          ),
          item.error && item.status === 'error' ? h('div', { className: 'csh-error' }, item.error) : null,
          item.unsupported && item.status !== 'missing' ? h('div', { className: 'csh-note', style: { marginTop: 6 } }, item.unsupported) : null,
          item.status === 'missing' ? h('div', { className: 'csh-error' }, tr('missingRow')) : null,
        ),
        h('div', { className: 'csh-side' },
          h('span', { className: `csh-status ${info.className}` },
            h('span', { className: 'csh-dot' }),
            info.label,
          ),
          h('div', { className: 'csh-row-actions' },
            item.status === 'error' && item.enabled && item.master
              ? h('button', {
                  type: 'button',
                  className: 'csh-btn small',
                  disabled: busy,
                  onClick: () => onRetry(item),
                }, tr('retry'))
              : null,
            h(Switch, {
              checked: item.enabled,
              disabled: blocked,
              busy,
              title: blocked ? (item.unsupported || tr('statusMissing')) : (item.enabled ? tr('enabled') : tr('disabled')),
              onChange: (next) => onToggle(item, next),
            }),
          ),
        ),
      )
    }

    function SkillRow({ item, busy, onToggle }) {
      const blocked = item.controllable !== true && item.missing !== true && item.enabled !== true
      return h('div', { className: `csh-row${item.enabled && item.master !== false ? '' : ' is-off'}` },
        h('div', { className: 'csh-main' },
          h('div', { className: 'csh-name-line' },
            h('span', { className: 'csh-name' }, item.name),
            item.source ? h(Badge, { tone: item.source === 'cc-switch' ? 'info' : undefined }, originLabel(item.source)) : null,
            blocked ? h(Badge, { tone: 'warn' }, tr('readonly')) : null,
            item.enabled && item.master !== false && !item.missing
              ? h(Badge, { tone: item.inRegistry ? 'ok' : 'warn' }, item.inRegistry ? tr('inRegistry') : tr('notInRegistry'))
              : null,
          ),
          h('div', { className: 'csh-desc' }, item.description || tr('noDescription')),
          h('div', { className: 'csh-meta' },
            item.rootLabel ? h('span', null, `${tr('source')}: ${item.rootLabel}`) : null,
            item.path ? h('span', { className: 'csh-code' }, item.path) : null,
          ),
          item.missing ? h('div', { className: 'csh-error' }, tr('missingRow')) : null,
          (blocked || item.missing) && item.readonlyReason ? h('div', { className: 'csh-error' }, item.readonlyReason) : null,
        ),
        h('div', { className: 'csh-side' },
          h('div', { className: 'csh-row-actions' },
            h(Switch, {
              checked: item.enabled,
              disabled: blocked,
              busy,
              title: blocked ? (item.readonlyReason || tr('readonly')) : (item.enabled ? tr('enabled') : tr('disabled')),
              onChange: (next) => onToggle(item, next),
            }),
          ),
        ),
      )
    }

    function EmptyState({ searching, tab }) {
      if (searching) return h('div', { className: 'csh-empty' }, h('div', { className: 'csh-empty-title' }, tr('emptySearch')))
      const title = tab === 'mcp' ? tr('emptyMcp') : tr('emptySkills')
      return h('div', { className: 'csh-empty' },
        h('div', { className: 'csh-empty-title' }, title),
        h('div', { className: 'csh-empty-hint' }, tr('emptyHint')),
      )
    }

    function HubIcon({ size = 18 }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block' },
      },
        h('path', { d: 'M8.5 4v4M15.5 4v4', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }),
        h('path', { d: 'M5.5 8h13v3.2a6.5 6.5 0 0 1-13 0V8Z', stroke: 'currentColor', strokeWidth: 1.7, strokeLinejoin: 'round' }),
        h('path', { d: 'M12 17.7V21', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }),
        h('path', { d: 'M18.6 3.6l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z', fill: 'currentColor' }),
      )
    }

    function Page() {
      const [snapshot, setSnapshot] = React.useState(null)
      const [loadError, setLoadError] = React.useState('')
      const [actionError, setActionError] = React.useState('')
      const [loading, setLoading] = React.useState(true)
      const [busy, setBusy] = React.useState('')
      const [tab, setTab] = React.useState('mcp')
      const [query, setQuery] = React.useState('')
      const [ccSwitchDir, setCcSwitchDir] = React.useState('')
      const [skillDirs, setSkillDirs] = React.useState('')
      const configInit = React.useRef(false)
      const [saving, setSaving] = React.useState(false)
      const [saveNote, setSaveNote] = React.useState('')
      const refreshTimer = React.useRef(null)

      React.useEffect(() => () => clearTimeout(refreshTimer.current), [])

      const scheduleRefresh = () => {
        clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(() => {
          void load(false)
        }, 2200)
      }

      const load = React.useCallback(async (force) => {
        if (!force) setLoading(true)
        try {
          const payload = await requestJson(`${STATE_ROUTE}${force ? '?refresh=1' : ''}`)
          setSnapshot(payload)
          setLoadError('')
          if (!configInit.current) {
            setCcSwitchDir(payload.config?.ccSwitchDir ?? '')
            setSkillDirs((payload.config?.skillDirs ?? []).join('\n'))
            configInit.current = true
          }
          if (payload.mcp?.items?.some((item) => item.status === 'connecting' || item.pending)) scheduleRefresh()
        } catch (error) {
          setLoadError(errorText(error))
        } finally {
          setLoading(false)
        }
      }, [])

      React.useEffect(() => {
        void load(false)
      }, [load])

      const act = async (body, key) => {
        setBusy(key)
        setActionError('')
        try {
          const payload = await requestJson(ACTION_ROUTE, {
            method: 'POST',
            body: JSON.stringify(body),
          })
          setSnapshot(payload)
          if (payload.mcp?.items?.some((item) => item.status === 'connecting' || item.pending)) scheduleRefresh()
        } catch (error) {
          setActionError(errorText(error))
          void load(false)
        } finally {
          setBusy('')
        }
      }

      const saveConfig = async () => {
        setSaving(true)
        setSaveNote('')
        setActionError('')
        try {
          const dirs = skillDirs.split(/[\n,]+/).map((entry) => entry.trim()).filter((entry) => entry !== '')
          const payload = await requestJson(CONFIG_ROUTE, {
            method: 'POST',
            body: JSON.stringify({ ccSwitchDir: ccSwitchDir.trim(), skillDirs: dirs }),
          })
          setSnapshot(payload)
          setSaveNote(tr('savedConfig'))
        } catch (error) {
          setActionError(errorText(error))
        } finally {
          setSaving(false)
        }
      }

      const toggleMaster = (kind) => {
        const current = kind === 'mcp' ? snapshot?.mcp?.master !== false : snapshot?.skills?.master !== false
        void act({ type: kind, master: true, enabled: !current }, `master:${kind}`)
      }

      if (loading && snapshot === null) {
        return h('div', { className: 'csh-page' },
          h('style', { 'data-plugin': NS }, CSS),
          h('div', { className: 'csh-wrap' },
            h('div', { className: 'csh-banner' }, tr('refreshing')),
          ),
        )
      }

      if (snapshot === null) {
        return h('div', { className: 'csh-page' },
          h('style', { 'data-plugin': NS }, CSS),
          h('div', { className: 'csh-wrap' },
            h('div', { className: 'csh-banner error' }, `${tr('loadFailed')}: ${loadError}`),
            h('button', { type: 'button', className: 'csh-btn', onClick: () => void load(true) }, tr('retryLoad')),
          ),
        )
      }

      const items = tab === 'mcp' ? snapshot.mcp.items : snapshot.skills.items
      const needle = query.trim().toLowerCase()
      const filtered = needle === ''
        ? items
        : items.filter((item) => {
            const haystack = tab === 'mcp'
              ? `${item.name} ${item.description ?? ''} ${item.summary ?? ''} ${(item.origins ?? []).join(' ')}`
              : `${item.name} ${item.description ?? ''} ${item.path ?? ''}`
            return haystack.toLowerCase().includes(needle)
          })
      const ccSource = (snapshot.sources ?? []).find((source) => source.id === 'ccswitch' && source.kind === 'mcp')
      const ccSkills = (snapshot.sources ?? []).find((source) => source.id === 'ccswitch' && source.kind === 'skills')
      const sourceFound = Boolean((ccSource && ccSource.exists) || (ccSkills && ccSkills.exists))
      const anySource = (snapshot.sources ?? []).some((source) => source.exists)
      const enabledMcp = snapshot.mcp.items.filter((item) => item.enabled).length
      const enabledSkills = snapshot.skills.items.filter((item) => item.enabled).length
      const warnings = snapshot.warnings ?? []

      return h('div', { className: 'csh-page' },
        h('style', { 'data-plugin': NS }, CSS),
        h('div', { className: 'csh-wrap' },
          h('div', { className: 'csh-head' },
            h('div', null,
              h('h1', { className: 'csh-title' }, tr('title')),
              h('p', { className: 'csh-sub' }, tr('subtitle')),
            ),
            h('div', { className: 'csh-head-actions' },
              h(Badge, { tone: sourceFound ? 'ok' : 'warn' }, sourceFound ? tr('sourceReady') : anySource ? tr('sourceOther') : tr('sourceMissing')),
              h('button', {
                type: 'button',
                className: 'csh-btn',
                disabled: busy === 'rescan',
                onClick: () => void act({ type: 'rescan' }, 'rescan'),
              }, busy === 'rescan' ? tr('refreshing') : tr('refresh')),
            ),
          ),

          warnings.length > 0
            ? h('div', { className: 'csh-card' },
                h('div', { className: 'csh-master-note', style: { marginBottom: 6 } }, tr('warnings')),
                h('ul', { className: 'csh-warnings' }, warnings.map((warning, index) => h('li', { key: index }, warning))),
              )
            : null,

          actionError !== '' ? h('div', { className: 'csh-banner error' }, `${tr('actionFailed')}: ${actionError}`) : null,
          loadError !== '' && snapshot !== null ? h('div', { className: 'csh-banner warn' }, `${tr('loadFailed')}: ${loadError}`) : null,

          h('div', { className: 'csh-card' },
            h('div', { className: 'csh-tabs', role: 'tablist' },
              h('button', {
                type: 'button',
                role: 'tab',
                'aria-selected': tab === 'mcp',
                className: `csh-tab${tab === 'mcp' ? ' active' : ''}`,
                onClick: () => setTab('mcp'),
              }, `${tr('tabMcp')} · ${snapshot.mcp.items.length}`),
              h('button', {
                type: 'button',
                role: 'tab',
                'aria-selected': tab === 'skills',
                className: `csh-tab${tab === 'skills' ? ' active' : ''}`,
                onClick: () => setTab('skills'),
              }, `${tr('tabSkills')} · ${snapshot.skills.items.length}`),
            ),

            h('div', { className: 'csh-toolbar' },
              h('div', { className: 'csh-master' },
                h(Switch, {
                  checked: tab === 'mcp' ? snapshot.mcp.master : snapshot.skills.master,
                  busy: busy === `master:${tab === 'mcp' ? 'mcp' : 'skills'}`,
                  title: tab === 'mcp' ? tr('masterMcp') : tr('masterSkills'),
                  onChange: () => toggleMaster(tab === 'mcp' ? 'mcp' : 'skills'),
                }),
                h('div', null,
                  h('div', { className: 'csh-master-name' }, tab === 'mcp' ? tr('masterMcp') : tr('masterSkills')),
                  h('div', { className: 'csh-master-note' }, tr('masterNote')),
                ),
              ),
              h('input', {
                className: 'csh-search',
                type: 'search',
                value: query,
                placeholder: tab === 'mcp' ? tr('searchMcp') : tr('searchSkills'),
                'aria-label': tab === 'mcp' ? tr('searchMcp') : tr('searchSkills'),
                onChange: (event) => setQuery(event.target.value),
              }),
              h('span', { className: 'csh-master-note' },
                `${tab === 'mcp' ? tr('mcpCount') : tr('skillCount')} · ${tab === 'mcp' ? enabledMcp : enabledSkills} ${tr('enabledCount')}`,
              ),
            ),

            tab === 'mcp' && !snapshot.mcp.master
              ? h('div', { className: 'csh-banner warn', style: { marginBottom: 10 } }, tr('masterOff'))
              : null,
            tab === 'skills' && !snapshot.skills.master
              ? h('div', { className: 'csh-banner warn', style: { marginBottom: 10 } }, tr('masterOff'))
              : null,

            h('div', { className: 'csh-list' },
              filtered.length === 0
                ? h(EmptyState, { searching: needle !== '', tab })
                : filtered.map((item) => tab === 'mcp'
                    ? h(McpRow, {
                        key: item.key,
                        item,
                        busy: busy === `mcp:${item.key}`,
                        onToggle: (row, next) => void act({ type: 'mcp', key: row.key, enabled: next }, `mcp:${row.key}`),
                        onRetry: (row) => void act({ type: 'retry', key: row.key }, `mcp:${row.key}`),
                      })
                    : h(SkillRow, {
                        key: item.name,
                        item,
                        busy: busy === `skills:${item.name}`,
                        onToggle: (row, next) => void act({ type: 'skills', key: row.name, enabled: next }, `skills:${row.name}`),
                      }),
            ),
          ),
        ),

          h('div', { className: 'csh-card' },
            h('details', { className: 'csh-advanced' },
              h('summary', null, tr('openAdvanced')),
              h('div', { className: 'csh-form' },
                h('div', { className: 'csh-field' },
                  h('label', { className: 'csh-label' }, tr('ccSwitchDir')),
                  h('input', {
                    className: 'csh-input',
                    type: 'text',
                    value: ccSwitchDir,
                    placeholder: snapshot.resolved?.ccSwitchDir ?? '~/.cc-switch',
                    onChange: (event) => setCcSwitchDir(event.target.value),
                  }),
                  h('div', { className: 'csh-note' }, tr('ccSwitchDirHint')),
                ),
                h('div', { className: 'csh-field' },
                  h('label', { className: 'csh-label' }, tr('skillDirs')),
                  h('textarea', {
                    className: 'csh-input',
                    rows: 3,
                    value: skillDirs,
                    placeholder: '~/.cc-switch/skills',
                    onChange: (event) => setSkillDirs(event.target.value),
                  }),
                  h('div', { className: 'csh-note' }, tr('skillDirsHint')),
                ),
                h('div', { className: 'csh-field wide' },
                  h('div', { className: 'csh-note' }, `${tr('dbPath')}: ${snapshot.resolved?.ccSwitchDb ?? '—'}`),
                  h('div', { className: 'csh-note' }, `${tr('agentsPath')}: ${snapshot.resolved?.agentsSkills ?? '—'}`),
                ),
                h('div', { className: 'csh-save-row' },
                  h('span', { className: 'csh-save-note' }, saveNote),
                  h('button', {
                    type: 'button',
                    className: 'csh-btn primary',
                    disabled: saving,
                    onClick: () => void saveConfig(),
                  }, saving ? tr('saving') : tr('saveConfig')),
                ),
              ),
            ),
          ),

          h('div', { className: 'csh-footer' }, `${tr('stateFile')}: ${snapshot.stateFile ?? '—'}`),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'ccswitch-hub: dictionaries')
        tr = ctx.locale.bind(NS)

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 7,
          locale: NS,
          label: () => ctx.locale.bind(NS)('panelLabel'),
        }, HubIcon))

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, Page))
      },
    }
  },
})
