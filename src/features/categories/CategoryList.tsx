import { useId } from 'react'
import type { Category } from '../../domain/models'
import { categoryTypeLabels } from './categoryHelpers'

interface CategoryListProps {
  categories: readonly Category[]
  disabled: boolean
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
}

export function CategoryList({ categories, disabled, onEdit, onDelete }: CategoryListProps) {
  const prefix = useId()
  const types: Category['type'][] = ['expense', 'income']

  return (
    <div className="category-groups">
      {types.map((type) => {
        const group = categories.filter((category) => category.type === type)
        return (
          <section className="category-group" key={type} aria-labelledby={`${prefix}-${type}`}>
            <h3 id={`${prefix}-${type}`}>{categoryTypeLabels[type]} categories</h3>
            {group.length === 0
              ? <p className="categories-empty">No {type} categories yet. Add a category and choose {categoryTypeLabels[type]} to get started.</p>
              : (
                <ul className="category-list">
                  {group.map((category) => (
                    <li className="category-card" key={category.id}>
                      <h4>{category.name}</h4>
                      <div className="category-actions">
                        <button type="button" disabled={disabled} onClick={() => onEdit(category)}
                          aria-label={`Edit ${type} category ${category.name}`}>Edit</button>
                        <button className="category-delete" type="button" disabled={disabled} onClick={() => onDelete(category)}
                          aria-label={`Delete ${type} category ${category.name}`}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        )
      })}
    </div>
  )
}
