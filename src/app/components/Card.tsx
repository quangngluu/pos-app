import React, { ReactNode, HTMLAttributes } from 'react';
import { colors, spacing, borderRadius, shadows } from '@/app/lib/designTokens';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: keyof typeof spacing;
  variant?: 'default' | 'interactive';
  onClick?: () => void;
}

export const Card = React.forwardRef<
  HTMLDivElement,
  CardProps
>(({ children, padding = '16', variant = 'default', onClick, style, ...rest }, ref) => {
  const isInteractive = variant === 'interactive' && onClick;

  const baseStyle: React.CSSProperties = {
    background: colors.bg.secondary,
    border: `1px solid ${colors.border.light}`,
    borderRadius: borderRadius.md,
    padding: spacing[padding as keyof typeof spacing],
    boxShadow: shadows.sm,
    cursor: isInteractive ? 'pointer' : 'default',
    transition: isInteractive ? 'all 0.2s ease' : 'none',
    ...style,
  };

  const [hovered, setHovered] = React.useState(false);

  const handleMouseEnter = () => {
    if (isInteractive) setHovered(true);
  };

  const handleMouseLeave = () => {
    if (isInteractive) setHovered(false);
  };

  const hoverStyle = hovered && isInteractive ? {
    borderColor: colors.interactive.primary,
    boxShadow: shadows.md,
  } : {};

  return (
    <div
      ref={ref}
      style={{ ...baseStyle, ...hoverStyle }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      {...rest}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';
