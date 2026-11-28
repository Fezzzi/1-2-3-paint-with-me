import { createContext } from 'react'

type Snack = {
  id: number
  message: string
  severity: 'success' | 'info' | 'error'
}

export type SnackbarApi = {
  show: (message: string, severity?: Snack['severity']) => void
}

export const SnackbarContext = createContext<SnackbarApi | null>(null)

export type ConfirmRequest = {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
}

export type ConfirmApi = {
  confirm: (request: ConfirmRequest) => Promise<boolean>
}

export const ConfirmContext = createContext<ConfirmApi | null>(null)
