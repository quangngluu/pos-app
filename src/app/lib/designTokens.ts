/**
 * Design System - Unified Color, Spacing, and Typography Tokens
 * Light theme (forced - no dark mode)
 */

// ============================================================
// COLOR PALETTE
// ============================================================

export const colors = {
  // Backgrounds
  bg: {
    primary: 'var(--color-bg-primary)',
    secondary: 'var(--color-bg-secondary)',
    tertiary: 'var(--color-bg-tertiary)',
    inverse: 'var(--color-bg-inverse)',
    dark: 'var(--color-bg-dark)',
    darker: 'var(--color-bg-darker)',
  },

  // Foreground / Text
  text: {
    primary: 'var(--color-text-primary)',
    secondary: 'var(--color-text-secondary)',
    tertiary: 'var(--color-text-tertiary)',
    light: 'var(--color-text-light)',
    lighter: 'var(--color-text-lighter)',
    inverse: 'var(--color-text-inverse)',
    muted: 'var(--color-text-muted)',
  },

  // Semantic Colors
  status: {
    success: 'var(--color-status-success)',
    successLight: 'var(--color-status-success-light)',
    error: 'var(--color-status-error)',
    errorLight: 'var(--color-status-error-light)',
    warning: 'var(--color-status-warning)',
    warningLight: 'var(--color-status-warning-light)',
    info: 'var(--color-status-info)',
    infoLight: 'var(--color-status-info-light)',
  },

  // Interactive
  interactive: {
    primary: 'var(--color-interactive-primary)',
    primaryHover: 'var(--color-interactive-primary-hover)',
    secondary: 'var(--color-interactive-secondary)',
    secondaryHover: 'var(--color-interactive-secondary-hover)',
  },

  // Borders
  border: {
    light: 'var(--color-border-light)',
    default: 'var(--color-border-medium)',
    dark: 'var(--color-border-dark)',
  },

  // Special
  shadow: 'rgba(0, 0, 0, 0.1)',
};

// ============================================================
// SPACING SCALE (8px base unit)
// ============================================================

export const spacing = {
  '0': 'var(--spacing-0)',
  '2': 'var(--spacing-2)',
  '4': 'var(--spacing-4)',
  '6': 'var(--spacing-6)',
  '8': 'var(--spacing-8)',
  '10': 'var(--spacing-10)',
  '12': 'var(--spacing-12)',
  '14': 'var(--spacing-14)',
  '16': 'var(--spacing-16)',
  '20': 'var(--spacing-20)',
  '24': 'var(--spacing-24)',
  '28': 'var(--spacing-28)',
  '32': 'var(--spacing-32)',
  '36': 'var(--spacing-36)',
  '40': 'var(--spacing-40)',
};

// ============================================================
// TYPOGRAPHY
// ============================================================

export const typography = {
  // Font families
  fontFamily: {
    sans: 'var(--font-family-primary)',
    mono: 'var(--font-family-mono)',
  },

  // Font sizes
  fontSize: {
    xs: 'var(--font-size-xs)',
    sm: 'var(--font-size-sm)',
    base: 'var(--font-size-base)',
    md: 'var(--font-size-md)',
    lg: 'var(--font-size-lg)',
    xl: 'var(--font-size-xl)',
    '2xl': 'var(--font-size-2xl)',
    '3xl': 'var(--font-size-3xl)',
    '4xl': 'var(--font-size-4xl)',
  },

  // Font weights
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },

  // Line heights
  lineHeight: {
    tight: 'var(--line-height-tight)',
    normal: 'var(--line-height-normal)',
    relaxed: 'var(--line-height-relaxed)',
    loose: 1.75,
  },
};

// ============================================================
// BORDER RADIUS
// ============================================================

export const borderRadius = {
  none: 'var(--border-radius-none)',
  sm: 'var(--border-radius-sm)',
  base: 'var(--border-radius-base)',
  md: 'var(--border-radius-md)',
  lg: 'var(--border-radius-lg)',
  xl: 'var(--border-radius-xl)',
  '2xl': 'var(--border-radius-2xl)',
  full: 'var(--border-radius-full)',
};

// ============================================================
// SHADOWS
// ============================================================

export const shadows = {
  none: 'var(--shadow-none)',
  sm: 'var(--shadow-sm)',
  base: 'var(--shadow-base)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
  xl: 'var(--shadow-xl)',
};

// ============================================================
// Z-INDEX SCALE
// ============================================================

export const zIndex = {
  hide: 'var(--z-index-hide)',
  base: 'var(--z-index-base)',
  dropdown: 'var(--z-index-dropdown)',
  sticky: 'var(--z-index-sticky)',
  fixed: 'var(--z-index-fixed)',
  backdrop: 'var(--z-index-backdrop)',
  modal: 'var(--z-index-modal)',
  popover: 'var(--z-index-popover)',
  tooltip: 'var(--z-index-tooltip)',
};

// ============================================================
// TRANSITIONS
// ============================================================

export const transitions = {
  fast: 'var(--transition-fast)',
  base: 'var(--transition-base)',
  slow: 'var(--transition-slow)',
};

// ============================================================
// COMPONENT PRESETS
// ============================================================

export const componentStyles = {
  // Button variants
  button: {
    primary: {
      background: colors.interactive.primary,
      color: colors.text.inverse,
      border: 'none',
      padding: `${spacing['8']} ${spacing['12']}`,
      borderRadius: borderRadius.md,
      fontWeight: typography.fontWeight.semibold,
      cursor: 'pointer',
      transition: `background ${transitions.base}`,
      '&:hover': {
        background: colors.interactive.primaryHover,
      },
      '&:disabled': {
        background: colors.text.light,
        cursor: 'not-allowed',
        opacity: 0.7,
      },
    },
    secondary: {
      background: colors.bg.secondary,
      color: colors.text.primary,
      border: `1px solid ${colors.border.default}`,
      padding: `${spacing['8']} ${spacing['12']}`,
      borderRadius: borderRadius.md,
      fontWeight: typography.fontWeight.medium,
      cursor: 'pointer',
      transition: `background ${transitions.base}`,
      '&:hover': {
        background: colors.bg.tertiary,
      },
    },
  },

  // Input field
  input: {
    padding: spacing['8'],
    width: '100%',
    border: `1px solid ${colors.border.default}`,
    borderRadius: borderRadius.base,
    background: colors.bg.secondary,
    color: colors.text.primary,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.base,
    transition: `border-color ${transitions.fast}, background ${transitions.fast}`,
    '&:focus': {
      borderColor: colors.interactive.primary,
      outline: 'none',
      boxShadow: `0 0 0 3px ${colors.status.infoLight}`,
    },
  },

  // Card
  card: {
    background: colors.bg.secondary,
    border: `1px solid ${colors.border.light}`,
    borderRadius: borderRadius.md,
    padding: spacing['16'],
    boxShadow: shadows.sm,
  },

  // Table cell
  tableCell: {
    padding: spacing['12'],
    borderBottom: `1px solid ${colors.border.light}`,
  },

  // Badge
  badge: {
    active: {
      padding: `${spacing['4']} ${spacing['8']}`,
      borderRadius: borderRadius.sm,
      fontSize: typography.fontSize.xs,
      background: 'rgba(16, 185, 129, 0.12)',
      color: colors.status.success,
    },
    inactive: {
      padding: `${spacing['4']} ${spacing['8']}`,
      borderRadius: borderRadius.sm,
      fontSize: typography.fontSize.xs,
      background: 'rgba(156, 163, 175, 0.12)',
      color: colors.text.tertiary,
    },
  },
};

// ============================================================
// RESPONSIVE UTILITIES
// ============================================================

export const responsive = {
  mobile: '640px',
  tablet: '1024px',
  desktop: '1280px',
};
