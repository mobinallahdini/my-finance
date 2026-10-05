import type { Theme } from '../appearance/themePreference'
import { legacyApplicationSettings, validateApplicationSettings, validateCurrencyCode, type ApplicationSettings } from '../../domain/financeSettings.ts'
import { knownFields, objectRecord, validateWorkspaceSnapshot, validateApplicationSnapshot, validateFinancialSnapshot,
  type WorkspaceSnapshot, type ApplicationSnapshot, type FinancialSnapshot } from '../../persistence/snapshotValidation.ts'
import { localCalendarDate } from '../transactions/transactionHelpers.ts'

const v1Sections = ['accounts', 'categories', 'transactions', 'preferences'] as const
const v2Sections = ['accounts', 'categories', 'transactions', 'obligations', 'obligationPayments', 'preferences'] as const
export const backupSections = ['accounts', 'categories', 'transactions', 'obligations', 'obligationPayments', 'applicationSettings', 'preferences'] as const
export type BackupSection = (typeof backupSections)[number]
interface BackupMetadata {
  format: 'my-finance-backup'
  exportedAt: string
  currency: string
  kind: 'full' | 'custom'
}
export interface BackupFile extends BackupMetadata {
  schemaVersion: 3
  sections: BackupSection[]
  data: Partial<ApplicationSnapshot> & { applicationSettings: ApplicationSettings }
  preferences?: { theme: Theme }
}
interface FullBackupV3 extends BackupFile { data: WorkspaceSnapshot; preferences: { theme: Theme } }
interface FullBackupV2 extends BackupMetadata {
  schemaVersion: 2
  sections: BackupSection[]
  data: ApplicationSnapshot & { applicationSettings?: ApplicationSettings }
  preferences: { theme: Theme }
}
interface FullBackupV1 extends BackupMetadata {
  schemaVersion: 1
  currency: 'CAD'
  sections: (typeof v1Sections)[number][]
  data: FinancialSnapshot
  preferences: { theme: Theme }
}
export type FullBackup = FullBackupV1 | FullBackupV2 | FullBackupV3

export function includedSections(selected: readonly BackupSection[]): BackupSection[] {
  const wanted = new Set(selected)
  wanted.add('applicationSettings')
  if (wanted.has('transactions')) { wanted.add('accounts'); wanted.add('categories') }
  if (wanted.has('obligations') || wanted.has('obligationPayments')) { wanted.add('obligations'); wanted.add('obligationPayments') }
  return backupSections.filter(section => wanted.has(section))
}
function validateTheme(value: unknown): asserts value is Theme {
  if (value !== 'sage' && value !== 'ocean' && value !== 'dark') throw new Error('Backup theme must be Sage, Ocean, or Dark.')
}
export function createBackup(value: WorkspaceSnapshot, theme: Theme, selected: readonly BackupSection[] = backupSections,
  kind: 'full' | 'custom' = 'full', now = new Date()): BackupFile {
  if (!selected.some(section => section !== 'applicationSettings')) throw new Error('Select at least one section to export.')
  const sections = includedSections(selected)
  if (kind === 'full' && sections.length !== backupSections.length) throw new Error('Full Backup must include every section.')
  const snapshot = validateWorkspaceSnapshot(value)
  validateTheme(theme)
  const data: BackupFile['data'] = { applicationSettings: snapshot.applicationSettings }
  if (sections.includes('accounts')) data.accounts = snapshot.accounts
  if (sections.includes('categories')) data.categories = snapshot.categories
  if (sections.includes('transactions')) data.transactions = snapshot.transactions
  if (sections.includes('obligations')) data.obligations = snapshot.obligations
  if (sections.includes('obligationPayments')) data.obligationPayments = snapshot.obligationPayments
  return structuredClone({
    format: 'my-finance-backup', schemaVersion: 3, exportedAt: now.toISOString(), currency: snapshot.applicationSettings.currencyCode, kind, sections, data,
    ...(sections.includes('preferences') ? { preferences: { theme } } : {}),
  })
}
function matchingSettingsCurrency(settings: ApplicationSettings, currency: string) {
  if (settings.currencyCode !== currency) throw new Error('Backup currency and workspace settings currency must agree.')
}
export function validateFullBackup(value: unknown): FullBackup {
  const backup = objectRecord(value, 'Backup')
  knownFields(backup, ['format', 'schemaVersion', 'exportedAt', 'currency', 'kind', 'sections', 'data', 'preferences'], 'Backup')
  if (backup.format !== 'my-finance-backup') throw new Error('This is not a My Finance backup file.')
  if (backup.schemaVersion !== 1 && backup.schemaVersion !== 2 && backup.schemaVersion !== 3) throw new Error('Unsupported backup schema version. My Finance restores versions 1, 2, and 3 only.')
  validateCurrencyCode(backup.currency)
  if (backup.schemaVersion === 1 && backup.currency !== 'CAD') throw new Error('Version 1 backups must use CAD.')
  if (typeof backup.exportedAt !== 'string' || !Number.isFinite(Date.parse(backup.exportedAt))
    || new Date(backup.exportedAt).toISOString() !== backup.exportedAt) throw new Error('Backup creation time must be a valid ISO timestamp.')
  if (backup.kind !== 'full' && backup.kind !== 'custom') throw new Error('Unsupported backup kind.')
  const data = objectRecord(backup.data, 'Backup data')
  const v2StoredSettings = backup.schemaVersion === 2 && Object.hasOwn(data, 'applicationSettings')
  const requiredSections = backup.schemaVersion === 1 ? v1Sections : backup.schemaVersion === 2 ? v2Sections : backupSections
  // v2 never required a settings section; accept a validated optional record when supplied.
  const sections = Array.isArray(backup.sections) ? backup.sections : []
  const expected = v2StoredSettings && sections.includes('applicationSettings') ? [...v2Sections, 'applicationSettings'] : requiredSections
  if (sections.length !== expected.length || !expected.every(section => sections.filter(value => value === section).length === 1)) {
    throw new Error('This file is a partial Custom Backup. Restore requires every section for its backup version. Choose a Full Backup.')
  }
  const preferences = objectRecord(backup.preferences, 'Preferences')
  knownFields(preferences, ['theme'], 'Preferences')
  validateTheme(preferences.theme)
  const metadata = { format: 'my-finance-backup' as const, exportedAt: backup.exportedAt, currency: backup.currency,
    kind: backup.kind as 'full' | 'custom', preferences: { theme: preferences.theme } }
  if (backup.schemaVersion === 1) return { ...metadata, currency: 'CAD', schemaVersion: 1, sections: [...v1Sections], data: validateFinancialSnapshot(data) }
  if (backup.schemaVersion === 2 && !v2StoredSettings) return { ...metadata, schemaVersion: 2, sections: [...v2Sections], data: validateApplicationSnapshot(data) }
  const workspace = validateWorkspaceSnapshot(data)
  matchingSettingsCurrency(workspace.applicationSettings, backup.currency)
  return backup.schemaVersion === 2
    ? { ...metadata, schemaVersion: 2, sections: [...expected] as BackupSection[], data: workspace }
    : { ...metadata, schemaVersion: 3, sections: [...backupSections], data: workspace }
}
export function settingsWereReconstructed(backup: FullBackup) {
  return backup.schemaVersion === 1 || (backup.schemaVersion === 2 && !backup.data.applicationSettings)
}
/** V2 keeps the destination's known region; currency never implies residence. */
export function restoreApplicationSettings(backup: FullBackup, fallbackCountry = 'CA'): ApplicationSettings {
  const stored = backup.schemaVersion === 1 ? undefined : backup.data.applicationSettings
  const settings = stored ?? { ...legacyApplicationSettings, currencyCode: backup.currency,
    countryCode: backup.schemaVersion === 1 ? 'CA' : fallbackCountry }
  // Restoring a valid workspace completes setup. Export/validation preserve its original flag.
  return validateApplicationSettings({ ...settings, onboardingCompleted: true })
}
/** Legacy replacement intentionally clears tracking data; it never preserves it. */
export function restoreSnapshot(backup: FullBackup, fallbackCountry = 'CA'): WorkspaceSnapshot {
  const data = backup.schemaVersion === 1 ? { ...backup.data, obligations: [], obligationPayments: [] } : backup.data
  return { ...data, applicationSettings: restoreApplicationSettings(backup, fallbackCountry) }
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
