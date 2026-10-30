/**
 * Client half of @local/dsh-ccswitch-hub.
 *
 * A left-sidebar entry opens one management page:
 * - MCP servers stored by this plugin and mounted in Harness;
 * - native skills under `$DSH_HOME/skills`, with enable/disable and delete;
 * - a separate CC Switch import tab that copies entries into Harness.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-ccswitch-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'ccswitch-hub'
    const PANEL_ID = 'ccswitch-hub'
    const API = '/plugins/ccswitch-hub'

    const ZH = {
      panelLabel: 'MCP 技能',
      title: 'MCP 与技能',
      subtitle: '统一管理 MCP 与技能；CC Switch 仅用于快速导入。',
      tabMcp: 'MCP 服务器',
      tabSkills: '技能',
      tabImport: '从 CC Switch 导入',
      tabAdvanced: '高级',
      settingsTitle: '高级 / 路径',
      versionLabel: '版本',
      refresh: '刷新',
      refreshing: '刷新中…',
      addMcp: '新增 MCP',
      edit: '编辑',
      delete: '删除',
      confirmDelete: '确认删除',
      cancel: '取消',
      save: '保存',
      saving: '保存中…',
      masterMcp: '插件 MCP 总开关',
      masterNote: '只影响通过本插件新增或导入的 MCP。',
      masterOff: '插件内置 MCP 总开关已关闭；可在高级中开启。',
      masterAdvancedNote: '只影响本插件新增/导入的 MCP；Harness 已有 MCP 由各自开关控制。',
      searchMcp: '搜索 MCP 服务器…',
      searchSkills: '搜索技能…',
      emptyMcp: '还没有 MCP 服务器',
      emptyMcpHint: '点击「新增 MCP」添加，或在「从 CC Switch 导入」中复制已有配置。',
      emptySkills: '还没有技能',
      emptySkillsHint: '把技能放到 Harness 技能目录，或从 CC Switch 导入。',
      emptySearch: '没有匹配的条目',
      statusOff: '未连接',
      statusConnecting: '连接中…',
      statusReady: '已连接',
      statusError: '连接失败',
      pending: '等待连接',
      retry: '重试',
      native: 'Harness',
      sourcePlugin: '插件',
      sourceHarness: 'Harness',
      sourceCcSwitch: 'CC Switch',
      importedFrom: '导入自 CC Switch',
      envKeys: '环境变量',
      headerKeys: '请求头',
      tools: '个工具',
      mcpName: '名称',
      transport: '传输方式',
      command: '命令',
      args: '参数（每行一个）',
      env: '环境变量（KEY=value，每行一个）',
      cwd: '工作目录（可选）',
      url: 'MCP 地址',
      headers: '请求头（KEY=value，每行一个）',
      timeout: '调用超时（毫秒）',
      stdio: 'stdio（本地进程）',
      http: 'HTTP',
      secretHint: '已保存的环境变量/请求头值不会回显；留空表示保留原值，删除整行表示移除。',
      enabled: '启用',
      disabled: '已停用',
      skillEnabled: '已启用',
      skillDisabled: '已停用',
      deleteSkill: '删除技能',
      skillDeleted: '技能已移到回收目录。',
      mcpDeleted: 'MCP 服务器已删除。',
      importTitle: '从 CC Switch 导入',
      importSubtitle: '只读取 CC Switch 的数据，导入时复制为 Harness 的独立条目；之后可以单独编辑、启停或删除。',
      importMcpTitle: 'MCP 服务器',
      importSkillsTitle: '技能',
      importOne: '导入',
      importAll: '全部导入',
      imported: '已导入',
      importConflict: '同名条目已存在',
      importUnsupported: 'Harness 不支持',
      importInstalled: '已安装',
      importEmpty: '没有可导入的条目',
      importHint: '未发现 CC Switch 数据；可以在下方「高级」中指定 CC Switch 目录。',
      importRefresh: '重新扫描',
      importNote: '导入的 MCP 默认关闭，导入后请在 MCP 页启用。',
      ccSwitchDir: 'CC Switch 目录（导入来源）',
      ccSwitchDirHint: '留空使用 ~/.cc-switch',
      dbFound: '数据库已找到',
      dbMissing: '数据库未找到',
      skillsFound: '技能目录已找到',
      skillsMissing: '技能目录未找到',
      skillsDir: 'Harness 技能目录',
      disabledDir: '停用技能目录',
      dbPath: 'CC Switch 数据库',
      stateFile: '状态文件',
      advanced: '高级 / 路径',
      saveConfig: '保存并重新扫描',
      savedConfig: '已保存。',
      checkUpdate: '检查更新',
      checkingUpdate: '检查中…',
      updateTo: '更新到',
      updating: '更新中…',
      upToDate: '已是最新',
      newVersion: '发现新版本',
      currentVersion: '当前',
      releaseNotes: 'Release 说明',
      updateApplied: '更新已应用，请刷新页面。',
      updateOverridden: '更新已安装，但当前入口被更高优先级配置覆盖。',
      updateCancelled: '更新已取消。',
      updateFailed: '更新失败',
      updateUnsupported: '当前 Host 不支持一键更新，请在终端手动安装。',
      restartRequired: '需要重启 Harness',
      restartHint: '更新包已安装，重启 Harness 后生效。',
      namespaceHint: '插件管理的 MCP 使用 csh- 前缀 + 短哈希作为运行时 serverName，避免与 cordis.yml 中已有的 MCP 冲突。',
      harnessMcpTitle: 'Harness 已有 MCP',
      harnessMcpBadge: 'Harness 配置',
      harnessMcpDesc: '由 cordis.yml 或预设启动；profile 中的条目可直接启停和编辑，预设/工具注册表条目只读。',
      readOnly: '只读',
      editHarness: '编辑 Harness MCP',
      shadowed: '已跳过',
      shadowedBy: 'Harness 已有同名 MCP，已跳过该重复条目：',
      harnessMcpImport: 'Harness 已有',
      configured: '已配置',
      installedVersion: '已安装',
      warnings: '提示',
      loadFailed: '无法读取状态',
      retryLoad: '重新加载',
      actionFailed: '操作失败',
      countMcp: 'MCP',
      countSkills: '技能',
      enabledCount: '已启用',
      noDescription: '（无描述）',
      deleteTrashNote: '删除的技能会移动到回收目录，不会立即永久删除。',
      importSuccess: '导入完成。',
      importAllErrors: '部分条目未导入',
      formError: '请检查表单',
      toggleSkill: '启用/停用技能',
    }

    const EN = {
      panelLabel: 'MCP Skills',
      title: 'MCP & Skills',
      subtitle: 'One place for MCP and skills; CC Switch is only a quick import source.',
      tabMcp: 'MCP servers',
      tabSkills: 'Skills',
      tabImport: 'Import from CC Switch',
      tabAdvanced: 'Advanced',
      settingsTitle: 'Advanced / paths',
      versionLabel: 'Version',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      addMcp: 'New MCP',
      edit: 'Edit',
      delete: 'Delete',
      confirmDelete: 'Confirm delete',
      cancel: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
      masterMcp: 'Plugin MCP master switch',
      masterNote: 'Only affects MCPs added or imported by this plugin.',
      masterOff: 'The plugin MCP master switch is off; turn it on under Advanced.',
      masterAdvancedNote: 'Only affects plugin-added/imported MCPs; Harness MCPs keep their own switches.',
      searchMcp: 'Search MCP servers…',
      searchSkills: 'Search skills…',
      emptyMcp: 'No MCP servers yet',
      emptyMcpHint: 'Use “New MCP” to add one, or copy one from “Import from CC Switch”.',
      emptySkills: 'No skills yet',
      emptySkillsHint: 'Place a skill in the Harness skills directory, or import one from CC Switch.',
      emptySearch: 'No matching items',
      statusOff: 'Not connected',
      statusConnecting: 'Connecting…',
      statusReady: 'Connected',
      statusError: 'Connection failed',
      pending: 'Waiting to connect',
      retry: 'Retry',
      native: 'Harness',
      sourcePlugin: 'Plugin',
      sourceHarness: 'Harness',
      sourceCcSwitch: 'CC Switch',
      importedFrom: 'From CC Switch',
      envKeys: 'Environment keys',
      headerKeys: 'Header keys',
      tools: 'tools',
      mcpName: 'Name',
      transport: 'Transport',
      command: 'Command',
      args: 'Arguments (one per line)',
      env: 'Environment (KEY=value, one per line)',
      cwd: 'Working directory (optional)',
      url: 'MCP URL',
      headers: 'Headers (KEY=value, one per line)',
      timeout: 'Call timeout (ms)',
      stdio: 'stdio (local process)',
      http: 'HTTP',
      secretHint: 'Stored environment/header values are never echoed; a blank value keeps the stored one, and deleting a line removes the key.',
      enabled: 'Enabled',
      disabled: 'Disabled',
      skillEnabled: 'Enabled',
      skillDisabled: 'Disabled',
      deleteSkill: 'Delete skill',
      skillDeleted: 'Skill moved to the trash directory.',
      mcpDeleted: 'MCP server deleted.',
      importTitle: 'Import from CC Switch',
      importSubtitle: 'Reads CC Switch only. Importing copies an independent Harness entry that you can edit, toggle, or delete later.',
      importMcpTitle: 'MCP servers',
      importSkillsTitle: 'Skills',
      importOne: 'Import',
      importAll: 'Import all',
      imported: 'Imported',
      importConflict: 'Name already exists',
      importUnsupported: 'Not supported by Harness',
      importInstalled: 'Installed',
      importEmpty: 'Nothing to import',
      importHint: 'No CC Switch data found; set the CC Switch directory under Advanced below.',
      importRefresh: 'Rescan',
      importNote: 'Imported MCP servers start disabled; enable them on the MCP tab.',
      ccSwitchDir: 'CC Switch directory (import source)',
      ccSwitchDirHint: 'Leave blank for ~/.cc-switch',
      dbFound: 'Database found',
      dbMissing: 'Database missing',
      skillsFound: 'Skills directory found',
      skillsMissing: 'Skills directory missing',
      skillsDir: 'Harness skills directory',
      disabledDir: 'Disabled skills directory',
      dbPath: 'CC Switch database',
      stateFile: 'State file',
      advanced: 'Advanced / paths',
      saveConfig: 'Save and rescan',
      savedConfig: 'Saved.',
      checkUpdate: 'Check for updates',
      checkingUpdate: 'Checking…',
      updateTo: 'Update to',
      updating: 'Updating…',
      upToDate: 'Up to date',
      newVersion: 'New version available',
      currentVersion: 'Current',
      releaseNotes: 'Release notes',
      updateApplied: 'Update applied; refresh the page.',
      updateOverridden: 'Update installed, but a higher-priority entry overrides this one.',
      updateCancelled: 'Update cancelled.',
      updateFailed: 'Update failed',
      updateUnsupported: 'This Host cannot install updates; run the command in a terminal.',
      restartRequired: 'Restart required',
      restartHint: 'The update is installed; restart Harness to use it.',
      namespaceHint: 'Plugin-managed MCP servers use a csh- prefix and short hash as their runtime serverName, avoiding collisions with MCPs already in cordis.yml.',
      harnessMcpTitle: 'Existing Harness MCPs',
      harnessMcpBadge: 'Harness config',
      harnessMcpDesc: 'Started by cordis.yml or a preset; profile entries can be toggled and edited here, preset/tool entries are read-only.',
      readOnly: 'Read-only',
      editHarness: 'Edit Harness MCP',
      shadowed: 'Skipped',
      shadowedBy: 'A Harness MCP with this name already exists; the duplicate is skipped:',
      harnessMcpImport: 'Already in Harness',
      configured: 'Configured',
      installedVersion: 'Installed',
      warnings: 'Notes',
      loadFailed: 'Could not read status',
      retryLoad: 'Reload',
      actionFailed: 'Action failed',
      countMcp: 'MCP',
      countSkills: 'Skills',
      enabledCount: 'enabled',
      noDescription: '(no description)',
      deleteTrashNote: 'Deleted skills move to a trash directory instead of being destroyed immediately.',
      importSuccess: 'Import complete.',
      importAllErrors: 'Some items were not imported',
      formError: 'Check the form',
      toggleSkill: 'Enable/disable skill',
    }

    let tr = (key) => ZH[key] ?? key

    const CSS = `
      .csh-page { height: 100%; overflow: auto; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
      .csh-wrap { max-width: 1000px; margin: 0 auto; padding: 28px 28px 72px; box-sizing: border-box; }
      .csh-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
      .csh-title { margin: 0 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
      .csh-sub { margin: 0; max-width: 660px; font-size: 13px; line-height: 1.55; color: var(--dsw-alias-label-secondary); }
      .csh-head-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .csh-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-radius: 8px; padding: 7px 13px; font: inherit; font-size: 13px; line-height: 1.35; cursor: pointer; white-space: nowrap; }
      .csh-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
      .csh-btn:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
      .csh-btn:disabled { opacity: 0.45; cursor: default; }
      .csh-btn.primary { background: var(--dsw-alias-button-primary-fill); border-color: transparent; color: var(--dsw-alias-label-primary-foreground); }
      .csh-btn.primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
      .csh-btn.small { padding: 5px 9px; font-size: 12px; }
      .csh-btn.danger { color: var(--dsw-alias-state-error-primary); }
      .csh-btn.danger:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); }
      .csh-card { margin-bottom: 14px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); }
      .csh-toolbar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
      .csh-master-name { font-size: 13px; font-weight: 550; }
      .csh-master-note { font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .csh-search { flex: 1 1 220px; min-width: 180px; box-sizing: border-box; padding: 8px 11px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; }
      .csh-search:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 0; border-color: transparent; }
      .csh-tabs { display: flex; gap: 4px; padding: 3px; margin-bottom: 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; background: var(--dsw-alias-bg-layer-2); width: fit-content; flex-wrap: wrap; }
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
      .csh-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; min-width: 148px; }
      .csh-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .csh-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
      .csh-status.ready { color: var(--dsw-alias-state-success-primary); }
      .csh-status.error { color: var(--dsw-alias-state-error-primary); }
      .csh-status.connecting { color: var(--dsw-alias-state-business-primary); }
      .csh-status.warn { color: var(--dsw-alias-state-warn-primary); }
      .csh-error { margin-top: 7px; padding: 7px 9px; border: 1px solid var(--dsw-alias-state-error-primary); border-radius: 7px; font-size: 11px; line-height: 1.5; color: var(--dsw-alias-state-error-primary); word-break: break-word; }
      .csh-note { margin-top: 6px; font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
      .csh-switch { position: relative; width: 38px; height: 22px; flex: none; padding: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; background: var(--dsw-alias-bg-layer-3); cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; }
      .csh-switch .csh-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-label-tertiary); transition: transform 0.15s ease, background 0.15s ease; }
      .csh-switch[aria-checked="true"] { background: var(--dsw-alias-state-business-primary); border-color: var(--dsw-alias-state-business-primary); }
      .csh-switch[aria-checked="true"] .csh-knob { transform: translateX(16px); background: var(--dsw-alias-label-primary-foreground); }
      .csh-switch:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
      .csh-switch:disabled { opacity: 0.45; cursor: default; }
      .csh-banner { display: flex; gap: 10px; margin-bottom: 14px; padding: 10px 13px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }
      .csh-banner.error { color: var(--dsw-alias-state-error-primary); border-color: currentColor; }
      .csh-banner.warn { color: var(--dsw-alias-state-warn-primary); border-color: currentColor; }
      .csh-banner.update { border-color: var(--dsw-alias-state-business-primary); }
      .csh-update-line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; width: 100%; }
      .csh-update-line .csh-btn { margin-left: auto; }
      .csh-link { color: var(--dsw-alias-state-business-primary); font-size: 12px; text-decoration: none; }
      .csh-link:hover { text-decoration: underline; }
      .csh-warnings { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
      .csh-empty { padding: 26px 8px 30px; text-align: center; }
      .csh-empty-title { font-size: 14px; font-weight: 550; }
      .csh-empty-hint { margin-top: 6px; font-size: 12px; line-height: 1.55; color: var(--dsw-alias-label-secondary); }
      .csh-editor { margin-bottom: 14px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-2); }
      .csh-editor-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      .csh-editor-title { margin: 0; font-size: 14px; font-weight: 600; }
      .csh-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
      .csh-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .csh-field.wide { grid-column: 1 / -1; }
      .csh-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .csh-input { box-sizing: border-box; width: 100%; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; }
      .csh-input:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 0; border-color: transparent; }
      .csh-textarea { min-height: 72px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; }
      .csh-check-row { display: flex; align-items: center; gap: 10px; min-height: 34px; }
      .csh-section { margin-top: 18px; }
      .csh-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
      .csh-section-title { margin: 0; font-size: 13px; font-weight: 600; }
      .csh-status-card { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
      .csh-scroll { max-height: 260px; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; }
      .csh-scroll::-webkit-scrollbar { width: 8px; }
      .csh-scroll::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l2); border-radius: 4px; }
      .csh-settings { display: flex; flex-direction: column; gap: 14px; }
      .csh-setting-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .csh-path-row { display: flex; gap: 10px; align-items: baseline; font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-secondary); word-break: break-all; }
      .csh-path-row .csh-label { flex: none; min-width: 88px; }
      .csh-divider { border-top: 1px solid var(--dsw-alias-border-l1); margin: 2px 0; }
      .csh-row-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      @media (max-width: 720px) {
        .csh-wrap { padding: 20px 16px 56px; }
        .csh-head { flex-direction: column; }
        .csh-head-actions { justify-content: flex-start; }
        .csh-row { grid-template-columns: minmax(0, 1fr); }
        .csh-side { flex-direction: row; align-items: center; justify-content: space-between; min-width: 0; }
        .csh-side .csh-row-actions { justify-content: flex-end; }
        .csh-scroll { max-height: 220px; }
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

    function statusInfo(item) {
      if (item.shadowedBy) return { className: 'warn', label: tr('shadowed') }
      if (item.enabled !== true) return { className: 'warn', label: tr('disabled') }
      switch (item.status) {
        case 'ready': return { className: 'ready', label: `${tr('statusReady')} · ${item.toolCount} ${tr('tools')}` }
        case 'connecting': return { className: 'connecting', label: tr('statusConnecting') }
        case 'error': return { className: 'error', label: tr('statusError') }
        case 'configured': return { className: '', label: tr('configured') }
        default: return { className: '', label: item.pending ? tr('pending') : tr('statusOff') }
      }
    }

    function sourceBadge(source) {
      if (source?.type === 'ccswitch') return h(Badge, null, tr('sourceCcSwitch'))
      if (source?.type === 'harness') return h(Badge, { tone: 'info' }, tr('sourceHarness'))
      return h(Badge, null, tr('sourcePlugin'))
    }

    function McpEditor({ detail, busy, external, onSave, onCancel }) {
      const editing = detail !== undefined
      const [form, setForm] = React.useState(() => ({
        name: detail?.name ?? '',
        transport: detail?.transport ?? 'stdio',
        command: detail?.command ?? '',
        argsText: (detail?.args ?? []).join('\n'),
        envText: (detail?.envKeys ?? []).map((key) => `${key}=`).join('\n'),
        cwd: detail?.cwd ?? '',
        url: detail?.url ?? '',
        headersText: (detail?.headerKeys ?? []).map((key) => `${key}=`).join('\n'),
        toolCallTimeoutMs: String(detail?.toolCallTimeoutMs ?? 60000),
        enabled: detail?.enabled ?? true,
      }))
      const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
      const submit = () => {
        onSave({
          id: detail?.id,
          entryId: detail?.entryId,
          name: form.name,
          transport: form.transport,
          command: form.command,
          argsText: form.argsText,
          envText: form.envText,
          cwd: form.cwd,
          url: form.url,
          headersText: form.headersText,
          toolCallTimeoutMs: Number(form.toolCallTimeoutMs),
          enabled: form.enabled,
        })
      }
      return h('div', { className: 'csh-editor' },
        h('div', { className: 'csh-editor-head' },
          h('h2', { className: 'csh-editor-title' }, editing ? `${external ? tr('editHarness') : tr('edit')} · ${detail.name}` : tr('addMcp')),
          h('div', { className: 'csh-row-actions' },
            h('button', { type: 'button', className: 'csh-btn small', disabled: busy, onClick: onCancel }, tr('cancel')),
            h('button', { type: 'button', className: 'csh-btn primary small', disabled: busy, onClick: submit }, busy ? tr('saving') : tr('save')),
          ),
        ),
        h('div', { className: 'csh-form-grid' },
          h('div', { className: 'csh-field' },
            h('label', { className: 'csh-label' }, tr('mcpName')),
            h('input', { className: 'csh-input', value: form.name, onChange: set('name'), placeholder: 'github' }),
          ),
          h('div', { className: 'csh-field' },
            h('label', { className: 'csh-label' }, tr('transport')),
            h('select', { className: 'csh-input', value: form.transport, onChange: set('transport') },
              h('option', { value: 'stdio' }, tr('stdio')),
              h('option', { value: 'http' }, tr('http')),
            ),
          ),
          h('div', { className: 'csh-field' },
            h('label', { className: 'csh-label' }, tr('timeout')),
            h('input', { className: 'csh-input', type: 'number', min: 1000, max: 600000, step: 1000, value: form.toolCallTimeoutMs, onChange: set('toolCallTimeoutMs') }),
          ),
          external ? null : h('div', { className: 'csh-field' },
            h('label', { className: 'csh-label' }, tr('enabled')),
            h('div', { className: 'csh-check-row' },
              h(Switch, {
                checked: form.enabled,
                busy,
                title: form.enabled ? tr('enabled') : tr('disabled'),
                onChange: (next) => setForm((current) => ({ ...current, enabled: next })),
              }),
              h('span', { className: 'csh-note', style: { marginTop: 0 } }, form.enabled ? tr('enabled') : tr('disabled')),
            ),
          ),
          form.transport === 'stdio'
            ? h(React.Fragment, null,
                h('div', { className: 'csh-field' },
                  h('label', { className: 'csh-label' }, tr('command')),
                  h('input', { className: 'csh-input', value: form.command, onChange: set('command'), placeholder: 'npx' }),
                ),
                h('div', { className: 'csh-field' },
                  h('label', { className: 'csh-label' }, tr('cwd')),
                  h('input', { className: 'csh-input', value: form.cwd, onChange: set('cwd'), placeholder: '/path/to/project' }),
                ),
                h('div', { className: 'csh-field wide' },
                  h('label', { className: 'csh-label' }, tr('args')),
                  h('textarea', { className: 'csh-input csh-textarea', value: form.argsText, onChange: set('argsText'), placeholder: '-y\n@modelcontextprotocol/server-github' }),
                ),
                h('div', { className: 'csh-field wide' },
                  h('label', { className: 'csh-label' }, tr('env')),
                  h('textarea', { className: 'csh-input csh-textarea', value: form.envText, onChange: set('envText'), placeholder: 'GITHUB_TOKEN=' }),
                  h('div', { className: 'csh-note' }, tr('secretHint')),
                ),
              )
            : h(React.Fragment, null,
                h('div', { className: 'csh-field wide' },
                  h('label', { className: 'csh-label' }, tr('url')),
                  h('input', { className: 'csh-input', value: form.url, onChange: set('url'), placeholder: 'https://example.com/mcp' }),
                ),
                h('div', { className: 'csh-field wide' },
                  h('label', { className: 'csh-label' }, tr('headers')),
                  h('textarea', { className: 'csh-input csh-textarea', value: form.headersText, onChange: set('headersText'), placeholder: 'Authorization=Bearer ...' }),
                  h('div', { className: 'csh-note' }, tr('secretHint')),
                ),
              ),
        ),
      )
    }

    function McpRow({
      item,
      busy,
      confirmDelete,
      onToggle,
      onEdit,
      onDelete,
      onRetry,
      onConfirmDelete,
      onToggleHarness,
      onEditHarness,
    }) {
      const external = item.kind === 'harness'
      const shadowed = !external && typeof item.shadowedBy === 'string'
      const info = statusInfo(item)
      const envKeys = Array.isArray(item.envKeys) ? item.envKeys : []
      const headerKeys = Array.isArray(item.headerKeys) ? item.headerKeys : []
      const active = external ? item.enabled === true : item.enabled === true && item.master !== false && !shadowed
      return h('div', { className: `csh-row${active ? '' : ' is-off'}` },
        h('div', { className: 'csh-main' },
          h('div', { className: 'csh-name-line' },
            h('span', { className: 'csh-name' }, item.name),
            sourceBadge(item.source),
            item.transport !== undefined && item.transport !== 'unknown' ? h(Badge, null, item.transport) : null,
            shadowed ? h(Badge, { tone: 'warn' }, tr('shadowed')) : null,
          ),
          item.kind !== 'harness' && item.summary ? h('div', { className: 'csh-desc' }, item.summary) : null,
          h('div', { className: 'csh-meta' },
            h('span', { className: 'csh-code' }, `mcp__${item.serverName}__`),
            envKeys.length > 0 ? h('span', null, `${tr('envKeys')}: ${envKeys.join(', ')}`) : null,
            headerKeys.length > 0 ? h('span', null, `${tr('headerKeys')}: ${headerKeys.join(', ')}`) : null,
          ),
          shadowed ? h('div', { className: 'csh-note' }, `${tr('shadowedBy')} ${item.shadowedBy}`) : null,
          item.error && item.status === 'error' ? h('div', { className: 'csh-error' }, item.error) : null,
        ),
        h('div', { className: 'csh-side' },
          h('span', { className: `csh-status ${info.className}` }, h('span', { className: 'csh-dot' }), info.label),
          external
            ? h('div', { className: 'csh-row-actions' },
                item.manageable === true
                  ? h(React.Fragment, null,
                      item.editable === true
                        ? h('button', { type: 'button', className: 'csh-btn small', disabled: busy, onClick: () => onEditHarness(item) }, tr('edit'))
                        : null,
                      h(Switch, {
                        checked: item.enabled,
                        busy,
                        title: item.enabled ? tr('enabled') : tr('disabled'),
                        onChange: (next) => onToggleHarness(item, next),
                      }),
                    )
                  : h(Badge, null, tr('readOnly')),
              )
            : h('div', { className: 'csh-row-actions' },
                item.status === 'error' && item.enabled && item.master
                  ? h('button', { type: 'button', className: 'csh-btn small', disabled: busy, onClick: () => onRetry(item) }, tr('retry'))
                  : null,
                h('button', { type: 'button', className: 'csh-btn small', disabled: busy, onClick: () => onEdit(item) }, tr('edit')),
                h('button', {
                  type: 'button',
                  className: 'csh-btn small danger',
                  disabled: busy,
                  onClick: () => (confirmDelete ? onDelete(item) : onConfirmDelete(item)),
                }, confirmDelete ? tr('confirmDelete') : tr('delete')),
                h(Switch, {
                  checked: item.enabled,
                  busy,
                  disabled: shadowed,
                  title: shadowed ? tr('shadowedBy') : (item.enabled ? tr('enabled') : tr('disabled')),
                  onChange: (next) => onToggle(item, next),
                }),
              ),
        ),
      )
    }

    function SkillRow({ item, busy, confirmDelete, onToggle, onDelete, onConfirmDelete }) {
      return h('div', { className: `csh-row${item.enabled ? '' : ' is-off'}` },
        h('div', { className: 'csh-main' },
          h('div', { className: 'csh-name-line' },
            h('span', { className: 'csh-name' }, item.name),
            h(Badge, { tone: item.enabled ? 'ok' : undefined }, item.enabled ? tr('skillEnabled') : tr('skillDisabled')),
            h(Badge, null, item.kind === 'directory' ? 'SKILL.md' : '.md'),
          ),
          h('div', { className: 'csh-desc' }, item.description || tr('noDescription')),
          h('div', { className: 'csh-meta' }, h('span', { className: 'csh-code' }, item.path)),
        ),
        h('div', { className: 'csh-side' },
          h('div', { className: 'csh-row-actions' },
            h('button', {
              type: 'button',
              className: 'csh-btn small danger',
              disabled: busy,
              onClick: () => (confirmDelete ? onDelete(item) : onConfirmDelete(item)),
            }, confirmDelete ? tr('confirmDelete') : tr('delete')),
            h(Switch, {
              checked: item.enabled,
              busy,
              title: tr('toggleSkill'),
              onChange: (next) => onToggle(item, next),
            }),
          ),
        ),
      )
    }

    function EmptyState({ searching, title, hint }) {
      return h('div', { className: 'csh-empty' },
        h('div', { className: 'csh-empty-title' }, searching ? tr('emptySearch') : title),
        searching ? null : h('div', { className: 'csh-empty-hint' }, hint),
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
      const [notice, setNotice] = React.useState('')
      const [loading, setLoading] = React.useState(true)
      const [busy, setBusy] = React.useState('')
      const [tab, setTab] = React.useState('mcp')
      const [query, setQuery] = React.useState('')
      const [editor, setEditor] = React.useState(null)
      const [confirmMcp, setConfirmMcp] = React.useState('')
      const [confirmSkill, setConfirmSkill] = React.useState('')
      const [importPayload, setImportPayload] = React.useState(null)
      const [importLoading, setImportLoading] = React.useState(false)
      const [importError, setImportError] = React.useState('')
      const [ccSwitchDir, setCcSwitchDir] = React.useState('')
      const [configNote, setConfigNote] = React.useState('')
      const [updateInfo, setUpdateInfo] = React.useState(null)
      const [updateChecking, setUpdateChecking] = React.useState(false)
      const [updateBusy, setUpdateBusy] = React.useState(false)
      const [updateError, setUpdateError] = React.useState('')
      const [updateNote, setUpdateNote] = React.useState('')
      const snapshotRef = React.useRef(null)
      const configInit = React.useRef(false)
      const refreshTimer = React.useRef(null)
      const updateTimer = React.useRef(null)

      React.useEffect(() => () => {
        clearTimeout(refreshTimer.current)
        clearTimeout(updateTimer.current)
      }, [])

      const scheduleRefresh = () => {
        clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(() => { void load() }, 2200)
      }

      const applySnapshot = (payload) => {
        snapshotRef.current = payload
        setSnapshot(payload)
        if (!configInit.current) {
          setCcSwitchDir(payload.config?.ccSwitchDir ?? '')
          configInit.current = true
        }
      }

      const load = React.useCallback(async () => {
        if (snapshotRef.current === null) setLoading(true)
        try {
          const payload = await requestJson(`${API}/state`)
          applySnapshot(payload)
          setLoadError('')
          if (payload.mcp.items.some((item) => item.status === 'connecting' || item.pending)) scheduleRefresh()
        } catch (error) {
          setLoadError(errorText(error))
        } finally {
          setLoading(false)
        }
      }, [])

      React.useEffect(() => { void load() }, [load])

      const loadUpdate = async (force, manual) => {
        setUpdateChecking(true)
        if (manual) {
          setUpdateError('')
          setUpdateNote('')
        }
        try {
          const payload = await requestJson(`${API}/update${force ? '?refresh=1' : ''}`)
          setUpdateInfo(payload)
          if (manual && payload.ok !== true) setUpdateError(payload.error ?? tr('updateFailed'))
          if (manual && payload.ok === true && payload.updateAvailable !== true) setUpdateNote(`${tr('upToDate')} · v${payload.current}`)
        } catch (error) {
          if (manual) setUpdateError(errorText(error))
        } finally {
          setUpdateChecking(false)
        }
      }

      React.useEffect(() => { void loadUpdate(false, false) }, [])

      const runUpdate = async () => {
        setUpdateBusy(true)
        setUpdateError('')
        setUpdateNote('')
        try {
          const payload = await requestJson(`${API}/update`, { method: 'POST', body: '{}' })
          if (payload.ok !== true) throw new Error(payload.result?.error ?? payload.error ?? tr('updateFailed'))
          const application = payload.result?.application
          const installed = payload.result?.installedVersion ?? payload.result?.version
          const reloadRequired = payload.result?.reloadRequired === true || application === 'restart-required'
          if (!reloadRequired) {
            if (application === 'overridden') {
              setUpdateNote(tr('updateOverridden'))
            } else if (application === 'cancelled') {
              throw new Error(tr('updateCancelled'))
            } else {
              setUpdateNote(`${tr('updateApplied')}${installed ? ` (v${installed})` : ''}`)
            }
          }
          setUpdateInfo((current) => current === null ? current : {
            ...current,
            updateAvailable: false,
            restartRequired: reloadRequired,
            installed: installed ?? current.installed,
            latest: installed ?? current.latest,
          })
          if (application === 'applied' && !reloadRequired) {
            clearTimeout(updateTimer.current)
            updateTimer.current = setTimeout(() => { void load() }, 1200)
          }
        } catch (error) {
          setUpdateError(errorText(error))
        } finally {
          setUpdateBusy(false)
        }
      }

      const loadImport = async () => {
        setImportLoading(true)
        setImportError('')
        try {
          setImportPayload(await requestJson(`${API}/ccswitch`))
        } catch (error) {
          setImportError(errorText(error))
        } finally {
          setImportLoading(false)
        }
      }

      const act = async (url, body, key) => {
        setBusy(key)
        setActionError('')
        setNotice('')
        try {
          const payload = await requestJson(url, { method: 'POST', body: JSON.stringify(body) })
          applySnapshot(payload)
          if (payload.mcp?.items?.some((item) => item.status === 'connecting' || item.pending)) scheduleRefresh()
          return payload
        } catch (error) {
          setActionError(errorText(error))
          return null
        } finally {
          setBusy('')
        }
      }

      const switchTab = (next) => {
        setTab(next)
        setQuery('')
        setEditor(null)
        setConfirmMcp('')
        setConfirmSkill('')
        if (next === 'import' && importPayload === null && !importLoading) void loadImport()
      }

      const openNew = () => { setEditor({ mode: 'new', detail: undefined }); setActionError('') }
      const openEdit = async (item) => {
        setBusy(`detail:${item.id}`)
        setActionError('')
        try {
          const payload = await requestJson(`${API}/mcp-detail?id=${encodeURIComponent(item.id)}`)
          setEditor({ mode: 'edit', detail: payload.item })
        } catch (error) {
          setActionError(errorText(error))
        } finally {
          setBusy('')
        }
      }
      const openHarnessEdit = async (server) => {
        if (typeof server.entryId !== 'string') return
        setBusy(`harness:${server.entryId}`)
        setActionError('')
        try {
          const payload = await requestJson(`${API}/harness-mcp-detail?entryId=${encodeURIComponent(server.entryId)}`)
          setEditor({ mode: 'edit', target: 'harness', detail: payload.item })
        } catch (error) {
          setActionError(errorText(error))
        } finally {
          setBusy('')
        }
      }
      const saveMcp = async (form) => {
        const target = editor?.target === 'harness' ? 'harness' : 'native'
        const payload = await act(target === 'harness' ? `${API}/harness-mcp-save` : `${API}/mcp-save`, form, 'editor')
        if (payload !== null) setEditor(null)
      }
      const toggleMcp = (item, enabled) => { void act(`${API}/mcp-toggle`, { id: item.id, enabled }, `mcp:${item.id}`) }
      const toggleHarnessMcp = (server, enabled) => {
        if (typeof server.entryId !== 'string') return
        void act(`${API}/harness-mcp-toggle`, { entryId: server.entryId, enabled }, `harness:${server.entryId}`)
      }
      const deleteMcp = async (item) => {
        const payload = await act(`${API}/mcp-delete`, { id: item.id }, `mcp:${item.id}`)
        if (payload !== null) { setConfirmMcp(''); setNotice(tr('mcpDeleted')) }
      }
      const retryMcp = (item) => { void act(`${API}/mcp-retry`, { id: item.id }, `mcp:${item.id}`) }
      const toggleSkill = (item, enabled) => { void act(`${API}/skills-toggle`, { name: item.name, enabled }, `skill:${item.name}`) }
      const deleteSkill = async (item) => {
        const payload = await act(`${API}/skills-delete`, { name: item.name }, `skill:${item.name}`)
        if (payload !== null) { setConfirmSkill(''); setNotice(tr('skillDeleted')) }
      }

      const importOne = async (kind, value) => {
        const payload = kind === 'mcp'
          ? await act(`${API}/import-mcp`, { id: value }, `import:${value}`)
          : await act(`${API}/import-skill`, { name: value }, `import:${value}`)
        if (payload !== null) {
          setNotice(tr('importSuccess'))
          await loadImport()
        }
      }
      const importAll = async (kind) => {
        const payload = await act(`${API}/import-all`, { kind }, `import-all:${kind}`)
        if (payload !== null) {
          setNotice(`${tr('importSuccess')}${payload.imported ? ` (${payload.imported})` : ''}`)
          if (payload.errors?.length) setActionError(`${tr('importAllErrors')}: ${payload.errors.join('; ')}`)
          await loadImport()
        }
      }

      const saveConfig = async () => {
        const payload = await act(`${API}/config`, { ccSwitchDir: ccSwitchDir.trim() }, 'config')
        if (payload !== null) {
          setConfigNote(tr('savedConfig'))
          await loadImport()
        }
      }

      if (loading && snapshot === null) {
        return h('div', { className: 'csh-page' }, h('style', { 'data-plugin': NS }, CSS),
          h('div', { className: 'csh-wrap' }, h('div', { className: 'csh-banner' }, tr('refreshing'))))
      }
      if (snapshot === null) {
        return h('div', { className: 'csh-page' }, h('style', { 'data-plugin': NS }, CSS),
          h('div', { className: 'csh-wrap' },
            h('div', { className: 'csh-banner error' }, `${tr('loadFailed')}: ${loadError}`),
            h('button', { type: 'button', className: 'csh-btn', onClick: () => void load() }, tr('retryLoad')),
          ))
      }

      const nativeMcp = snapshot.mcp.items.map((item) => ({ ...item, kind: 'native' }))
      const harnessMcp = snapshot.mcp.harness ?? []
      const harnessRows = harnessMcp.map((server) => ({
        kind: 'harness',
        id: `harness:${server.entryId ?? server.serverName}`,
        name: server.serverName,
        transport: server.transport,
        summary: server.summary,
        enabled: server.enabled !== false,
        master: true,
        status: server.enabled === false ? 'off' : (server.toolCount > 0 ? 'ready' : 'configured'),
        toolCount: server.toolCount ?? 0,
        error: undefined,
        serverName: server.serverName,
        envKeys: server.envKeys ?? [],
        headerKeys: server.headerKeys ?? [],
        source: { type: 'harness', id: server.entryId, name: server.serverName },
        shadowedBy: undefined,
        pending: false,
        entryId: server.entryId,
        manageable: server.manageable === true,
        editable: server.editable === true,
      }))
      const skillItems = snapshot.skills.items
      const allMcp = [...nativeMcp, ...harnessRows].sort((left, right) => left.name.localeCompare(right.name))
      const needle = query.trim().toLowerCase()
      const filteredMcp = needle === ''
        ? allMcp
        : allMcp.filter((item) => `${item.name} ${item.summary ?? ''} ${item.serverName}`.toLowerCase().includes(needle))
      const filteredSkills = needle === '' ? skillItems : skillItems.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(needle))
      const enabledMcp = allMcp.filter((item) => item.enabled === true && typeof item.shadowedBy !== 'string' && (item.kind === 'harness' || item.master !== false)).length
      const enabledSkills = skillItems.filter((item) => item.enabled).length
      const warnings = snapshot.warnings ?? []

      return h('div', { className: 'csh-page' }, h('style', { 'data-plugin': NS }, CSS),
        h('div', { className: 'csh-wrap' },
          h('div', { className: 'csh-head' },
            h('div', null,
              h('h1', { className: 'csh-title' }, tr('title')),
              h('p', { className: 'csh-sub' }, tr('subtitle')),
            ),
            h('div', { className: 'csh-head-actions' },
              h(Badge, { tone: 'ok' }, `${tr('countMcp')} ${allMcp.length} · ${tr('countSkills')} ${skillItems.length}`),
              updateInfo?.updateAvailable
                ? h('button', {
                    type: 'button',
                    className: 'csh-btn primary',
                    disabled: updateBusy || updateInfo.installable === false,
                    onClick: () => void runUpdate(),
                  }, updateBusy ? tr('updating') : `${tr('updateTo')} v${updateInfo.latest}`)
                : updateInfo?.restartRequired
                  ? h(Badge, { tone: 'warn' }, `${tr('restartRequired')} · v${updateInfo.installed ?? updateInfo.latest}`)
                  : h('button', {
                      type: 'button',
                      className: 'csh-btn',
                      disabled: updateChecking,
                      onClick: () => void loadUpdate(true, true),
                    }, updateChecking ? tr('checkingUpdate') : (updateInfo?.ok === true ? `${tr('upToDate')} · v${updateInfo.current}` : tr('checkUpdate'))),
              h('button', { type: 'button', className: 'csh-btn', onClick: () => { void load(); if (tab === 'import') void loadImport() } }, tr('refresh')),
            ),
          ),

          warnings.length > 0 ? h('div', { className: 'csh-card' },
            h('div', { className: 'csh-master-note', style: { marginBottom: 6 } }, tr('warnings')),
            h('ul', { className: 'csh-warnings' }, warnings.map((warning, index) => h('li', { key: index }, warning))),
          ) : null,

          updateInfo?.updateAvailable ? h('div', { className: 'csh-banner update' },
            h('div', { className: 'csh-update-line' },
              h('strong', null, `${tr('newVersion')} v${updateInfo.latest}`),
              h('span', { className: 'csh-note', style: { marginTop: 0 } }, `${tr('currentVersion')} v${updateInfo.current}`),
              updateInfo.release?.url ? h('a', {
                className: 'csh-link',
                href: updateInfo.release.url,
                target: '_blank',
                rel: 'noreferrer',
              }, tr('releaseNotes')) : null,
              updateInfo.installable === false
                ? h('span', { className: 'csh-note', style: { marginTop: 0 } }, tr('updateUnsupported'))
                : h('button', {
                    type: 'button',
                    className: 'csh-btn primary small',
                    disabled: updateBusy,
                    onClick: () => void runUpdate(),
                  }, updateBusy ? tr('updating') : `${tr('updateTo')} v${updateInfo.latest}`),
            ),
          ) : updateInfo?.restartRequired ? h('div', { className: 'csh-banner warn' },
            h('div', { className: 'csh-update-line' },
              h('strong', null, tr('restartRequired')),
              h('span', { className: 'csh-note', style: { marginTop: 0 } }, `${tr('installedVersion')} v${updateInfo.installed ?? updateInfo.latest} · ${tr('currentVersion')} v${updateInfo.current}`),
              h('span', { className: 'csh-note', style: { marginTop: 0 } }, tr('restartHint')),
            ),
          ) : null,
          updateError !== '' ? h('div', { className: 'csh-banner error' }, `${tr('updateFailed')}: ${updateError}`) : null,
          updateNote !== '' ? h('div', { className: 'csh-banner' }, updateNote) : null,

          actionError !== '' ? h('div', { className: 'csh-banner error' }, `${tr('actionFailed')}: ${actionError}`) : null,
          notice !== '' ? h('div', { className: 'csh-banner' }, notice) : null,
          loadError !== '' ? h('div', { className: 'csh-banner warn' }, `${tr('loadFailed')}: ${loadError}`) : null,

          h('div', { className: 'csh-tabs', role: 'tablist' },
            h('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'mcp', className: `csh-tab${tab === 'mcp' ? ' active' : ''}`, onClick: () => switchTab('mcp') }, `${tr('tabMcp')} · ${allMcp.length}`),
            h('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'skills', className: `csh-tab${tab === 'skills' ? ' active' : ''}`, onClick: () => switchTab('skills') }, `${tr('tabSkills')} · ${skillItems.length}`),
            h('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'import', className: `csh-tab${tab === 'import' ? ' active' : ''}`, onClick: () => switchTab('import') }, tr('tabImport')),
            h('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'advanced', className: `csh-tab${tab === 'advanced' ? ' active' : ''}`, onClick: () => switchTab('advanced') }, tr('tabAdvanced')),
          ),

          tab === 'mcp' ? h('div', { className: 'csh-card' },
            h('div', { className: 'csh-toolbar' },
              h('button', { type: 'button', className: 'csh-btn primary', onClick: openNew }, tr('addMcp')),
              h('input', { className: 'csh-search', type: 'search', value: query, placeholder: tr('searchMcp'), 'aria-label': tr('searchMcp'), onChange: (event) => setQuery(event.target.value) }),
              h('span', { className: 'csh-master-note' }, `${enabledMcp} ${tr('enabledCount')}`),
            ),
            !snapshot.mcp.master ? h('div', { className: 'csh-banner warn' }, tr('masterOff')) : null,
            editor !== null ? h(McpEditor, {
              key: editor.mode === 'edit' ? `edit:${editor.target ?? 'native'}:${editor.detail?.entryId ?? editor.detail?.id}` : 'new',
              detail: editor.detail,
              external: editor.target === 'harness',
              busy: busy === 'editor',
              onSave: (form) => void saveMcp(form),
              onCancel: () => setEditor(null),
            }) : null,
            h('div', { className: 'csh-list' },
              filteredMcp.length === 0
                ? h(EmptyState, { searching: needle !== '', title: tr('emptyMcp'), hint: tr('emptyMcpHint') })
                : filteredMcp.map((item) => h(McpRow, {
                    key: item.id,
                    item,
                    busy: item.kind === 'harness'
                      ? busy === `harness:${item.entryId}`
                      : busy === `mcp:${item.id}` || busy === `detail:${item.id}`,
                    confirmDelete: item.kind !== 'harness' && confirmMcp === item.id,
                    onToggle: toggleMcp,
                    onEdit: (row) => void openEdit(row),
                    onDelete: (row) => void deleteMcp(row),
                    onRetry: retryMcp,
                    onConfirmDelete: (row) => setConfirmMcp(row.id),
                    onToggleHarness: toggleHarnessMcp,
                    onEditHarness: (row) => void openHarnessEdit(row),
                  })),
            ),
          ) : null,

          tab === 'skills' ? h('div', { className: 'csh-card' },
            h('div', { className: 'csh-toolbar' },
              h('input', { className: 'csh-search', type: 'search', value: query, placeholder: tr('searchSkills'), 'aria-label': tr('searchSkills'), onChange: (event) => setQuery(event.target.value) }),
              h('span', { className: 'csh-master-note' }, `${enabledSkills} ${tr('enabledCount')}`),
              h('button', { type: 'button', className: 'csh-btn', onClick: () => switchTab('import') }, tr('tabImport')),
            ),
            h('div', { className: 'csh-list' },
              filteredSkills.length === 0
                ? h(EmptyState, { searching: needle !== '', title: tr('emptySkills'), hint: tr('emptySkillsHint') })
                : filteredSkills.map((item) => h(SkillRow, {
                    key: item.name,
                    item,
                    busy: busy === `skill:${item.name}`,
                    confirmDelete: confirmSkill === item.name,
                    onToggle: toggleSkill,
                    onDelete: (row) => void deleteSkill(row),
                    onConfirmDelete: (row) => setConfirmSkill(row.name),
                  })),
            ),
          ) : null,

          tab === 'import' ? h('div', null,
            h('div', { className: 'csh-card' },
              h('div', { className: 'csh-section-head' },
                h('div', null,
                  h('h2', { className: 'csh-section-title' }, tr('importTitle')),
                ),
                h('button', { type: 'button', className: 'csh-btn small', disabled: importLoading, onClick: () => void loadImport() }, importLoading ? tr('refreshing') : tr('importRefresh')),
              ),
              importError !== '' ? h('div', { className: 'csh-banner error' }, `${tr('actionFailed')}: ${importError}`) : null,
              importPayload === null && importLoading ? h('div', { className: 'csh-banner' }, tr('refreshing')) : null,
              importPayload === null && !importLoading ? h('div', { className: 'csh-banner warn' }, tr('importHint')) : null,
              importPayload !== null ? h('div', null,
                h('div', { className: 'csh-status-card' },
                  h(Badge, { tone: importPayload.status.dbExists ? 'ok' : 'warn' }, importPayload.status.dbExists ? tr('dbFound') : tr('dbMissing')),
                  h(Badge, { tone: importPayload.status.skillsExists ? 'ok' : 'warn' }, importPayload.status.skillsExists ? tr('skillsFound') : tr('skillsMissing')),
                ),
                importPayload.status.mcpError ? h('div', { className: 'csh-error' }, importPayload.status.mcpError) : null,
                h('div', { className: 'csh-section' },
                  h('div', { className: 'csh-section-head' },
                    h('h3', { className: 'csh-section-title' }, tr('importMcpTitle')),
                    h('button', { type: 'button', className: 'csh-btn small', disabled: busy === 'import-all:mcp', onClick: () => void importAll('mcp') }, tr('importAll')),
                  ),
                  importPayload.mcp.length === 0
                    ? h('div', { className: 'csh-note' }, tr('importEmpty'))
                    : h('div', { className: 'csh-list csh-scroll' }, importPayload.mcp.map((item) => h('div', { key: item.id, className: 'csh-row' },
                        h('div', { className: 'csh-main' },
                          h('div', { className: 'csh-name-line' },
                            h('span', { className: 'csh-name' }, item.name),
                            h(Badge, null, item.transport),
                            item.unsupported ? h(Badge, { tone: 'warn' }, tr('importUnsupported')) : null,
                            item.imported ? h(Badge, { tone: 'ok' }, tr('imported')) : null,
                            item.external ? h(Badge, { tone: 'warn' }, tr('harnessMcpImport')) : null,
                            item.conflict && !item.external ? h(Badge, { tone: 'warn' }, tr('importConflict')) : null,
                          ),
                          h('div', { className: 'csh-desc' }, item.description || item.summary),
                          h('div', { className: 'csh-meta' }, h('span', { className: 'csh-code' }, item.summary)),
                        ),
                        h('div', { className: 'csh-side' },
                          h('button', {
                            type: 'button',
                            className: 'csh-btn small',
                            disabled: busy === `import:${item.id}` || item.imported || item.conflict || Boolean(item.unsupported),
                            onClick: () => void importOne('mcp', item.id),
                          }, item.imported ? tr('imported') : item.external ? tr('harnessMcpImport') : tr('importOne')),
                        ),
                      ))),
                ),
                h('div', { className: 'csh-section' },
                  h('div', { className: 'csh-section-head' },
                    h('h3', { className: 'csh-section-title' }, tr('importSkillsTitle')),
                    h('button', { type: 'button', className: 'csh-btn small', disabled: busy === 'import-all:skill', onClick: () => void importAll('skill') }, tr('importAll')),
                  ),
                  importPayload.skills.length === 0
                    ? h('div', { className: 'csh-note' }, tr('importEmpty'))
                    : h('div', { className: 'csh-list csh-scroll' }, importPayload.skills.map((item) => h('div', { key: item.name, className: 'csh-row' },
                        h('div', { className: 'csh-main' },
                          h('div', { className: 'csh-name-line' },
                            h('span', { className: 'csh-name' }, item.name),
                            item.installed ? h(Badge, { tone: 'ok' }, tr('importInstalled')) : null,
                          ),
                          h('div', { className: 'csh-desc' }, item.description || tr('noDescription')),
                        ),
                        h('div', { className: 'csh-side' },
                          h('button', {
                            type: 'button',
                            className: 'csh-btn small',
                            disabled: busy === `import:${item.name}` || item.installed,
                            onClick: () => void importOne('skill', item.name),
                          }, item.installed ? tr('importInstalled') : tr('importOne')),
                        ),
                      ))),
                ),
                importPayload.warnings?.length > 0 ? h('div', { className: 'csh-section' },
                  h('div', { className: 'csh-section-title' }, tr('warnings')),
                  h('ul', { className: 'csh-warnings' }, importPayload.warnings.map((warning, index) => h('li', { key: index }, warning))),
                ) : null,
              ) : null,
            ),
          ) : null,

          tab === 'advanced' ? h('div', { className: 'csh-card' },
            h('div', { className: 'csh-section-head' },
              h('h2', { className: 'csh-section-title' }, tr('settingsTitle')),
              h('span', { className: 'csh-master-note' }, `${tr('versionLabel')} v${snapshot.pluginVersion ?? ''}`),
            ),
            h('div', { className: 'csh-settings' },
              h('div', { className: 'csh-field' },
                h('label', { className: 'csh-label' }, tr('ccSwitchDir')),
                h('div', { className: 'csh-check-row', style: { alignItems: 'stretch' } },
                  h('input', { className: 'csh-input', value: ccSwitchDir, placeholder: snapshot.paths.ccSwitchDir, onChange: (event) => setCcSwitchDir(event.target.value) }),
                  h('button', { type: 'button', className: 'csh-btn primary small', disabled: busy === 'config', onClick: () => void saveConfig() }, busy === 'config' ? tr('saving') : tr('saveConfig')),
                ),
                h('div', { className: 'csh-note' }, tr('ccSwitchDirHint')),
                configNote !== '' ? h('div', { className: 'csh-note' }, configNote) : null,
              ),
              h('div', { className: 'csh-divider' }),
              h('div', { className: 'csh-setting-row' },
                h('div', { className: 'csh-master-name' }, tr('masterMcp')),
                h(Switch, {
                  checked: snapshot.mcp.master,
                  busy: busy === 'master',
                  title: tr('masterMcp'),
                  onChange: (enabled) => void act(`${API}/mcp-master`, { enabled }, 'master'),
                }),
              ),
              h('div', { className: 'csh-divider' }),
              h('div', { className: 'csh-path-row' },
                h('span', { className: 'csh-label' }, tr('skillsDir')),
                h('span', { className: 'csh-code' }, snapshot.paths.skillsDir),
              ),
              h('div', { className: 'csh-path-row' },
                h('span', { className: 'csh-label' }, tr('stateFile')),
                h('span', { className: 'csh-code' }, snapshot.stateFile),
              ),
            ),
          ) : null,
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'ccswitch-hub:dictionaries')
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
