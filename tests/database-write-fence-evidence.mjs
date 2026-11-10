// Compact, reviewable evidence derived from retained raw qualification reports.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { canonicalRecords } from './helpers/installmentBaseline.mjs'
import { auditLinks, businessData } from './fixtures/mixed-version/prototype.mjs'
import { deriveHistoricalBaseline } from './helpers/installmentBaseline.mjs'
import * as financial from '../src/domain/calculations.ts'
import * as obligations from '../src/domain/obligationCalculations.ts'

const input = resolve(process.argv[2]), output = resolve(process.argv[3])
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const recordsHash = data => hash(canonicalRecords(data))
const summary = JSON.parse(await readFile(join(input, 'qualification.json'), 'utf8'))
const engines = []
for (const engine of summary.engines) {
  const raw = await readFile(engine.reportPath), report = JSON.parse(raw)
  assert.equal(createHash('sha256').update(raw).digest('hex'), engine.reportSha256)
  const s = report.snapshots, guarded = s.guarded?.state, canonical = guarded && businessData(guarded, 'v4_')
  const historical = canonical && Object.fromEntries(Object.entries(canonical).map(([name, rows]) => [name, rows.filter(row => !row.id.startsWith('v13-'))]))
  const projection = historical && deriveHistoricalBaseline({ ...historical, applicationSettings: historical.applicationSettings[0] }, financial, obligations)
  engines.push({ engine: engine.engine, classification: engine.classification, environment: report.environment,
    checks: report.checkNames ?? report.checks, release: report.release, fixtureHash: report.fixtureHash, dexieVersion: report.dexieVersion,
    rawReport: engine.reportPath, rawReportSha256: engine.reportSha256, rawLog: engine.logPath,
    guarded: guarded && { outcomes: s.guarded.outcomes, concurrent: s.guarded.concurrent, offline: s.guarded.offline,
      emptyRestore: s.guarded.emptyRestore, duplicate: s.guarded.duplicate, openEvents: s.guarded.events,
      historicalHashAfterAttacks: recordsHash(historical), canonicalGraphHash: recordsHash(canonical),
      operationReceiptsHash: hash(guarded.data.paymentOperations), audit: auditLinks(guarded, 'v4_'), projection },
    aborts: s.aborts?.map(row => ({ afterStoreMove: row.failAfter, error: row.failed, nativeVersionAfterAbort: row.aborted.version,
      hashBefore: recordsHash(row.before.data), hashAfterAbort: recordsHash(row.aborted.data), hashAfterRetry: recordsHash(businessData(row.afterRetry, 'v4_')) })),
    tabInterruption: s.interruption && { nativeVersionBeforeRetry: s.interruption.beforeRetry.version,
      hashBeforeRetry: recordsHash(s.interruption.beforeRetry.data), hashAfterRetry: recordsHash(businessData(s.interruption.afterRetry, 'v4_')) },
    processInterruption: s.browserTermination?.classification === 'observed' ? {
      beforeCommitHash: recordsHash(s.browserTermination.beforeTermination.data),
      beforeCommitRestartHash: recordsHash(s.browserTermination.afterUncommittedTermination.data),
      afterCommitHash: recordsHash(businessData(s.browserTermination.committedBeforeTermination, 'v4_')),
      afterCommitRestartHash: recordsHash(businessData(s.browserTermination.afterCommittedTermination, 'v4_')),
      epochBeforeTermination: s.browserTermination.committedBeforeTermination.data.applicationControl,
      epochAfterRestart: s.browserTermination.afterCommittedTermination.data.applicationControl,
      afterRepeatedGateHash: recordsHash(businessData(s.browserTermination.afterRepeatedGate, 'v4_')),
    } : s.browserTermination,
    inFlightWriter: s.inFlightWriter && { expectedHash: s.inFlightWriter.expectedHash, actualHash: s.inFlightWriter.actualHash },
    incompleteGate: s.incompleteGate?.incomplete,
    competingUpgradersHash: s.concurrentUpgraders && recordsHash(businessData(s.concurrentUpgraders, 'v4_')),
    negativeEvidence: {
      additive: s.additive && { nativeOlder: s.additive.nativeOlder, spread: s.additive.spread, historicalEdit: s.additive.historicalEdit,
        transactionEdit: s.additive.transactionEdit, replace: s.additive.replace, paymentDelete: s.additive.paymentDelete,
        transactionDelete: s.additive.transactionDelete, reopen: s.additive.reopen, offline: s.additive.offline, restore: s.additive.restore,
        openEvents: s.additive.events, violations: auditLinks(s.additive.state) },
      namespace: s.namespace && { retry: s.namespace.retry, sourceHash: recordsHash(s.namespace.source.data), targetHash: recordsHash(s.namespace.target.data) },
      renameOnly: s.renameOnly && { create: s.renameOnly.create, nativeVersion: s.renameOnly.state.version, openEvents: s.renameOnly.events },
      pwaAdditive: s.pwaAdditive && { violations: auditLinks(s.pwaAdditive.afterUnsafeOldUiWrite), oldAssets: s.pwaAdditive.oldAssets },
    },
    pwaGuarded: s.pwaGuarded && { beforeSave: s.pwaGuarded.beforeSave, oldRecovery: s.pwaGuarded.oldRecovery,
      candidateRecovery: s.pwaGuarded.candidateRecovery, historicalHash: recordsHash(Object.fromEntries(Object.entries(businessData(s.pwaGuarded.canonical, 'v4_')).map(([name, rows]) => [name, rows.filter(row => !row.id.startsWith('v13-'))]))) },
    limitations: report.limitations, safetyGates: report.safetyGates, error: report.error,
  })
}
await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify({ milestone: '5B-1', run: input, engines,
  productionIntegration: 'UNPROVEN', installedDesktopAndIosPwas: 'UNPROVEN', recommendation: 'STOP' }, null, 2) + '\n')
console.log(output)
