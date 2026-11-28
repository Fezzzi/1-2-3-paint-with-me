import { createTheme } from '@mui/material/styles'
import { brand } from './brand.ts'

const sans = '"Inter Variable", "Inter", sans-serif'
const display = '"Fredoka Variable", "Fredoka", sans-serif'

export const theme = createTheme({
  palette: {
    primary: {
      main: brand.orange,
      dark: brand.orangeDeep,
      light: '#F0A15A',
      contrastText: brand.ink,
    },
    secondary: {
      main: brand.purple,
      dark: brand.purpleDeep,
      light: '#7C6AA6',
      contrastText: brand.ink,
    },
    success: {
      main: brand.green,
      dark: brand.greenDeep,
      light: '#5C9474',
      contrastText: brand.ink,
    },
    info: {
      main: brand.purple,
      dark: brand.purpleDeep,
      light: '#7C6AA6',
      contrastText: brand.ink,
    },
    background: {
      default: brand.paper,
      paper: brand.sheet,
    },
    text: {
      primary: brand.ink,
      secondary: brand.inkSoft,
    },
    divider: brand.line,
    action: {
      hover: 'rgba(47, 107, 74, 0.10)',
      selected: 'rgba(91, 74, 134, 0.14)',
      focus: 'rgba(224, 122, 42, 0.24)',
    },
  },
  shape: {
    borderRadius: 8,
  },
  spacing: 8,
  typography: {
    fontFamily: sans,
    h1: { fontFamily: display, fontWeight: 600 },
    h2: { fontFamily: display, fontWeight: 600 },
    h3: { fontFamily: display, fontWeight: 600 },
    h4: { fontFamily: display, fontWeight: 600 },
    button: { fontFamily: sans, fontWeight: 600, textTransform: 'none' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: brand.paper,
          color: brand.ink,
          fontFamily: sans,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: brand.ink,
          color: brand.sheet,
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 10,
          '&:focus-visible': {
            outline: `3px solid ${brand.orange}`,
            outlineOffset: 2,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: `1px solid ${brand.line}`,
          boxShadow: '0 8px 24px rgba(26, 24, 20, 0.06)',
          backgroundImage: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: brand.orange,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '&:focus-visible': {
            outline: `3px solid ${brand.orange}`,
            outlineOffset: 2,
          },
        },
      },
    },
  },
})
