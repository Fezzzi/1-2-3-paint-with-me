import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { Box, Slider, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { brand } from '../brand.ts'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  moveCrop,
  placementToCrop,
  zoomPlacement,
  type CropPlacement,
} from '../processing/crop.ts'
import type { PaperOrientation } from '../processing/paper.ts'

type ImageCropProps = {
  src: string
  imageWidth: number
  imageHeight: number
  pageAspect: number
  placement: CropPlacement
  orientation: PaperOrientation
  onPlacement: (placement: CropPlacement) => void
  onOrientation: (orientation: PaperOrientation) => void
}

export function ImageCrop({
  src,
  imageWidth,
  imageHeight,
  pageAspect,
  placement,
  orientation,
  onPlacement,
  onOrientation,
}: ImageCropProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const placementRef = useRef(placement)
  const onPlacementRef = useRef(onPlacement)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ offsetX: number; offsetY: number } | null>(null)
  const pinch = useRef<{ distance: number; placement: CropPlacement } | null>(null)

  useEffect(() => {
    placementRef.current = placement
  }, [placement])
  useEffect(() => {
    onPlacementRef.current = onPlacement
  }, [onPlacement])
  const crop = placementToCrop(imageWidth, imageHeight, pageAspect, placement)

  useEffect(() => {
    const node = frameRef.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const x = (event.clientX - rect.left) / rect.width
      const y = (event.clientY - rect.top) / rect.height
      const factor = event.deltaY > 0 ? 1 / 1.08 : 1.08
      onPlacementRef.current(
        zoomPlacement(
          imageWidth,
          imageHeight,
          pageAspect,
          placementRef.current,
          placementRef.current.zoom * factor,
          x,
          y,
        ),
      )
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [imageWidth, imageHeight, pageAspect])

  function pointFromEvent(event: PointerEvent<HTMLDivElement>): { x: number; y: number } | null {
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return null
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const point = pointFromEvent(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, point)
    if (pointers.current.size === 1) {
      const inside =
        point.x >= crop.x &&
        point.x <= crop.x + crop.width &&
        point.y >= crop.y &&
        point.y <= crop.y + crop.height
      drag.current = inside ? { offsetX: point.x - crop.x, offsetY: point.y - crop.y } : null
      pinch.current = null
      return
    }
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()]
      if (!first || !second) return
      drag.current = null
      pinch.current = {
        distance: Math.hypot(first.x - second.x, first.y - second.y),
        placement: placementRef.current,
      }
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    const point = pointFromEvent(event)
    if (!point) return
    pointers.current.set(event.pointerId, point)
    if (pointers.current.size >= 2 && pinch.current && pinch.current.distance > 0) {
      const [first, second] = [...pointers.current.values()]
      if (!first || !second) return
      const distance = Math.hypot(first.x - second.x, first.y - second.y)
      onPlacement(
        zoomPlacement(
          imageWidth,
          imageHeight,
          pageAspect,
          pinch.current.placement,
          pinch.current.placement.zoom * (distance / pinch.current.distance),
          (first.x + second.x) / 2,
          (first.y + second.y) / 2,
        ),
      )
      return
    }
    if (!drag.current) return
    onPlacement(
      moveCrop(imageWidth, imageHeight, pageAspect, placement, point.x - drag.current.offsetX, point.y - drag.current.offsetY),
    )
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) drag.current = null
  }

  function nudge(dx: number, dy: number) {
    onPlacement(moveCrop(imageWidth, imageHeight, pageAspect, placement, crop.x + dx, crop.y + dy))
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.05 : 0.01
    if (event.key === 'ArrowLeft') nudge(-step, 0)
    else if (event.key === 'ArrowRight') nudge(step, 0)
    else if (event.key === 'ArrowUp') nudge(0, -step)
    else if (event.key === 'ArrowDown') nudge(0, step)
    else if (event.key === '+' || event.key === '=') {
      onPlacement(zoomPlacement(imageWidth, imageHeight, pageAspect, placement, placement.zoom * 1.1, placement.centerX, placement.centerY))
    } else if (event.key === '-' || event.key === '_') {
      onPlacement(zoomPlacement(imageWidth, imageHeight, pageAspect, placement, placement.zoom / 1.1, placement.centerX, placement.centerY))
    } else return
    event.preventDefault()
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: '100%', minWidth: 0 }}>
      <Box
        ref={frameRef}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        aria-label="Page crop. Drag the frame to place it. Scroll, pinch, or use the slider to zoom. Arrow keys nudge the frame."
        sx={{
          position: 'relative',
          maxWidth: '100%',
          overflow: 'hidden',
          touchAction: 'none',
          userSelect: 'none',
          cursor: 'grab',
          outline: 'none',
          '&:focus-visible': { boxShadow: `0 0 0 3px ${brand.orange}` },
        }}
      >
        <Box
          component="img"
          src={src}
          alt="Source photo"
          draggable={false}
          sx={{ display: 'block', width: '100%', maxWidth: '100%', height: 'auto', pointerEvents: 'none' }}
        />
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: `${crop.x * 100}%`,
            top: `${crop.y * 100}%`,
            width: `${crop.width * 100}%`,
            height: `${crop.height * 100}%`,
            boxSizing: 'border-box',
            border: '2px solid #fff',
            boxShadow: `0 0 0 1px ${brand.orange}, 0 0 0 9999px rgba(26, 24, 20, 0.45)`,
            pointerEvents: 'none',
          }}
        />
      </Box>
      <Typography variant="body2" color="text.secondary">
        Drag the frame to place the page. Scroll, pinch, or use the slider to zoom.
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', maxWidth: '100%' }}>
        <ToggleButtonGroup exclusive value={orientation} aria-label="Page orientation" sx={{ flex: '0 0 auto' }}>
          <ToggleButton value="portrait" type="button" onClick={() => onOrientation('portrait')}>
            Portrait
          </ToggleButton>
          <ToggleButton value="landscape" type="button" onClick={() => onOrientation('landscape')}>
            Landscape
          </ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: '1 1 180px', minWidth: 160, px: 0.5 }}>
          <Typography id="crop-zoom-slider" variant="body2" gutterBottom>
            Zoom {placement.zoom.toFixed(1)}×
          </Typography>
          <Slider
            aria-labelledby="crop-zoom-slider"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={placement.zoom}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${value.toFixed(1)}×`}
            onChange={(_event, value) => {
              const next = Array.isArray(value) ? value[0] : value
              if (typeof next !== 'number') return
              onPlacement(
                zoomPlacement(imageWidth, imageHeight, pageAspect, placement, next, placement.centerX, placement.centerY),
              )
            }}
          />
        </Box>
      </Box>
    </Box>
  )
}
