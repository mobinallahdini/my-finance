import type { Category } from '../../domain/models'
import { categoryTypeLabels } from './categoryHelpers'

interface CategoryListProps {
  categories: readonly Category[]
  type: Category['type']
  disabled: boolean
  onOpen: (category: Category, opener: HTMLButtonElement) => void
}

export function CategoryList({ categories, type, disabled, onOpen }: CategoryListProps) {
  const orderedCategories = [...categories].sort((left, right) => left.name.localeCompare(right.name)
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  return (
    <ul className="category-list" aria-label={`${categoryTypeLabels[type]} categories`}>
      {orderedCategories.map((category) => (
        <li key={category.id}>
          <button className="category-row" type="button" disabled={disabled} aria-haspopup="dialog"
            data-category-id={category.id} aria-label={`${category.name}, ${categoryTypeLabels[category.type]} category`}
            onClick={(event) => onOpen(category, event.currentTarget)}>
            <span>{category.name}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
              aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg>
          </button>
        </li>
      ))}
    </ul>
  )
}
