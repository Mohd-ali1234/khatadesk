import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { downloadCsv } from '../api'
import { useApp, useFetch } from '../store'
import { Empty, ErrorBox, Loading } from '../ui'
import EntriesTable from '../components/EntriesTable'
import { money, plural, toISO, todayISO } from '../format'

const RANGES = [
  ['today', 'Today'],
  ['week', 'Last 7 days'],
  ['month', 'This month'],
  ['all', 'All time'],
]

function rangeDates(key) {
  const now = new Date()
  const today = toISO(now)
  if (key === 'today') return [today, today]
  if (key === 'week') return [toISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), today]
  if (key === 'month') return [toISO(new Date(now.getFullYear(), now.getMonth(), 1)), today]
  return ['', '']
}

export default function Daybook() {
  const { ledgers, openModal } = useApp()
  const [sp] = useSearchParams()
  const [range, setRange] = useState(RANGES.some(([k]) => k === sp.get('range')) ? sp.get('range') : 'week')
  const [ledgerId, setLedgerId] = useState(sp.get('ledger') ?? '')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(100)

  const [from, to] = rangeDates(range)
  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (from) p.set('date_from', from)
    if (to) p.set('date_to', to)
    if (ledgerId) p.set('ledger_id', ledgerId)
    if (q.trim()) p.set('q', q.trim())
    return p
  }, [from, to, ledgerId, q])
  const { data, error, reload } = useFetch(`/entries?${params}&limit=${limit}`)
  const selected = ledgers?.find((l) => String(l.id) === ledgerId)

  return (
    <div className="page">
      <div className="titlerow">
        <div>
          <h1>Daybook</h1>
          <p className="finding">Every entry across your ledgers, newest first.</p>
        </div>
        <button className="btn" onClick={() => downloadCsv(params.toString())}>
          Export CSV
        </button>
      </div>

      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="Period">
          {RANGES.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={range === k} className={range === k ? 'on' : ''} onClick={() => (setRange(k), setLimit(100))}>
              {label}
            </button>
          ))}
        </div>
        <label className="sr" htmlFor="d-ledger">Ledger</label>
        <select id="d-ledger" value={ledgerId} onChange={(e) => (setLedgerId(e.target.value), setLimit(100))}>
          <option value="">All ledgers</option>
          {ledgers?.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <label className="sr" htmlFor="d-q">Search</label>
        <input id="d-q" type="search" placeholder="Search name or note" value={q} onChange={(e) => (setQ(e.target.value), setLimit(100))} />
      </div>

      <section className="panel flush">
        {error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : !data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <Empty title="No entries here">
            <p>{q || ledgerId || range !== 'all' ? 'Nothing matches these filters. Try a wider period.' : 'Add your first entry to see it here.'}</p>
            <button className="btn btn-primary" onClick={() => openModal({ type: 'entry', ledgerId: ledgerId ? Number(ledgerId) : undefined })}>New entry</button>
          </Empty>
        ) : (
          <>
            <EntriesTable
              entries={data.items}
              showParty
              showLedger={!ledgerId}
              gaveLabel={selected?.gave_label ?? 'Gave'}
              gotLabel={selected?.got_label ?? 'Got'}
              onEdit={(entry) => openModal({ type: 'entry', entry })}
              footer={
                <tfoot>
                  <tr>
                    <td colSpan={ledgerId ? 3 : 4}>
                      Total of {plural(data.total, 'entry', 'entries')}
                    </td>
                    <td className="num strong">{money(data.gave_sum)}</td>
                    <td className="num strong">{money(data.got_sum)}</td>
                    <td />
                  </tr>
                </tfoot>
              }
            />
            {data.items.length < data.total && (
              <div className="more">
                <button className="btn" onClick={() => setLimit((l) => l + 100)}>
                  Show more ({data.total - data.items.length} left)
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
