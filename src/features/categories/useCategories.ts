import { useCallback, useEffect, useState } from 'react'
import type { Category } from '../../domain/models'
import { categoriesRepository } from '../../persistence/repositories'
import { saveCategoryRecord } from './categoryWrites'
import { notifyDataChanged, useDataRefresh } from '../shared/dataRefresh'

export function useCategories() {
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
        const loadedCategories = await categoriesRepository.getAll()
        if (!active) return
        setCategories(loadedCategories.sort((left, right) => left.name.localeCompare(right.name)))
      } catch {
        if (active) {
          setLoadError('Categories could not be loaded from browser storage. Check that IndexedDB is available, then try again.')
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

  async function saveCategory(category: Category, editing: boolean) {
    await write(() => saveCategoryRecord(category, editing))
  }

  async function deleteCategory(id: string) {
    await write(() => categoriesRepository.delete(id))
  }

  return { categories, isLoading, isWriting, loadError, reload, saveCategory, deleteCategory }
}
