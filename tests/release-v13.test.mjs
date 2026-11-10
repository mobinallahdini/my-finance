// Reporting-only release boundaries against the actual released v1.2.0 tag.
import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { historical } from './helpers/installmentBaseline.mjs'

const run = promisify(execFile)
async function git(...args) { return (await run('git', args, { windowsHide: true })).stdout }
const normalize = source => source.replace(/\r\n/g, '\n')

test('Reporting RC is version 1.3.0 in package and lockfile metadata only; dependencies match v1.2', async () => {
  const current = JSON.parse(await readFile('package.json', 'utf8'))
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
  const released = JSON.parse(await git('show', 'v1.2.0:package.json'))
  const releasedLock = JSON.parse(await git('show', 'v1.2.0:package-lock.json'))
  assert.equal(current.version, '1.3.0'); assert.equal(lock.version, '1.3.0'); assert.equal(lock.packages[''].version, '1.3.0')
  assert.deepEqual(current.dependencies, released.dependencies); assert.deepEqual(current.devDependencies, released.devDependencies)
  const expected = structuredClone(releasedLock); expected.version = '1.3.0'; expected.packages[''].version = '1.3.0'
  assert.deepEqual(lock, expected, 'No dependency resolution or backup/storage dependency changes')
  assert.equal((await git('rev-parse', 'v1.2.0^{commit}')).trim(), historical.release.commit)
})

for (const [label, paths] of [
  ['database schema and all financial repositories', ['src/persistence']],
  ['models and obligation payment lifecycle', ['src/domain/models.ts', 'src/domain/obligationCalculations.ts', 'src/domain/obligationValidation.ts', 'src/features/obligations']],
  ['backup formats and canonical CSV', ['src/features/dataBackup']],
  ['service worker and hosting/build configuration', ['src/pwa', 'scripts/pwaBuild.ts', 'vite.config.ts', 'public/manifest.webmanifest', '.github']],
]) test('Reporting RC retains actual v1.2 ' + label + ' byte-for-byte logically', async () => {
  const files = (await git('ls-tree', '-r', '--name-only', 'v1.2.0', '--', ...paths)).trim().split('\n')
  assert.ok(files.length > 0)
  for (const file of files) assert.equal(normalize(await readFile(file, 'utf8')), normalize(await git('show', 'v1.2.0:' + file)), file)
  assert.equal((await git('diff', '--name-only', 'v1.2.0', '--', ...paths)).trim(), '', 'No added storage/lifecycle implementation')
})
