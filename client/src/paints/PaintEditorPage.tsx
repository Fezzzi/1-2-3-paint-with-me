import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { Link as RouterLink, useNavigate } from 'react-router'
import { useConfirm, useSnackbar } from '../ui/useFeedback.ts'
import { usePageTitle } from '../ui/title.ts'
import { averageHex, dominantHex } from '../processing/sampleColor.ts'
import { createPaint, deletePaint, getPaint, paintFileUrl, updatePaint, uploadPaintReference, type PaintJson } from './api.ts'
import { draftFromPaint, draftToInput, emptyDraft, isPaintHex, paintTitle, swatchBackground, type PaintDraft } from './draft.ts'

const RADII = { Small: 2, Medium: 6, Large: 12 } as const

function readImagePixels(image: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Could not read the reference photo.')
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

export function PaintEditorPage({ paintId }: { paintId: string | null }) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const snackbar = useSnackbar()
  const imageRef = useRef<HTMLImageElement>(null)
  const [paint, setPaint] = useState<PaintJson | null>(null)
  const [draft, setDraft] = useState<PaintDraft>(emptyDraft)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)
  const pendingUrlRef = useRef<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(paintId))
  const [saving, setSaving] = useState(false)
  const [sampleSize, setSampleSize] = useState<keyof typeof RADII>('Medium')
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null)
  const [sampled, setSampled] = useState<string | null>(null)
  usePageTitle(paintId ? 'Edit paint' : 'New paint')

  useEffect(() => {
    if (!paintId) return
    let cancelled = false
    void getPaint(paintId)
      .then((next) => {
        if (cancelled) return
        setPaint(next)
        setDraft(draftFromPaint(next))
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load this paint.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [paintId])

  useEffect(() => () => {
    if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current)
  }, [])

  function setField(field: keyof PaintDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  async function onSave() {
    const parsed = draftToInput(draft)
    if (!parsed.ok) {
      setFormError(parsed.error)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (!paintId) {
        const created = await createPaint(parsed.value)
        if (pendingFile) await uploadPaintReference(created.id, pendingFile)
        snackbar.show('Paint saved.')
        navigate(`/paints/${created.id}`, { replace: true })
        return
      }
      const updated = await updatePaint(paintId, parsed.value)
      setPaint(updated)
      setDraft(draftFromPaint(updated))
      snackbar.show('Paint saved.')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save this paint.')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!paintId) return
    const ok = await confirm({ title: 'Delete this paint?', body: 'Projects that used it will keep their colors.', confirmLabel: 'Delete', danger: true })
    if (!ok) return
    await deletePaint(paintId)
    snackbar.show('Paint deleted.')
    navigate('/paints')
  }

  async function onUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!paintId) {
      if (pendingUrlRef.current) URL.revokeObjectURL(pendingUrlRef.current)
      const url = URL.createObjectURL(file)
      pendingUrlRef.current = url
      setPendingUrl(url)
      setPendingFile(file)
      return
    }
    try {
      setPaint(await uploadPaintReference(paintId, file))
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not upload the reference photo.')
    }
  }

  function sampleAt(event: ReactPointerEvent<HTMLImageElement>) {
    const image = imageRef.current
    if (!image) return
    const rect = image.getBoundingClientRect()
    const x = Math.round(((event.clientX - rect.left) / rect.width) * image.naturalWidth)
    const y = Math.round(((event.clientY - rect.top) / rect.height) * image.naturalHeight)
    setMarker({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 })
    try {
      const pixels = readImagePixels(image)
      setSampled(averageHex(pixels.data, pixels.width, pixels.height, x, y, RADII[sampleSize]))
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not sample the photo.')
    }
  }

  function detectDominant() {
    const image = imageRef.current
    if (!image) return
    try {
      const pixels = readImagePixels(image)
      setSampled(dominantHex(pixels.data, pixels.width, pixels.height))
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not sample the photo.')
    }
  }

  if (loading) return <CircularProgress />
  if (loadError) {
    return (
      <Alert severity="error" action={<Button component={RouterLink} to="/paints">Back</Button>}>
        {loadError}
      </Alert>
    )
  }

  const previewUrl = paint?.referenceFileId ? paintFileUrl(paint.referenceFileId) : pendingUrl
  const hexInvalid = draft.hex.trim().length > 0 && !isPaintHex(draft.hex)

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, pb: 10 }}>
      <Box>
        <Typography variant="h4" component="h1" sx={{ mb: 2 }}>{paintId ? paintTitle(draft) : 'New paint'}</Typography>
        {formError ? <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert> : null}
        <Typography variant="h6" component="h2">Paint</Typography>
        <TextField label="Label" value={draft.label} onChange={(event) => setField('label', event.target.value)} fullWidth sx={{ mt: 1 }} />
        <TextField label="Manufacturer" value={draft.manufacturer} onChange={(event) => setField('manufacturer', event.target.value)} fullWidth sx={{ mt: 2 }} />
        <TextField label="Product line" value={draft.productLine} onChange={(event) => setField('productLine', event.target.value)} fullWidth sx={{ mt: 2 }} />
        <TextField label="Code" value={draft.manufacturerCode} onChange={(event) => setField('manufacturerCode', event.target.value)} fullWidth sx={{ mt: 2 }} />
        <Typography variant="h6" component="h2" sx={{ mt: 3 }}>Color</Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
          <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: swatchBackground(draft.hex), border: 1, borderColor: 'divider' }} />
          <TextField label="Hex" value={draft.hex} error={hexInvalid} helperText={hexInvalid ? 'Use #rrggbb or #rrggbbaa.' : undefined} onChange={(event) => setField('hex', event.target.value)} fullWidth />
          <input aria-label="Color picker" type="color" value={isPaintHex(draft.hex) ? draft.hex.slice(0, 7) : '#cccccc'} onChange={(event) => setField('hex', event.target.value)} />
        </Box>
        <Typography variant="h6" component="h2" sx={{ mt: 3 }}>Inventory</Typography>
        <TextField label="Quantity" value={draft.quantityOnHand} onChange={(event) => setField('quantityOnHand', event.target.value)} fullWidth sx={{ mt: 1 }} />
        <Autocomplete
          freeSolo
          options={['ml', 'g', 'oz', 'tube']}
          value={draft.unit}
          onInputChange={(_event, value) => setField('unit', value)}
          renderInput={(params) => <TextField {...params} label="Unit" sx={{ mt: 2 }} />}
        />
        <TextField label="Notes" value={draft.notes} onChange={(event) => setField('notes', event.target.value)} multiline minRows={3} fullWidth sx={{ mt: 2 }} />
      </Box>
      <Card>
        <CardContent>
          <Typography variant="h6" component="h2">Reference photo</Typography>
          <Button component="label" sx={{ mt: 1 }}>{paintId ? 'Replace photo' : 'Choose photo'}
            <input hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void onUpload(event)} />
          </Button>
          {previewUrl ? (
            <Box sx={{ position: 'relative', mt: 2 }}>
              <Box component="img" ref={imageRef} src={previewUrl} alt="Reference photo" onPointerDown={sampleAt} sx={{ width: '100%', cursor: 'crosshair' }} />
              {marker ? (
                <Box aria-hidden sx={{ position: 'absolute', left: `${marker.x}%`, top: `${marker.y}%`, width: 28, height: 28, border: '2px solid #fff', borderRadius: '50%', transform: 'translate(-50%, -50%)', boxShadow: '0 0 0 2px #E07A2A' }} />
              ) : null}
            </Box>
          ) : (
            <Typography color="text.secondary" sx={{ mt: 2 }}>No reference photo yet.</Typography>
          )}
          <ToggleButtonGroup exclusive value={sampleSize} onChange={(_event, value: keyof typeof RADII | null) => value && setSampleSize(value)} aria-label="Sample size" sx={{ mt: 2 }}>
            <ToggleButton value="Small">Small</ToggleButton>
            <ToggleButton value="Medium">Medium</ToggleButton>
            <ToggleButton value="Large">Large</ToggleButton>
          </ToggleButtonGroup>
          {sampled ? (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2 }}>
              <Box sx={{ width: 36, height: 36, bgcolor: sampled, borderRadius: 1, border: 1, borderColor: 'divider' }} />
              <Typography>{sampled}</Typography>
              <Button onClick={() => setField('hex', sampled)}>Use this color</Button>
            </Box>
          ) : null}
          <Button sx={{ mt: 2 }} onClick={detectDominant} disabled={!previewUrl}>Detect dominant color</Button>
        </CardContent>
      </Card>
      <Box sx={{ position: 'sticky', bottom: { xs: 72, md: 16 }, gridColumn: '1 / -1', display: 'flex', gap: 1, bgcolor: 'background.paper', p: 1, borderRadius: 2, border: 1, borderColor: 'divider' }}>
        <Button variant="contained" disabled={saving} onClick={() => void onSave()}>{saving ? 'Saving…' : 'Save'}</Button>
        <Button component={RouterLink} to="/paints">Cancel</Button>
        {paintId ? <Button color="error" onClick={() => void onDelete()}>Delete</Button> : null}
      </Box>
    </Box>
  )
}
