import type { Category } from '../../domain/models'

export const categoryTypeLabels: Record<Category['type'], string> = {
  expense: 'Expense',
  income: 'Income',
}

// Name validation is an entry-form rule; persistence remains responsible for integrity.
export function categoryNameError(
  name: string,
  type: Category['type'],
  categories: readonly Category[],
  excludingId?: string,
): string | null {
  const normalizedName = name.trim().toLowerCase()
  if (!normalizedName) return 'Enter a category name.'
  if (categories.some((category) => category.id !== excludingId
    && category.type === type && category.name.trim().toLowerCase() === normalizedName)) {
    return `An ${type} category with this name already exists. Choose a different name.`
  }
  return null
}

export class CategoryNameError extends Error {}

export function categoryWriteError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === 'Cannot change the type of a category referenced by transactions.') {
      return 'This category has transactions, so its type cannot be changed. You can still edit its name. Your changes were not applied.'
    }
    if (error.message === 'Cannot delete a category referenced by transactions.') {
      return 'This category has transactions and cannot be deleted. The category and its transactions have been preserved.'
    }
    if (error.message.startsWith('Category does not exist:')) {
      return 'This category no longer exists. Cancel editing and refresh the category list.'
    }
  }
  return 'The category could not be saved or deleted. Your changes were not applied. Check that browser storage is available and try again.'
}
