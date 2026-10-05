import type { FinancialSnapshot } from '../../persistence/snapshotValidation'
import type { FullBackup } from './backupFormat'

const themeLabels = { sage: 'Sage', ocean: 'Ocean', dark: 'Dark' }
export function RestorePreview({ backup, current, filename }: { backup: FullBackup; current: FinancialSnapshot; filename: string }) {
  return <>
    <p className="backup-filename">{filename}</p>
    <dl className="backup-restore-summary">
      <div><dt>Backup created</dt><dd><time dateTime={backup.exportedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(backup.exportedAt))}</time></dd></div>
      <div><dt>Accounts</dt><dd>{backup.data.accounts.length}</dd></div>
      <div><dt>Categories</dt><dd>{backup.data.categories.length}</dd></div>
      <div><dt>Transactions</dt><dd>{backup.data.transactions.length}</dd></div>
      <div><dt>Theme</dt><dd>{themeLabels[backup.preferences.theme]}</dd></div>
      <div><dt>Restore mode</dt><dd>Replace current data</dd></div>
    </dl>
    <section className="backup-current-data" aria-labelledby="restore-current-data">
      <h3 id="restore-current-data">Current local data</h3>
      <p>{current.accounts.length} accounts · {current.categories.length} categories · {current.transactions.length} transactions</p>
    </section>
    <p className="backup-restore-warning">Restoring will replace the current local financial data. Export a Full Backup first if you want to keep it.</p>
  </>
}
