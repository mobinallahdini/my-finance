import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react'
import type { Category } from '../../domain/models'
import { CategoryNameError, categoryNameError, categoryTypeLabels, categoryWriteError } from './categoryHelpers'

interface CategoryFormProps {
  category?: Category
  categories: readonly Category[]
  disabled: boolean
  onSave: (category: Category) => Promise<void>
  onCancel: () => void
}

export function CategoryForm({ category, categories, disabled, onSave, onCancel }: CategoryFormProps) {
  const prefix = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const [name, setName] = useState(category?.name ?? '')
  const [type, setType] = useState<Category['type']>(category?.type ?? 'expense')
  const [nameError, setNameError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || submitting.current) return
    setSaveError(null)
    const error = categoryNameError(name, type, categories, category?.id)
    setNameError(error)
    if (error) {
      nameRef.current?.focus()
      return
    }

    submitting.current = true
    try {
      await onSave({ id: category?.id ?? crypto.randomUUID(), name: name.trim(), type })
    } catch (error) {
      if (error instanceof CategoryNameError) {
        setNameError(error.message)
        nameRef.current?.focus()
      } else {
        setSaveError(categoryWriteError(error))
      }
    } finally {
      submitting.current = false
    }
  }

  return (
    <form className="category-form" onSubmit={handleSubmit} noValidate aria-labelledby={`${prefix}-heading`}>
      <h3 id={`${prefix}-heading`}>{category ? 'Edit category' : 'Add category'}</h3>
      <fieldset disabled={disabled}>
        <div className="category-field">
          <label htmlFor={`${prefix}-name`}>Category name</label>
          <input ref={nameRef} id={`${prefix}-name`} value={name} required
            onChange={(event) => { setName(event.target.value); setNameError(null); setSaveError(null) }}
            aria-invalid={Boolean(nameError)} aria-describedby={nameError ? `${prefix}-name-error` : undefined} />
          {nameError && <p className="category-error" id={`${prefix}-name-error`} role="alert">{nameError}</p>}
        </div>
        <div className="category-field">
          <label htmlFor={`${prefix}-type`}>Category type</label>
          <select id={`${prefix}-type`} value={type}
            onChange={(event) => { setType(event.target.value as Category['type']); setNameError(null); setSaveError(null) }}
            aria-describedby={category ? `${prefix}-type-help` : undefined}>
            {Object.entries(categoryTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {category && <p id={`${prefix}-type-help`}>Categories with transactions cannot change type. Their names can still be edited.</p>}
        </div>
        <div className="category-actions">
          <button className="category-primary" type="submit">{disabled ? 'Saving…' : 'Save category'}</button>
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </fieldset>
      {saveError && <p className="category-error" role="alert">{saveError}</p>}
    </form>
  )
}
