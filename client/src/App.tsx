import { Container, Typography } from '@mui/material'

export default function App() {
  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1">
        1-2-3 draw with me!
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 2 }}>
        Project shell. Features are not built yet.
      </Typography>
    </Container>
  )
}
