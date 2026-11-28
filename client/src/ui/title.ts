import { useEffect } from 'react'

const APP = '1-2-3 paint with me!'

export function usePageTitle(page: string | null) {
  useEffect(() => {
    document.title = page ? `${page} · ${APP}` : APP
    return () => {
      document.title = APP
    }
  }, [page])
}
