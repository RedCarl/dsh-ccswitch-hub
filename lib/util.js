/** Small shared helpers. */

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function errorMessage(error) {
  return error?.message ?? String(error)
}

export function truncate(value, length) {
  const text = typeof value === 'string' ? value : String(value ?? '')
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}
