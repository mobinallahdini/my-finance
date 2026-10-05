import type { ApplicationSnapshot } from '../../persistence/snapshotValidation'
import { restoreApplicationSettings, settingsWereReconstructed, type FullBackup } from './backupFormat'
import { useFinanceSettings } from '../financeSettings/settingsContext'
import { settingsChoices } from '../financeSettings/selectorLabels'

const themeLabels = { sage: 'Sage', ocean: 'Ocean', dark: 'Dark' }
const countries = settingsChoices('region')
const currencies = settingsChoices('currency')
export function RestorePreview({ backup, current, filename }: { backup: FullBackup; current: ApplicationSnapshot; filename: string }) {
  const { settings } = useFinanceSettings()
  const restored = restoreApplicationSettings(backup, settings?.countryCode)
  const fiscalMonth = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, restored.fiscalYearStartMonth - 1, 1)))
  return <>
    <p className="backup-filename">{filename}</p>
    <section className="backup-workspace" aria-labelledby="restore-workspace-heading">
      <h3 id="restore-workspace-heading">Workspace</h3>
      <dl className="backup-restore-summary">
        <div><dt>Country / Region</dt><dd>{countries.find(item => item.code === restored.countryCode)?.label ?? restored.countryCode}</dd></div>
        <div><dt>Currency</dt><dd>{currencies.find(item => item.code === restored.currencyCode)?.label ?? restored.currencyCode}</dd></div>
        <div><dt>Fiscal year starts</dt><dd>{fiscalMonth}</dd></div>
      </dl>
      {settingsWereReconstructed(backup) && <p className="backup-help">This older backup did not save workspace preferences. {backup.schemaVersion === 1
        ? 'Country / Region is Canada and currency is CAD.' : 'Your current Country / Region is used; currency comes from the backup.'} January fiscal start is restored as the default. Setup stays complete.</p>}
    </section>
    <dl className="backup-restore-summary">
      <div><dt>Backup created</dt><dd><time dateTime={backup.exportedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(backup.exportedAt))}</time></dd></div>
      <div><dt>Accounts</dt><dd>{backup.data.accounts.length}</dd></div>
      <div><dt>Categories</dt><dd>{backup.data.categories.length}</dd></div>
      <div><dt>Transactions</dt><dd>{backup.data.transactions.length}</dd></div>
      <div><dt>Bills &amp; Installments</dt><dd>{backup.schemaVersion === 1 ? 'Not included in this backup version' : backup.data.obligations.length}</dd></div>
      <div><dt>Recorded payments</dt><dd>{backup.schemaVersion === 1 ? 'Not included in this backup version' : backup.data.obligationPayments.length}</dd></div>
      <div><dt>Theme</dt><dd>{themeLabels[backup.preferences.theme]}</dd></div>
      <div><dt>Restore mode</dt><dd>Replace current data</dd></div>
    </dl>
    <section className="backup-current-data" aria-labelledby="restore-current-data">
      <h3 id="restore-current-data">Current local data</h3>
      <p>{current.accounts.length} accounts · {current.categories.length} categories · {current.transactions.length} transactions · {current.obligations.length} bills &amp; installments · {current.obligationPayments.length} recorded payments</p>
    </section>
    {backup.schemaVersion === 1 && <p className="backup-restore-warning">This version 1 backup contains no Bills &amp; Installments. Restoring it will remove all current bills, installments, and recorded payments.</p>}
    <p className="backup-restore-warning">Restoring will replace all current local financial data, bills, installments, and recorded payments. Export a Full Backup first if you want to keep them.</p>
    <p className="backup-help">The workspace currency will become {backup.currency} with the restored amounts. The workspace preferences shown above will replace current settings. No currency conversion occurs.</p>
  </>
}
