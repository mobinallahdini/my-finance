import { useCallback, useEffect, useState } from 'react'
import { readFinancialSnapshot } from '../../persistence/dataBackup'
import type { FinancialSnapshot } from '../../persistence/snapshotValidation'
import { useDataRefresh } from '../shared/dataRefresh'

interface SnapshotResult { version: number; snapshot: FinancialSnapshot | null; error: string | null }
export function useReportSnapshot() {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<SnapshotResult | null>(null)
  const refresh = useCallback(() => setVersion(value => value + 1), [])
  useDataRefresh(refresh)
  useEffect(() => {
    let active = true
    void readFinancialSnapshot().then(snapshot => {
      if (active) setResult({ version, snapshot, error: null })
    }).catch(() => {
      if (active) setResult({ version, snapshot: null,
        error: 'Your report could not be loaded from browser storage. Refresh to try again.' })
    })
    return () => { active = false }
  }, [version])
  const current = result?.version === version ? result : null
  return { snapshot: current?.snapshot ?? null, isLoading: current === null,
    error: current?.error ?? null, refresh }
}
