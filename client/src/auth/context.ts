import { createContext } from 'react'
import type { PublicUser } from '../session.ts'

export type AuthContextValue = {
  user: PublicUser | null
  googleClientId: string
  devLoginEnabled: boolean
  loading: boolean
  loadError: string | null
  signInError: string | null
  signIn: (credential: string) => Promise<void>
  signInDev: () => Promise<void>
  signOut: () => Promise<void>
  clearUser: () => void
  setSignInError: (message: string | null) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
