import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Field, Modal } from '../ui'
import { useApp } from '../store'
import { plural } from '../format'

export default function PartyModal({ ledger, party }) {
  const { closeModal, refresh, notify } = useApp()
  const navigate = useNavigate()
  const editing = !!party
  const [name, setName] = useState(party?.name ?? '')
  const [phone, setPhone] = useState(party?.phone ?? '')
  const [note, setNote] = useState(party?.note ?? '')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save(e) {
    e.preventDefault()
    const errs = {}
    if (!name.trim()) errs.name = 'Enter a name'
    if (phone && phone.replace(/\D/g, '').length < 7) errs.phone = 'That phone number looks too short'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      if (editing) {
        await api.patch(`/parties/${party.id}`, { name, phone, note })
        notify('Saved')
      } else {
        const p = await api.post(`/ledgers/${ledger.id}/parties`, { name, phone, note })
        notify(`${p.name} added`)
        navigate(`/parties/${p.id}`)
      }
      refresh()
      closeModal()
    } catch (err) {
      setErrors({ form: err.message })
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await api.del(`/parties/${party.id}`)
      notify(`${party.name} deleted`)
      closeModal()
      navigate(`/ledgers/${party.ledger_id}`)
      setTimeout(refresh, 60) // after the navigation, so the page being left does not re-read a deleted party
    } catch (err) {
      setErrors({ form: err.message })
      setBusy(false)
    }
  }

  return (
    <Modal title={editing ? 'Edit details' : `Add to ${ledger.name}`} onClose={closeModal}>
      <form onSubmit={save} noValidate>
        <Field label="Name" htmlFor="p-name" error={errors.name}>
          <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} autoComplete="off" />
        </Field>
        <Field label="Phone" htmlFor="p-phone" error={errors.phone} hint="Optional. Used for WhatsApp reminders.">
          <input id="p-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} autoComplete="off" />
        </Field>
        <Field label="Note" htmlFor="p-note" hint="Optional. Address, shop, anything useful.">
          <input id="p-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} autoComplete="off" />
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
                <span>Delete with {plural(party.entry_count, 'entry', 'entries')}?</span>
                <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
                  Yes, delete
                </button>
                <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-quiet danger-text" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )
          ) : (
            <span />
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {editing ? 'Save changes' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
