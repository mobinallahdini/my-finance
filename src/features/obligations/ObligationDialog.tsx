import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, SubmitEvent } from 'react'
import { writeError } from './obligationPresentation'

interface Props {
  title: string
  dirty: boolean
  onClose: () => void
  onSubmit: () => Promise<void>
  children: ReactNode
}

export function ObligationDialog({ title, dirty, onClose, onSubmit, children }: Props) {
  const headingId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const originalURL = useRef(window.location.href)
  const submitting = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useLayoutEffect(() => {
    const element = dialog.current!
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    element.querySelector<HTMLElement>('h2')?.focus()
    return () => { element.close(); document.body.style.overflow = overflow }
  }, [])
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty || submitting.current) { event.preventDefault(); event.returnValue = '' }
    }
    const guard = (event: Event) => {
      if (window.location.href === originalURL.current) return
      if (submitting.current || (dirty && !window.confirm('Discard unsaved changes? Your changes will be lost.'))) {
        window.history.replaceState(window.history.state, '', originalURL.current)
        event.stopImmediatePropagation()
      }
    }
    window.addEventListener('beforeunload', unload)
    window.addEventListener('hashchange', guard, true)
    window.addEventListener('popstate', guard, true)
    return () => {
      window.removeEventListener('beforeunload', unload)
      window.removeEventListener('hashchange', guard, true)
      window.removeEventListener('popstate', guard, true)
    }
  }, [dirty])
  useEffect(() => { if (error) { errorRef.current?.focus(); errorRef.current?.scrollIntoView({ block: 'nearest' }) } }, [error])
  function close() {
    if (!submitting.current && (!dirty || window.confirm('Discard unsaved changes? Your changes will be lost.'))) onClose()
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const invalid = event.currentTarget.querySelector<HTMLInputElement>(':invalid')
    if (invalid) { invalid.reportValidity(); invalid.focus(); return }
    submitting.current = true
    setBusy(true)
    setError(null)
    try { await onSubmit() }
    catch (caught) { setError(writeError(caught)) }
    finally { submitting.current = false; setBusy(false) }
  }
  return <dialog ref={dialog} className="obligation-editor" aria-labelledby={headingId}
    onCancel={(event) => { event.preventDefault(); close() }} onKeyDown={(event) => {
      // Handle Escape before the browser's native close request so rejecting a
      // nested discard confirmation keeps this modal in the top layer.
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
      if (event.key !== 'Tab') return
      const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')).filter((node) => node.getClientRects().length)
      const first = targets[0], last = targets.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget.querySelector('h2'))) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <header className="obligation-editor-header">
        <h2 id={headingId} tabIndex={-1}>{title}</h2>
        <button className="button-quiet" type="button" disabled={busy} onClick={close}>Cancel</button>
        <button className="button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </header>
      <div className="obligation-editor-body" onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement && event.target.matches('input, select, textarea')) event.target.scrollIntoView({ block: 'nearest' })
      }}>
        <fieldset disabled={busy}>{children}</fieldset>
        {error && <p ref={errorRef} className="obligation-error" role="alert" tabIndex={-1}>{error}</p>}
      </div>
    </form>
  </dialog>
}
