import { useApp } from '../store'
import { decimalsFor, fmtDate, isMoneyIn, money } from '../format'

/**
 * Entries in two columns (gave / got) with an optional running balance.
 * Money coming in is green with a plus; everything else stays in ink.
 */
export default function EntriesTable({ entries, gaveLabel = 'Gave', gotLabel = 'Got', showLedger, showParty, showBalance, balanceLabel = 'Balance', onEdit, footer }) {
  const { ledgers } = useApp()
  const kindOf = (e) => ledgers?.find((l) => l.id === e.ledger_id)?.kind
  const dp = decimalsFor([...entries.map((e) => e.amount), ...entries.map((e) => e.running_balance ?? 0)])

  return (
    <div className="tablewrap">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            {showParty && <th>Party</th>}
            {showLedger && <th>Ledger</th>}
            <th className="note-col">Note</th>
            <th className="num">{gaveLabel}</th>
            <th className="num">{gotLabel}</th>
            {showBalance && <th className="num">{balanceLabel}</th>}
            <th className="act" />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const inn = isMoneyIn(kindOf(e), e.direction)
            return (
              <tr key={e.id} onClick={() => onEdit(e)} className="clickable">
                <td className="nowrap">{fmtDate(e.entry_date)}</td>
                {showParty && <td>{e.party_name ?? <span className="muted">–</span>}</td>}
                {showLedger && <td className="muted">{e.ledger_name}</td>}
                <td className="note-col">{e.note || <span className="muted">–</span>}</td>
                <td className="num">{e.direction === 'gave' ? money(e.amount, dp) : <span className="muted">–</span>}</td>
                <td className={'num' + (inn ? ' in' : '')}>{e.direction === 'got' ? (inn ? '+' : '') + money(e.amount, dp) : <span className="muted">–</span>}</td>
                {showBalance && <td className={'num strong' + (e.running_balance === 0 ? ' zero' : '')}>{money(e.running_balance ?? 0, dp)}</td>}
                <td className="act">
                  <button className="btn btn-quiet" onClick={(ev) => (ev.stopPropagation(), onEdit(e))} aria-label={`Edit entry of ${money(e.amount)} on ${fmtDate(e.entry_date)}`}>
                    Edit
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
        {footer}
      </table>
    </div>
  )
}
