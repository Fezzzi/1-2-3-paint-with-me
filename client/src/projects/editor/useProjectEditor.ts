import { useEffect, useRef, useState } from 'react'
import type { PaintJson } from '../../paints/api.ts'
import { listPaints } from '../../paints/api.ts'
import {
  cropToPlacement,
  defaultPlacement,
  placementToCrop,
  type CropPlacement,
} from '../../processing/crop.ts'
import { COVERAGE_ML_PER_CM2, DEFAULT_DETAIL, MAX_COLOR_COUNT, MIN_COLOR_COUNT, type DetailLevel } from '../../processing/defaults.ts'
import { StaleEngineRequest } from '../../processing/engine/engineClient.ts'
import { serializeAnalysis } from '../../processing/engine/cache.ts'
import type { ReducePayload } from '../../processing/engine/protocol.ts'
import { pxPerMm } from '../../processing/engine/scale.ts'
import { usablePaintCount } from '../../processing/engine/palette.ts'
import { measureImage, readCroppedRgba } from '../raster.ts'
import {
  fetchProjectFile,
  fetchProjectSource,
  getProject,
  patchProject,
  putProjectAnalysis,
  putProjectThumbnail,
  type ProjectJson,
  type ProjectPatch,
} from '../api.ts'
import { formFromProject, pageSizeFromForm, parseFormSettings, type ProjectForm } from '../form.ts'
import { analysisKey } from './analysisKey.ts'
import { buildLegend, type LegendRow } from './legend.ts'
import { useEngine } from './useEngine.ts'

export type SaveStatus = 'saved' | 'saving' | 'error'

type AnalysisReady = { key: string; width: number; height: number }

function cropOf(image: { width: number; height: number }, form: ProjectForm, placement: CropPlacement) {
  const page = pageSizeFromForm(form)
  const aspect = page && page.heightMm > 0 ? page.widthMm / page.heightMm : 1
  return { aspect, crop: placementToCrop(image.width, image.height, aspect, placement) }
}

export function useProjectEditor(projectId: string) {
  const engine = useEngine()
  const [project, setProject] = useState<ProjectJson | null>(null)
  const [paints, setPaints] = useState<PaintJson[]>([])
  const [source, setSource] = useState<File | null>(null)
  const [image, setImage] = useState<{ width: number; height: number; url: string } | null>(null)
  const [form, setForm] = useState<ProjectForm | null>(null)
  const [detail, setDetail] = useState<DetailLevel>(DEFAULT_DETAIL)
  const [placement, setPlacement] = useState<CropPlacement>(defaultPlacement)
  const [phase, setPhase] = useState<'loading' | 'analyzing' | 'reducing' | 'ready' | 'error'>('loading')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ReducePayload | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisReady | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [saveAttempt, setSaveAttempt] = useState(0)
  const uploadedKeys = useRef(new Set<string>())
  const saveTimer = useRef(0)
  const colorTimer = useRef(0)
  const thumbTimer = useRef(0)
  const pendingSave = useRef(false)

  useEffect(() => {
    let cancelled = false
    let url = ''
    void (async () => {
      try {
        const [nextProject, nextPaints] = await Promise.all([getProject(projectId), listPaints()])
        if (!nextProject.sourceFileId) throw new Error('This project has no photo.')
        const file = await fetchProjectSource(nextProject.sourceFileId)
        const size = await measureImage(file)
        url = URL.createObjectURL(file)
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        const nextForm = formFromProject(nextProject)
        const page = pageSizeFromForm(nextForm)
        const aspect = page && page.heightMm > 0 ? page.widthMm / page.heightMm : 1
        const stored =
          nextProject.cropX !== null &&
          nextProject.cropY !== null &&
          nextProject.cropWidth !== null &&
          nextProject.cropHeight !== null
            ? cropToPlacement(size.width, size.height, aspect, {
                x: nextProject.cropX,
                y: nextProject.cropY,
                width: nextProject.cropWidth,
                height: nextProject.cropHeight,
              })
            : defaultPlacement
        setProject(nextProject)
        setPaints(nextPaints)
        setSource(file)
        setImage({ width: size.width, height: size.height, url })
        setForm(nextForm)
        setDetail(nextProject.detail ?? DEFAULT_DETAIL)
        setPlacement(stored)
        if (nextProject.analysisKey) uploadedKeys.current.add(nextProject.analysisKey)
      } catch (loadError) {
        if (cancelled) return
        setPhase('error')
        setError(loadError instanceof Error ? loadError.message : 'Could not open this project.')
      }
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [projectId, reloadKey])

  const framed = image && form ? cropOf(image, form, placement) : null
  const parsed = form && framed ? parseFormSettings(form, framed.crop) : null
  const settings = parsed && parsed.ok ? parsed.value : null
  const settingsError = parsed && !parsed.ok ? parsed.error : null
  const usable = usablePaintCount(paints)
  const requestedCount = Math.min(MAX_COLOR_COUNT, Math.max(MIN_COLOR_COUNT, form?.colorCount ?? 24))
  const capped = Boolean(form?.constrainToOwned && usable > 0 && usable < requestedCount)
  const cropKey = framed ? `${framed.crop.x},${framed.crop.y},${framed.crop.width},${framed.crop.height}` : ''
  const sourceFileId = project?.sourceFileId ?? ''
  const storedAnalysisId = project?.analysisFileId ?? ''
  const storedAnalysisKey = project?.analysisKey ?? ''
  const paperWidthMm = settings?.paperWidthMm ?? 0
  const marginMm = settings?.marginMm ?? 0
  const cropX = framed?.crop.x ?? 0
  const cropY = framed?.crop.y ?? 0
  const cropWidth = framed?.crop.width ?? 0
  const cropHeight = framed?.crop.height ?? 0

  useEffect(() => {
    if (!engine || !source || !image || !sourceFileId || !cropKey) return
    const crop = { x: cropX, y: cropY, width: cropWidth, height: cropHeight }
    const key = analysisKey(sourceFileId, crop)
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setPhase('analyzing')
        setProgress(0)
        try {
          const raster = await readCroppedRgba(source, crop)
          if (cancelled) return
          const canLoad = storedAnalysisKey === key && storedAnalysisId.length > 0
          if (canLoad) {
            try {
              const blob = await fetchProjectFile(storedAnalysisId)
              await engine.load(new Uint8Array(await blob.arrayBuffer()))
            } catch (loadError) {
              if (loadError instanceof StaleEngineRequest || cancelled) return
              await analyzeAndStore(engine, projectId, raster.rgba, raster.width, raster.height, key, (value) => {
                if (!cancelled) setProgress(value)
              })
              uploadedKeys.current.add(key)
            }
          } else if (!uploadedKeys.current.has(key)) {
            await analyzeAndStore(engine, projectId, raster.rgba, raster.width, raster.height, key, (value) => {
              if (!cancelled) setProgress(value)
            })
            uploadedKeys.current.add(key)
          } else {
            await engine.analyze(raster.rgba, raster.width, raster.height, (value) => {
              if (!cancelled) setProgress(value)
            })
          }
          if (cancelled) return
          setAnalysis({ key, width: raster.width, height: raster.height })
        } catch (analyzeError) {
          if (analyzeError instanceof StaleEngineRequest || cancelled) return
          setPhase('error')
          setError(analyzeError instanceof Error ? analyzeError.message : 'Could not analyze this photo.')
        }
      })()
    }, 600)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [engine, source, image, sourceFileId, storedAnalysisId, storedAnalysisKey, cropKey, cropX, cropY, cropWidth, cropHeight, projectId])

  useEffect(() => {
    if (!engine || !analysis || paperWidthMm <= 0) return
    let cancelled = false
    const px = pxPerMm(analysis.width, paperWidthMm, marginMm)
    const timer = window.setTimeout(() => {
      setPhase((current) => (current === 'error' ? current : 'reducing'))
      void engine
        .reduce({ colorCount: requestedCount, detail, pxPerMm: px })
        .then((next) => {
          if (cancelled) return
          setResult(next)
          setPhase('ready')
          setError(null)
        })
        .catch((reduceError: unknown) => {
          if (reduceError instanceof StaleEngineRequest || cancelled) return
          setPhase('error')
          setError(reduceError instanceof Error ? reduceError.message : 'Could not build a preview.')
        })
    }, 120)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [engine, analysis, detail, requestedCount, paperWidthMm, marginMm])

  const paperHeightMm = settings?.paperHeightMm ?? 0
  const coverageRate = settings?.coverageRate || COVERAGE_ML_PER_CM2
  const constrainToOwned = Boolean(form?.constrainToOwned)
  const legend =
    result && paperWidthMm > 0
      ? buildLegend(result, paints, constrainToOwned, {
          widthMm: paperWidthMm,
          heightMm: paperHeightMm,
          marginMm,
          coverageMlPerCm2: coverageRate,
        })
      : []

  const colorPatch =
    legend.length === 0
      ? ''
      : JSON.stringify(
          legend.map((row) => ({
            number: row.number,
            hex: row.hex,
            paintId: row.paintId,
            areaCm2: row.areaCm2,
            estimatedQuantity: row.estimatedMl,
            shortfall: row.shortfall,
          })),
        )
  const saveKey =
    form && settings && framed
      ? JSON.stringify({
          title: form.title.trim() || 'Untitled project',
          colorCount: form.colorCount,
          detail,
          paperPreset: settings.paperPreset,
          paperWidthMm: settings.paperWidthMm,
          paperHeightMm: settings.paperHeightMm,
          orientation: settings.orientation,
          marginMm: settings.marginMm,
          coverageRate: settings.coverageRate,
          crop: framed.crop,
          constrainToOwned: form.constrainToOwned,
        })
      : ''

  useEffect(() => {
    if (!saveKey) return
    const patch = JSON.parse(saveKey) as ProjectPatch
    pendingSave.current = true
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      setSaveStatus('saving')
      void patchProject(projectId, patch)
        .then((saved) => {
          pendingSave.current = false
          setProject((current) =>
            current
              ? {
                  ...current,
                  title: saved.title,
                  colorCount: saved.colorCount,
                  detail: saved.detail,
                  paperPreset: saved.paperPreset,
                  paperWidthMm: saved.paperWidthMm,
                  paperHeightMm: saved.paperHeightMm,
                  orientation: saved.orientation,
                  marginMm: saved.marginMm,
                  coverageRate: saved.coverageRate,
                  cropX: saved.cropX,
                  cropY: saved.cropY,
                  cropWidth: saved.cropWidth,
                  cropHeight: saved.cropHeight,
                  constrainToOwned: saved.constrainToOwned,
                  updatedAt: saved.updatedAt,
                  status: saved.status,
                }
              : current,
          )
          setSaveStatus('saved')
        })
        .catch(() => {
          pendingSave.current = false
          setSaveStatus('error')
        })
    }, 800)
    return () => window.clearTimeout(saveTimer.current)
  }, [projectId, saveKey, saveAttempt])

  useEffect(() => {
    if (!colorPatch || phase !== 'ready') return
    const colors = JSON.parse(colorPatch) as ProjectPatch['colors']
    window.clearTimeout(colorTimer.current)
    colorTimer.current = window.setTimeout(() => {
      setSaveStatus('saving')
      void patchProject(projectId, { colors })
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('error'))
    }, 800)
    return () => window.clearTimeout(colorTimer.current)
  }, [projectId, colorPatch, phase, saveAttempt])

  useEffect(() => {
    if (!result) return
    window.clearTimeout(thumbTimer.current)
    const preview = result.colorPreviewRgba
    const width = result.width
    const height = result.height
    thumbTimer.current = window.setTimeout(() => {
      void rgbaToThumbnail(preview, width, height)
        .then((blob) => putProjectThumbnail(projectId, blob))
        .catch(() => undefined)
    }, 2000)
    return () => window.clearTimeout(thumbTimer.current)
  }, [projectId, result])

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (saveStatus === 'saving' || pendingSave.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [saveStatus])

  function retrySave() {
    setSaveStatus('saving')
    setSaveAttempt((value) => value + 1)
  }

  function retry() {
    setPhase('loading')
    setError(null)
    setResult(null)
    setAnalysis(null)
    setReloadKey((value) => value + 1)
  }

  return {
    project,
    paints,
    image,
    form,
    setForm,
    detail,
    setDetail,
    placement,
    setPlacement,
    phase,
    progress,
    result,
    legend,
    saveStatus,
    error,
    usable,
    capped,
    settingsError,
    pageAspect: framed?.aspect ?? 1,
    retry,
    retrySave,
    setProject,
    setSource,
    setImage,
    setAnalysis,
    setResult,
  }
}

async function analyzeAndStore(
  engine: NonNullable<ReturnType<typeof useEngine>>,
  projectRecordId: string,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  key: string,
  onProgress: (value: number) => void,
) {
  const fresh = await engine.analyze(rgba, width, height, onProgress)
  const bytes = await serializeAnalysis(fresh)
  await putProjectAnalysis(projectRecordId, bytes, key)
}

async function rgbaToThumbnail(rgba: Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not draw the thumbnail.')
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  const longest = Math.max(width, height)
  const scale = longest > 480 ? 480 / longest : 1
  const thumb = document.createElement('canvas')
  thumb.width = Math.max(1, Math.round(width * scale))
  thumb.height = Math.max(1, Math.round(height * scale))
  const thumbContext = thumb.getContext('2d')
  if (!thumbContext) throw new Error('Could not draw the thumbnail.')
  thumbContext.drawImage(canvas, 0, 0, thumb.width, thumb.height)
  const blob = await new Promise<Blob | null>((resolve) => thumb.toBlob(resolve, 'image/webp', 0.8))
  if (!blob) throw new Error('Could not draw the thumbnail.')
  return blob
}

export type { LegendRow }
