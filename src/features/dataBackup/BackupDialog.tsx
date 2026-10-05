import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

export function BackupDialog({ title, busy, error, onClose, children, action, wide = false }: {
  title: string
  busy: boolean
  error: string
  onClose: () => void
  children: ReactNode
  action: ReactNode
  wide?: boolean
}) {
  const prefix = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const dialog = dialogRef.current!
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    dialog.querySelector<HTMLElement>('h2')?.focus()
    return () => { dialog.close(); document.body.style.overflow = oldOverflow }
  }, [])
  useEffect(() => {
    if (error) { errorRef.current?.focus(); errorRef.current?.scrollIntoView({ block: 'nearest' }) }
  }, [error])
  function containFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary',
    )).filter((element) => element.getClientRects().length)
    const first = targets[0], last = targets.at(-1)
    if (!first) { event.preventDefault(); event.currentTarget.querySelector<HTMLElement>('h2')?.focus() }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  return <dialog ref={dialogRef} className={`backup-dialog${wide ? ' backup-dialog-wide' : ''}`} aria-labelledby={`${prefix}-heading`}
    aria-busy={busy} onKeyDown={containFocus} onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="backup-dialog-layout">
      <header className="backup-dialog-header">
        <button className="button-quiet" type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <h2 id={`${prefix}-heading`} tabIndex={-1}>{title}</h2>
        <span className="backup-header-balance" aria-hidden="true" />
      </header>
      <div className="backup-dialog-body">
        {children}
        {error && <p ref={errorRef} className="backup-error" role="alert" tabIndex={-1}>{error}</p>}
        {busy && <p className="backup-feedback" role="status">Working with local data…</p>}
      </div>
      <footer className="backup-dialog-footer">{action}</footer>
    </div>
  </dialog>
}
