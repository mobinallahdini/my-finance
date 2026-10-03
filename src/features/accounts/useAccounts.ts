import { useCallback, useEffect, useState } from 'react'
import type { Account, Transaction } from '../../domain/models'
import { accountsRepository, transactionsRepository } from '../../persistence/repositories'
import { notifyDataChanged, useDataRefresh } from '../shared/dataRefresh'

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isWriting, setIsWriting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadVersion, setLoadVersion] = useState(0)

  const reload = useCallback(() => {
    setLoadError(null)
    setIsLoading(true)
    setLoadVersion((version) => version + 1)
  }, [])

  useDataRefresh(reload)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [loadedAccounts, loadedTransactions] = await Promise.all([
          accountsRepository.getAll(),
          transactionsRepository.getAll(),
        ])
        if (!active) return
        setAccounts(loadedAccounts.sort((left, right) => left.name.localeCompare(right.name)))
        setTransactions(loadedTransactions)
      } catch {
        if (active) {
          setLoadError('Accounts could not be loaded from browser storage. Check that IndexedDB is available, then try again.')
        }
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [loadVersion])

  async function write(action: () => Promise<unknown>) {
    setIsWriting(true)
    try {
      await action()
      // A successful write stays successful even if the subsequent read fails.
      notifyDataChanged()
    } finally {
      setIsWriting(false)
    }
  }

  async function saveAccount(account: Account, editing: boolean) {
    await write(() => editing
      ? accountsRepository.update(account)
      : accountsRepository.add(account))
  }

  async function deleteAccount(id: string) {
    await write(() => accountsRepository.delete(id))
  }

  return { accounts, transactions, isLoading, isWriting, loadError, reload, saveAccount, deleteAccount }
}
