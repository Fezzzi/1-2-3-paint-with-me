import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from './context.ts'

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is missing')
  return value
}
