import { Box } from '@mui/material'
import { brand } from './brand.ts'

export function Logo({ size = 32, gap }: { size?: number; gap: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <polygon
        points="8,8 38,8 34,34 8,36"
        fill={brand.orange}
        stroke={gap}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <polygon
        points="38,8 56,8 56,30 34,34"
        fill={brand.green}
        stroke={gap}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <polygon
        points="8,36 34,34 56,30 56,56 8,56"
        fill={brand.purple}
        stroke={gap}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <text
        x="22"
        y="22"
        fill={brand.ink}
        fontSize="11"
        fontFamily="inherit"
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
      >
        1
      </text>
      <text
        x="46"
        y="20"
        fill={brand.ink}
        fontSize="11"
        fontFamily="inherit"
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
      >
        2
      </text>
      <text
        x="30"
        y="46"
        fill={brand.ink}
        fontSize="11"
        fontFamily="inherit"
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
      >
        3
      </text>
    </svg>
  )
}

export function BrandStripe() {
  return (
    <Box aria-hidden sx={{ display: 'flex', height: 4, flex: '0 0 auto' }}>
      <Box sx={{ flex: 1, bgcolor: brand.orange }} />
      <Box sx={{ flex: 1, bgcolor: brand.green }} />
      <Box sx={{ flex: 1, bgcolor: brand.purple }} />
    </Box>
  )
}
