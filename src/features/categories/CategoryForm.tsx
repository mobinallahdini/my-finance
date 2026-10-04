import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react'
import type { Category } from '../../domain/models'
import { CategoryNameError, categoryNameError, categoryTypeLabels, categoryWriteError } from './categoryHelpers'

interface CategoryFormProps {
  category?: Category
  categories: readonly Category[]
  initialType: Category['type']
  disabled: boolean
  isLoading: boolean
  loadError: string | null
  onSave: (category: Category) => Promise<void>
  onCancel: () => void
  onDelete: (category: Category) => Promise<void>
  onRetry: () => void
}

export function CategoryForm({ category, initialType, categories, disabled, isLoading, loadError, onSave, onCancel, onDelete, onRetry }: CategoryFormProps) {
  const prefix = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const navigationAllowed = useRef(false)
  const editorURL = useRef(window.location.href)
  const [initial] = useState(() => ({ name: category?.name ?? '', type: category?.type ?? initialType }))
  const [name, setName] = useState(initial.name)
  const [type, setType] = useState<Category['type']>(initial.type)
  const [nameError, setNameError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const dirty = name !== initial.name || type !== initial.type

  useLayoutEffect(() => {
    const dialog = dialogRef.current!
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    dialog.querySelector<HTMLElement>('h2')?.focus()
    return () => {
      dialog.close()
      document.body.style.overflow = oldOverflow
    }
  }, [])

  useEffect(() => {
    if (disabled || errorRef.current) return
    nameRef.current?.focus()
  }, [disabled])

  useLayoutEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if ((!dirty && !submitting.current) || navigationAllowed.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    function guardNavigation(event: Event) {
      // Ignore opening/restored hashes. Popstate precedes the hash notification.
      if (navigationAllowed.current || window.location.href === editorURL.current) return
      if (disabled || submitting.current || (dirty && !window.confirm('Discard unsaved category changes? Your changes will be lost.'))) {
        // Restore the URL before the app's hash subscriber reads it.
        window.history.replaceState(window.history.state, '', editorURL.current)
        event.stopImmediatePropagation()
      } else navigationAllowed.current = true
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('hashchange', guardNavigation, true)
    window.addEventListener('popstate', guardNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('hashchange', guardNavigation, true)
      window.removeEventListener('popstate', guardNavigation, true)
    }
  }, [dirty, disabled])

  function confirmDiscard() {
    return !dirty || window.confirm('Discard unsaved category changes? Your changes will be lost.')
  }

  function requestClose() {
    if (disabled || submitting.current || !confirmDiscard()) return
    onCancel()
  }

  function containKeyboardFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
    ))
    const first = targets[0]
    const last = targets.at(-1)
    if (!first) {
      event.preventDefault()
      event.currentTarget.querySelector<HTMLElement>('h2')?.focus()
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  useEffect(() => {
    if (!saveError) return
    errorRef.current?.focus()
    errorRef.current?.scrollIntoView({ block: 'nearest' })
  }, [saveError])

  async function handleDelete() {
    if (!category || disabled || submitting.current) return
    submitting.current = true
    setSaveError(null)
    try {
      await onDelete(category)
    } catch (error) {
      setSaveError(categoryWriteError(error))
    } finally {
      submitting.current = false
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || loadError || submitting.current) return
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
    <dialog ref={dialogRef} className="category-editor" aria-labelledby={`${prefix}-heading`}
      onKeyDown={containKeyboardFocus} onCancel={(event) => { event.preventDefault(); requestClose() }}>
      <form className="category-form" onSubmit={handleSubmit} noValidate aria-busy={disabled}>
        <header className="category-editor-header">
          <button className="button-quiet" type="button" disabled={disabled} onClick={requestClose}>Cancel</button>
          <h2 id={`${prefix}-heading`} tabIndex={-1}>{category ? 'Edit category' : 'New category'}</h2>
          <button className="category-primary" type="submit" disabled={disabled || Boolean(loadError)}>Save</button>
        </header>
        <div className="category-editor-body" onFocusCapture={(event) => {
          const field = event.target
          if (field instanceof HTMLElement && field.matches('input, select')) {
            field.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          }
        }}>
          {isLoading && <p className="category-loading" role="status">Loading categories...</p>}
          {loadError && <div className="category-recovery">
            <p className="category-error" role="alert">{loadError}</p>
            <button type="button" disabled={disabled} onClick={onRetry}>Retry</button>
          </div>}
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
          </fieldset>
          {saveError && <p ref={errorRef} className="category-error" role="alert" tabIndex={-1}>{saveError}</p>}
          {category && <div className="category-editor-delete">
            <button className="button-quiet button-destructive" type="button" disabled={disabled}
              onClick={() => { void handleDelete() }}>Delete category</button>
          </div>}
        </div>
      </form>
    </dialog>
  )
}
