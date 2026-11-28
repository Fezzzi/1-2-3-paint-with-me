import { useContext } from 'react'
import { ConfirmContext, SnackbarContext, type ConfirmApi, type SnackbarApi } from './feedbackContext.ts'

export function useSnackbar(): SnackbarApi {
  const value = useContext(SnackbarContext)
  if (!value) throw new Error('SnackbarProvider is missing')
  return value
}

export function useConfirm(): ConfirmApi['confirm'] {
  const value = useContext(ConfirmContext)
  if (!value) throw new Error('ConfirmDialogProvider is missing')
  return value.confirm
}
