import type { Theme } from '../appearance/themePreference'
import { knownFields, objectRecord, validateFinancialSnapshot, type FinancialSnapshot } from '../../persistence/snapshotValidation.ts'
import { localCalendarDate } from '../transactions/transactionHelpers.ts'

export const backupSections = ['accounts', 'categories', 'transactions', 'preferences'] as const
export type BackupSection = (typeof backupSections)[number]
export interface BackupFile {
  format: 'my-finance-backup'
  schemaVersion: 1
  exportedAt: string
  currency: 'CAD'
  kind: 'full' | 'custom'
  sections: BackupSection[]
  data: Partial<FinancialSnapshot>
  preferences?: { theme: Theme }
}
export interface FullBackup extends BackupFile {
  data: FinancialSnapshot
  preferences: { theme: Theme }
}

export function includedSections(selected: readonly BackupSection[]): BackupSection[] {
  const wanted = new Set(selected)
  if (wanted.has('transactions')) { wanted.add('accounts'); wanted.add('categories') }
  return backupSections.filter((section) => wanted.has(section))
}
function validateTheme(value: unknown): asserts value is Theme {
  if (value !== 'sage' && value !== 'ocean' && value !== 'dark') throw new Error('Backup theme must be Sage, Ocean, or Dark.')
}
export function createBackup(snapshot: FinancialSnapshot, theme: Theme, selected: readonly BackupSection[] = backupSections,
  kind: 'full' | 'custom' = 'full', now = new Date()): BackupFile {
  const sections = includedSections(selected)
  if (!sections.length) throw new Error('Select at least one section to export.')
  if (kind === 'full' && sections.length !== backupSections.length) throw new Error('Full Backup must include every section.')
  // A transaction export must contain a consistent reference graph.
  validateFinancialSnapshot(snapshot)
  validateTheme(theme)
  const data: Partial<FinancialSnapshot> = {}
  if (sections.includes('accounts')) data.accounts = snapshot.accounts
  if (sections.includes('categories')) data.categories = snapshot.categories
  if (sections.includes('transactions')) data.transactions = snapshot.transactions
  return structuredClone({
    format: 'my-finance-backup', schemaVersion: 1, exportedAt: now.toISOString(), currency: 'CAD', kind, sections, data,
    ...(sections.includes('preferences') ? { preferences: { theme } } : {}),
  })
}

export function validateFullBackup(value: unknown): FullBackup {
  const backup = objectRecord(value, 'Backup')
  knownFields(backup, ['format', 'schemaVersion', 'exportedAt', 'currency', 'kind', 'sections', 'data', 'preferences'], 'Backup')
  if (backup.format !== 'my-finance-backup') throw new Error('This is not a My Finance backup file.')
  if (backup.schemaVersion !== 1) throw new Error('Unsupported backup schema version. This version of My Finance restores version 1 only.')
  if (backup.currency !== 'CAD') throw new Error('Only CAD backups are supported.')
  if (typeof backup.exportedAt !== 'string' || !Number.isFinite(Date.parse(backup.exportedAt))
    || new Date(backup.exportedAt).toISOString() !== backup.exportedAt) throw new Error('Backup creation time must be a valid ISO timestamp.')
  if (backup.kind !== 'full' && backup.kind !== 'custom') throw new Error('Unsupported backup kind.')
  if (!Array.isArray(backup.sections) || backup.sections.length !== backupSections.length
    || !backupSections.every((section) => (backup.sections as unknown[]).filter((value) => value === section).length === 1)) {
    throw new Error('This file is a partial Custom Backup. Restore requires accounts, categories, transactions, and preferences. Choose a Full Backup.')
  }
  const data = validateFinancialSnapshot(backup.data)
  const preferences = objectRecord(backup.preferences, 'Preferences')
  knownFields(preferences, ['theme'], 'Preferences')
  validateTheme(preferences.theme)
  return { format: 'my-finance-backup', schemaVersion: 1, exportedAt: backup.exportedAt, currency: 'CAD',
    kind: backup.kind, sections: [...backupSections], data, preferences: { theme: preferences.theme } }
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
