import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Field, Modal } from '../ui'
import { useApp } from '../store'
import { DEFAULT_LABELS, KINDS, plural } from '../format'

/** Create a ledger of any kind and name its two sides, or edit one. */
export default function LedgerModal({ ledger }) {
  const { closeModal, refresh, notify } = useApp()
  const navigate = useNavigate()
  const editing = !!ledger
  const [kind, setKind] = useState(ledger?.kind ?? 'receivable')
  const [name, setName] = useState(ledger?.name ?? '')
  const [gave, setGave] = useState(ledger?.gave_label ?? DEFAULT_LABELS.receivable[0])
  const [got, setGot] = useState(ledger?.got_label ?? DEFAULT_LABELS.receivable[1])
  const [labelsTouched, setLabelsTouched] = useState(editing)
  const [note, setNote] = useState(ledger?.note ?? '')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function pickKind(k) {
    setKind(k)
    if (!labelsTouched) {
      setGave(DEFAULT_LABELS[k][0])
      setGot(DEFAULT_LABELS[k][1])
    }
    if (!editing && !name.trim()) setName('')
  }

  async function save(e) {
    e.preventDefault()
    const errs = {}
    if (!name.trim()) errs.name = 'Give the ledger a name'
    if (!gave.trim() || !got.trim()) errs.labels = 'Both sides need a name'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      if (editing) {
        await api.patch(`/ledgers/${ledger.id}`, { name, gave_label: gave, got_label: got, note })
        notify('Ledger updated')
        refresh()
        closeModal()
      } else {
        const created = await api.post('/ledgers', { name, kind, gave_label: gave, got_label: got, note })
        notify(`${created.name} created`)
        refresh()
        closeModal()
        navigate(`/ledgers/${created.id}`)
      }
    } catch (err) {
      setErrors({ form: err.message })
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await api.del(`/ledgers/${ledger.id}`)
      notify(`${ledger.name} deleted`)
      closeModal()
      navigate('/')
      // Router navigation is a low-priority transition: refresh after it, or the page being left re-reads a deleted ledger.
      setTimeout(refresh, 60)
    } catch (err) {
      setErrors({ form: err.message })
      setBusy(false)
    }
  }

  return (
    <Modal title={editing ? 'Edit ledger' : 'New ledger'} onClose={closeModal} wide>
      <form onSubmit={save} noValidate>
        {!editing && (
          <div className="field">
            <span className="label" id="l-kind">
              What will you keep track of?
            </span>
            <div className="kinds" role="radiogroup" aria-labelledby="l-kind">
              {Object.entries(KINDS).map(([k, v]) => (
                <button type="button" role="radio" aria-checked={kind === k} key={k} className={'kind' + (kind === k ? ' on' : '')} onClick={() => pickKind(k)}>
                  <strong>{v.title}</strong>
                  <span>{v.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label="Ledger name" htmlFor="l-name" error={errors.name}>
          <input id="l-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus placeholder={placeholderFor(kind)} autoComplete="off" />
        </Field>

        <div className="row2">
          <Field label="Name for the first button" htmlFor="l-gave" error={errors.labels}>
            <input id="l-gave" value={gave} onChange={(e) => (setGave(e.target.value), setLabelsTouched(true))} maxLength={32} />
          </Field>
          <Field label="Name for the second button" htmlFor="l-got">
            <input id="l-got" value={got} onChange={(e) => (setGot(e.target.value), setLabelsTouched(true))} maxLength={32} />
          </Field>
        </div>
        <p className="hint spaced">
          Entries in this ledger use these two names, for example “{gave}” and “{got}”.
          {kind === 'receivable' && ' The first adds to what a customer owes you, the second reduces it.'}
          {kind === 'payable' && ' The second adds to what you owe, the first reduces it.'}
        </p>

        <Field label="Note" htmlFor="l-note" hint="Optional.">
          <input id="l-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} autoComplete="off" />
        </Field>

        {errors.form && (
          <p className="error" role="alert">
            {errors.form}
          </p>
        )}

        <div className="dialog-foot">
          {editing ? (
            confirmDelete ? (
              <div className="confirm">
                <span>
                  Delete with {plural(ledger.party_count, 'party', 'parties')} and {plural(ledger.entry_count, 'entry', 'entries')}?
                </span>
                <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
                  Yes, delete
                </button>
                <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-quiet danger-text" onClick={() => setConfirmDelete(true)}>
                Delete ledger
              </button>
            )
          ) : (
            <span />
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {editing ? 'Save changes' : 'Create ledger'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const placeholderFor = (k) => ({ receivable: 'Customers', payable: 'Suppliers', cash: 'Cash book', custom: 'Staff advances' })[k]
