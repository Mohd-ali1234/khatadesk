import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp, useFetch } from '../store'
import { Empty, ErrorBox, Loading } from '../ui'
import EntriesTable from '../components/EntriesTable'
import { KINDS, balanceWords, decimalsFor, fmtDate, isMoneyIn, money, plural, relative } from '../format'

export default function LedgerPage() {
  const { id } = useParams()
  const { ledgers, openModal } = useApp()
  const ledger = ledgers?.find((l) => String(l.id) === id)

  if (!ledgers) return <div className="page"><Loading /></div>
  if (!ledger)
    return (
      <div className="page">
        <h1>Ledger not found</h1>
        <p className="finding">It may have been deleted.</p>
        <Link to="/" className="link">Back to dashboard</Link>
      </div>
    )
  return ledger.kind === 'cash' ? <CashLedger ledger={ledger} /> : <PartyLedger ledger={ledger} />
}

function Header({ ledger, summary }) {
  const { openModal } = useApp()
  return (
    <div className="titlerow">
      <div>
        <h1>{ledger.name}</h1>
        <p className="finding">{summary}</p>
      </div>
      <div className="actions">
        <button className="btn btn-quiet" onClick={() => openModal({ type: 'ledger', ledger })}>Edit ledger</button>
        {ledger.kind !== 'cash' && <button className="btn" onClick={() => openModal({ type: 'party', ledger })}>Add {partyWord(ledger.kind)}</button>}
        <button className="btn btn-primary" onClick={() => openModal({ type: 'entry', ledgerId: ledger.id })}>New entry</button>
      </div>
    </div>
  )
}

const WORDS = { receivable: ['customer', 'customers'], payable: ['supplier', 'suppliers'] }
const partyWord = (kind) => (WORDS[kind] ?? ['party', 'parties'])[0]
const partyWords = (kind) => (WORDS[kind] ?? ['party', 'parties'])[1]

function Totals({ ledger }) {
  return (
    <section className="kpis three" aria-label="Totals">
      <div className="kpi"><p className="kpi-label">{ledger.gave_label}, in total</p><p className="kpi-value num">{money(ledger.gave_total)}</p></div>
      <div className="kpi"><p className="kpi-label">{ledger.got_label}, in total</p><p className="kpi-value num">{money(ledger.got_total)}</p></div>
      <div className="kpi">
        <p className="kpi-label">{ledger.kind === 'receivable' ? 'To receive' : ledger.kind === 'payable' ? 'To pay' : ledger.kind === 'cash' ? 'In hand' : 'Balance'}</p>
        <p className={'kpi-value num' + (ledger.balance === 0 ? ' zero' : '')}>{money(ledger.balance)}</p>
      </div>
    </section>
  )
}

function PartyLedger({ ledger }) {
  const { openModal } = useApp()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('balance')
  const path = `/ledgers/${ledger.id}/parties${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`
  const { data, error, reload } = useFetch(path)

  const rows = useMemo(() => {
    if (!data) return []
    const r = [...data]
    if (sort === 'balance') r.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name))
    if (sort === 'name') r.sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'recent') r.sort((a, b) => (b.last_entry ?? '').localeCompare(a.last_entry ?? ''))
    return r
  }, [data, sort])
  const dp = decimalsFor(rows.map((r) => r.balance))
  const word = partyWord(ledger.kind)
  const words = partyWords(ledger.kind)
  const summary =
    ledger.party_count === 0
      ? `No ${words} yet. Add the first one to start keeping their account.`
      : `${plural(ledger.party_count, word, words)} · ${money(ledger.balance)} ${balanceWords(ledger.kind, ledger.balance)}`

  return (
    <div className="page">
      <Header ledger={ledger} summary={summary} />
      <Totals ledger={ledger} />

      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="Sort">
          {[['balance', 'Highest balance'], ['recent', 'Recent activity'], ['name', 'Name']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{label}</button>
          ))}
        </div>
        <label className="sr" htmlFor="pl-q">Search</label>
        <input id="pl-q" type="search" placeholder={`Search ${words}`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <section className="panel flush">
        {error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          q ? (
            <Empty title="No match">Nobody in {ledger.name} matches “{q}”.</Empty>
          ) : (
            <Empty title={`No ${words} yet`}>
              <p>{KINDS[ledger.kind].hint}</p>
              <button className="btn btn-primary" onClick={() => openModal({ type: 'party', ledger })}>Add {word}</button>
            </Empty>
          )
        ) : (
          <div className="tablewrap">
            <table className="table linked">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Last entry</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/parties/${p.id}`} className="cell-link">
                        <span className="row-title">{p.name}</span>
                        {p.phone && <span className="row-sub">{p.phone}</span>}
                      </Link>
                    </td>
                    <td className="muted nowrap">{p.last_entry ? relative(p.last_entry) : '–'}</td>
                    <td className="num">
                      <span className={'strong' + (p.balance === 0 ? ' zero' : '')}>{money(Math.abs(p.balance), dp)}</span>
                      <span className="row-sub right">{balanceWords(ledger.kind, p.balance)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {ledger.entry_count > 0 && <LatestEntries ledger={ledger} />}
    </div>
  )
}

function LatestEntries({ ledger }) {
  const { data } = useFetch(`/entries?ledger_id=${ledger.id}&limit=5`)
  if (!data?.items.length) return null
  const dp = decimalsFor(data.items.map((e) => e.amount))
  return (
    <section className="panel latest" aria-labelledby="h-latest">
      <div className="panel-head">
        <h2 id="h-latest">Latest entries</h2>
        <Link to={`/daybook?ledger=${ledger.id}&range=all`} className="link">Open in daybook</Link>
      </div>
      <ul className="rows">
        {data.items.map((e) => {
          const inn = isMoneyIn(ledger.kind, e.direction)
          return (
            <li key={e.id} className="row">
              <Link to={`/parties/${e.party_id}`} className="row-main">
                <span className="row-title">{e.party_name}</span>
                <span className="row-sub">{fmtDate(e.entry_date)} · {e.direction === 'gave' ? ledger.gave_label : ledger.got_label}{e.note ? ` · ${e.note}` : ''}</span>
              </Link>
              <span className={'num' + (inn ? ' in' : '')}>{inn ? '+' : ''}{money(e.amount, dp)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function CashLedger({ ledger }) {
  const { openModal } = useApp()
  const { data, error, reload } = useFetch(`/entries?ledger_id=${ledger.id}&limit=200`)
  const summary = `${money(ledger.balance)} ${balanceWords(ledger.kind, ledger.balance)} · ${plural(ledger.entry_count, 'entry', 'entries')}`
  return (
    <div className="page">
      <Header ledger={ledger} summary={summary} />
      <Totals ledger={ledger} />
      <section className="panel flush">
        {error ? (
          <ErrorBox message={error} onRetry={reload} />
        ) : !data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <Empty title="No entries yet">
            <p>{KINDS.cash.hint}</p>
            <button className="btn btn-primary" onClick={() => openModal({ type: 'entry', ledgerId: ledger.id })}>New entry</button>
          </Empty>
        ) : (
          <>
            <EntriesTable entries={data.items} gaveLabel={ledger.gave_label} gotLabel={ledger.got_label} showBalance balanceLabel="In hand" onEdit={(entry) => openModal({ type: 'entry', entry })} />
            {data.items.length < data.total && <p className="more muted">Showing the latest {data.items.length} of {data.total} entries. Use the daybook to see the rest.</p>}
          </>
        )}
      </section>
    </div>
  )
}
