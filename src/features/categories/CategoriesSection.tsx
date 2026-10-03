import { useRef, useState } from 'react'
import type { Category } from '../../domain/models'
import { CategoryForm } from './CategoryForm'
import { CategoryList } from './CategoryList'
import { categoryWriteError } from './categoryHelpers'
import { useCategories } from './useCategories'
import './categories.css'

export function CategoriesSection() {
  const { categories, isLoading, isWriting, loadError, reload, saveCategory, deleteCategory } = useCategories()
  const [editor, setEditor] = useState<{ category?: Category } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const deleting = useRef(false)
  const busy = isLoading || isWriting

  function openEditor(category?: Category) {
    setEditor({ category })
    setActionError(null)
    setStatus('')
  }

  function closeEditor() {
    setEditor(null)
    headingRef.current?.focus()
  }

  async function handleSave(category: Category) {
    await saveCategory(category, editor?.category !== undefined)
    setEditor(null)
    setStatus(`${category.type === 'expense' ? 'Expense' : 'Income'} category “${category.name}” saved.`)
    headingRef.current?.focus()
  }

  async function handleDelete(category: Category) {
    if (busy || deleting.current) return
    if (!window.confirm(`Delete ${category.type} category “${category.name}”? This permanently removes the category. Categories with transactions cannot be deleted.`)) return
    deleting.current = true
    setActionError(null)
    setStatus('')
    try {
      await deleteCategory(category.id)
      setStatus(`Category “${category.name}” deleted.`)
      headingRef.current?.focus()
    } catch (error) {
      setActionError(categoryWriteError(error))
    } finally {
      deleting.current = false
    }
  }

  return (
    <section className="categories-section" aria-labelledby="categories-heading">
      <div className="categories-header">
        <h2 ref={headingRef} id="categories-heading" tabIndex={-1}>Categories</h2>
        <div className="category-actions">
          <button type="button" disabled={busy || editor !== null} onClick={() => { setActionError(null); setStatus(''); reload() }}>Refresh</button>
          <button className="category-primary" type="button" disabled={busy || Boolean(loadError) || editor !== null}
            onClick={() => openEditor()}>Add category</button>
        </div>
      </div>
      <p>Manage your expense and income categories. Categories are stored in this browser.</p>
      <p className="category-status" role="status">{status}</p>
      {actionError && <p className="category-error" role="alert">{actionError}</p>}
      {editor && <CategoryForm key={editor.category?.id ?? 'new'} category={editor.category} categories={categories}
        disabled={busy} onSave={handleSave} onCancel={closeEditor} />}
      <div aria-busy={busy}>
        {isLoading && <p role="status">Loading categories…</p>}
        {loadError && <p className="category-error" role="alert">{loadError} Use Refresh to retry.</p>}
        {!isLoading && !loadError && <CategoryList categories={categories} disabled={busy || editor !== null}
          onEdit={openEditor} onDelete={(category) => { void handleDelete(category) }} />}
      </div>
    </section>
  )
}
