import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useApp, useFetch } from '../store'
import { Delta, Empty, ErrorBox, Loading } from '../ui'
import SalesChart from '../components/SalesChart'
import { balanceWords, fmtDate, isMoneyIn, money, parseISO, plural, relative, whatsappLink, decimalsFor } from '../format'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Dashboard() {
  const { ledgers, openModal } = useApp()
  const { data: d, error, reload } = useFetch('/dashboard')
  const [hover, setHover] = useState(null)

  if (ledgers && ledgers.length === 0) return <Welcome />
  if (error) return <div className="page"><h1>Dashboard</h1><ErrorBox message={error} onRetry={reload} /></div>
  if (!d || !ledgers) return <div className="page"><h1>Dashboard</h1><Loading /></div>

  const top = d.top_debtors[0]
  const finding =
    d.counts.entries === 0
      ? 'No entries yet. Press N, or use New entry, to record your first one.'
      : d.debtor_count === 0
      ? 'Nobody owes you anything right now.'
      : `${money(d.to_receive)} is waiting to be collected from ${plural(d.debtor_count, 'customer')}. ${top.name} owes the most, ${money(top.balance)}, and ${top.last_payment ? 'last paid ' + relative(top.last_payment) : 'has not paid yet'}.`

  // The same span of last month, named so every comparison says what it is against.
  const ms = parseISO(d.month_start)
  const prevStart = new Date(ms.getFullYear(), ms.getMonth() - 1, 1)
  const prevEnd = parseISO(d.prev_same_day)
  const mon = MONTHS[prevStart.getMonth()]
  const window = prevEnd.getDate() === 1 ? `1 ${mon}` : `1–${prevEnd.getDate()} ${mon}`

  const total30 = d.daily_sales.reduce((s, x) => s + x.amount, 0)
  const readout = hover ? `${fmtDate(hover.date)}: ${money(hover.amount)}` : `${money(total30)} in the last 30 days`
  const kindOf = (id) => ledgers.find((l) => l.id === id)?.kind
  const dpDebt = decimalsFor(d.top_debtors.map((x) => x.balance))
  const dpRec = decimalsFor(d.recent.slice(0, 4).map((x) => x.amount))

  return (
    <div className="page">
      <div className="titlerow">
        <div>
          <h1>Dashboard</h1>
          <p className="finding">{finding}</p>
        </div>
      </div>

      <section className="kpis" aria-label="Summary">
        <Kpi label="To receive" value={money(d.to_receive)} sub={d.debtor_count ? `From ${plural(d.debtor_count, 'customer')}` : 'Nobody owes you'} zero={!d.to_receive} />
        <Kpi label="To pay" value={money(d.to_pay)} sub={d.creditor_count ? `To ${plural(d.creditor_count, 'supplier')}` : 'Nothing due'} zero={!d.to_pay} />
        <Kpi label="Sales this month" value={money(d.sales_month)} sub={<Delta now={d.sales_month} before={d.sales_prev_period} window={window} />} zero={!d.sales_month} />
        <Kpi label="Collected this month" value={money(d.collected_month)} sub={<Delta now={d.collected_month} before={d.collected_prev_period} window={window} />} zero={!d.collected_month} />
        <Kpi label="Cash in hand" value={money(d.cash_in_hand)} sub="From your cash book" zero={!d.cash_in_hand} />
      </section>

      <div className="grid">
        <section className="panel span7" aria-labelledby="h-sales">
          <div className="panel-head">
            <h2 id="h-sales">Sales, last 30 days</h2>
            <p className="readout num" aria-live="off">{readout}</p>
          </div>
          <SalesChart days={d.daily_sales} monthStart={d.month_start} onHover={setHover} />
          <div className="legend">
            <span><i className="sw now" />This month</span>
            <span><i className="sw before" />Earlier</span>
            <span className="muted grow">Sales are credit given to customers plus cash in.</span>
          </div>
        </section>

        <section className="panel span5" aria-labelledby="h-collect">
          <div className="panel-head">
            <h2 id="h-collect">Collect from</h2>
            {top && (
              <Link to={`/ledgers/${top.ledger_id}`} className="link">
                View all
              </Link>
            )}
          </div>
          {d.top_debtors.length === 0 ? (
            <Empty title="Nothing to collect">Credit you give to customers will show up here.</Empty>
          ) : (
            <ul className="rows">
              {d.top_debtors.map((p) => {
                const wa = whatsappLink(p.phone, `Hello ${p.name}, a gentle reminder that ${money(p.balance)} is pending on your account. Please pay when convenient. Thank you!`)
                return (
                  <li key={p.party_id} className="row">
                    <Link to={`/parties/${p.party_id}`} className="row-main">
                      <span className="row-title">{p.name}</span>
                      <span className="row-sub">{p.last_payment ? `Last paid ${relative(p.last_payment)}` : 'Has not paid yet'}</span>
                    </Link>
                    <span className="num strong">{money(p.balance, dpDebt)}</span>
                    {wa && (
                      <a className="btn" href={wa} target="_blank" rel="noreferrer" aria-label={`Send ${p.name} a WhatsApp reminder`}>
                        Remind
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="panel span7" aria-labelledby="h-recent">
          <div className="panel-head">
            <h2 id="h-recent">Latest entries</h2>
            <Link to="/daybook" className="link">
              Open daybook
            </Link>
          </div>
          <ul className="rows">
            {d.recent.slice(0, 4).map((e) => {
              const kind = kindOf(e.ledger_id)
              const inn = isMoneyIn(kind, e.direction)
              const target = e.party_id ? `/parties/${e.party_id}` : `/ledgers/${e.ledger_id}`
              return (
                <li key={e.id} className="row">
                  <Link to={target} className="row-main">
                    <span className="row-title">{e.party_name ?? e.ledger_name}</span>
                    <span className="row-sub">
                      {fmtDate(e.entry_date)} · {e.ledger_name}
                      {e.note ? ` · ${e.note}` : ''}
                    </span>
                  </Link>
                  <span className={'num' + (inn ? ' in' : '')}>
                    {inn ? '+' : ''}
                    {money(e.amount, dpRec)}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="panel span5" aria-labelledby="h-pay">
          <div className="panel-head">
            <h2 id="h-pay">Pay soon</h2>
          </div>
          {d.top_creditors.length === 0 ? (
            <Empty title="Nothing to pay">Stock you buy on credit will show up here.</Empty>
          ) : (
            <ul className="rows">
              {d.top_creditors.map((p) => (
                <li key={p.party_id} className="row">
                  <Link to={`/parties/${p.party_id}`} className="row-main">
                    <span className="row-title">{p.name}</span>
                    <span className="row-sub">{p.ledger_name} · last entry {relative(p.last_entry)}</span>
                  </Link>
                  <span className="num strong">{money(p.balance)}</span>
                </li>
              ))}
              <li className="row total">
                <span className="row-main"><span className="row-title">Total to pay</span></span>
                <span className="num strong">{money(d.to_pay)}</span>
              </li>
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, zero }) {
  return (
    <div className="kpi">
      <p className="kpi-label">{label}</p>
      <p className={'kpi-value num' + (zero ? ' zero' : '')}>{value}</p>
      <p className="kpi-sub">{sub}</p>
    </div>
  )
}

function Welcome() {
  const { openModal, refresh, notify } = useApp()
  const preset = async (name, kind) => {
    try {
      await api.post('/ledgers', { name, kind })
      notify(`${name} created`)
      refresh()
    } catch (e) {
      notify(e.message)
    }
  }
  return (
    <div className="page narrow">
      <h1>Welcome to KhataDesk</h1>
      <p className="finding">Keep every account of your shop in ledgers you shape yourself. Start with the ones most shops need, or make your own.</p>
      <div className="panel starter">
        <ul className="rows">
          <li className="row">
            <span className="row-main"><span className="row-title">Customers</span><span className="row-sub">Who owes you for goods given on credit</span></span>
            <button className="btn" onClick={() => preset('Customers', 'receivable')}>Add</button>
          </li>
          <li className="row">
            <span className="row-main"><span className="row-title">Suppliers</span><span className="row-sub">What you owe for stock bought on credit</span></span>
            <button className="btn" onClick={() => preset('Suppliers', 'payable')}>Add</button>
          </li>
          <li className="row">
            <span className="row-main"><span className="row-title">Cash book</span><span className="row-sub">Daily cash sales and expenses</span></span>
            <button className="btn" onClick={() => preset('Cash book', 'cash')}>Add</button>
          </li>
        </ul>
      </div>
      <button className="btn btn-primary" onClick={() => openModal({ type: 'ledger' })}>Create your own ledger</button>
    </div>
  )
}
