import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Menu, MenuItem, Skeleton, TextField, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { useSnackbar } from '../ui/useFeedback.ts'
import { usePageTitle } from '../ui/title.ts'
import { downloadPaintExport, importPaints, listPaints, type PaintJson } from './api.ts'
import { paintDetails, paintTitle, quantityLabel, swatchBackground } from './draft.ts'

type SortKey = 'name' | 'manufacturer' | 'updated'

function importedMessage(count: number): string {
  return count === 1 ? 'Imported 1 paint.' : `Imported ${count} paints.`
}

export function PaintsPage() {
  const [paints, setPaints] = useState<PaintJson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const snackbar = useSnackbar()
  usePageTitle('Paints')

  function load() {
    setLoading(true)
    setError(null)
    void listPaints()
      .then(setPaints)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Could not load paints.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    void listPaints()
      .then((rows) => {
        if (!cancelled) setPaints(rows)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load paints.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = paints.filter((paint) => {
      if (!needle) return true
      return [paint.label, paint.manufacturer, paint.manufacturerCode, paint.productLine].some((value) => value?.toLowerCase().includes(needle))
    })
    return [...filtered].sort((left, right) => {
      if (sort === 'updated') return right.updatedAt.localeCompare(left.updatedAt)
      if (sort === 'manufacturer') return (left.manufacturer ?? '').localeCompare(right.manufacturer ?? '')
      return paintTitle(left).localeCompare(paintTitle(right))
    })
  }, [paints, query, sort])

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    setMenu(null)
    if (!file) return
    try {
      const count = await importPaints(file)
      snackbar.show(importedMessage(count))
      load()
    } catch (importError) {
      snackbar.show(importError instanceof Error ? importError.message : 'Could not import paints.', 'error')
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h4" component="h1">Paints {loading ? '' : `(${paints.length})`}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={(event) => setMenu(event.currentTarget)}>More</Button>
          <Button variant="contained" component={RouterLink} to="/paints/new">Add paint</Button>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <TextField label="Search" value={query} onChange={(event) => setQuery(event.target.value)} size="small" />
        <TextField select label="Sort" value={sort} onChange={(event) => setSort(event.target.value as SortKey)} size="small">
          <MenuItem value="name">Name</MenuItem>
          <MenuItem value="manufacturer">Manufacturer</MenuItem>
          <MenuItem value="updated">Recently updated</MenuItem>
        </TextField>
      </Box>
      {error ? <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>{error}</Alert> : null}
      {loading ? <Skeleton variant="rounded" height={160} /> : null}
      {!loading && !error && visible.length === 0 ? (
        <Box sx={{ py: 4 }}>
          <Typography variant="h6">No paints yet</Typography>
          <Typography color="text.secondary">Add a paint, or import a JSON or CSV file.</Typography>
          <Button variant="contained" component={RouterLink} to="/paints/new" sx={{ mt: 2 }}>Add paint</Button>
        </Box>
      ) : null}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
        {visible.map((paint) => (
          <Card key={paint.id} component={RouterLink} to={`/paints/${paint.id}`} sx={{ color: 'inherit', textDecoration: 'none' }}>
            <CardContent>
              <Box
                sx={{
                  height: 72,
                  borderRadius: 2,
                  mb: 1,
                  bgcolor: paint.hex ? swatchBackground(paint.hex) : 'transparent',
                  backgroundImage: paint.hex ? undefined : 'repeating-linear-gradient(45deg, #e4d8c8, #e4d8c8 8px, #fffbf6 8px, #fffbf6 16px)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {paint.hex ? null : 'No color'}
              </Box>
              <Typography sx={{ fontWeight: 600 }}>{paintTitle(paint)}</Typography>
              <Typography variant="body2" color="text.secondary">{[paint.manufacturer, paint.productLine, paint.manufacturerCode].filter(Boolean).join(' · ') || paintDetails(paint.manufacturer, paint.productLine)}</Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Chip size="small" label={quantityLabel(paint.quantityOnHand, paint.unit)} />
                {paint.quantityOnHand !== null && paint.unit?.toLowerCase() === 'ml' && paint.quantityOnHand <= 5 ? <Chip size="small" label="Low" color="warning" /> : null}
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
      <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem component="label">Import JSON<input hidden type="file" accept="application/json,.json" onChange={(event) => void onImport(event)} /></MenuItem>
        <MenuItem component="label">Import CSV<input hidden type="file" accept="text/csv,.csv" onChange={(event) => void onImport(event)} /></MenuItem>
        <MenuItem onClick={() => { setMenu(null); void downloadPaintExport('json') }}>Export JSON</MenuItem>
        <MenuItem onClick={() => { setMenu(null); void downloadPaintExport('csv') }}>Export CSV</MenuItem>
      </Menu>
    </Box>
  )
}
