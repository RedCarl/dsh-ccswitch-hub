/**
 * Text helpers for removing one mcp-client row from a profile patch.
 *
 * ConfigEditor can edit a row's config but has no delete operation. A profile
 * patch is a YAML sequence, so removing one sequence item by its indentation
 * keeps the rest of the document (including comments) intact.
 */

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function indentation(line) {
  return line.length - line.trimStart().length
}

function isSequenceItem(line) {
  return /^\s*-\s+/.test(line) || /^\s*-\s*$/.test(line)
}

function findBlockEnd(lines, start) {
  const indent = indentation(lines[start])
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '') continue
    const nextIndent = indentation(line)
    if (nextIndent < indent) return index
    if (nextIndent === indent && isSequenceItem(line)) return index
  }
  return lines.length
}

/**
 * Remove the profile-patch sequence item whose `id` is `id` and whose `name`
 * declares the MCP client module.
 * @returns `{ removed, text }`; text is unchanged when no matching row exists.
 */
export function removeMcpClientRow(text, id) {
  const source = String(text ?? '')
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.split(/\r?\n/)
  const idPattern = new RegExp(`(^|\\n)\\s*(?:-\\s*)?id:\\s*['"]?${escapeRegExp(id)}['"]?\\s*(\\n|$)`)
  for (let index = 0; index < lines.length; index += 1) {
    if (!isSequenceItem(lines[index])) continue
    const firstKey = lines[index].replace(/^\s*-\s?/, '')
    if (!/^(?:id|name)\s*:/.test(firstKey)) continue
    const end = findBlockEnd(lines, index)
    const block = lines.slice(index, end).join('\n')
    if (!idPattern.test(block)) continue
    if (!/name:\s*['"]?(@deepseek-ai\/dsh-mcp-client|mcp-client)['"]?/m.test(block)) continue
    return {
      removed: true,
      text: [...lines.slice(0, index), ...lines.slice(end)].join(eol),
    }
  }
  return { removed: false, text: source }
}
