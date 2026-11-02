const nf = {}
function fmt(dp) {
  return (nf[dp] ??= new Intl.NumberFormat('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }))
}

/** ₹1,23,456 in Indian grouping. Whole rupees unless dp is given or the value has paise. */
export function money(n, dp) {
  n = Number(n) || 0
  dp ??= Number.isInteger(n) ? 0 : 2
  return (n < 0 ? '−' : '') + '₹' + fmt(dp).format(Math.abs(n))
}

/** Decimals for a column: 2 if any value has paise, else 0, so digits line up. */
export const decimalsFor = (values) => (values.some((v) => !Number.isInteger(Number(v))) ? 2 : 0)

export function compact(n) {
  if (n >= 100000) return '₹' + +(n / 100000).toFixed(1) + 'L'
  if (n >= 1000) return '₹' + +(n / 1000).toFixed(1) + 'k'
  return '₹' + n
}

const pad = (n) => String(n).padStart(2, '0')
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayISO = () => toISO(new Date())
export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function fmtDate(iso) {
  if (!iso) return '–'
  const d = parseISO(iso)
  const opts = { day: '2-digit', month: 'short' }
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString('en-IN', opts)
}

export function daysSince(iso) {
  const a = parseISO(iso)
  const b = parseISO(todayISO())
  return Math.round((b - a) / 86400000)
}

export function relative(iso) {
  if (!iso) return 'never'
  const n = daysSince(iso)
  if (n <= 0) return 'today'
  if (n === 1) return 'yesterday'
  return `${n} days ago`
}

export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** What a party's balance means, by ledger kind. */
export function balanceWords(kind, balance) {
  if (kind === 'cash') return 'in hand'
  if (kind === 'custom') return balance === 0 ? 'settled' : balance > 0 ? 'net in' : 'net out'
  if (balance === 0) return 'settled'
  if (kind === 'receivable') return balance > 0 ? 'to receive' : 'advance'
  return balance > 0 ? 'to pay' : 'advance paid'
}

/** Only money coming into the shop reads as a gain. Credit bought from a supplier does not. */
export const isMoneyIn = (kind, direction) => direction === 'got' && kind !== 'payable'

export const KINDS = {
  receivable: { title: 'Customers', hint: 'People who buy from you on credit. Track what they owe.' },
  payable: { title: 'Suppliers', hint: 'People you buy from on credit. Track what you owe.' },
  cash: { title: 'Cash book', hint: 'Money in and out of the till. No people, just entries.' },
  custom: { title: 'Something else', hint: 'Staff advances, committees, loans. Name the two sides yourself.' },
}

export const DEFAULT_LABELS = {
  receivable: ['You gave', 'You got'],
  payable: ['You paid', 'You bought'],
  cash: ['Cash out', 'Cash in'],
  custom: ['Out', 'In'],
}

export function whatsappLink(phone, text) {
  let p = (phone || '').replace(/[^\d]/g, '')
  if (!p) return null
  if (p.length === 10) p = '91' + p
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`
}
