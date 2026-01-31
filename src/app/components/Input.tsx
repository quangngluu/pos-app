import React, { InputHTMLAttributes } from 'react';
import { colors, spacing, typography, borderRadius, transitions } from '@/app/lib/designTokens';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, onFocus, onBlur, ...props }, ref) => {
    const [focused, setFocused] = React.useState(false);

    const baseStyle: React.CSSProperties = {
      padding: spacing['8'],
      width: '100%',
      border: `1px solid ${error ? colors.status.error : focused ? colors.interactive.primary : colors.border.default}`,
      borderRadius: borderRadius.base,
      background: colors.bg.secondary,
      color: colors.text.primary,
      fontFamily: typography.fontFamily.sans,
      fontSize: typography.fontSize.base,
      transition: `border-color ${transitions.fast}, box-shadow ${transitions.fast}`,
      boxShadow: focused ? `0 0 0 3px ${colors.status.infoLight}` : 'none',
    };

    return (
      <div style={{ width: '100%' }}>
        {label && (
          <label
            style={{
              display: 'block',
              marginBottom: spacing['6'],
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              color: colors.text.primary,
            }}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          style={baseStyle}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {error && (
          <p
            style={{
              marginTop: spacing['4'],
              fontSize: typography.fontSize.sm,
              color: colors.status.error,
            }}
          >
            {error}
          </p>
        )}
        {helperText && !error && (
          <p
            style={{
              marginTop: spacing['4'],
              fontSize: typography.fontSize.sm,
              color: colors.text.secondary,
            }}
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
