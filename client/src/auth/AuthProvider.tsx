import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { onSessionExpired } from '../api/http.ts'
import {
  fetchAuthConfig,
  fetchSessionUser,
  signInAsDeveloper,
  signInWithGoogle,
  signOutRequest,
  type PublicUser,
} from '../session.ts'
import { AuthContext } from './context.ts'
import { useSnackbar } from '../ui/useFeedback.ts'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [googleClientId, setGoogleClientId] = useState('')
  const [devLoginEnabled, setDevLoginEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [signInError, setSignInError] = useState<string | null>(null)
  const signingIn = useRef(false)
  const navigate = useNavigate()
  const snackbar = useSnackbar()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [config, sessionUser] = await Promise.all([fetchAuthConfig(), fetchSessionUser()])
        if (cancelled) return
        setGoogleClientId(config.googleClientId)
        setDevLoginEnabled(config.devLoginEnabled)
        setUser(sessionUser)
        setLoadError(null)
      } catch (error) {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : 'Something went wrong.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return onSessionExpired(() => {
      setUser(null)
      snackbar.show('Your session expired. Please sign in again.', 'info')
      navigate('/')
    })
  }, [navigate, snackbar])

  async function signIn(credential: string) {
    if (signingIn.current) return
    signingIn.current = true
    setSignInError(null)
    try {
      setUser(await signInWithGoogle(credential))
      navigate('/projects')
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : 'Sign-in failed.')
    } finally {
      signingIn.current = false
    }
  }

  async function signInDev() {
    setSignInError(null)
    try {
      setUser(await signInAsDeveloper())
      navigate('/projects')
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : 'Sign-in failed.')
    }
  }

  async function signOut() {
    try {
      await signOutRequest()
      setUser(null)
      navigate('/')
    } catch (error) {
      snackbar.show(error instanceof Error ? error.message : 'Sign-out failed.', 'error')
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        googleClientId,
        devLoginEnabled,
        loading,
        loadError,
        signInError,
        signIn,
        signInDev,
        signOut,
        clearUser: () => setUser(null),
        setSignInError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
