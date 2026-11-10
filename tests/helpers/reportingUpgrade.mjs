// Runs on the actual upgraded production tab, offline at /my-finance/.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { historical } from './installmentBaseline.mjs'
import { prepareFinancialReport } from '../../src/domain/reporting.ts'
import { createReportFilters } from '../../src/domain/transactionQuery.ts'
import { dollarsForInput, formatMoney } from '../../src/features/accounts/money.ts'
import { parseCsv, unprotectCsvText } from '../../src/features/dataBackup/csv.ts'
import { reportSummaryMetrics } from '../../src/features/reports/reportPresentation.ts'

export async function verifyUpgradedOfflineReports({ client, evaluate, wait, stored, passed, artifacts }) {
  const before = await stored()
  const report = prepareFinancialReport({ ...historical.workspace, filters: createReportFilters() })
  const currency = historical.workspace.applicationSettings.currencyCode
  await evaluate(`(()=>{const select=document.querySelector('#report-period');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'all');select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
  await wait(`document.querySelector('[data-metric="transactionCount"]')?.textContent==='13'`)
  const screen = await evaluate(`Object.fromEntries([...document.querySelectorAll('[data-metric]')].map(element=>[element.dataset.metric,element.textContent]))`)
  for (const [key] of reportSummaryMetrics) assert.equal(screen[key], key === 'transactionCount' ? String(report.summary[key]) : formatMoney(report.summary[key], currency))
  assert.ok(await evaluate(`location.pathname==='/my-finance/'&&location.hash==='#more/reports'&&!!navigator.serviceWorker.controller&&!document.querySelector('.finance-onboarding')`))
  passed('Actual v1.2 upgrade opens Reports offline at /my-finance/ with exact historical financial totals')

  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: artifacts })
  await evaluate(`(()=>{const original=URL.createObjectURL.bind(URL);window.__rcReportCsv=null;URL.createObjectURL=blob=>{window.__rcReportCsv=blob.text();return original(blob)};window.__rcPrintCalls=0;window.print=()=>{window.__rcPrintCalls++};return true})()`)
  async function csv(index) {
    await evaluate(`window.__rcReportCsv=null;document.querySelectorAll('.report-export-actions button')[${index}].click();true`)
    await wait('!!window.__rcReportCsv')
    return parseCsv(await evaluate('window.__rcReportCsv'))
  }
  const [headers, ...rows] = await csv(0)
  assert.equal(rows.length, report.matchedTransactionCount)
  assert.deepEqual(headers, ['Date', 'Type', 'Category', 'Account', 'Amount (GBP)', 'currency_code', 'report_format', 'text_encoding'])
  for (const [index, row] of rows.entries()) {
    const expected = report.rows[index]
    assert.equal(unprotectCsvText(row[0]), expected.date)
    assert.equal(row[4], (expected.type === 'expense' ? '-' : '') + dollarsForInput(expected.amountCents))
    assert.equal(row[5], currency)
  }
  passed('Actual upgraded offline detail CSV includes all historical transactions with exact signed amounts and GBP currency')
  const [, ...summary] = await csv(1)
  const globals = summary.filter(row => unprotectCsvText(row[0]) === 'global')
  assert.equal(globals.length, 7)
  for (const [key, label] of reportSummaryMetrics) assert.equal(globals.find(row => unprotectCsvText(row[3]) === label)[4], key === 'transactionCount' ? String(report.summary[key]) : dollarsForInput(report.summary[key]))
  passed('Actual upgraded offline Summary CSV agrees with every on-screen PreparedReport total')

  await evaluate(`document.querySelectorAll('.report-export-actions button')[2].click();true`)
  await wait(`!!document.querySelector('.report-print')`)
  assert.equal(await evaluate(`document.querySelectorAll('[data-print-row]').length`), report.matchedTransactionCount)
  const print = await evaluate(`Object.fromEntries([...document.querySelectorAll('[data-print-metric]')].map(element=>[element.dataset.printMetric,element.textContent]))`)
  assert.deepEqual(print, screen)
  assert.equal(await evaluate('window.__rcPrintCalls'), 1)
  await client.send('Emulation.setEmulatedMedia', { media: 'print' })
  assert.ok(await evaluate(`getComputedStyle(document.querySelector('#root')).display==='none'&&!document.querySelector('.report-print nav,.report-print button')`))
  const pdf = Buffer.from((await client.send('Page.printToPDF', { preferCSSPageSize: true, displayHeaderFooter: false })).data, 'base64')
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  await writeFile(join(artifacts, 'v13-upgraded-offline-report.pdf'), pdf)
  await client.send('Emulation.setEmulatedMedia', { media: '' })
  await evaluate(`window.dispatchEvent(new Event('afterprint'));true`)
  await wait(`!document.querySelector('.report-print')`)
  passed('Actual upgraded offline PDF contains all historical report rows and matching totals without application navigation')
  assert.deepEqual(await stored(), before)
  assert.ok(await evaluate('window.__safetyWrites.length===0'))
  passed('Upgraded report viewing, both CSV exports and PDF make zero store writes and preserve every record, setting and theme')
  assert.ok(await evaluate(`caches.keys().then(async names=>(await Promise.all(names.map(name=>caches.open(name).then(cache=>cache.keys())))).flat().every(request=>!request.url.startsWith('blob:')&&!/\\.(csv|pdf)$/.test(new URL(request.url).pathname)))`))
  passed('Upgraded report exports leave no generated financial files in persistent asset caches')
}
