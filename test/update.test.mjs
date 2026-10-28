import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  RELEASE_API,
  compareVersions,
  fetchLatestRelease,
  isNewer,
  parseVersion,
  readPackageVersion,
  releaseTarballAsset,
} from '../lib/update.js'

const here = path.dirname(fileURLToPath(import.meta.url))

test('compares versions numerically and ignores a leading v', () => {
  assert.deepEqual(parseVersion('v2.1.0'), [2, 1, 0])
  assert.deepEqual(parseVersion('2.0.0-beta.1'), [2, 0, 0])
  assert.equal(compareVersions('2.1.0', '2.0.9'), 1)
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0)
  assert.equal(compareVersions('v1.9.9', '2.0.0'), -1)
  assert.equal(compareVersions('2.0.0.1', '2.0.0'), 0)
  assert.equal(compareVersions('abc', '0.0.0'), 0)
  assert.equal(isNewer('2.1.0', '2.0.0'), true)
  assert.equal(isNewer('2.0.0', '2.1.0'), false)
})

test('reads the running manifest version', () => {
  const meta = new URL('../index.js', import.meta.url)
  const expected = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version
  assert.equal(readPackageVersion(meta), expected)
  assert.equal(readPackageVersion(new URL('file:///definitely/missing/index.js')), '0.0.0')
})

test('fetches the latest release and truncates notes', async () => {
  let requested
  const result = await fetchLatestRelease({
    userAgent: 'test-agent',
    fetchImpl: async (url, options) => {
      requested = { url, options }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            tag_name: 'v2.2.0',
            html_url: 'https://github.com/RedCarl/dsh-ccswitch-hub/releases/tag/v2.2.0',
            published_at: '2026-10-28T00:00:00Z',
            body: 'x'.repeat(5000),
            assets: [
              { name: 'local-dsh-ccswitch-hub-2.2.0.tgz', browser_download_url: 'https://github.com/RedCarl/dsh-ccswitch-hub/releases/download/v2.2.0/local-dsh-ccswitch-hub-2.2.0.tgz', size: 1234 },
              { name: 'source.zip', browser_download_url: 'https://github.com/RedCarl/dsh-ccswitch-hub/archive/v2.2.0.zip' },
            ],
          }
        },
      }
    },
  })
  assert.equal(requested.url, RELEASE_API)
  assert.equal(requested.options.headers['user-agent'], 'test-agent')
  assert.equal(result.version, '2.2.0')
  assert.equal(result.tag, 'v2.2.0')
  assert.equal(result.url.includes('/releases/tag/v2.2.0'), true)
  assert.equal(result.notes.length, 4000)
  assert.equal(result.assets.length, 2)
  assert.equal(result.assets[0].size, 1234)
  assert.equal(releaseTarballAsset(result).name, 'local-dsh-ccswitch-hub-2.2.0.tgz')
  assert.equal(releaseTarballAsset({ assets: [{ name: 'x.zip', url: 'u' }] }), null)
})

test('reports GitHub failures and timeouts', async () => {
  await assert.rejects(
    fetchLatestRelease({
      fetchImpl: async () => ({ ok: false, status: 404, async json() { return {} } }),
    }),
    /还没有 Release/,
  )
  await assert.rejects(
    fetchLatestRelease({
      fetchImpl: async () => ({ ok: false, status: 403, async json() { return {} } }),
    }),
    /GitHub API 403/,
  )
  await assert.rejects(
    fetchLatestRelease({
      timeoutMs: 20,
      fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      }),
    }),
    /超时/,
  )
})
