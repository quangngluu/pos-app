import React, { ReactNode } from 'react';
import { colors, spacing, typography, borderRadius, shadows, zIndex } from '@/app/lib/designTokens';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeStyles = {
  sm: { maxWidth: '400px' },
  md: { maxWidth: '600px' },
  lg: { maxWidth: '900px' },
  xl: { maxWidth: '1200px', width: 'calc(100vw - 48px)' },
};

export const Modal = React.forwardRef<
  HTMLDivElement,
  ModalProps
>(({ isOpen, onClose, title, children, size = 'md' }, ref) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: zIndex.backdrop,
          animation: 'fadeIn 0.15s ease-in-out',
        }}
      />

      {/* Modal */}
      <div
        ref={ref}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: colors.bg.primary,
          borderRadius: borderRadius.lg,
          boxShadow: shadows.xl,
          zIndex: zIndex.modal,
          maxHeight: '90vh',
          overflow: 'auto',
          ...sizeStyles[size],
        }}
      >
        {/* Header */}
        {title && (
          <div
            style={{
              padding: spacing['16'],
              borderBottom: `1px solid ${colors.border.light}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: typography.fontSize.lg,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
              }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: typography.fontSize.xl,
                color: colors.text.tertiary,
                padding: spacing['4'],
                display: 'flex',
                alignItems: 'center',
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Content */}
        <div style={{ padding: spacing['16'] }}>
          {children}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
});

Modal.displayName = 'Modal';
