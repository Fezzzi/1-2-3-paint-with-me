import { useState } from 'react'
import { Box, Button, Menu, MenuItem, TextField, Typography } from '@mui/material'
import type { SaveStatus } from './useProjectEditor.ts'

const SAVE_LABEL: Record<SaveStatus, string> = {
  saving: 'Saving…',
  saved: 'All changes saved',
  error: "Couldn't save – Retry",
}

export function EditorHeader({
  title,
  saveStatus,
  canExport,
  onTitle,
  onExport,
  onReplace,
  onDelete,
  onRetrySave,
}: {
  title: string
  saveStatus: SaveStatus
  canExport: boolean
  onTitle: (title: string) => void
  onExport: () => void
  onReplace: (file: File) => void
  onDelete: () => void
  onRetrySave: () => void
}) {
  const [menu, setMenu] = useState<HTMLElement | null>(null)

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
      <TextField
        value={title}
        onChange={(event) => onTitle(event.target.value)}
        aria-label="Project title"
        variant="standard"
        sx={{ flex: '1 1 180px', minWidth: 0 }}
      />
      <Typography variant="body2" color={saveStatus === 'error' ? 'error' : 'text.secondary'}>
        {SAVE_LABEL[saveStatus]}
      </Typography>
      {saveStatus === 'error' ? (
        <Button size="small" onClick={onRetrySave}>
          Retry
        </Button>
      ) : null}
      <Button variant="contained" disabled={!canExport} onClick={onExport}>
        Export PDF
      </Button>
      <Button aria-haspopup="menu" onClick={(event) => setMenu(event.currentTarget)}>
        More
      </Button>
      <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem component="label">
          Replace photo
          <input
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              setMenu(null)
              if (file) onReplace(file)
            }}
          />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenu(null)
            onDelete()
          }}
        >
          Delete project
        </MenuItem>
      </Menu>
    </Box>
  )
}
