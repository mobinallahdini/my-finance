import { useCallback, useEffect, useRef, useState } from 'react'
import type { Obligation, ObligationPayment } from '../../domain/models'
import { obligationsRepository, obligationPaymentsRepository } from '../../persistence/repositories'
import { database } from '../../persistence/database'
import { useDataRefresh } from '../shared/dataRefresh'

export function useObligations() {
  const [data, setData] = useState<{ obligations: Obligation[]; payments: ObligationPayment[] }>({ obligations: [], payments: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const version = useRef(0)
  const reload = useCallback(async () => {
    const request = ++version.current
    setLoading(true)
    try {
      const [obligations, payments] = await database.transaction('r', database.obligations, database.obligationPayments,
        () => Promise.all([obligationsRepository.getAll(), obligationPaymentsRepository.getAll()]))
      if (request === version.current) { setData({ obligations, payments }); setError(null) }
    } catch {
      if (request === version.current) setError('Could not load bills and payments. Please retry.')
    } finally {
      if (request === version.current) setLoading(false)
    }
  }, [])
  const invalidate = useCallback(() => { version.current++ }, [])
  useEffect(() => {
    let mounted = true
    queueMicrotask(() => { if (mounted) void reload() })
    return () => { mounted = false; invalidate() }
  }, [reload, invalidate])
  useDataRefresh(reload)
  return { ...data, loading, error, reload }
}
