/** Small shared helpers. */

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function errorMessage(error) {
  if (typeof error?.message === 'string' && error.message !== '') return error.message
  if (typeof error?.diagnostic === 'string' && error.diagnostic !== '') return error.diagnostic
  if (typeof error?.code === 'string' && error.code !== '') return error.code
  return String(error)
}

export function truncate(value, length) {
  const text = typeof value === 'string' ? value : String(value ?? '')
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}
