import { lazy, Suspense } from 'react'
import { Box, CircularProgress } from '@mui/material'
import { Navigate, Route, Routes, useParams } from 'react-router'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { useAuth } from './auth/useAuth.ts'
import { ConfirmDialogProvider, SnackbarProvider } from './ui/feedback.tsx'
import { AppShell } from './shell/AppShell.tsx'

const LandingPage = lazy(() => import('./pages/LandingPage.tsx').then((module) => ({ default: module.LandingPage })))
const PrivacyPage = lazy(() => import('./pages/LegalPages.tsx').then((module) => ({ default: module.PrivacyPage })))
const TermsPage = lazy(() => import('./pages/LegalPages.tsx').then((module) => ({ default: module.TermsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.tsx').then((module) => ({ default: module.NotFoundPage })))
const AccountPage = lazy(() => import('./pages/AccountPage.tsx').then((module) => ({ default: module.AccountPage })))
const ProjectsPage = lazy(() => import('./projects/ProjectsPage.tsx').then((module) => ({ default: module.ProjectsPage })))
const NewProjectPage = lazy(() => import('./projects/NewProjectPage.tsx').then((module) => ({ default: module.NewProjectPage })))
const ProjectEditorPage = lazy(() => import('./projects/ProjectEditorPage.tsx').then((module) => ({ default: module.ProjectEditorPage })))
const PaintsPage = lazy(() => import('./paints/PaintsPage.tsx').then((module) => ({ default: module.PaintsPage })))
const PaintEditorPage = lazy(() => import('./paints/PaintEditorPage.tsx').then((module) => ({ default: module.PaintEditorPage })))

function Fallback() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
      <CircularProgress />
    </Box>
  )
}

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return <Fallback />
  if (!user) return <Navigate to="/" replace />
  return <AppShell />
}

function ProjectRoute() {
  const { id } = useParams()
  if (!id) return <Navigate to="/projects" replace />
  return <ProjectEditorPage key={id} projectId={id} />
}

function PaintRoute() {
  const { id } = useParams()
  if (!id) return <Navigate to="/paints" replace />
  return <PaintEditorPage key={id} paintId={id} />
}

export default function App() {
  return (
    <SnackbarProvider>
      <ConfirmDialogProvider>
        <AuthProvider>
          <Suspense fallback={<Fallback />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route element={<RequireAuth />}>
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/new" element={<NewProjectPage />} />
                <Route path="/projects/:id" element={<ProjectRoute />} />
                <Route path="/paints" element={<PaintsPage />} />
                <Route path="/paints/new" element={<PaintEditorPage paintId={null} />} />
                <Route path="/paints/:id" element={<PaintRoute />} />
                <Route path="/account" element={<AccountPage />} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ConfirmDialogProvider>
    </SnackbarProvider>
  )
}
