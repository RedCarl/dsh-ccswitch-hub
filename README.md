# MCP 与技能（CC Switch 桥接）

在 DeepSeek Harness 中**只读引用** [CC Switch](https://github.com/farion1231/cc-switch) 管理的 MCP 服务器与技能：

- 左侧栏新增「MCP 技能」入口，打开一个统一管理页。
- MCP 与技能各有一个**总开关**，每个条目还有独立开关；选择会持久化。
- 启用的 MCP 通过 DSH 自带的 `@deepseek-ai/dsh-mcp-client` 直接接入，工具名形如 `mcp__<server>__<tool>`。
- 启用的技能注册为 `ctx.skills` 提供方，下一次模型步骤即可出现在技能目录中。
- 所有改动即时生效，无需重启 Harness。

## 打开方式

安装后刷新 Web 页面，点击左侧栏的 **MCP 技能** 图标。页面分为：

- **MCP 服务器**：显示来源、传输方式、工具前缀、连接状态和工具数量。
- **技能**：显示名称、描述、来源目录；已启用且进入技能目录的会标记为「已进入技能目录」。
- **高级**：可以修改 CC Switch 目录和额外技能目录，保存后自动重新扫描。

## 数据来源

| 来源 | 默认路径 |
|---|---|
| CC Switch 数据库 | `~/.cc-switch/cc-switch.db`（`mcp_servers` 表，只读） |
| CC Switch 技能 | `~/.cc-switch/skills` |
| Claude Code | `~/.claude.json` 的 `mcpServers`、`~/.claude/skills` |
| Codex | `~/.codex/config.toml` 的 `[mcp_servers.*]`、`~/.codex/skills` |
| Gemini CLI | `~/.gemini/settings.json` 的 `mcpServers`、`~/.gemini/skills` |
| 共享技能 | `~/.agents/skills`（只读展示，见下方限制） |

同名 MCP 服务器会合并为一行，CC Switch 数据库中的配置优先；不同来源配置不一致时页面会提示。技能按目录优先级去重：CC Switch → Claude → Codex → Gemini → 额外目录。

## 安全

- 不写入 CC Switch 的数据库、配置或技能目录。
- 浏览器只拿到环境变量和请求头的**键名**，不包含值；stdio 摘要不显示参数内容，HTTP 摘要去掉查询串。
- 状态文件只保存开关和目录覆盖，权限为 `0600`。

## 已知限制

- **SSE**：CC Switch 的 SSE 服务器会列出，但 Harness 的 MCP 桥接不支持 SSE，开关会保持禁用并显示原因。请在 CC Switch 中改为 HTTP，或改用 stdio 服务。
- **`~/.agents/skills` 与 `$DSH_HOME/skills`**：Harness 的代理预设会直接扫描这两个目录。位于其中（或同名）的技能会以只读方式显示，无法通过本面板隐藏。若希望 CC Switch 技能可被独立开关，请在 CC Switch 中把技能存储位置设为默认的 `~/.cc-switch/skills`。
- **只读桥接**：不会把 Harness 的改动写回 CC Switch，也不在页面内新建或编辑 MCP/技能。
- **作用范围**：开关是当前 profile 全局生效，不是按会话或按代理预设。
- **远程 MCP 鉴权**：只传递 CC Switch 中已配置的 env/headers；不处理 OAuth 登录流程。

## 状态与卸载

状态保存在 `$DSH_HOME/ccswitch-hub/state.json`。卸载插件（或在插件管理中停用）会断开所有由本插件挂载的 MCP 服务器，并移除技能提供方；CC Switch 数据不受影响。删除该状态目录可重置所有开关。

## 开发

无第三方依赖，使用 Node 内置模块：

```bash
node --check index.js client.js lib/*.js
node --test
```
