import { useState } from 'react'
import { Alert, Box, Button, CircularProgress } from '@mui/material'
import { useNavigate } from 'react-router'
import { deleteProject, replaceProjectSource } from './api.ts'
import { pageSizeFromForm } from './form.ts'
import { measureImage } from './raster.ts'
import { EditorHeader } from './editor/EditorHeader.tsx'
import { LegendPanel } from './editor/LegendPanel.tsx'
import { PreviewWorkspace } from './editor/PreviewWorkspace.tsx'
import { SettingsPanel } from './editor/SettingsPanel.tsx'
import { useProjectEditor } from './editor/useProjectEditor.ts'
import { useConfirm, useSnackbar } from '../ui/useFeedback.ts'
import { usePageTitle } from '../ui/title.ts'

export function ProjectEditorPage({ projectId }: { projectId: string }) {
  const editor = useProjectEditor(projectId)
  const navigate = useNavigate()
  const confirm = useConfirm()
  const snackbar = useSnackbar()
  const [exporting, setExporting] = useState(false)
  usePageTitle(editor.form?.title || 'Project')

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete this project?',
      body: 'The photo and preview will be removed.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    await deleteProject(projectId)
    snackbar.show('Project deleted.')
    navigate('/projects')
  }

  async function onExport() {
    if (!editor.result || !editor.form || exporting) return
    setExporting(true)
    try {
      const { buildProjectPdf } = await import('./pdf.ts')
      const png = await rgbaToPng(editor.result.colorPreviewRgba, editor.result.width, editor.result.height)
      const page = editor.form
      const paper = pageSizeFromForm(page)
      const bytes = await buildProjectPdf({
        title: page.title.trim() || 'Untitled project',
        colorCount: editor.legend.length,
        width: editor.result.width,
        height: editor.result.height,
        chains: editor.result.chains,
        labels: editor.result.labels,
        colorPreviewPng: png,
        legend: editor.legend.map((row) => ({
          number: row.number,
          hex: row.hex,
          paintLabel: row.paintName,
          estimatedMl: row.estimatedMl,
          shortfall: row.shortfall,
        })),
        paperWidthMm: paper?.widthMm ?? 210,
        paperHeightMm: paper?.heightMm ?? 297,
        marginMm: Number(page.marginMm) || 10,
      })
      downloadBytes(bytes, `${page.title.trim() || 'project'}.pdf`)
    } catch (error) {
      snackbar.show(error instanceof Error ? error.message : "Couldn't export the PDF.", 'error')
    } finally {
      setExporting(false)
    }
  }

  async function onReplace(file: File) {
    try {
      const saved = await replaceProjectSource(projectId, file)
      const size = await measureImage(file)
      editor.setProject(saved)
      editor.setSource(file)
      editor.setImage({ width: size.width, height: size.height, url: URL.createObjectURL(file) })
      editor.setAnalysis(null)
      editor.setResult(null)
    } catch (error) {
      snackbar.show(error instanceof Error ? error.message : 'Could not replace the photo.', 'error')
    }
  }

  if (editor.phase === 'loading' && !editor.form) {
    return <CircularProgress />
  }
  if (editor.phase === 'error' && !editor.form) {
    return (
      <Alert
        severity="error"
        action={<Button onClick={editor.retry}>Retry</Button>}
      >
        {editor.error ?? 'Could not open this project.'}
      </Alert>
    )
  }
  if (!editor.form) return <CircularProgress />

  const settings = (
    <SettingsPanel
      form={editor.form}
      detail={editor.detail}
      image={editor.image}
      pageAspect={editor.pageAspect}
      placement={editor.placement}
      usable={editor.usable}
      capped={editor.capped}
      limitedByImage={editor.result?.limitedBy === 'image'}
      imageColors={editor.result?.palette.length ?? 0}
      settingsError={editor.settingsError}
      onForm={editor.setForm}
      onDetail={editor.setDetail}
      onPlacement={editor.setPlacement}
    />
  )

  return (
    <Box>
      <EditorHeader
        title={editor.form.title}
        saveStatus={editor.saveStatus}
        canExport={Boolean(editor.result) && !exporting}
        onTitle={(title) => editor.setForm({ ...editor.form!, title })}
        onExport={() => void onExport()}
        onReplace={(file) => void onReplace(file)}
        onDelete={() => void onDelete()}
        onRetrySave={editor.retrySave}
      />
      {editor.error && editor.form ? (
        <Alert severity="error" action={<Button onClick={editor.retry}>Retry</Button>} sx={{ mb: 2 }}>
          {editor.error}
        </Alert>
      ) : null}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '380px 1fr' }, gap: 2, alignItems: 'start' }}>
        <Box sx={{ order: { xs: 2, md: 1 }, maxHeight: { md: 'calc(100vh - 140px)' }, overflow: { md: 'auto' } }}>{settings}</Box>
        <Box sx={{ order: { xs: 1, md: 2 }, position: { md: 'sticky' }, top: { md: 16 } }}>
          <PreviewWorkspace
            phase={editor.phase}
            progress={editor.progress}
            result={editor.result}
            photoUrl={editor.image?.url ?? null}
            showOverlay={editor.phase === 'analyzing'}
          />
          <LegendPanel rows={editor.legend} onCopy={(hex) => void navigator.clipboard.writeText(hex).then(() => snackbar.show('Copied'))} />
        </Box>
      </Box>
      <Box sx={{ display: { xs: 'block', md: 'none' }, position: 'sticky', bottom: 64, mt: 2 }}>
        <Button variant="contained" fullWidth disabled={!editor.result || exporting} onClick={() => void onExport()}>
          Export PDF
        </Button>
      </Box>
    </Box>
  )
}

function downloadBytes(bytes: Uint8Array, name: string) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const url = URL.createObjectURL(new Blob([copy], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function rgbaToPng(rgba: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not draw the preview.')
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not draw the preview.')
  return new Uint8Array(await blob.arrayBuffer())
}
