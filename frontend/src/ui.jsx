import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from './store'

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null)
  useEffect(() => {
    const prev = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
          (el) => !el.disabled && el.offsetParent !== null,
        )
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus())
        else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus())
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [onClose])

  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'dialog' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={ref}>
        <div className="dialog-head">
          <h2 id="dialog-title">{title}</h2>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function Toast() {
  const { toast } = useApp()
  return (
    <div className="toast-region" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  )
}

export function Loading() {
  return (
    <div className="loading" role="status">
      Loading…
    </div>
  )
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="empty" role="alert">
      <p className="empty-title">Could not load this</p>
      <div className="empty-body">
        <p>{message}</p>
        {onRetry && (
          <button className="btn" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

export function Delta({ now, before, window }) {
  const diff = Math.round((now - before) * 100) / 100
  if (before === 0 && now === 0) return <span className="delta flat">No activity yet</span>
  if (before === 0) return <span className="delta up"><i className="tri up" />+{fmtShort(diff)} (new) vs {window}</span>
  if (diff === 0) return <span className="delta flat">Same as {window}</span>
  return (
    <span className={'delta ' + (diff > 0 ? 'up' : 'down')}>
      <i className={'tri ' + (diff > 0 ? 'up' : 'down')} />
      {diff > 0 ? '+' : '−'}
      {fmtShort(Math.abs(diff))} vs {window}
    </span>
  )
}
const fmtShort = (n) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
