import { Button, Container, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { usePageTitle } from '../ui/title.ts'

export function NotFoundPage() {
  usePageTitle('Page not found')
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Typography variant="h3" component="h1">That page is not here</Typography>
      <Typography sx={{ mt: 1, mb: 2 }}>The link may be old, or the page may have moved.</Typography>
      <Button variant="contained" component={RouterLink} to="/">Go home</Button>
    </Container>
  )
}
