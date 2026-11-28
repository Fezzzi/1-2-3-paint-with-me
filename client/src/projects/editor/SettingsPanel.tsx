import { useState } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Link,
  MenuItem,
  Slider,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { ImageCrop } from '../ImageCrop.tsx'
import { defaultPlacement, type CropPlacement } from '../../processing/crop.ts'
import { COLOR_COUNT_PRESETS, MAX_COLOR_COUNT, MIN_COLOR_COUNT, type DetailLevel } from '../../processing/defaults.ts'
import type { ProjectForm } from '../form.ts'

export function SettingsPanel({
  form,
  detail,
  image,
  pageAspect,
  placement,
  usable,
  capped,
  limitedByImage,
  imageColors,
  settingsError,
  onForm,
  onDetail,
  onPlacement,
}: {
  form: ProjectForm
  detail: DetailLevel
  image: { width: number; height: number; url: string } | null
  pageAspect: number
  placement: CropPlacement
  usable: number
  capped: boolean
  limitedByImage: boolean
  imageColors: number
  settingsError: string | null
  onForm: (form: ProjectForm) => void
  onDetail: (detail: DetailLevel) => void
  onPlacement: (placement: CropPlacement) => void
}) {
  const [frame, setFrame] = useState(false)
  const marks = COLOR_COUNT_PRESETS.map((value) => ({ value, label: String(value) }))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Accordion defaultExpanded>
        <AccordionSummary>Photo</AccordionSummary>
        <AccordionDetails>
          <Button onClick={() => setFrame(true)} disabled={!image}>Frame</Button>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Changing orientation re-frames the photo.
          </Typography>
        </AccordionDetails>
      </Accordion>
      <Accordion defaultExpanded>
        <AccordionSummary>Colors</AccordionSummary>
        <AccordionDetails>
          <Typography id="color-count-slider" gutterBottom>Colors {form.colorCount}</Typography>
          <Slider
            aria-labelledby="color-count-slider"
            min={MIN_COLOR_COUNT}
            max={MAX_COLOR_COUNT}
            step={1}
            marks={marks}
            value={form.colorCount}
            onChange={(_event, value) => {
              const next = Array.isArray(value) ? value[0] : value
              if (typeof next === 'number') onForm({ ...form, colorCount: next })
            }}
          />
          <TextField
            label="Color count"
            type="number"
            value={form.colorCount}
            slotProps={{ htmlInput: { min: MIN_COLOR_COUNT, max: MAX_COLOR_COUNT } }}
            onChange={(event) => {
              const next = Number(event.target.value)
              if (Number.isInteger(next)) onForm({ ...form, colorCount: Math.min(MAX_COLOR_COUNT, Math.max(MIN_COLOR_COUNT, next)) })
            }}
            sx={{ mt: 1 }}
          />
          <ToggleButtonGroup exclusive value={detail} onChange={(_event, value: DetailLevel | null) => value && onDetail(value)} aria-label="Detail" sx={{ mt: 2, display: 'flex' }}>
            <ToggleButton value="simple">Simple</ToggleButton>
            <ToggleButton value="balanced">Balanced</ToggleButton>
            <ToggleButton value="detailed">Detailed</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {detail === 'simple' ? 'Fewer, larger regions.' : detail === 'detailed' ? 'More small regions and finer lines.' : 'A balance of region size and detail.'}
          </Typography>
          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Switch
                checked={form.constrainToOwned}
                disabled={usable === 0}
                onChange={(event) => onForm({ ...form, constrainToOwned: event.target.checked })}
              />
            }
            label="Use only paints I own"
          />
          <Typography variant="body2" color="text.secondary">
            {usable === 0 ? (
              <>
                You have no paints with colors. <Link component={RouterLink} to="/paints">Add paints</Link>
              </>
            ) : (
              `You have ${usable} paints with colors`
            )}
          </Typography>
          {capped ? (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Limited to {usable} colors — the number of paints you own with a color
            </Typography>
          ) : null}
          {limitedByImage ? <Typography variant="body2" sx={{ mt: 1 }}>This photo only has {imageColors} distinct colors</Typography> : null}
        </AccordionDetails>
      </Accordion>
      <Accordion defaultExpanded>
        <AccordionSummary>Paper</AccordionSummary>
        <AccordionDetails>
          <TextField
            select
            label="Paper"
            value={form.paperPreset}
            onChange={(event) => onForm({ ...form, paperPreset: event.target.value as ProjectForm['paperPreset'] })}
            fullWidth
          >
            {['A5', 'A4', 'A3', 'Letter', 'custom'].map((preset) => (
              <MenuItem key={preset} value={preset}>{preset === 'custom' ? 'Custom' : preset}</MenuItem>
            ))}
          </TextField>
          <ToggleButtonGroup
            exclusive
            value={form.orientation}
            onChange={(_event, value: ProjectForm['orientation'] | null) => value && onForm({ ...form, orientation: value })}
            aria-label="Orientation"
            sx={{ mt: 2 }}
          >
            <ToggleButton value="portrait">Portrait</ToggleButton>
            <ToggleButton value="landscape">Landscape</ToggleButton>
          </ToggleButtonGroup>
          <TextField label="Margin (mm)" value={form.marginMm} onChange={(event) => onForm({ ...form, marginMm: event.target.value })} fullWidth sx={{ mt: 2 }} />
          {form.paperPreset === 'custom' ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 2 }}>
              <TextField label="Width (mm)" value={form.customWidth} onChange={(event) => onForm({ ...form, customWidth: event.target.value })} />
              <TextField label="Height (mm)" value={form.customHeight} onChange={(event) => onForm({ ...form, customHeight: event.target.value })} />
            </Box>
          ) : null}
          {settingsError ? <Typography color="error" variant="body2" sx={{ mt: 1 }}>{settingsError}</Typography> : null}
        </AccordionDetails>
      </Accordion>
      <Dialog open={frame} onClose={() => setFrame(false)} fullWidth maxWidth="md">
        <DialogTitle>Frame</DialogTitle>
        <DialogContent>
          {image ? (
            <ImageCrop
              src={image.url}
              imageWidth={image.width}
              imageHeight={image.height}
              pageAspect={pageAspect}
              placement={placement}
              orientation={form.orientation}
              onPlacement={onPlacement}
              onOrientation={(orientation) => onForm({ ...form, orientation })}
            />
          ) : null}
          <Button sx={{ mt: 2 }} onClick={() => onPlacement(defaultPlacement)}>Reset</Button>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
