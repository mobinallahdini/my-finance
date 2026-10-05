import type { Theme } from '../appearance/themePreference'
import { validateCurrencyCode } from '../../domain/financeSettings.ts'
import { knownFields, objectRecord, validateApplicationSnapshot, validateFinancialSnapshot, type ApplicationSnapshot, type FinancialSnapshot } from '../../persistence/snapshotValidation.ts'
import { localCalendarDate } from '../transactions/transactionHelpers.ts'

const legacySections = ['accounts', 'categories', 'transactions', 'preferences'] as const
export const backupSections = ['accounts', 'categories', 'transactions', 'obligations', 'obligationPayments', 'preferences'] as const
export type BackupSection = (typeof backupSections)[number]
export interface BackupFile {
  format: 'my-finance-backup'
  schemaVersion: 2
  exportedAt: string
  currency: string
  kind: 'full' | 'custom'
  sections: BackupSection[]
  data: Partial<ApplicationSnapshot>
  preferences?: { theme: Theme }
}
interface FullBackupV2 extends BackupFile {
  data: ApplicationSnapshot
  preferences: { theme: Theme }
}
interface FullBackupV1 extends Omit<BackupFile, 'schemaVersion' | 'data' | 'sections' | 'currency'> {
  schemaVersion: 1
  currency: 'CAD'
  sections: (typeof legacySections)[number][]
  data: FinancialSnapshot
  preferences: { theme: Theme }
}
export type FullBackup = FullBackupV1 | FullBackupV2

export function includedSections(selected: readonly BackupSection[]): BackupSection[] {
  const wanted = new Set(selected)
  if (wanted.has('transactions')) { wanted.add('accounts'); wanted.add('categories') }
  if (wanted.has('obligations') || wanted.has('obligationPayments')) { wanted.add('obligations'); wanted.add('obligationPayments') }
  return backupSections.filter((section) => wanted.has(section))
}
function validateTheme(value: unknown): asserts value is Theme {
  if (value !== 'sage' && value !== 'ocean' && value !== 'dark') throw new Error('Backup theme must be Sage, Ocean, or Dark.')
}
export function createBackup(snapshot: ApplicationSnapshot, theme: Theme, selected: readonly BackupSection[] = backupSections,
  kind: 'full' | 'custom' = 'full', now = new Date(), currencyCode = 'CAD'): BackupFile {
  const sections = includedSections(selected)
  if (!sections.length) throw new Error('Select at least one section to export.')
  if (kind === 'full' && sections.length !== backupSections.length) throw new Error('Full Backup must include every section.')
  validateApplicationSnapshot(snapshot)
  validateTheme(theme)
  validateCurrencyCode(currencyCode)
  const data: Partial<ApplicationSnapshot> = {}
  if (sections.includes('accounts')) data.accounts = snapshot.accounts
  if (sections.includes('categories')) data.categories = snapshot.categories
  if (sections.includes('transactions')) data.transactions = snapshot.transactions
  if (sections.includes('obligations')) data.obligations = snapshot.obligations
  if (sections.includes('obligationPayments')) data.obligationPayments = snapshot.obligationPayments
  return structuredClone({
    format: 'my-finance-backup', schemaVersion: 2, exportedAt: now.toISOString(), currency: currencyCode, kind, sections, data,
    ...(sections.includes('preferences') ? { preferences: { theme } } : {}),
  })
}

export function validateFullBackup(value: unknown): FullBackup {
  const backup = objectRecord(value, 'Backup')
  knownFields(backup, ['format', 'schemaVersion', 'exportedAt', 'currency', 'kind', 'sections', 'data', 'preferences'], 'Backup')
  if (backup.format !== 'my-finance-backup') throw new Error('This is not a My Finance backup file.')
  if (backup.schemaVersion !== 1 && backup.schemaVersion !== 2) throw new Error('Unsupported backup schema version. My Finance restores versions 1 and 2 only.')
  validateCurrencyCode(backup.currency)
  if (backup.schemaVersion === 1 && backup.currency !== 'CAD') throw new Error('Version 1 backups must use CAD.')
  if (typeof backup.exportedAt !== 'string' || !Number.isFinite(Date.parse(backup.exportedAt))
    || new Date(backup.exportedAt).toISOString() !== backup.exportedAt) throw new Error('Backup creation time must be a valid ISO timestamp.')
  if (backup.kind !== 'full' && backup.kind !== 'custom') throw new Error('Unsupported backup kind.')
  const requiredSections = backup.schemaVersion === 1 ? legacySections : backupSections
  if (!Array.isArray(backup.sections) || backup.sections.length !== requiredSections.length
    || !requiredSections.every((section) => (backup.sections as unknown[]).filter((value) => value === section).length === 1)) {
    throw new Error('This file is a partial Custom Backup. Restore requires every section for its backup version. Choose a Full Backup.')
  }
  const preferences = objectRecord(backup.preferences, 'Preferences')
  knownFields(preferences, ['theme'], 'Preferences')
  validateTheme(preferences.theme)
  const metadata = { format: 'my-finance-backup' as const, exportedAt: backup.exportedAt, currency: backup.currency,
    kind: backup.kind as 'full' | 'custom', preferences: { theme: preferences.theme } }
  return backup.schemaVersion === 1
    ? { ...metadata, currency: 'CAD', schemaVersion: 1, sections: [...legacySections], data: validateFinancialSnapshot(backup.data) }
    : { ...metadata, schemaVersion: 2, sections: [...backupSections], data: validateApplicationSnapshot(backup.data) }
}

/** Legacy replacement intentionally clears tracking data; it never preserves it. */
export function restoreSnapshot(backup: FullBackup): ApplicationSnapshot {
  return backup.schemaVersion === 1 ? { ...backup.data, obligations: [], obligationPayments: [] } : backup.data
}

export function parseFullBackup(text: string): FullBackup {
  let value: unknown
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')) }
  catch { throw new Error('The file is not valid JSON. Current data has not been changed.') }
  return validateFullBackup(value)
}
export function exportFilename(kind: 'backup' | 'custom-backup' | 'transactions' | 'accounts' | 'categories', now = new Date()) {
  return `my-finance-${kind}-${localCalendarDate(now)}.${kind.endsWith('backup') ? 'json' : 'csv'}`
}
