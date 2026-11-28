import { useState } from 'react'
import {
  Avatar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material'
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router'
import { brand } from '../brand.ts'
import { BrandStripe, Logo } from '../Logo.tsx'
import { useAuth } from '../auth/useAuth.ts'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'
}

export function AppShell() {
  const { user, signOut } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  if (!user) return null
  const label = user.displayName || user.email
  const section = pathname.startsWith('/paints') ? 'paints' : pathname.startsWith('/account') ? 'account' : 'projects'

  return (
    <Box sx={{ minHeight: '100vh', pb: { xs: 8, md: 0 } }}>
      <Box
        component="a"
        href="#content"
        sx={{
          position: 'absolute',
          left: -9999,
          top: 8,
          bgcolor: 'background.paper',
          p: 1,
          zIndex: 2000,
          '&:focus': { left: 8 },
        }}
      >
        Skip to content
      </Box>
      <BrandStripe />
      <Box
        component="header"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          bgcolor: brand.ink,
          color: brand.sheet,
        }}
      >
        <Typography
          component={RouterLink}
          to="/projects"
          sx={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 1, fontFamily: '"Fredoka Variable", sans-serif', fontWeight: 600, mr: 'auto' }}
        >
          <Logo size={32} gap={brand.ink} />
          <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>1-2-3 paint with me!</Box>
        </Typography>
        <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 1 }}>
          <Button color="inherit" component={RouterLink} to="/projects">Projects</Button>
          <Button color="inherit" component={RouterLink} to="/paints">Paints</Button>
        </Box>
        <Button color="inherit" aria-haspopup="menu" onClick={(event) => setMenu(event.currentTarget)} sx={{ minWidth: 0 }}>
          <Avatar src={user.photoUrl ?? undefined} alt="" sx={{ width: 32, height: 32, mr: 1 }}>{initials(label)}</Avatar>
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{label}</Box>
        </Button>
        <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
          <MenuItem disabled>{user.email}</MenuItem>
          <MenuItem onClick={() => { setMenu(null); navigate('/account') }}>Account</MenuItem>
          <MenuItem onClick={() => { setMenu(null); void signOut() }}>Sign out</MenuItem>
        </Menu>
      </Box>
      <Box component="main" id="content" sx={{ px: { xs: 2, md: 3 }, py: 3, maxWidth: pathname.startsWith('/projects/') && pathname !== '/projects/new' ? '100%' : 1100, mx: 'auto' }}>
        <Outlet />
      </Box>
      <BottomNavigation
        showLabels
        value={section}
        onChange={(_event, value: string) => navigate(value === 'account' ? '/account' : `/${value}`)}
        sx={{ display: { xs: 'flex', md: 'none' }, position: 'fixed', bottom: 0, left: 0, right: 0, borderTop: 1, borderColor: 'divider' }}
      >
        <BottomNavigationAction label="Projects" value="projects" />
        <BottomNavigationAction label="Paints" value="paints" />
        <BottomNavigationAction label="Account" value="account" />
      </BottomNavigation>
    </Box>
  )
}
