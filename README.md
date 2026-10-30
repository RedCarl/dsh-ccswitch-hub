# MCP 与技能

DeepSeek Harness 的 **原生 MCP 服务器与技能管理器**：

- 在面板里新增、编辑、删除、启停 Harness 自己的 MCP 服务器；
- 管理 `$DSH_HOME/skills` 下的原生技能，支持启停和删除（可恢复）；
- 额外提供 **从 CC Switch 导入**：只读取 CC Switch 的 MCP 与技能，导入后复制为 Harness 的独立条目。

> CC Switch 只是可选的导入来源，不是本插件的主要功能。本插件不会读取 Claude Code、Codex 或 Gemini CLI 的 MCP/技能。

## 安装

从私有 npm 源安装（推荐）：

```sh
dsh plugin --profile web add @local/dsh-ccswitch-hub@latest
```

profile 需要认识 `@local` scope（`dsh-registry enable --profile web` 会写入
`@local:registry=https://npm.carljoy.cn/`）。也可以直接在
[npm.carljoy.cn](https://npm.carljoy.cn/) 的 Web 界面下载 tgz 离线安装。

## 自动检查更新

页面右上角会显示 **检查更新** 按钮：

- 打开页面时自动检查一次私有源里的 `dist-tags.latest`，10 分钟内复用结果；
- 有新版本时显示版本号和私有源页面链接，可 **一键更新**；
- 更新通过 Host 的插件管理器安装 registry 上的同一版本；HMR 拒绝覆盖已安装包时回退到该版本的 registry tarball；
- Host 端新版本需要重启 Harness 后生效；如果更新包已安装但 Host 仍运行旧版本，页面会显示“需要重启 Harness”；
- 如果当前 Host 没有插件管理器（例如 TUI），会提示在终端手动安装。

手动升级：

```sh
dsh plugin --profile web add @local/dsh-ccswitch-hub@latest
```

## 打开方式

安装后刷新 Web 页面，点击左侧栏的 **MCP 技能** 图标。页面有四个标签：

### MCP 服务器

- **统一列表**：Harness 已有、插件新增和 CC Switch 导入的 MCP 显示在同一张列表里，用 `Harness` / `插件` / `CC Switch` 小标签区分来源。
- **新增 / 编辑 / 删除**：配置名称、传输方式（stdio 或 HTTP）、命令、参数、环境变量、工作目录或 URL、请求头、调用超时。Harness profile 条目可以直接启停和编辑；插件新增/导入条目支持删除；预设或工具注册表发现的条目只读。
- **逐项开关**：每个 MCP 独立启停；插件内置 MCP 的总开关移到「高级」标签，不影响 Harness 已有条目。
- 启用的服务器通过 DSH 自带的 `@deepseek-ai/dsh-mcp-client` 动态挂载；运行时 serverName 使用 `csh-<名称>-<短哈希>`，工具名形如 `mcp__csh-...__<tool>`，避免与 `cordis.yml` 里已有的 MCP 冲突。
- 面板会识别由 profile 配置、agent 预设或当前工具注册表启动的 MCP，并把它们并入同一个 MCP 列表。profile 条目可直接启停、编辑（写入 `cordis.patch.yml`）；同名导入条目会标记为「已跳过」，不会重复启动。
- 支持连接失败重试；状态、工具数量、错误会直接显示在行内。
- 插件新增/导入的敏感值保存在 Host 的 `state.json`（权限 `0600`）；Harness 已有条目的值留在 profile 配置。列表和编辑接口只回显键名，不回显已保存的值；编辑时留空表示保留，删除整行表示移除。

### 技能

- 管理 `$DSH_HOME/skills` 下的技能（目录形式的 `SKILL.md`，或单个 `.md` 文件）。
- **启用/停用**：停用会把技能移到 `$DSH_HOME/ccswitch-hub/disabled-skills/`，启用时移回；Harness 的代理预设只扫描 `$DSH_HOME/skills`，所以切换会真正生效。
- **删除**：移动到 `$DSH_HOME/ccswitch-hub/trash/skills/`，不会立即永久删除。
- 共享目录 `~/.agents/skills` 和项目级技能不在此面板管理，仍由 Harness 自身发现。

### 从 CC Switch 导入

- 只读取 `~/.cc-switch/cc-switch.db` 的 `mcp_servers` 表和 `~/.cc-switch/skills/`。
- **导入 MCP**：复制为 Harness 的原生 MCP 条目，默认关闭；导入后可以单独编辑、启停、删除，不再依赖 CC Switch。
- **导入技能**：复制到 `$DSH_HOME/skills/`，成为独立副本。
- 同名条目会显示冲突并拒绝覆盖；SSE 服务器会标记为 Harness 不支持。
- 数据库和技能目录只读，不会修改 CC Switch 的数据。

## 数据与路径

| 内容 | 路径 |
|---|---|
| 原生 MCP 定义（含环境变量/请求头） | `$DSH_HOME/ccswitch-hub/state.json` |
| 原生技能 | `$DSH_HOME/skills` |
| 停用的技能 | `$DSH_HOME/ccswitch-hub/disabled-skills` |
| 删除的技能（回收） | `$DSH_HOME/ccswitch-hub/trash/skills` |
| CC Switch 导入来源 | `~/.cc-switch`（可在「高级」中修改） |

状态文件权限为 `0600`。浏览器只拿到环境变量/请求头的键名，不包含值；MCP 参数会在编辑时回显，因此不要把密钥放在参数里，优先使用环境变量或请求头。

## 已知限制

- **SSE**：Harness 的 MCP 桥接不支持 SSE，CC Switch 中的 SSE 服务器会显示但不能导入。
- **技能启停依赖目录移动**：不要在其他地方同时移动 `$DSH_HOME/skills` 中的条目，否则面板状态会以实际目录为准。
- **导入是复制**：CC Switch 后续更新不会自动同步；需要时重新导入（同名默认拒绝覆盖）。
- **CC Switch 技能存储位置**：导入页默认读取 `~/.cc-switch/skills`；如果 CC Switch 使用 `~/.agents/skills` 作为存储位置，本插件不会自动发现这些技能。
- **作用范围**：MCP 开关是当前 profile 全局生效；技能目录属于当前 `DSH_HOME`。
- **远程 MCP 鉴权**：只传递你填写的 env/headers，不处理 OAuth 登录流程。

## 开发

无第三方依赖，使用 Node 内置模块：

```bash
node --check index.js client.js lib/*.js
node --test
```

## 发布

现在插件检查更新读取私有源 `npm.carljoy.cn`，GitHub Release 只作为归档。发布新版本时运行
`node ../dsh-registry/bin/dsh-registry.mjs publish . --bump patch --deploy`，会同时刷新市场索引。

推送 `v*` 标签会触发 GitHub Actions：`npm pack` 生成 `.tgz` 并上传到对应的 GitHub Release。发布新版本时先更新 `package.json` 的 `version`，提交后：

```bash
git tag v2.2.1
git push origin v2.2.1
```
