import type { ApplicationSnapshot } from '../../persistence/snapshotValidation'
import type { FullBackup } from './backupFormat'

const themeLabels = { sage: 'Sage', ocean: 'Ocean', dark: 'Dark' }
export function RestorePreview({ backup, current, filename }: { backup: FullBackup; current: ApplicationSnapshot; filename: string }) {
  return <>
    <p className="backup-filename">{filename}</p>
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
  </>
}
