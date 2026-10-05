import { useState } from 'react'
import { backupSections, includedSections, type BackupSection } from './backupFormat'
import { BackupDialog } from './BackupDialog'

const sectionLabels = { accounts: 'Accounts', categories: 'Categories', transactions: 'Transactions', obligations: 'Bills & Installments', preferences: 'Preferences' }
export function CustomExport({ busy, error, available, onClose, onExport }: {
  busy: boolean; error: string; available: boolean; onClose: () => void; onExport: (sections: readonly BackupSection[]) => void
}) {
  const [selected, setSelected] = useState<BackupSection[]>([])
  const included = includedSections(selected)
  const requiresReferences = selected.includes('transactions')
  return <BackupDialog title="Custom Backup" busy={busy} error={error} onClose={onClose}
    action={<button className="button-primary" type="button" disabled={busy || !available || !selected.length} onClick={() => onExport(selected)}>Download JSON</button>}>
    <fieldset className="backup-custom-options" disabled={busy}>
      <legend>Choose sections to export</legend>
      {backupSections.filter((section) => section !== 'obligationPayments' && section !== 'applicationSettings').map((section) => <label className="backup-check" key={section}>
        <input type="checkbox" name="backupSections" value={section} checked={included.includes(section)}
          disabled={requiresReferences && (section === 'accounts' || section === 'categories')}
          aria-describedby={section === 'obligations' ? 'backup-tracking-help' : requiresReferences ? 'backup-dependency-help' : undefined}
          onChange={() => setSelected((current) => current.includes(section) ? current.filter((value) => value !== section) : [...current, section])} />
        <span>{sectionLabels[section]}</span>
      </label>)}
    </fieldset>
    {requiresReferences && <p id="backup-dependency-help" className="backup-help" role="status">Transactions automatically include all Accounts and Categories so their references remain usable.</p>}
    <p id="backup-tracking-help" className="backup-help">Bills &amp; Installments automatically includes all obligations and their recorded payments together.</p>
    <p className="backup-help">Workspace settings and currency are always included. Appearance is optional under Preferences.</p>
    <p className="backup-help">Partial Custom Backups are for export. Restore requires every section for the backup version.</p>
    <p className="backup-help">Backup files contain your financial data. Store them securely.</p>
  </BackupDialog>
}
