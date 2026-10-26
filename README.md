# MCP 与技能

DeepSeek Harness 的 **MCP 服务器与技能管理器**：把本机各工具里的 MCP 定义和技能目录聚合到一个页面，按需接入当前 Harness。

> 兼容 [CC Switch](https://github.com/farion1231/cc-switch)，但 CC Switch 只是一个可选来源，不是本插件的唯一用途。

## 核心能力

- **统一发现**：同时读取 CC Switch、Claude Code、Codex、Gemini CLI 的 MCP 配置和技能目录。
- **统一开关**：MCP 与技能各有一个总开关，每个条目还有独立开关；关闭总开关不会丢失逐项选择。
- **运行时接入**：
  - 启用的 MCP 通过 DSH 自带的 `@deepseek-ai/dsh-mcp-client` 动态挂载，工具名形如 `mcp__<server>__<tool>`。
  - 启用的技能注册为 `ctx.skills` 提供方，下一次模型步骤进入技能目录。
- **持久化**：选择保存在 `$DSH_HOME/ccswitch-hub/state.json`，重启后恢复。
- **只读来源**：不修改 CC Switch、Claude、Codex、Gemini 的配置或技能目录。
- **即时生效**：打开/关闭后无需重启 Harness。

## 打开方式

安装后刷新 Web 页面，点击左侧栏的 **MCP 技能** 图标。页面分为：

- **MCP 服务器**：显示来源、传输方式、工具前缀、连接状态和工具数量。
- **技能**：显示名称、描述、来源目录；已启用且进入技能目录的会标记为「已进入技能目录」。
- **高级**：可以修改 CC Switch 目录和额外技能目录，保存后自动重新扫描。

## 支持的来源

| 来源 | 默认路径 | 说明 |
|---|---|---|
| CC Switch 数据库 | `~/.cc-switch/cc-switch.db` | 读取 `mcp_servers` 表，只读 |
| CC Switch 技能 | `~/.cc-switch/skills` | 作为技能来源之一 |
| Claude Code | `~/.claude.json` 的 `mcpServers`、`~/.claude/skills` | MCP + 技能 |
| Codex | `~/.codex/config.toml` 的 `[mcp_servers.*]`、`~/.codex/skills` | MCP + 技能 |
| Gemini CLI | `~/.gemini/settings.json` 的 `mcpServers`、`~/.gemini/skills` | MCP + 技能 |
| 共享技能 | `~/.agents/skills` | 只读展示，见下方限制 |
| 额外技能目录 | 页面「高级」中配置 | 用于上述位置之外的技能 |

同名 MCP 服务器会合并成一行，CC Switch 数据库中的配置优先；不同来源配置不一致时页面会提示。技能按目录优先级去重：CC Switch → Claude → Codex → Gemini → 额外目录。

## 与 CC Switch 的关系

- 仅做**兼容读取**：CC Switch 的数据是来源之一，和 Claude Code、Codex、Gemini CLI 地位相同。
- 不写入 CC Switch 的数据库、配置或技能目录。
- 包名、仓库名和状态目录沿用 `ccswitch-hub`，这是为了保持已安装 profile 的路径和状态兼容；展示层是通用的 MCP 与技能管理器。

## 安全

- 浏览器只拿到环境变量和请求头的**键名**，不包含值；stdio 摘要不显示参数内容，HTTP 摘要去掉查询串。
- 状态文件只保存开关和目录覆盖，权限为 `0600`。
- 所有运行时操作都在 Host 侧完成，密钥不进入页面。

## 已知限制

- **SSE**：Harness 的 MCP 桥接不支持 SSE，这类服务器会列出但开关保持禁用。请改用 HTTP 或 stdio。
- **`~/.agents/skills` 与 `$DSH_HOME/skills`**：Harness 的代理预设会直接扫描这两个目录，其中的技能只能只读展示，无法通过本面板隐藏。若希望 CC Switch 技能可独立开关，请让 CC Switch 使用默认存储 `~/.cc-switch/skills`。
- **只读管理**：当前版本聚焦发现、开关与接入，不在页面内新建或编辑 MCP/技能；原有配置仍在各自工具中维护。
- **作用范围**：开关是当前 profile 全局生效，不是按会话或按代理预设。
- **远程 MCP 鉴权**：只传递来源中已配置的 env/headers，不处理 OAuth 登录流程。

## 状态与卸载

状态保存在 `$DSH_HOME/ccswitch-hub/state.json`。卸载插件（或在插件管理中停用）会断开所有由本插件挂载的 MCP 服务器，并移除技能提供方；来源数据不受影响。删除该状态目录可重置所有开关。

## 开发

无第三方依赖，使用 Node 内置模块：

```bash
node --check index.js client.js lib/*.js
node --test
```
