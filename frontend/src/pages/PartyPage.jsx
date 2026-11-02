import { Link, useParams } from 'react-router-dom'
import { downloadCsv } from '../api'
import { useApp, useFetch } from '../store'
import { Empty, ErrorBox, Loading } from '../ui'
import EntriesTable from '../components/EntriesTable'
import { balanceWords, money, plural, relative, whatsappLink } from '../format'

export default function PartyPage() {
  const { id } = useParams()
  const { ledgers, openModal } = useApp()
  const party = useFetch(`/parties/${id}`)
  const entries = useFetch(`/entries?party_id=${id}&limit=500`)
  const ledger = ledgers?.find((l) => l.id === party.data?.ledger_id)

  if (party.error) return <div className="page"><h1>Not found</h1><ErrorBox message={party.error} /></div>
  if (!party.data || !ledger) return <div className="page"><Loading /></div>

  const p = party.data
  const items = entries.data?.items ?? []
  const lastPaid = items.find((e) => e.direction === 'got')
  const owes = ledger.kind === 'receivable' && p.balance > 0
  const wa = owes ? whatsappLink(p.phone, `Hello ${p.name}, a gentle reminder that ${money(p.balance)} is pending on your account. Please pay when convenient. Thank you!`) : null

  const meaning =
    ledger.kind === 'receivable'
      ? p.balance > 0 ? `${p.name} owes you` : p.balance < 0 ? `${p.name} has paid ahead` : 'All settled'
      : ledger.kind === 'payable'
        ? p.balance > 0 ? `You owe ${p.name}` : p.balance < 0 ? `You have paid ${p.name} ahead` : 'All settled'
        : 'Balance'

  return (
    <div className="page">
      <Link to={`/ledgers/${ledger.id}`} className="link back">← {ledger.name}</Link>
      <div className="titlerow">
        <div>
          <h1>{p.name}</h1>
          <p className="finding">
            {[p.phone, p.note].filter(Boolean).join(' · ') || 'No phone or note saved.'}
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-quiet" onClick={() => openModal({ type: 'party', ledger, party: p })}>Edit details</button>
          <button className="btn" onClick={() => downloadCsv(`party_id=${p.id}`)}>Export CSV</button>
        </div>
      </div>

      <section className="balancecard" aria-label="Balance">
        <div>
          <p className="kpi-label">{meaning}</p>
          <p className={'balance-figure num' + (p.balance === 0 ? ' zero' : '')}>{money(Math.abs(p.balance))}</p>
          <p className="kpi-sub">
            {balanceWords(ledger.kind, p.balance)}
            {ledger.kind === 'receivable' && p.entry_count > 0 && (lastPaid ? ` · last paid ${relative(lastPaid.entry_date)}` : ' · has not paid yet')}
          </p>
        </div>
        <div className="actions">
          {wa && <a className="btn" href={wa} target="_blank" rel="noreferrer">Remind on WhatsApp</a>}
          <button className="btn btn-lg" onClick={() => openModal({ type: 'entry', ledgerId: ledger.id, partyId: p.id, direction: 'gave' })}>{ledger.gave_label}</button>
          <button className="btn btn-primary btn-lg" onClick={() => openModal({ type: 'entry', ledgerId: ledger.id, partyId: p.id, direction: 'got' })}>{ledger.got_label}</button>
        </div>
      </section>

      <section className="panel flush">
        {entries.error ? (
          <ErrorBox message={entries.error} onRetry={entries.reload} />
        ) : !entries.data ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty title="No entries yet">Use “{ledger.gave_label}” or “{ledger.got_label}” above to record the first one.</Empty>
        ) : (
          <EntriesTable entries={items} gaveLabel={ledger.gave_label} gotLabel={ledger.got_label} showBalance onEdit={(entry) => openModal({ type: 'entry', entry })} />
        )}
      </section>
    </div>
  )
}
