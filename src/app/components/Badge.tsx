import React, { ReactNode } from 'react';
import { colors, spacing, typography, borderRadius } from '@/app/lib/designTokens';

interface BadgeProps {
  children: ReactNode;
  variant?: 'active' | 'inactive' | 'success' | 'error' | 'warning' | 'info';
}

const variantStyles = {
  active: {
    background: `rgba(16, 185, 129, 0.1)`,
    color: colors.status.success,
  },
  inactive: {
    background: `rgba(156, 163, 175, 0.1)`,
    color: colors.text.tertiary,
  },
  success: {
    background: `rgba(16, 185, 129, 0.1)`,
    color: colors.status.success,
  },
  error: {
    background: `rgba(239, 68, 68, 0.1)`,
    color: colors.status.error,
  },
  warning: {
    background: `rgba(245, 158, 11, 0.1)`,
    color: colors.status.warning,
  },
  info: {
    background: `rgba(59, 130, 246, 0.1)`,
    color: colors.status.info,
  },
};

export const Badge = React.forwardRef<
  HTMLSpanElement,
  BadgeProps
>(({ children, variant = 'active' }, ref) => {
  const style = variantStyles[variant];

  return (
    <span
      ref={ref}
      style={{
        display: 'inline-block',
        padding: `${spacing['4']} ${spacing['8']}`,
        borderRadius: borderRadius.sm,
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.medium,
        ...style,
      }}
    >
      {children}
    </span>
  );
});

Badge.displayName = 'Badge';
