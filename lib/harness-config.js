/**
 * Text helpers for changing one mcp-client row in a profile patch.
 *
 * ConfigEditor can edit a row's config but has no delete or row-disable
 * operation. A profile patch is a YAML sequence, so one sequence item can be
 * changed by its indentation while the rest of the document (including
 * comments) stays intact.
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

function findMcpBlock(lines, id) {
  const idPattern = new RegExp(`(^|\\n)\\s*(?:-\\s*)?id:\\s*['"]?${escapeRegExp(id)}['"]?\\s*(\\n|$)`)
  for (let index = 0; index < lines.length; index += 1) {
    if (!isSequenceItem(lines[index])) continue
    const firstKey = lines[index].replace(/^\s*-\s?/, '')
    if (!/^(?:id|name)\s*:/.test(firstKey)) continue
    const end = findBlockEnd(lines, index)
    const block = lines.slice(index, end).join('\n')
    if (!idPattern.test(block)) continue
    if (!/name:\s*['"]?(@deepseek-ai\/dsh-mcp-client|mcp-client)['"]?/m.test(block)) continue
    return { start: index, end }
  }
  return undefined
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
  const found = findMcpBlock(lines, id)
  if (found === undefined) return { removed: false, text: source }
  return {
    removed: true,
    text: [...lines.slice(0, found.start), ...lines.slice(found.end)].join(eol),
  }
}

/**
 * Set `disabled: true|false` on a profile-patch mcp-client row.
 * @returns `{ updated, text }`; text is unchanged when no matching row exists.
 */
export function setMcpClientRowDisabled(text, id, disabled) {
  const source = String(text ?? '')
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.split(/\r?\n/)
  const found = findMcpBlock(lines, id)
  if (found === undefined) return { updated: false, text: source }
  const baseIndent = indentation(lines[found.start])
  let propertyIndent = baseIndent + 2
  for (let index = found.start + 1; index < found.end; index += 1) {
    const line = lines[index]
    if (line.trim() === '' || isSequenceItem(line)) continue
    if (indentation(line) > baseIndent) {
      propertyIndent = indentation(line)
      break
    }
  }
  for (let index = found.start + 1; index < found.end; index += 1) {
    const line = lines[index]
    if (indentation(line) === propertyIndent && /^disabled\s*:/.test(line.trimStart())) {
      lines[index] = `${' '.repeat(propertyIndent)}disabled: ${disabled}`
      return { updated: true, text: lines.join(eol) }
    }
  }
  lines.splice(found.start + 1, 0, `${' '.repeat(propertyIndent)}disabled: ${disabled}`)
  return { updated: true, text: lines.join(eol) }
}
