import { useCallback, useEffect, useState } from 'react'
import type { Account, Category } from '../../domain/models'
import { accountsRepository, categoriesRepository, transactionsRepository } from '../../persistence/repositories'
import { notifyDataChanged, useDataRefresh } from '../shared/dataRefresh'
import { compareTransactions, incomeAccountError, isEligibleAccount, type EntryTransaction } from './transactionHelpers'

export function useTransactions() {
  const [transactions, setTransactions] = useState<EntryTransaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
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
        const [loadedTransactions, loadedAccounts, loadedCategories] = await Promise.all([
          transactionsRepository.getAll(),
          accountsRepository.getAll(),
          categoriesRepository.getAll(),
        ])
        if (!active) return
        setTransactions(loadedTransactions.filter((transaction): transaction is EntryTransaction => (
          transaction.type === 'expense' || transaction.type === 'income'
        )).sort(compareTransactions))
        setAccounts(loadedAccounts.sort((left, right) => left.name.localeCompare(right.name)))
        setCategories(loadedCategories.sort((left, right) => left.name.localeCompare(right.name)))
      } catch {
        if (active) {
          setLoadError('Transactions, accounts, and categories could not be loaded from browser storage. Check that IndexedDB is available, then use Refresh to retry.')
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
      // A committed write stays successful even if a subsequent feature read fails.
      notifyDataChanged()
    } finally {
      setIsWriting(false)
    }
  }

  async function saveTransaction(transaction: EntryTransaction, editing: boolean) {
    // The repository rechecks persisted references and category type atomically.
    await write(async () => {
      if (transaction.type === 'income') {
        // UI policy: recheck storage because the form's account list may be stale.
        const account = await accountsRepository.get(transaction.accountId)
        if (!account || !isEligibleAccount(account, 'income')) throw new Error(incomeAccountError)
      }
      if (editing) await transactionsRepository.update(transaction)
      else await transactionsRepository.add(transaction)
    })
  }

  async function deleteTransaction(id: string) {
    await write(() => transactionsRepository.delete(id))
  }

  return { transactions, accounts, categories, isLoading, isWriting, loadError, reload, saveTransaction, deleteTransaction }
}
