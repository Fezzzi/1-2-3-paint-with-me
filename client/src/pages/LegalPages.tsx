import type { ReactNode } from 'react'
import { Box, Button, Container, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { usePageTitle } from '../ui/title.ts'

function LegalFrame({ title, children }: { title: string; children: ReactNode }) {
  usePageTitle(title)
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Button component={RouterLink} to="/">Home</Button>
      <Typography variant="overline" sx={{ mt: 2, display: 'block' }}>
        Template — review with legal counsel before launch.
      </Typography>
      <Typography variant="h3" component="h1" sx={{ mt: 1, mb: 2 }}>{title}</Typography>
      {children}
    </Container>
  )
}

export function PrivacyPage() {
  return (
    <LegalFrame title="Privacy">
      <Typography variant="h5" component="h2">Data we store</Typography>
      <Typography sx={{ mb: 2 }}>Google profile basics (name, email, photo), your paints, your projects, and uploaded photos.</Typography>
      <Typography variant="h5" component="h2">Why</Typography>
      <Typography sx={{ mb: 2 }}>So you can sign in, keep a paint library, and reopen a project without starting over.</Typography>
      <Typography variant="h5" component="h2">Retention</Typography>
      <Typography sx={{ mb: 2 }}>We keep this data until you delete a project, a paint, or your account.</Typography>
      <Typography variant="h5" component="h2">Deletion</Typography>
      <Typography sx={{ mb: 2 }}>You can delete your account from the Account page. That removes your profile, paints, projects, and uploaded files.</Typography>
      <Typography variant="h5" component="h2">Cookies</Typography>
      <Typography sx={{ mb: 2 }}>One session cookie keeps you signed in.</Typography>
      <Typography variant="h5" component="h2">Contact</Typography>
      <Typography sx={{ mb: 2 }}>Contact placeholder: privacy@example.com</Typography>
    </LegalFrame>
  )
}

export function TermsPage() {
  return (
    <LegalFrame title="Terms">
      <Typography sx={{ mb: 2 }}>This app turns a photo into a paint-by-number canvas for personal use.</Typography>
      <Typography variant="h5" component="h2">Your content</Typography>
      <Typography sx={{ mb: 2 }}>You keep the rights to photos you upload. You are responsible for having permission to use them.</Typography>
      <Typography variant="h5" component="h2">The preview</Typography>
      <Typography sx={{ mb: 2 }}>Color counts, paint matches, and quantity estimates are guides. Printing and paint brands can look different from the screen.</Typography>
      <Typography variant="h5" component="h2">Accounts</Typography>
      <Typography sx={{ mb: 2 }}>You can delete your account at any time from the Account page.</Typography>
      <Box sx={{ mt: 2 }}>
        <Typography>Contact placeholder: legal@example.com</Typography>
      </Box>
    </LegalFrame>
  )
}
