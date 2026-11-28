import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Box, Button, Dialog, LinearProgress, Tab, Tabs, Typography } from '@mui/material'
import type { ReducePayload } from '../../processing/engine/protocol.ts'
import { toSvgPathData } from '../../processing/engine/vectorize.ts'

type PreviewTab = 'colors' | 'numbers' | 'photo'

export function PreviewWorkspace({
  phase,
  progress,
  result,
  photoUrl,
  showOverlay,
}: {
  phase: string
  progress: number
  result: ReducePayload | null
  photoUrl: string | null
  showOverlay: boolean
}) {
  const [tab, setTab] = useState<PreviewTab>('colors')
  const [outline, setOutline] = useState(false)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [full, setFull] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const pinch = useRef<{ distance: number; scale: number } | null>(null)

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y }
    if (pointers.current.size >= 2) {
      const [first, second] = [...pointers.current.values()]
      if (!first || !second) return
      drag.current = null
      pinch.current = { distance: Math.hypot(first.x - second.x, first.y - second.y), scale }
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size >= 2 && pinch.current && pinch.current.distance > 0) {
      const [first, second] = [...pointers.current.values()]
      if (!first || !second) return
      const distance = Math.hypot(first.x - second.x, first.y - second.y)
      setScale(Math.min(6, Math.max(0.4, pinch.current.scale * (distance / pinch.current.distance))))
      return
    }
    if (!drag.current) return
    setPan({ x: drag.current.px + event.clientX - drag.current.x, y: drag.current.py + event.clientY - drag.current.y })
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    drag.current = null
    pinch.current = null
  }

  useEffect(() => {
    if (!result) return
    const canvas = document.createElement('canvas')
    canvas.width = result.width
    canvas.height = result.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.putImageData(new ImageData(new Uint8ClampedArray(result.colorPreviewRgba), result.width, result.height), 0, 0)
    let url = ''
    let cancelled = false
    void new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9)).then((blob) => {
      if (!blob || cancelled) return
      url = URL.createObjectURL(blob)
      setPreviewUrl(url)
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [result])

  useEffect(() => {
    const node = frame.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setScale((current) => Math.min(6, Math.max(0.4, current * (event.deltaY > 0 ? 0.9 : 1.1))))
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [result, tab])

  const path = result ? toSvgPathData(result.chains) : ''
  const view = (
    <Box
      ref={frame}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      sx={{ position: 'relative', overflow: 'hidden', bgcolor: '#fff', borderRadius: 2, minHeight: 280, touchAction: 'none', cursor: 'grab' }}
    >
      {phase === 'reducing' && result ? <LinearProgress sx={{ position: 'sticky', top: 0 }} /> : null}
      {showOverlay ? (
        <Box sx={{ position: 'absolute', inset: 0, zIndex: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(246,241,232,0.86)', p: 2 }}>
          <Box sx={{ width: 'min(320px, 100%)' }}>
            <Typography sx={{ mb: 1 }}>Analyzing your photo… {Math.round(progress * 100)}%</Typography>
            <LinearProgress variant="determinate" value={Math.round(progress * 100)} />
          </Box>
        </Box>
      ) : null}
      {result && tab !== 'photo' ? (
        <svg viewBox={`0 0 ${result.width} ${result.height}`} style={{ width: `${scale * 100}%`, height: 'auto', display: 'block', transform: `translate(${pan.x}px, ${pan.y}px)` }}>
          {tab === 'colors' && previewUrl ? <image href={previewUrl} width={result.width} height={result.height} /> : null}
          {(tab === 'numbers' || outline) && path ? <path d={path} fill="none" stroke="#6b6b6b" strokeWidth={Math.max(1, result.width / 800)} /> : null}
          {tab === 'numbers'
            ? result.labels.map((label) => (
                <text key={`${label.number}-${label.x}-${label.y}`} x={label.x} y={label.y} fontSize={label.fontPx} textAnchor="middle" fill="#7a7a7a">
                  {label.number}
                </text>
              ))
            : null}
        </svg>
      ) : null}
      {tab === 'photo' && photoUrl ? (
        <Box component="img" src={photoUrl} alt="Original photo" sx={{ width: `${scale * 100}%`, height: 'auto', display: 'block', transform: `translate(${pan.x}px, ${pan.y}px)` }} />
      ) : null}
    </Box>
  )

  return (
    <Box>
      <Tabs value={tab} onChange={(_event, value: PreviewTab) => setTab(value)} sx={{ mb: 1 }}>
        <Tab value="colors" label="Colors" />
        <Tab value="numbers" label="Numbers" />
        <Tab value="photo" label="Photo" />
      </Tabs>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Button size="small" onClick={() => setScale((value) => Math.max(0.4, value / 1.2))}>−</Button>
        <Button size="small" onClick={() => setScale((value) => Math.min(6, value * 1.2))}>+</Button>
        <Button size="small" onClick={() => { setScale(1); setPan({ x: 0, y: 0 }) }}>Fit</Button>
        {tab === 'colors' ? (
          <Button size="small" onClick={() => setOutline((value) => !value)}>{outline ? 'Hide outline' : 'Show outline'}</Button>
        ) : null}
        <Button size="small" onClick={() => setFull(true)}>Full screen</Button>
      </Box>
      {view}
      <Dialog fullScreen open={full} onClose={() => setFull(false)}>
        <Box sx={{ p: 2 }}>
          <Button onClick={() => setFull(false)} sx={{ mb: 1 }}>Close</Button>
          {view}
        </Box>
      </Dialog>
    </Box>
  )
}
