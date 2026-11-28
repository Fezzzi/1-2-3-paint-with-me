import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Menu,
  MenuItem,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { deleteProject, listProjects, patchProject, projectFileUrl, type ProjectListJson } from './api.ts'
import { useConfirm, useSnackbar } from '../ui/useFeedback.ts'
import { usePageTitle } from '../ui/title.ts'

function relativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(delta / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString()
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListJson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; project: ProjectListJson } | null>(null)
  const [rename, setRename] = useState<ProjectListJson | null>(null)
  const [title, setTitle] = useState('')
  const confirm = useConfirm()
  const snackbar = useSnackbar()
  usePageTitle('Projects')

  function load() {
    setLoading(true)
    setError(null)
    void listProjects()
      .then(setProjects)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Could not load projects.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    void listProjects()
      .then((rows) => {
        if (!cancelled) setProjects(rows)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load projects.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onDelete(project: ProjectListJson) {
    const ok = await confirm({ title: 'Delete this project?', body: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    await deleteProject(project.id)
    setProjects((rows) => rows.filter((row) => row.id !== project.id))
    snackbar.show('Project deleted.')
  }

  async function onRename() {
    if (!rename) return
    const saved = await patchProject(rename.id, { title: title.trim() || 'Untitled project' })
    setProjects((rows) => rows.map((row) => (row.id === saved.id ? { ...row, title: saved.title, updatedAt: saved.updatedAt } : row)))
    setRename(null)
    snackbar.show('Renamed.')
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1">Projects</Typography>
        <Button variant="contained" component={RouterLink} to="/projects/new">New project</Button>
      </Box>
      {error ? <Alert severity="error" action={<Button onClick={load}>Retry</Button>} sx={{ mb: 2 }}>{error}</Alert> : null}
      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
          {[0, 1, 2].map((item) => <Skeleton key={item} variant="rounded" height={240} />)}
        </Box>
      ) : null}
      {!loading && !error && projects.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <svg width="120" height="80" viewBox="0 0 120 80" aria-hidden>
            <rect x="8" y="10" width="104" height="60" rx="12" fill="#FFFBF6" stroke="#E4D8C8" />
            <circle cx="36" cy="36" r="10" fill="#E07A2A" />
            <rect x="54" y="28" width="42" height="8" rx="4" fill="#5B4A86" />
            <rect x="54" y="42" width="28" height="8" rx="4" fill="#2F6B4A" />
          </svg>
          <Typography variant="h6" sx={{ mt: 2 }}>Turn your first photo into a canvas</Typography>
          <Button variant="contained" component={RouterLink} to="/projects/new" sx={{ mt: 2 }}>Upload</Button>
        </Box>
      ) : null}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
        {projects.map((project) => (
          <Card key={project.id}>
            <Box
              component={RouterLink}
              to={`/projects/${project.id}`}
              sx={{ display: 'block', aspectRatio: '4 / 3', bgcolor: 'background.default', overflow: 'hidden' }}
            >
              {project.thumbnailFileId ? (
                <Box component="img" src={projectFileUrl(project.thumbnailFileId)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Box sx={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'text.secondary' }}>No preview yet</Box>
              )}
            </Box>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography component={RouterLink} to={`/projects/${project.id}`} sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                  {project.title}
                </Typography>
                <Button
                  size="small"
                  aria-label={`Actions for ${project.title}`}
                  onClick={(event) => setMenu({ anchor: event.currentTarget, project })}
                >
                  ···
                </Button>
              </Box>
              {project.status === 'draft' ? <Chip size="small" label="Draft" sx={{ mt: 1 }} /> : null}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {project.colorCount} colors · {project.paperPreset ?? 'Custom'} {project.orientation}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                {project.palette.slice(0, 8).map((hex) => (
                  <Box key={hex} sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: hex, border: 1, borderColor: 'divider' }} />
                ))}
              </Box>
              <Typography variant="body2" title={new Date(project.updatedAt).toLocaleString()} sx={{ mt: 1 }}>
                {relativeTime(project.updatedAt)}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { if (!menu) return; setTitle(menu.project.title); setRename(menu.project); setMenu(null) }}>Rename</MenuItem>
        <MenuItem onClick={() => { if (!menu) return; const project = menu.project; setMenu(null); void onDelete(project) }}>Delete</MenuItem>
      </Menu>
      <Dialog open={Boolean(rename)} onClose={() => setRename(null)}>
        <DialogTitle>Rename</DialogTitle>
        <DialogContent>
          <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)} fullWidth sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRename(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => void onRename()}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
