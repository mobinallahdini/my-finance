import { useCallback, useEffect, useState } from 'react'
import type { Category } from '../../domain/models'
import { categoriesRepository } from '../../persistence/repositories'
import { CategoryNameError, categoryNameError } from './categoryHelpers'
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
    await write(async () => {
      // Recheck persisted names so a stale list does not allow an accidental duplicate.
      const currentCategories = await categoriesRepository.getAll()
      const error = categoryNameError(category.name, category.type, currentCategories, editing ? category.id : undefined)
      if (error) throw new CategoryNameError(error)
      const record: Category = { ...category, name: category.name.trim() }
      if (editing) await categoriesRepository.update(record)
      else await categoriesRepository.add(record)
    })
  }

  async function deleteCategory(id: string) {
    await write(() => categoriesRepository.delete(id))
  }

  return { categories, isLoading, isWriting, loadError, reload, saveCategory, deleteCategory }
}
