import { useEffect, useState, type DragEvent } from 'react'
import { Alert, Box, Button, LinearProgress, Typography } from '@mui/material'
import { useNavigate } from 'react-router'
import { createProject } from './api.ts'
import { usePageTitle } from '../ui/title.ts'

const MAX_BYTES = 15 * 1024 * 1024
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']

function accepted(file: File): string | null {
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  const okType = ACCEPT.includes(type) || /\.(jpe?g|png|webp|gif|heic|heif)$/.test(name)
  if (!okType) return 'Use a JPEG, PNG, WebP, GIF, or HEIC photo.'
  if (file.size > MAX_BYTES) return 'Photos need to be 15 MB or smaller.'
  return null
}

export function NewProjectPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  usePageTitle('New project')

  useEffect(() => {
    const onPaste = (event: globalThis.ClipboardEvent) => {
      const file = event.clipboardData?.files?.[0]
      if (!file) return
      event.preventDefault()
      const problem = accepted(file)
      if (problem) {
        setError(problem)
        return
      }
      setError(null)
      setProgress(0)
      void createProject(file, { title: file.name.replace(/\.[^.]+$/, '') }, setProgress)
        .then((project) => navigate(`/projects/${project.id}`))
        .catch((uploadError: unknown) => {
          setError(uploadError instanceof Error ? uploadError.message : 'Could not upload this photo.')
          setProgress(null)
        })
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [navigate])

  async function upload(file: File) {
    const problem = accepted(file)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setProgress(0)
    try {
      const project = await createProject(file, { title: file.name.replace(/\.[^.]+$/, '') }, setProgress)
      navigate(`/projects/${project.id}`)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload this photo.')
      setProgress(null)
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) void upload(file)
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" sx={{ mb: 2 }}>New project</Typography>
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      <Box
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        sx={{ border: '2px dashed', borderColor: 'divider', borderRadius: 2, p: 4, textAlign: 'center', bgcolor: 'background.paper' }}
      >
        <Typography>Drop a photo here, or choose one.</Typography>
        <Button variant="contained" component="label" sx={{ mt: 2 }} disabled={progress !== null}>
          Choose photo
          <input hidden type="file" accept={ACCEPT.join(',')} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }} />
        </Button>
        {touch ? (
          <Button component="label" sx={{ mt: 1 }} disabled={progress !== null}>
            Take photo
            <input hidden type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }} />
          </Button>
        ) : null}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>You can also paste a photo from the clipboard.</Typography>
        {progress !== null ? <LinearProgress variant={progress > 0 ? 'determinate' : 'indeterminate'} value={progress * 100} sx={{ mt: 2 }} /> : null}
      </Box>
    </Box>
  )
}
