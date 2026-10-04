import { useEffect, useId, useRef, useState } from 'react'
import type { Category } from '../../domain/models'
import { CategoryForm } from './CategoryForm'
import { CategoryList } from './CategoryList'
import { categoryTypeLabels } from './categoryHelpers'
import { useCategories } from './useCategories'
import './categories.css'

export function CategoriesSection() {
  const { categories, isLoading, isWriting, loadError, reload, saveCategory, deleteCategory } = useCategories()
  const [activeType, setActiveType] = useState<Category['type']>('expense')
  const [editor, setEditor] = useState<{ category?: Category; initialType: Category['type'] } | null>(null)
  const [status, setStatus] = useState('')
  const filterName = useId()
  const addRef = useRef<HTMLButtonElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const opener = useRef<{ element?: HTMLButtonElement; categoryId?: string }>({})
  const pendingFocus = useRef(false)
  const deleting = useRef(false)
  const busy = isLoading || isWriting

  const filteredCategories = categories.filter((category) => category.type === activeType)

  useEffect(() => {
    if (editor || busy || !pendingFocus.current) return
    pendingFocus.current = false
    const target = opener.current
    const row = target.categoryId
      ? sectionRef.current?.querySelector<HTMLButtonElement>(`[data-category-id="${CSS.escape(target.categoryId)}"]`)
      : null
    const element = target.element?.isConnected && !target.element.disabled ? target.element : row
    const focusTarget = element ?? addRef.current
    focusTarget?.focus()
  }, [editor, busy])

  function openEditor(element: HTMLButtonElement, category?: Category) {
    opener.current = { element, categoryId: category?.id }
    setEditor({ category, initialType: activeType })
    setStatus('')
  }

  function closeEditor() {
    pendingFocus.current = true
    setEditor(null)
  }

  async function handleSave(category: Category) {
    await saveCategory(category, editor?.category !== undefined)
    setStatus(`${category.type === 'expense' ? 'Expense' : 'Income'} category “${category.name}” saved.`)
    closeEditor()
  }

  async function handleDelete(category: Category) {
    if (busy || deleting.current) return
    if (!window.confirm(`Delete ${category.type} category “${category.name}”? This permanently removes the category. Categories with transactions cannot be deleted.`)) return
    deleting.current = true
    setStatus('')
    try {
      await deleteCategory(category.id)
      setStatus(`Category “${category.name}” deleted.`)
      closeEditor()
    } finally {
      deleting.current = false
    }
  }

  return (
    <section ref={sectionRef} className="categories-section" aria-labelledby="categories-heading">
      <div className="categories-header">
        <h2 id="categories-heading" tabIndex={-1}>Categories</h2>
        <button ref={addRef} className="category-primary category-add" type="button" aria-haspopup="dialog"
          disabled={isWriting || editor !== null} onClick={(event) => openEditor(event.currentTarget)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg>
          Add Category
        </button>
      </div>
      <fieldset className="category-type-filter">
        <legend className="category-sr-only">Filter categories by type</legend>
        {(['expense', 'income'] as const).map((type) => (
          <label className="category-type-segment" key={type}>
            <input type="radio" name={filterName} value={type} checked={activeType === type}
              onChange={() => { setActiveType(type); setStatus('') }} />
            <span>{categoryTypeLabels[type]}</span>
          </label>
        ))}
      </fieldset>
      <p className="category-status" role="status">{status}</p>
      <div aria-busy={busy}>
        {isLoading && <p className="category-loading" role="status">Loading categories…</p>}
        {loadError ? <div className="category-recovery">
          <p className="category-error" role="alert">{loadError}</p>
          <button type="button" disabled={busy} onClick={reload}>Retry</button>
        </div> : (!isLoading || categories.length > 0) && <>
          <p className="category-count" role="status">{filteredCategories.length} {activeType} {filteredCategories.length === 1 ? 'category' : 'categories'}</p>
          {filteredCategories.length === 0 ? <div className="category-empty">
            <p>No {activeType} categories yet.</p>
            <button className="button-quiet" type="button" disabled={busy} aria-haspopup="dialog"
              onClick={(event) => openEditor(event.currentTarget)}>Add {categoryTypeLabels[activeType]} Category</button>
          </div> : <CategoryList categories={filteredCategories} type={activeType} disabled={busy}
            onOpen={(category, element) => openEditor(element, category)} />}
        </>}
      </div>
      {editor && <CategoryForm key={editor.category?.id ?? 'new'} category={editor.category} initialType={editor.initialType}
        categories={categories} disabled={busy} isLoading={isLoading} loadError={loadError}
        onSave={handleSave} onCancel={closeEditor} onDelete={handleDelete} onRetry={reload} />}
    </section>
  )
}
