import { Box, Chip, Link, Typography } from '@mui/material'
import type { SVGProps } from 'react'
import { Link as RouterLink } from 'react-router'
import type { LegendRow } from './legend.ts'

export function LegendPanel({ rows, onCopy }: { rows: LegendRow[]; onCopy: (hex: string) => void }) {
  const total = rows.reduce((sum, row) => sum + row.estimatedMl, 0)
  return (
    <Box sx={{ mt: 2 }}>
      <Typography sx={{ mb: 1 }}>
        {rows.length} colors · approx. {total.toFixed(1)} ml of paint in total
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
        {rows.map((row) => (
          <Box key={row.number} sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1, border: 1, borderColor: 'divider', borderRadius: 2 }}>
            <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: row.hex, border: 1, borderColor: 'divider', display: 'grid', placeItems: 'center', fontSize: 12 }}>
              {row.number}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <ButtonHex hex={row.hex} onCopy={onCopy} />
              {row.paintId && row.paintName ? (
                <Link component={RouterLink} to={`/paints/${row.paintId}`} sx={{ display: 'block' }}>
                  {row.paintName}
                </Link>
              ) : (
                <Typography variant="body2" color="text.secondary">No matching paint</Typography>
              )}
              <Typography variant="body2">{row.estimatedMl.toFixed(1)} ml</Typography>
              {row.shortfall ? <Chip size="small" icon={<WarningIcon />} label="Short" color="warning" /> : null}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function WarningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  )
}

function ButtonHex({ hex, onCopy }: { hex: string; onCopy: (hex: string) => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onCopy(hex)}
      sx={{ border: 0, bgcolor: 'transparent', p: 0, cursor: 'pointer', font: 'inherit' }}
    >
      {hex}
    </Box>
  )
}
