import React, { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { colors, spacing, typography, borderRadius } from '@/app/lib/designTokens';

interface TableProps {
  children: ReactNode;
  striped?: boolean;
}

interface TableHeaderProps extends ThHTMLAttributes<HTMLTableHeaderCellElement> {
  children: ReactNode;
}

interface TableCellProps extends TdHTMLAttributes<HTMLTableDataCellElement> {
  children: ReactNode;
}

interface TableRowProps {
  children: ReactNode;
}

const tableHeaderStyle = {
  padding: `${spacing['12']} ${spacing['16']}`,
  textAlign: 'left' as const,
  borderBottom: `1px solid ${colors.border.light}`,
  backgroundColor: colors.bg.secondary,
  fontWeight: typography.fontWeight.semibold,
  fontSize: typography.fontSize.sm,
  color: colors.text.primary,
};

const tableCellStyle = {
  padding: `${spacing['12']} ${spacing['16']}`,
  borderBottom: `1px solid ${colors.border.light}`,
  fontSize: typography.fontSize.sm,
  color: colors.text.primary,
};

export const Table = React.forwardRef<
  HTMLTableElement,
  TableProps
>(({ children, striped = false }, ref) => {
  return (
    <table
      ref={ref}
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        borderRadius: borderRadius.md,
        overflow: 'hidden',
        border: `1px solid ${colors.border.light}`,
      }}
    >
      {children}
    </table>
  );
});

Table.displayName = 'Table';

export const TableHead = React.forwardRef<
  HTMLTableSectionElement,
  { children: ReactNode }
>(({ children }, ref) => {
  return (
    <thead ref={ref}>
      {children}
    </thead>
  );
});

TableHead.displayName = 'TableHead';

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  { children: ReactNode; striped?: boolean }
>(({ children, striped = false }, ref) => {
  return (
    <tbody ref={ref}>
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;
        
        if (striped && index % 2 === 1) {
          return React.cloneElement<any>(child, {
            style: {
              ...(child.props as any).style,
              backgroundColor: colors.bg.secondary,
            },
          });
        }
        return child;
      })}
    </tbody>
  );
});

TableBody.displayName = 'TableBody';

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  TableRowProps & React.HTMLAttributes<HTMLTableRowElement>
>(({ children, ...props }, ref) => {
  return (
    <tr ref={ref} {...props}>
      {children}
    </tr>
  );
});

TableRow.displayName = 'TableRow';

export const TableHeader = React.forwardRef<
  HTMLTableHeaderCellElement,
  TableHeaderProps
>(({ children, ...props }, ref) => {
  return (
    <th
      ref={ref}
      style={tableHeaderStyle}
      {...props}
    >
      {children}
    </th>
  );
});

TableHeader.displayName = 'TableHeader';

export const TableCell = React.forwardRef<
  HTMLTableDataCellElement,
  TableCellProps
>(({ children, ...props }, ref) => {
  return (
    <td
      ref={ref}
      style={tableCellStyle}
      {...props}
    >
      {children}
    </td>
  );
});

TableCell.displayName = 'TableCell';
