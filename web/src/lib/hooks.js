import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

// Ouvre automatiquement un formulaire de création quand l'URL contient ?new=1
// (utilisé par le bouton « + Créer » global).
export function useOpenOnNew(open, enabled = true) {
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (params.get('new') === '1' && enabled) {
      open()
      const q = new URLSearchParams(params)
      q.delete('new')
      setParams(q, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
