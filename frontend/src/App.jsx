import { useEffect, useState } from 'react'
import { api } from './api'
import { NavLink, Route, Routes, useLocation, useMatch } from 'react-router-dom'
import { AppProvider, useApp } from './store'
import { Toast } from './ui'
import { money } from './format'
import EntryModal from './components/EntryModal'
import LedgerModal from './components/LedgerModal'
import PartyModal from './components/PartyModal'
import Dashboard from './pages/Dashboard'
import Daybook from './pages/Daybook'
import LedgerPage from './pages/LedgerPage'
import PartyPage from './pages/PartyPage'

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}

function Shell() {
  const { ledgers, ledgersError, modal, openModal } = useApp()
  const [menu, setMenu] = useState(false)
  const [desktop, setDesktop] = useState(false)
  const [stopped, setStopped] = useState(false)
  useEffect(() => {
    api.get('/meta').then((m) => setDesktop(m.desktop)).catch(() => {})
  }, [])
  async function quit() {
    await fetch('/api/shutdown', { method: 'POST', headers: { 'X-Khata': '1' } }).catch(() => {})
    setStopped(true)
  }
  const loc = useLocation()
  const onLedger = useMatch('/ledgers/:id')

  useEffect(() => setMenu(false), [loc.pathname])

  // N opens a new entry from anywhere, on the ledger you are looking at.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (modal || e.metaKey || e.ctrlKey || e.altKey) return
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        openModal({ type: 'entry', ledgerId: onLedger ? Number(onLedger.params.id) : undefined })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modal, openModal, onLedger])

  return (
    <div className="app">
      <header className="mobilebar">
        <span className="brand">KhataDesk</span>
        <button className="btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-controls="sidebar">
          {menu ? 'Close' : 'Menu'}
        </button>
      </header>

      <nav id="sidebar" className={'sidebar' + (menu ? ' open' : '')} aria-label="Main">
        <div className="brand">KhataDesk</div>
        <button className="btn btn-primary wide-btn" onClick={() => openModal({ type: 'entry', ledgerId: onLedger ? Number(onLedger.params.id) : undefined })}>
          New entry <kbd>N</kbd>
        </button>

        <div className="navgroup">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/daybook">Daybook</NavLink>
        </div>

        <div className="navhead">
          <h2>Ledgers</h2>
          <button className="btn btn-quiet" onClick={() => openModal({ type: 'ledger' })}>
            New
          </button>
        </div>
        <div className="navgroup ledgers">
          {ledgersError && <p className="navnote">Cannot load ledgers.</p>}
          {ledgers && ledgers.length === 0 && <p className="navnote">No ledgers yet.</p>}
          {ledgers?.map((l) => (
            <NavLink key={l.id} to={`/ledgers/${l.id}`}>
              <span className="nav-name">{l.name}</span>
              <span className={'num nav-amt' + (l.balance === 0 ? ' zero' : '')}>{money(l.balance)}</span>
            </NavLink>
          ))}
        </div>


        {desktop && (
          <div className="sidefoot">
            <p>Your data is saved on this computer.</p>
            <button className="btn" onClick={quit}>Quit KhataDesk</button>
          </div>
        )}
      </nav>

      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/daybook" element={<Daybook />} />
          <Route path="/ledgers/:id" element={<LedgerPage />} />
          <Route path="/parties/:id" element={<PartyPage />} />
          <Route path="*" element={<div className="page"><h1>Page not found</h1></div>} />
        </Routes>
      </main>

      {modal?.type === 'entry' && <EntryModal key={JSON.stringify(modal)} {...modal} />}
      {modal?.type === 'ledger' && <LedgerModal {...modal} />}
      {modal?.type === 'party' && <PartyModal {...modal} />}
      {stopped && (
        <div className="scrim" role="alertdialog" aria-labelledby="stopped-title">
          <div className="dialog">
            <h2 id="stopped-title">KhataDesk has stopped</h2>
            <p className="hint spaced">Your data is saved. You can close this window. Open KhataDesk from the Start menu or desktop to use it again.</p>
          </div>
        </div>
      )}
      <Toast />
    </div>
  )
}
