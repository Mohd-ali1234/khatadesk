import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { Field, Modal } from '../ui'
import { useApp } from '../store'
import { money, todayISO } from '../format'

/**
 * One form for adding and editing entries.
 * Props: entry (edit), or ledgerId / partyId / direction to prefill a new one.
 */
export default function EntryModal({ entry, ledgerId, partyId, direction }) {
  const { ledgers, closeModal, refresh, notify } = useApp()
  const editing = !!entry
  const firstLedger = ledgerId ?? entry?.ledger_id ?? ledgers?.[0]?.id ?? ''
  const [lid, setLid] = useState(firstLedger)
  const [parties, setParties] = useState([])
  const [partyName, setPartyName] = useState(entry?.party_name ?? '')
  const [dir, setDir] = useState(entry?.direction ?? direction ?? 'got')
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '')
  const [date, setDate] = useState(entry?.entry_date ?? todayISO())
  const [note, setNote] = useState(entry?.note ?? '')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const amountRef = useRef(null)
  const partyRef = useRef(null)
  const addAnother = useRef(false)
  const formRef = useRef(null)

  const ledger = useMemo(() => ledgers?.find((l) => l.id === Number(lid)), [ledgers, lid])
  const isCash = ledger?.kind === 'cash'

  useEffect(() => {
    if (!lid || isCash || editing) return setParties([])
    let alive = true
    api.get(`/ledgers/${lid}/parties`).then((p) => {
      if (!alive) return
      setParties(p)
      if (partyId) {
        const found = p.find((x) => x.id === partyId)
        if (found) setPartyName(found.name)
      }
    })
    return () => {
      alive = false
    }
  }, [lid, isCash, editing, partyId])

  // Land on the field that needs typing: the amount when the person is known, otherwise the name.
  useEffect(() => {
    const el = partyId || editing || isCash ? amountRef.current : partyRef.current
    el?.focus()
    el?.select?.()
  }, [partyId, editing, isCash])

  const match = parties.find((p) => p.name.toLowerCase() === partyName.trim().toLowerCase())
  const isNewParty = !isCash && !editing && partyName.trim() && !match

  async function save(e) {
    e.preventDefault()
    const errs = {}
    const cleaned = amount.replace(/[,\s₹]/g, '')
    const num = Number(cleaned)
    if (!cleaned || !Number.isFinite(num) || num <= 0) errs.amount = 'Enter an amount above zero'
    else if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) errs.amount = 'Use at most two decimals'
    if (!ledger) errs.ledger = 'Create a ledger first'
    if (!isCash && !editing && !partyName.trim()) errs.party = 'Who is this for?'
    if (!date) errs.date = 'Pick a date'
    setErrors(errs)
    if (Object.keys(errs).length) {
      // Put the cursor on the first thing to fix.
      const first = errs.party ? partyRef.current : errs.amount ? amountRef.current : null
      first?.focus()
      return
    }

    setBusy(true)
    try {
      if (editing) {
        await api.patch(`/entries/${entry.id}`, { direction: dir, amount: cleaned, entry_date: date, note })
        notify('Entry updated')
      } else {
        let pid = null
        if (!isCash) {
          pid = match?.id
          if (!pid) {
            const created = await api.post(`/ledgers/${ledger.id}/parties`, { name: partyName })
            pid = created.id
            setParties((list) => [...list, created]) // so "save and add another" finds them next time
          }
        }
        await api.post('/entries', { ledger_id: ledger.id, party_id: pid, direction: dir, amount: cleaned, entry_date: date, note })
        notify(`${dir === 'gave' ? ledger.gave_label : ledger.got_label} ${money(num)} saved`)
      }
      refresh()
      if (addAnother.current) {
        addAnother.current = false
        setAmount('')
        setNote('')
        if (!partyId) setPartyName('')
        setBusy(false)
        ;(partyId || isCash ? amountRef : partyRef).current?.focus()
      } else closeModal()
    } catch (err) {
      setErrors({ form: err.message })
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await api.del(`/entries/${entry.id}`)
      notify('Entry deleted')
      refresh()
      closeModal()
    } catch (err) {
      setErrors({ form: err.message })
      setBusy(false)
    }
  }

  if (!ledgers) return null
  if (!ledgers.length)
    return (
      <Modal title="New entry" onClose={closeModal}>
        <NoLedgers />
      </Modal>
    )

  return (
    <Modal title={editing ? 'Edit entry' : 'New entry'} onClose={closeModal}>
      <form onSubmit={save} noValidate ref={formRef}>
        {!editing && !partyId && ledgers.length > 1 && (
          <Field label="Ledger" htmlFor="e-ledger" error={errors.ledger}>
            <select id="e-ledger" value={lid} onChange={(e) => (setLid(Number(e.target.value)), setPartyName(''))}>
              {ledgers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {!isCash && (
          <Field
            label="Party"
            htmlFor="e-party"
            error={errors.party}
            hint={isNewParty ? `“${partyName.trim()}” is new and will be added to ${ledger.name}.` : undefined}
          >
            <input
              id="e-party"
              ref={partyRef}
              list="e-parties"
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              disabled={editing}
              autoComplete="off"
              placeholder="Type a name"
            />
            <datalist id="e-parties">
              {parties.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </Field>
        )}

        <div className="field">
          <span className="label" id="e-dir">
            What happened
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="e-dir">
            {['gave', 'got'].map((d) => (
              <button
                type="button"
                role="radio"
                aria-checked={dir === d}
                key={d}
                className={dir === d ? 'on' : ''}
                onClick={() => setDir(d)}
              >
                {d === 'gave' ? ledger?.gave_label : ledger?.got_label}
              </button>
            ))}
          </div>
        </div>

        <div className="row2">
          <Field label="Amount (₹)" htmlFor="e-amount" error={errors.amount}>
            <input
              id="e-amount"
              ref={amountRef}
              className="amount-input num"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              autoComplete="off"
            />
          </Field>
          <Field label="Date" htmlFor="e-date" error={errors.date}>
            <input id="e-date" type="date" value={date} max="2100-01-01" onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Note" htmlFor="e-note" hint="Optional. Items, bill number, anything you will want to remember.">
          <input id="e-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} autoComplete="off" />
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
                <span>Delete this entry?</span>
                <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
                  Yes, delete
                </button>
                <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                  Keep it
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
          <div className="actions">
            {!editing && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  addAnother.current = true
                  formRef.current.requestSubmit()
                }}
              >
                Save and add another
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {editing ? 'Save changes' : 'Save entry'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function NoLedgers() {
  const { openModal } = useApp()
  return (
    <div className="empty">
      <p className="empty-title">Make a ledger first</p>
      <div className="empty-body">
        <p>Entries live inside ledgers, such as Customers or Suppliers.</p>
        <button className="btn btn-primary" onClick={() => openModal({ type: 'ledger' })}>
          Create a ledger
        </button>
      </div>
    </div>
  )
}
