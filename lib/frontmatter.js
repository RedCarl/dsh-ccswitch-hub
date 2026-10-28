/** Skill frontmatter parsing shared by native and CC Switch scans. */
import fs from 'node:fs'

export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Parse the small YAML frontmatter subset skills use. */
export function parseFrontmatter(raw) {
  const text = String(raw).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (!text.startsWith('---\n')) return undefined
  const lines = text.split('\n')
  let closing = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].replace(/\s+$/, '') === '---') {
      closing = index
      break
    }
  }
  if (closing < 0) return undefined
  return { data: parseYamlSubset(lines.slice(1, closing)), body: lines.slice(closing + 1).join('\n') }
}

function unquote(value) {
  const text = value.trim()
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text)
    } catch {
      return text.slice(1, -1)
    }
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'")
  }
  return text
}

function parseYamlSubset(lines) {
  const data = {}
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    if (/^\s/.test(line)) continue
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (match === null) continue
    const key = match[1]
    let rest = match[2].trim()

    if (rest === '|' || rest === '|-' || rest === '|+' || rest === '>' || rest === '>-' || rest === '>+') {
      const block = []
      while (index + 1 < lines.length && (/^\s+/.test(lines[index + 1]) || lines[index + 1].trim() === '')) {
        index += 1
        block.push(lines[index])
      }
      const indents = block.filter((entry) => entry.trim() !== '').map((entry) => /^\s*/.exec(entry)[0].length)
      const indent = indents.length > 0 ? Math.min(...indents) : 0
      const content = block.map((entry) => entry.slice(indent)).join('\n')
      const folded = rest.startsWith('>')
      const value = folded ? content.replace(/\n(?!\n)/g, ' ') : content
      data[key] = rest.endsWith('-') ? value.replace(/\s+$/, '') : `${value.replace(/\s+$/, '')}\n`
      continue
    }

    if (!rest.startsWith('"') && !rest.startsWith("'")) {
      const comment = rest.search(/\s#/)
      if (comment >= 0) rest = rest.slice(0, comment).trim()
    }
    if (rest === 'true') data[key] = true
    else if (rest === 'false') data[key] = false
    else data[key] = unquote(rest)
  }
  return data
}

function stringField(data, key) {
  const value = data[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function booleanField(data, key) {
  const value = data[key]
  if (value === true || value === 1 || value === '1' || value === 'true' || value === 'yes' || value === 'on') return true
  if (value === false || value === 0 || value === '0' || value === 'false' || value === 'no' || value === 'off') return false
  return undefined
}

function invocationPolicy(data) {
  return {
    modelInvocable: booleanField(data, 'disable-model-invocation') !== true,
    userInvocable: booleanField(data, 'user-invocable') !== false,
  }
}

/** Whether a string is a valid public skill name. */
export function isSkillName(name) {
  return typeof name === 'string' && SKILL_NAME.test(name)
}

/**
 * Read and validate one skill file.
 * @returns `{ skill }` on success, `{ error }` when the file cannot be a skill.
 */
export function readSkillFile(file, fallbackName) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    return { error: `无法读取 ${file}：${error?.message ?? String(error)}` }
  }
  const parsed = parseFrontmatter(text)
  const data = parsed?.data ?? {}
  const rawName = stringField(data, 'name') ?? fallbackName
  const name = typeof rawName === 'string' ? rawName.trim().toLowerCase() : ''
  if (!isSkillName(name)) {
    return { error: `${file} 的技能名「${String(rawName)}」不是 kebab-case，已忽略。` }
  }
  return {
    skill: {
      name,
      description: stringField(data, 'description') ?? '',
      whenToUse: stringField(data, 'whenToUse') ?? stringField(data, 'when_to_use'),
      invocation: invocationPolicy(data),
      content: (parsed?.body ?? text).trim(),
    },
  }
}
