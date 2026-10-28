/** GitHub release checking and version comparison for self-update. */
import fs from 'node:fs'

/** Repository that owns this plugin's releases. */
export const REPO = 'RedCarl/dsh-ccswitch-hub'
export const REPO_URL = `https://github.com/${REPO}`
export const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`

/** Read the running package version from the plugin's own manifest. */
export function readPackageVersion(metaUrl) {
  try {
    const file = new URL('./package.json', metaUrl)
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    return typeof value.version === 'string' ? value.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** Parse a semver-ish version into three numeric parts. */
export function parseVersion(value) {
  const text = String(value ?? '').trim().replace(/^v/i, '').split(/[+-]/)[0]
  const parts = text.split('.').map((part) => {
    const number = Number.parseInt(part, 10)
    return Number.isFinite(number) ? number : 0
  })
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

/** Compare two versions: positive when left is newer. */
export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

/** Whether `candidate` is a newer release than `current`. */
export function isNewer(candidate, current) {
  return compareVersions(candidate, current) > 0
}

function truncate(value, length) {
  const text = typeof value === 'string' ? value : ''
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}

/**
 * Fetch the latest GitHub release.
 * @param options.fetchImpl - injectable fetch for tests.
 * @param options.timeoutMs - abort the request after this long.
 * @param options.userAgent - GitHub API user agent.
 * @returns `{version, tag, url, publishedAt, notes}`.
 */
export async function fetchLatestRelease(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('当前运行环境没有 fetch')
  const timeoutMs = options.timeoutMs ?? 10_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  timer.unref?.()
  try {
    const response = await fetchImpl(RELEASE_API, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': options.userAgent ?? 'dsh-ccswitch-hub',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      if (response.status === 404) throw new Error('GitHub 上还没有 Release')
      throw new Error(`GitHub API ${response.status}`)
    }
    const release = await response.json()
    const tag = typeof release?.tag_name === 'string' ? release.tag_name : ''
    if (tag === '') throw new Error('Release 缺少 tag_name')
    const assets = Array.isArray(release?.assets)
      ? release.assets
          .filter((asset) => typeof asset?.browser_download_url === 'string')
          .map((asset) => ({
            name: typeof asset.name === 'string' ? asset.name : '',
            url: asset.browser_download_url,
            size: typeof asset.size === 'number' ? asset.size : undefined,
          }))
      : []
    return {
      version: tag.replace(/^v/i, ''),
      tag,
      url: typeof release?.html_url === 'string' ? release.html_url : `${REPO_URL}/releases`,
      publishedAt: typeof release?.published_at === 'string' ? release.published_at : undefined,
      notes: truncate(release?.body, 4000),
      assets,
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`检查更新超时（${timeoutMs}ms）`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** Pick the release tarball, which avoids a git connection check during install. */
export function releaseTarballAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : []
  return assets.find((asset) => /\.(tgz|tar\.gz)$/i.test(asset.name)) ?? null
}
