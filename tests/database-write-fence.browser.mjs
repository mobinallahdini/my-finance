// Qualification is deliberately a release gate: 2 = completed but release UNPROVEN;
// 1 = unexpected harness failure. Missing engines are recorded, never skipped as PASS.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-write-fence-5b1-'))
const engines = []
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const reportPath = join(artifacts, engine + '.json'), logPath = join(artifacts, engine + '.log')
  const child = spawn(process.execPath, ['tests/mixed-version-safety.browser.mjs'], {
    windowsHide: true,
    env: { ...process.env, FINANCE_COMPATIBILITY_ENGINE: engine, FINANCE_COMPATIBILITY_REPORT: reportPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = '', launchError
  child.stdout.on('data', chunk => { log += chunk; process.stdout.write('[' + engine + '] ' + chunk) })
  child.stderr.on('data', chunk => { log += chunk; process.stderr.write('[' + engine + '] ' + chunk) })
  child.on('error', error => { launchError = String(error) })
  const timeout = setTimeout(() => { launchError = 'Qualification timeout'; child.kill() }, 240000)
  const exitCode = await new Promise(done => child.on('close', done))
  clearTimeout(timeout)
  await writeFile(logPath, log)
  let report
  try { report = JSON.parse(await readFile(reportPath, 'utf8')) } catch { /* Missing report is an unproven engine. */ }
  const completed = exitCode === 2 && report?.safetyGates?.guardedRepositoryMatrix === 'PROVEN SAFE FOR TESTED PATHS'
  engines.push({ engine, classification: report?.snapshots?.canonicalViolation ? 'PROVEN UNSAFE' : completed ? 'PROVEN SAFE FOR TESTED PATHS' : 'UNPROVEN',
    environment: report?.environment, completed, exitCode, error: launchError ?? report?.error,
    checks: Array.isArray(report?.checks) ? report.checks.length : report?.checks, reportPath, logPath,
    reportSha256: report ? createHash('sha256').update(await readFile(reportPath)).digest('hex') : null,
    productionIntegration: 'UNPROVEN', installedPwaReopening: 'UNPROVEN',
    unavailable: /Cannot find package|Executable doesn't exist|browserType.launch/.test(launchError ?? report?.error ?? ''),
  })
}
const summary = { milestone: '5B-1', engines, productionRelease: 'UNPROVEN', recommendation: 'STOP', artifacts }
await writeFile(join(artifacts, 'qualification.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
process.exitCode = engines.some(engine => engine.exitCode !== 2 && !engine.unavailable) ? 1 : 2
