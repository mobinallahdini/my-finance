// Normal reporting-only RC gate. Future linked-payment qualification is separate.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

const suites = [
  'navigation-focus', 'reports', 'report-exports', 'installment-safety',
  'obligations', 'obligations-ui', 'data-backup', 'finance-settings',
  'workspace-backup', 'expense-details', 'spending-donut', 'transaction-improvements',
  'pwa', 'release-candidate', 'release-v12',
]
const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-v13-rc-'))
// Vite dev-server creation sets NODE_ENV; do not leak it into production-build suites.
const childEnvironment = { ...process.env }
const server = await createServer({ cacheDir: join(artifacts, 'shared-vite-cache'), server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const appURL = `http://127.0.0.1:${server.httpServer.address().port}`
const results = []
try {
  for (const suite of suites) {
    console.log('RUN ' + suite)
    const child = spawn(process.execPath, ['tests/' + suite + '.browser.mjs'], {
      windowsHide: true, env: { ...childEnvironment, BILLS_APP_URL: appURL }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let log = '', launchError
    child.stdout.on('data', chunk => { log += chunk })
    child.stderr.on('data', chunk => { log += chunk })
    child.on('error', error => { launchError = String(error) })
    const exitCode = await new Promise(done => child.once('close', done))
    const logPath = join(artifacts, suite + '.log')
    await writeFile(logPath, log)
    const checkMatch = log.match(/^(\d+) [^\r\n]*checks passed/m)
    const checks = checkMatch ? Number(checkMatch[1]) : null
    results.push({ suite, exitCode, checks, launchError, logPath })
    console.log((exitCode === 0 ? 'PASS ' : 'FAIL ') + suite + ' (' + checks + ' checks); ' + logPath)
    if (exitCode !== 0) console.error(log)
    // Preserve partial evidence and continue independent suites after a failure.
    await writeFile(join(artifacts, 'results.json'), JSON.stringify({ results, artifacts, appURL }, null, 2))
  }
} finally { await server.close() }
const version = JSON.parse(await readFile('package.json', 'utf8')).version
const report = { version, baselineTag: 'v1.2.0', suites: results,
  checks: results.reduce((sum, row) => sum + (row.checks ?? 0), 0),
  reportingAcceptance: results.every(row => row.exitCode === 0 && row.checks !== null) ? 'PASS' : 'FAIL',
  linkedPaymentProductionGate: 'UNPROVEN / BLOCKED (separate qualification intentionally exits 2)', artifacts, appURL }
await writeFile(join(artifacts, 'results.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.reportingAcceptance === 'PASS' ? 0 : 1
