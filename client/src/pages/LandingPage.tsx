import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Container, Typography } from '@mui/material'
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google'
import { Link as RouterLink, Navigate } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { brand } from '../brand.ts'
import { BrandStripe, Logo } from '../Logo.tsx'
import { usePageTitle } from '../ui/title.ts'

const steps = [
  ['Upload & frame', 'Add a photo and place it on the page.'],
  ['Choose colors', 'Pick how many colors and match paints you own.'],
  ['Print & paint', 'Download a numbered canvas and print it at 100%.'],
]

const features = [
  ['Exact color count', 'The preview uses the number of colors you choose.'],
  ['Uses paints you own', 'Match each color to a paint already in your library.'],
  ['True paper sizes', 'A5, A4, A3, Letter, or a custom size.'],
  ['Paint quantity estimates', 'See roughly how much paint each color needs.'],
]

const year = new Date().getFullYear()

const faqs = [
  ['Which photos can I use?', 'JPEG, PNG, WebP, GIF, and HEIC. The first frame of a GIF is used. If a HEIC photo cannot be opened, try exporting it as JPEG.'],
  ['How should I print?', 'Print at 100% (actual size) and check the 50 mm scale bar on the color key.'],
  ['Will the colors match my paints exactly?', 'Colors are a guide. Screens, printers, and paint brands all shift color a little.'],
  ['Where is my photo processed?', 'Processing runs in your browser. Saved photos are stored privately in your account. You can delete your account anytime.'],
]

export function LandingPage() {
  const auth = useAuth()
  usePageTitle(null)
  if (auth.loading) return null
  if (auth.user) return <Navigate to="/projects" replace />
  return (
    <Box>
      <BrandStripe />
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 4, alignItems: 'center' }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Logo size={56} gap={brand.paper} />
              <Typography variant="h3" component="p">1-2-3 paint with me!</Typography>
            </Box>
            <Typography variant="h4" component="h1" sx={{ mt: 3 }}>
              Turn a favorite photo into a canvas you can paint
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 2, mb: 3 }}>
              Pick how many colors, match the paints you already own, and print a numbered canvas at home.
            </Typography>
            {auth.loadError ? <Alert severity="error" sx={{ mb: 2 }}>{auth.loadError}</Alert> : null}
            {auth.signInError ? <Alert severity="error" sx={{ mb: 2 }}>{auth.signInError}</Alert> : null}
            {auth.googleClientId ? (
              <GoogleOAuthProvider clientId={auth.googleClientId}>
                <GoogleLogin
                  onSuccess={(response) => {
                    if (!response.credential) {
                      auth.setSignInError('Sign-in failed.')
                      return
                    }
                    void auth.signIn(response.credential)
                  }}
                  onError={() => auth.setSignInError('Google sign-in failed.')}
                />
              </GoogleOAuthProvider>
            ) : null}
            {auth.devLoginEnabled ? (
              <Button variant="outlined" sx={{ mt: 2 }} onClick={() => void auth.signInDev()}>
                Continue as developer
              </Button>
            ) : null}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }} aria-hidden>
            <Box component="img" src="/landing/photo.webp" alt="" sx={{ width: '100%', borderRadius: 2 }} />
            <Box component="img" src="/landing/colors.webp" alt="" sx={{ width: '100%', borderRadius: 2 }} />
            <Box component="img" src="/landing/outline.svg" alt="" sx={{ width: '100%', borderRadius: 2, bgcolor: '#fff' }} />
          </Box>
        </Box>
        <Typography variant="h4" component="h2" sx={{ mt: 8, mb: 2 }}>How it works</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
          {steps.map(([title, body]) => (
            <Box key={title} sx={{ p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="h6" component="h3">{title}</Typography>
              <Typography color="text.secondary">{body}</Typography>
            </Box>
          ))}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 4 }}>
          {features.map(([title, body]) => (
            <Box key={title} sx={{ p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="h6" component="h3">{title}</Typography>
              <Typography color="text.secondary">{body}</Typography>
            </Box>
          ))}
        </Box>
        <Typography variant="h4" component="h2" sx={{ mt: 6, mb: 1 }}>Questions</Typography>
        {faqs.map(([title, body]) => (
          <Accordion key={title}>
            <AccordionSummary>{title}</AccordionSummary>
            <AccordionDetails>{body}</AccordionDetails>
          </Accordion>
        ))}
        <Box component="footer" sx={{ display: 'flex', gap: 2, mt: 6, color: 'text.secondary' }}>
          <Button component={RouterLink} to="/privacy">Privacy</Button>
          <Button component={RouterLink} to="/terms">Terms</Button>
          <Typography sx={{ alignSelf: 'center' }}>© {year}</Typography>
        </Box>
      </Container>
    </Box>
  )
}
