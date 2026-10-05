import { useState } from 'react'
import { backupSections, includedSections, type BackupSection } from './backupFormat'
import { BackupDialog } from './BackupDialog'

const sectionLabels = { accounts: 'Accounts', categories: 'Categories', transactions: 'Transactions', preferences: 'Preferences' }
export function CustomExport({ busy, error, available, onClose, onExport }: {
  busy: boolean; error: string; available: boolean; onClose: () => void; onExport: (sections: readonly BackupSection[]) => void
}) {
  const [selected, setSelected] = useState<BackupSection[]>([])
  const included = includedSections(selected)
  const requiresReferences = selected.includes('transactions')
  return <BackupDialog title="Custom Backup" busy={busy} error={error} onClose={onClose}
    action={<button className="button-primary" type="button" disabled={busy || !available || !included.length} onClick={() => onExport(selected)}>Download JSON</button>}>
    <fieldset className="backup-custom-options" disabled={busy}>
      <legend>Choose sections to export</legend>
      {backupSections.map((section) => <label className="backup-check" key={section}>
        <input type="checkbox" name="backupSections" value={section} checked={included.includes(section)}
          disabled={requiresReferences && (section === 'accounts' || section === 'categories')}
          aria-describedby={requiresReferences ? 'backup-dependency-help' : undefined}
          onChange={() => setSelected((current) => current.includes(section) ? current.filter((value) => value !== section) : [...current, section])} />
        <span>{sectionLabels[section]}</span>
      </label>)}
    </fieldset>
    {requiresReferences && <p id="backup-dependency-help" className="backup-help" role="status">Transactions automatically include all Accounts and Categories so their references remain usable.</p>}
    <p className="backup-help">Partial Custom Backups are for export. Restore requires all four sections.</p>
    <p className="backup-help">Backup files contain your financial data. Store them securely.</p>
  </BackupDialog>
}
