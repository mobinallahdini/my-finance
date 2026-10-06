import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { Category } from '../../domain/models'
import { CategoryNameError, categoryTypeLabels, categoryWriteError } from '../categories/categoryHelpers'
import { saveCategoryRecord } from '../categories/categoryWrites'
import { notifyDataChanged } from '../shared/dataRefresh'

export function InlineCategoryCreate({ type, onCreated, onCancel, onBusyChange }: {
  type: Category['type']
  onCreated: (category: Category) => void
  onCancel: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const writing = useRef(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useLayoutEffect(() => { input.current?.focus() }, [])

  async function save() {
    if (writing.current) return
    writing.current = true
    setBusy(true)
    onBusyChange(true)
    setError(null)
    try {
      const category = await saveCategoryRecord({ id: crypto.randomUUID(), name, type }, false)
      onCreated(category)
      notifyDataChanged()
    } catch (failure) {
      setError(failure instanceof CategoryNameError ? failure.message : categoryWriteError(failure))
      requestAnimationFrame(() => input.current?.focus())
    } finally {
      writing.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }

  return <section className="transaction-new-category" aria-label={`New ${categoryTypeLabels[type]} category`} aria-busy={busy}>
    <label htmlFor={id}>New {categoryTypeLabels[type]} category name</label>
    <input ref={input} id={id} value={name} disabled={busy} aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
      onChange={(event) => { setName(event.target.value); setError(null) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); void save() }
      }} />
    {error && <p className="transaction-error" id={`${id}-error`} role="alert">{error}</p>}
    <div className="transaction-new-category-actions">
      <button className="transaction-primary" type="button" disabled={busy} onClick={() => { void save() }}>Save category</button>
      <button className="button-quiet" type="button" disabled={busy} onClick={onCancel}>Cancel category</button>
    </div>
  </section>
}
