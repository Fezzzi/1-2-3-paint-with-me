import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar } from '@mui/material'
import { ConfirmContext, SnackbarContext, type ConfirmRequest } from './feedbackContext.ts'

type Snack = { id: number; message: string; severity: 'success' | 'info' | 'error' }

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Snack[]>([])
  const current = queue[0] ?? null

  const show = useCallback((message: string, severity: 'success' | 'info' | 'error' = 'success') => {
    setQueue((items) => [...items, { id: Date.now() + items.length, message, severity }])
  }, [])

  const api = useMemo(() => ({ show }), [show])

  return (
    <SnackbarContext.Provider value={api}>
      {children}
      <Snackbar
        open={current !== null}
        autoHideDuration={4000}
        onClose={() => setQueue((items) => items.slice(1))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {current ? (
          <Alert severity={current.severity} variant="filled" onClose={() => setQueue((items) => items.slice(1))} sx={{ width: '100%' }}>
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </SnackbarContext.Provider>
  )
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [resolve, setResolve] = useState<((value: boolean) => void) | null>(null)

  const confirm = useCallback((next: ConfirmRequest) => {
    return new Promise<boolean>((done) => {
      setRequest(next)
      setResolve(() => done)
    })
  }, [])

  function close(value: boolean) {
    resolve?.(value)
    setResolve(null)
    setRequest(null)
  }

  const api = useMemo(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <Dialog open={request !== null} onClose={() => close(false)} aria-labelledby="confirm-title">
        {request ? (
          <>
            <DialogTitle id="confirm-title">{request.title}</DialogTitle>
            <DialogContent>{request.body}</DialogContent>
            <DialogActions>
              <Button onClick={() => close(false)}>Cancel</Button>
              <Button variant="contained" color={request.danger ? 'error' : 'primary'} onClick={() => close(true)}>
                {request.confirmLabel}
              </Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  )
}
