import { useState } from 'react'
import { Avatar, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { deleteAccount } from '../session.ts'
import { useSnackbar } from '../ui/useFeedback.ts'
import { usePageTitle } from '../ui/title.ts'

export function AccountPage() {
  const { user, signOut, clearUser } = useAuth()
  const snackbar = useSnackbar()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  usePageTitle('Account')
  if (!user) return null
  const label = user.displayName || user.email

  async function onDelete() {
    setBusy(true)
    setError(null)
    try {
      await deleteAccount(email.trim())
      clearUser()
      snackbar.show('Your account has been deleted.')
      navigate('/')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the account.')
      setBusy(false)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 2, maxWidth: 640 }}>
      <Typography variant="h4" component="h1">Account</Typography>
      <Card>
        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Avatar src={user.photoUrl ?? undefined} alt="" sx={{ width: 64, height: 64 }}>{label.slice(0, 1).toUpperCase()}</Avatar>
          <Box>
            <Typography variant="h6">{user.displayName || 'Signed in'}</Typography>
            <Typography color="text.secondary">{user.email}</Typography>
            <Button sx={{ mt: 1 }} onClick={() => void signOut()}>Sign out</Button>
          </Box>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="h6" component="h2">Danger zone</Typography>
          <Typography color="text.secondary" sx={{ my: 1 }}>Delete your account, paints, projects, and uploaded files.</Typography>
          <Button color="error" variant="outlined" onClick={() => setOpen(true)}>Delete account</Button>
        </CardContent>
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Delete account</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            This deletes your profile, paints, projects, and photos. Type {user.email} to confirm.
          </Typography>
          <TextField label="Email" value={email} onChange={(event) => setEmail(event.target.value)} fullWidth />
          {error ? <Typography color="error" sx={{ mt: 1 }}>{error}</Typography> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={busy || email.trim().toLowerCase() !== user.email.toLowerCase()} onClick={() => void onDelete()}>
            Delete account
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
