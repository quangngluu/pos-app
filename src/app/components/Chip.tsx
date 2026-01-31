import React, { ReactNode } from 'react';
import { colors, spacing, typography, borderRadius } from '@/app/lib/designTokens';

interface ChipProps {
  children: ReactNode;
  onRemove?: () => void;
  variant?: 'default' | 'primary' | 'error';
}

const variantStyles = {
  default: {
    background: colors.bg.secondary,
    color: colors.text.primary,
    border: `1px solid ${colors.border.light}`,
  },
  primary: {
    background: `rgba(59, 130, 246, 0.1)`,
    color: colors.interactive.primary,
    border: `1px solid ${colors.interactive.primary}`,
  },
  error: {
    background: `rgba(239, 68, 68, 0.1)`,
    color: colors.status.error,
    border: `1px solid ${colors.status.error}`,
  },
};

export const Chip = React.forwardRef<
  HTMLDivElement,
  ChipProps
>(({ children, onRemove, variant = 'default' }, ref) => {
  const style = variantStyles[variant];

  return (
    <div
      ref={ref}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing['4'],
        padding: `${spacing['6']} ${spacing['12']}`,
        borderRadius: borderRadius.full,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
        ...style,
      }}
    >
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: typography.fontSize.lg,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
});

Chip.displayName = 'Chip';
