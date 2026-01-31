import React, { ButtonHTMLAttributes } from 'react';
import { colors, spacing, typography, borderRadius, transitions } from '@/app/lib/designTokens';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

const variantStyles = {
  primary: {
    background: colors.interactive.primary,
    color: colors.text.inverse,
    border: 'none',
  },
  secondary: {
    background: colors.bg.secondary,
    color: colors.text.primary,
    border: `1px solid ${colors.border.default}`,
  },
  danger: {
    background: colors.status.error,
    color: colors.text.inverse,
    border: 'none',
  },
  success: {
    background: colors.status.success,
    color: colors.text.inverse,
    border: 'none',
  },
};

const sizeStyles = {
  sm: {
    padding: `${spacing['6']} ${spacing['10']}`,
    fontSize: typography.fontSize.sm,
  },
  md: {
    padding: `${spacing['8']} ${spacing['12']}`,
    fontSize: typography.fontSize.base,
  },
  lg: {
    padding: `${spacing['10']} ${spacing['16']}`,
    fontSize: typography.fontSize.md,
  },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      onMouseEnter,
      onMouseLeave,
      disabled,
      className,
      ...props
    },
    ref
  ) => {
    const variantStyle = variantStyles[variant];
    const sizeStyle = sizeStyles[size];

    const baseStyle: React.CSSProperties = {
      ...variantStyle,
      ...sizeStyle,
      fontWeight: typography.fontWeight.semibold,
      borderRadius: borderRadius.md,
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: `all ${transitions.base}`,
      width: fullWidth ? '100%' : 'auto',
      opacity: disabled ? 0.7 : 1,
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!disabled) {
        const target = e.currentTarget;
        if (variant === 'primary') {
          target.style.background = colors.interactive.primaryHover;
        } else if (variant === 'secondary') {
          target.style.background = colors.bg.tertiary;
        }
      }
      onMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      const target = e.currentTarget;
      if (variant === 'primary') {
        target.style.background = colors.interactive.primary;
      } else if (variant === 'secondary') {
        target.style.background = colors.bg.secondary;
      }
      onMouseLeave?.(e);
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        style={baseStyle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
