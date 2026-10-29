# MCP 与技能

DeepSeek Harness 的 **原生 MCP 服务器与技能管理器**：

- 在面板里新增、编辑、删除、启停 Harness 自己的 MCP 服务器；
- 管理 `$DSH_HOME/skills` 下的原生技能，支持启停和删除（可恢复）；
- 额外提供 **从 CC Switch 导入**：只读取 CC Switch 的 MCP 与技能，导入后复制为 Harness 的独立条目。

> CC Switch 只是可选的导入来源，不是本插件的主要功能。本插件不会读取 Claude Code、Codex 或 Gemini CLI 的 MCP/技能。

## 安装（无需 npm）

直接从 GitHub 安装（推荐）：

```sh
dsh plugin --profile web add https://github.com/RedCarl/dsh-ccswitch-hub
```

也可以在 DSH 的「设置 → 插件」中粘贴这个 GitHub 地址；安装后刷新页面。

离线或锁定版本时，从 [GitHub Releases](https://github.com/RedCarl/dsh-ccswitch-hub/releases) 下载 `*.tgz`，在安装框中粘贴本地绝对路径。

> 不需要 npmjs 账号；本插件通过 GitHub 仓库和 GitHub Release 分发。

## 自动检查更新

页面右上角会显示 **检查更新** 按钮：

- 打开页面时自动检查一次 GitHub Release，5 分钟内复用结果；
- 有新版本时显示版本号和 Release 链接，可 **一键更新**；
- 更新通过 Host 的插件管理器安装 Release 包；Host 端新版本需要重启 Harness 后生效；
- 如果更新包已安装但 Host 仍运行旧版本，页面会显示“需要重启 Harness”，不会重复安装或报 `already-installed`；
- 如果当前 Host 没有插件管理器（例如 TUI），会提示在终端手动安装。

更新只针对本仓库的 GitHub 发布：

```sh
dsh plugin --profile web add https://github.com/RedCarl/dsh-ccswitch-hub
```

## 打开方式

安装后刷新 Web 页面，点击左侧栏的 **MCP 技能** 图标。页面有三个标签：

### MCP 服务器

- **新增 / 编辑 / 删除**：配置名称、传输方式（stdio 或 HTTP）、命令、参数、环境变量、工作目录或 URL、请求头、调用超时。
- **总开关 + 逐项开关**：关闭总开关会断开所有 MCP，但保留每个服务器的启用选择。
- 启用的服务器通过 DSH 自带的 `@deepseek-ai/dsh-mcp-client` 动态挂载，工具名形如 `mcp__<server>__<tool>`。
- 支持连接失败重试；状态、工具数量、错误会直接显示在行内。
- 环境变量/请求头的值只保存在 Host（`state.json`，权限 `0600`），列表和编辑接口不会回显已保存的值；编辑时留空表示保留，删除整行表示移除。

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

推送 `v*` 标签会触发 GitHub Actions：`npm pack` 生成 `.tgz` 并上传到对应的 GitHub Release。发布新版本时先更新 `package.json` 的 `version`，提交后：

```bash
git tag v2.1.3
git push origin v2.1.3
```
