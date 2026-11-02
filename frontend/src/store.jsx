import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const [ledgers, setLedgers] = useState(null)
  const [ledgersError, setLedgersError] = useState(null)
  const [version, setVersion] = useState(0)
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)

  // Any write calls refresh(): the sidebar and every page re-read their data.
  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let alive = true
    api
      .get('/ledgers')
      .then((d) => alive && (setLedgers(d), setLedgersError(null)))
      .catch((e) => alive && setLedgersError(e.message))
    return () => {
      alive = false
    }
  }, [version])

  const notify = useCallback((msg) => setToast({ msg, id: Date.now() }), [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const value = useMemo(
    () => ({
      ledgers,
      ledgersError,
      version,
      refresh,
      modal,
      openModal: setModal,
      closeModal: () => setModal(null),
      toast,
      notify,
    }),
    [ledgers, ledgersError, version, refresh, modal, toast, notify],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** GET a path, and read it again after any write. Data from another path is never shown. */
export function useFetch(path) {
  const { version } = useApp()
  const [state, setState] = useState({ path: null, data: null, error: null })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (path == null) return
    let alive = true
    api
      .get(path)
      .then((data) => alive && setState({ path, data, error: null }))
      .catch((error) => alive && setState({ path, data: null, error: error.message }))
    return () => {
      alive = false
    }
  }, [path, version, retry])
  const mine = state.path === path
  return {
    data: mine ? state.data : null,
    error: mine ? state.error : null,
    loading: !mine || (!state.data && !state.error),
    reload: () => {
      setState({ path: null, data: null, error: null })
      setRetry((r) => r + 1)
    },
  }
}
