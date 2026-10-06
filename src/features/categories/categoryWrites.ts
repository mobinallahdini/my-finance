import type { Category } from '../../domain/models'
import { categoriesRepository } from '../../persistence/repositories'
import { CategoryNameError, categoryNameError } from './categoryHelpers'

/** Shared by Categories and the transaction editor; recheck persisted names before writing. */
export async function saveCategoryRecord(category: Category, editing: boolean) {
  const currentCategories = await categoriesRepository.getAll()
  const error = categoryNameError(category.name, category.type, currentCategories, editing ? category.id : undefined)
  if (error) throw new CategoryNameError(error)
  const record: Category = { ...category, name: category.name.trim() }
  if (editing) await categoriesRepository.update(record)
  else await categoriesRepository.add(record)
  return record
}
