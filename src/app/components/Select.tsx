import React, { SelectHTMLAttributes } from 'react';
import { colors, spacing, typography, borderRadius } from '@/app/lib/designTokens';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: boolean;
  helperText?: string;
  options: Array<{ value: string | number; label: string }>;
}

export const Select = React.forwardRef<
  HTMLSelectElement,
  SelectProps
>(({ label, error = false, helperText, options, ...props }, ref) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['4'] }}>
      {label && (
        <label
          style={{
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
            color: colors.text.primary,
          }}
        >
          {label}
        </label>
      )}
      <select
        ref={ref}
        style={{
          padding: `${spacing['8']} ${spacing['12']}`,
          fontSize: typography.fontSize.sm,
          borderRadius: borderRadius.md,
          border: `1px solid ${error ? colors.status.error : colors.border.light}`,
          backgroundColor: colors.bg.primary,
          color: colors.text.primary,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
          backgroundSize: '20px',
          paddingRight: spacing['32'],
        }}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText && (
        <span
          style={{
            fontSize: typography.fontSize.xs,
            color: error ? colors.status.error : colors.text.tertiary,
          }}
        >
          {helperText}
        </span>
      )}
    </div>
  );
});

Select.displayName = 'Select';
