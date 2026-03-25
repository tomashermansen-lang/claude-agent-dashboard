import { createTheme } from '@mui/material/styles'

/* ═══ Type Augmentations ═══ */

declare module '@mui/material/styles' {
  interface Palette {
    status: {
      pending: string
      wip: string
      done: string
      failed: string
      skipped: string
      blocked: string
    }
    eventType: {
      tool: string
      error: string
      notification: string
      subagent: string
      session: string
      permission: string
      task: string
      prompt: string
    }
    statusContainer: {
      pending: string
      wip: string
      done: string
      failed: string
      skipped: string
      blocked: string
    }
    onStatusContainer: {
      pending: string
      wip: string
      done: string
      failed: string
      skipped: string
      blocked: string
    }
    surface1: string
    surface2: string
    surface3: string
    surfaceVariant: string
    outline: string
    outlineVariant: string
  }
  interface PaletteOptions {
    status?: {
      pending?: string
      wip?: string
      done?: string
      failed?: string
      skipped?: string
      blocked?: string
    }
    eventType?: {
      tool?: string
      error?: string
      notification?: string
      subagent?: string
      session?: string
      permission?: string
      task?: string
      prompt?: string
    }
    statusContainer?: {
      pending?: string
      wip?: string
      done?: string
      failed?: string
      skipped?: string
      blocked?: string
    }
    onStatusContainer?: {
      pending?: string
      wip?: string
      done?: string
      failed?: string
      skipped?: string
      blocked?: string
    }
    surface1?: string
    surface2?: string
    surface3?: string
    surfaceVariant?: string
    outline?: string
    outlineVariant?: string
  }
  interface TypographyVariants {
    displayMedium: React.CSSProperties
    headlineSmall: React.CSSProperties
    titleLarge: React.CSSProperties
    titleMedium: React.CSSProperties
    titleSmall: React.CSSProperties
    labelLarge: React.CSSProperties
    labelMedium: React.CSSProperties
    labelSmall: React.CSSProperties
  }
  interface TypographyVariantsOptions {
    displayMedium?: React.CSSProperties
    headlineSmall?: React.CSSProperties
    titleLarge?: React.CSSProperties
    titleMedium?: React.CSSProperties
    titleSmall?: React.CSSProperties
    labelLarge?: React.CSSProperties
    labelMedium?: React.CSSProperties
    labelSmall?: React.CSSProperties
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    displayMedium: true
    headlineSmall: true
    titleLarge: true
    titleMedium: true
    titleSmall: true
    labelLarge: true
    labelMedium: true
    labelSmall: true
  }
}

declare module '@mui/material/Chip' {
  interface ChipPropsColorOverrides {
    pending: true
    wip: true
    done: true
    failed: true
    skipped: true
    blocked: true
  }
}

/* ═══ Theme ═══ */

const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'data' },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: '#4A6741',
          light: '#6B8F61',
          dark: '#344A2E',
          contrastText: '#FAFAF7',
        },
        secondary: {
          main: '#8B7355',
          light: '#B09A7C',
          dark: '#5E4D39',
        },
        background: {
          default: '#FAFAF7',
          paper: '#F5F3EE',
        },
        text: {
          primary: '#2C2C2A',
          secondary: '#6B6B65',
        },
        divider: 'rgba(0, 0, 0, 0.08)',
        status: {
          pending: '#9CA3AF',
          wip: '#6B8DB5',
          done: '#6B9E6B',
          failed: '#C07070',
          skipped: '#B8B5AD',
          blocked: '#C4943E',
        },
        eventType: {
          tool: '#4A7DB5',
          error: '#C07070',
          notification: '#C4943E',
          subagent: '#8B6BAE',
          session: '#6B9E6B',
          permission: '#C48040',
          task: '#4A9E8E',
          prompt: '#9CA3AF',
        },
        statusContainer: {
          done: '#C4EDBB',
          wip: '#D6E3FF',
          failed: '#FFDAD6',
          pending: '#E2E2E5',
          skipped: '#E3E3DB',
          blocked: '#FFEFD6',
        },
        onStatusContainer: {
          done: '#205017',
          wip: '#004788',
          failed: '#690005',
          pending: '#44474F',
          skipped: '#3F4239',
          blocked: '#5C3D00',
        },
        surface1: '#EFF2EB',
        surface2: '#E7EBE2',
        surface3: '#DFE3DA',
        surfaceVariant: '#DFE4D7',
        outline: '#737870',
        outlineVariant: '#C3C8BB',
      },
    },
    dark: {
      palette: {
        primary: {
          main: '#8BAF82',
          light: '#A8C9A0',
          dark: '#6B8F61',
        },
        secondary: {
          main: '#C4A882',
          light: '#D4BFA0',
          dark: '#A08A68',
        },
        background: {
          default: '#1A1A18',
          paper: '#242422',
        },
        text: {
          primary: '#E8E6E1',
          secondary: '#9C9A94',
        },
        divider: 'rgba(255, 255, 255, 0.08)',
        status: {
          pending: '#6B6F76',
          wip: '#7BA3CC',
          done: '#82B882',
          failed: '#D48A8A',
          skipped: '#5C5A55',
          blocked: '#D4A54A',
        },
        eventType: {
          tool: '#7BA3CC',
          error: '#D48A8A',
          notification: '#D4A54A',
          subagent: '#A98FCA',
          session: '#82B882',
          permission: '#D4A060',
          task: '#6BBCAC',
          prompt: '#6B6F76',
        },
        statusContainer: {
          done: '#1D3713',
          wip: '#003062',
          failed: '#410002',
          pending: '#2B2F33',
          skipped: '#2C2F28',
          blocked: '#3D2E00',
        },
        onStatusContainer: {
          done: '#A5D199',
          wip: '#ABC7FF',
          failed: '#FFB4AB',
          pending: '#C3C6CF',
          skipped: '#C7C8BF',
          blocked: '#FFD98E',
        },
        surface1: '#1A1E17',
        surface2: '#212520',
        surface3: '#2B2F28',
        surfaceVariant: '#434840',
        outline: '#8D9287',
        outlineVariant: '#434840',
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Inter Variable", "Inter", "Roboto", "Helvetica Neue", sans-serif',
    h4: { fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.2 },
    h5: { fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1.3 },
    h6: { fontWeight: 500, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 500, fontSize: '0.95rem' },
    subtitle2: { fontWeight: 500, fontSize: '0.8rem', letterSpacing: '0.02em' },
    body2: { lineHeight: 1.6 },
    caption: { fontSize: '0.75rem', letterSpacing: '0.01em' },
    overline: { fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em' },
    displayMedium: { fontSize: '2.8rem', fontWeight: 400, lineHeight: 1.2 },
    headlineSmall: { fontSize: '1.5rem', fontWeight: 500, lineHeight: 1.3 },
    titleLarge: { fontSize: '1.375rem', fontWeight: 500, lineHeight: 1.3 },
    titleMedium: { fontSize: '1rem', fontWeight: 500, lineHeight: 1.4 },
    titleSmall: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.4 },
    labelLarge: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.4 },
    labelMedium: { fontSize: '0.75rem', fontWeight: 500, lineHeight: 1.3 },
    labelSmall: { fontSize: '0.6875rem', fontWeight: 500, lineHeight: 1.2 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          '--motion-emphasized': 'cubic-bezier(0.2, 0, 0, 1)',
          '--motion-emphasized-decelerate': 'cubic-bezier(0.05, 0.7, 0.1, 1)',
          '--motion-emphasized-accelerate': 'cubic-bezier(0.3, 0, 0.8, 0.15)',
          '--motion-standard': 'cubic-bezier(0.2, 0, 0, 1)',
          '--motion-short3': '150ms',
          '--motion-short4': '200ms',
          '--motion-medium1': '250ms',
          '--motion-medium2': '300ms',
          '--font-mono': "'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', monospace",
        },
        body: {
          transition: 'background-color 400ms var(--motion-emphasized), color 400ms var(--motion-emphasized)',
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 8,
          border: '1px solid',
          borderColor: 'var(--mui-palette-divider)',
          transition: 'background-color var(--motion-short4) var(--motion-emphasized), border-color var(--motion-short4) var(--motion-emphasized)',
          '&:hover': {
            borderColor: 'var(--mui-palette-primary-light)',
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500, borderRadius: 8 },
      },
    },
MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 3, height: 6, backgroundColor: 'var(--mui-palette-divider)' },
        bar: { borderRadius: 3, transition: '600ms var(--motion-emphasized)' },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderLeft: 'none',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.08)',
          borderRadius: '8px 0 0 8px',
        },
      },
    },
  },
})

export default theme
