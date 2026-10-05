import { useCallback, useEffect, useRef, useState } from 'react'
import type { Transaction } from '../../domain/models'
import { importTransactionBatch, readFinancialSnapshot, replaceFinancialSnapshot } from '../../persistence/dataBackup'
import type { FinancialSnapshot } from '../../persistence/snapshotValidation'
import { setTheme } from '../appearance/themePreference'
import { notifyDataChanged, useDataRefresh } from '../shared/dataRefresh'
import { validateFullBackup, type FullBackup } from './backupFormat'

export function useDataBackup() {
  const [snapshot, setSnapshot] = useState<FinancialSnapshot>({ accounts: [], categories: [], transactions: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [isWriting, setIsWriting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadVersion, setLoadVersion] = useState(0)
  const writing = useRef(false)
  const reload = useCallback(() => {
    setLoadError(null); setIsLoading(true); setLoadVersion((version) => version + 1)
  }, [])
  useDataRefresh(reload)
  useEffect(() => {
    let active = true
    void readFinancialSnapshot().then((data) => { if (active) setSnapshot(data) }).catch(() => {
      if (active) setLoadError('Local data could not be read. Check that browser storage is available, then try again.')
    }).finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [loadVersion])

  async function write<T>(action: () => Promise<T>): Promise<T> {
    if (writing.current) throw new Error('A data operation is already in progress.')
    writing.current = true; setIsWriting(true)
    try {
      const result = await action()
      notifyDataChanged()
      return result
    } finally { writing.current = false; setIsWriting(false) }
  }
  async function restore(backup: FullBackup) {
    const validated = validateFullBackup(structuredClone(backup))
    return write(async () => {
      await replaceFinancialSnapshot(validated.data)
      // Appearance persistence cannot roll back or misreport a successful financial commit.
      return setTheme(validated.preferences.theme)
    })
  }
  async function importTransactions(transactions: readonly Transaction[]) {
    try { return await write(() => importTransactionBatch(transactions)) }
    catch (error) { reload(); throw error }
  }
  return { snapshot, isLoading, isWriting, loadError, reload, restore, importTransactions }
}
