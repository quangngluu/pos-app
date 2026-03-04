# Design System Implementation Guide

## ✅ Completed: Design System Foundation

### 1. Design Tokens (`src/app/lib/designTokens.ts`)
Centralized system with all design decisions:
- **Colors**: Backgrounds, text, status, interactive, borders, shadows
- **Spacing**: 8px-based scale (0-40px)
- **Typography**: Font family, sizes (xs-4xl), weights (400-900), line heights
- **Border Radius**: 4px-9999px scale
- **Shadows**: 6-level depth scale (none-xl)
- **Z-Index**: Proper layering (-10 to 70)
- **Transitions**: fast/base/slow durations

### 2. CSS Variables (`src/app/globals.css`)
All tokens mapped as CSS custom properties for both TypeScript and CSS usage.

### 3. Component Library (7/7 Complete)

#### Core Components
1. **Button.tsx**
   - Usage: `<Button variant="primary" size="md">Click me</Button>`
   - Variants: primary, secondary, danger, success
   - Sizes: sm, md, lg
   - Props: fullWidth, disabled, children, onClick, etc.

2. **Input.tsx**
   - Usage: `<Input label="Email" type="email" error={error} helperText="Error message" />`
   - Features: label, error state, helperText, focus effects
   - Props: label, error, helperText, type, placeholder, value, onChange, etc.

3. **Select.tsx**
   - Usage: `<Select label="Category" options={[{value: 1, label: 'Cat'}]} />`
   - Features: label, error state, helperText
   - Props: label, error, helperText, options, value, onChange, etc.

4. **Card.tsx**
   - Usage: `<Card interactive onClick={handler}>Content</Card>`
   - Variants: default, interactive (with hover effect)
   - Props: children, interactive, onClick

#### Data Display
5. **Table.tsx**
   - Usage: 
   ```jsx
   <Table striped>
     <TableHead>
       <TableRow>
         <TableHeader>Name</TableHeader>
         <TableHeader>Price</TableHeader>
       </TableRow>
     </TableHead>
     <TableBody striped>
       <TableRow>
         <TableCell>Product 1</TableCell>
         <TableCell>$10</TableCell>
       </TableRow>
     </TableBody>
   </Table>
   ```
   - Features: striped rows, consistent padding, borders
   - Exports: Table, TableHead, TableBody, TableRow, TableHeader, TableCell

#### Indicators
6. **Badge.tsx**
   - Usage: `<Badge variant="success">Active</Badge>`
   - Variants: active, inactive, success, error, warning, info
   - Props: children, variant

7. **Chip.tsx**
   - Usage: `<Chip variant="primary" onRemove={() => {}}>Tag Name</Chip>`
   - Variants: default, primary, error
   - Props: children, variant, onRemove

#### Dialogs
8. **Modal.tsx**
   - Usage: 
   ```jsx
   <Modal isOpen={isOpen} onClose={closeHandler} title="Dialog Title" size="md">
     Content here
   </Modal>
   ```
   - Features: overlay, header with close button, size variants
   - Props: isOpen, onClose, title, children, size (sm/md/lg)

## 🔄 Next Steps: Page Refactoring

### Import Pattern
All pages should start with:
```typescript
import { Button, Input, Select, Card, Badge, Chip, Table, TableHead, TableBody, TableRow, TableHeader, TableCell, Modal } from '@/app/components';
import { colors, spacing, typography, borderRadius, shadows } from '@/app/lib/designTokens';
```

### Step 1: Refactor `src/app/pos/page.tsx` (2,308 lines)
**Key Changes:**
- Replace all `<button>` with `<Button variant="..." size="...">`
- Replace form inputs with `<Input label="..." />`
- Replace `<select>` with `<Select options={...} />`
- Replace table styling with `<Table>` component
- Replace inline styles with design token values
- Remove hardcoded colors (#3b82f6, #2a2a2a, etc.) - use `colors.interactive.primary`, etc.
- Remove scattered spacing (6px, 10px, etc.) - use `spacing['8']`, `spacing['16']`, etc.

**File Structure After Refactor:**
```
pos/page.tsx
├── Imports (components + design tokens)
├── State management
├── Event handlers
├── Component structure (using Button, Input, Table, Card, Modal, Badge, Chip)
└── Clean, readable JSX without inline styles
```

### Step 2: Refactor `src/app/admin/page.tsx` (2,360 lines)
**Key Changes:**
- Similar to POS, but focus on:
  - `<Table>` component for promotions, products, stores, categories lists
  - `<Select>` for filtering and data entry
  - `<Button>` for all actions (Create, Edit, Delete, Export)
  - `<Modal>` for product/promotion creation dialogs
  - Replace scattered styles with design tokens

### Step 3: Refactor `src/app/login/page.tsx`
**Key Changes:**
- Replace form styling with `<Input>` and `<Button>` components
- Use design tokens for card styling
- Remove inline styles

## 📋 Refactoring Checklist Template

For each page being refactored:

- [ ] Remove all inline style objects
- [ ] Replace all `<button>` with `<Button>`
- [ ] Replace all `<input>` with `<Input>`
- [ ] Replace all `<select>` with `<Select>`
- [ ] Replace all hardcoded colors with tokens (colors.*)
- [ ] Replace all hardcoded spacing with tokens (spacing['*'])
- [ ] Replace all hardcoded typography with tokens (typography.*)
- [ ] Replace tables with `<Table>` component
- [ ] Check all hover/focus states use component built-in effects
- [ ] Test in browser
- [ ] Verify responsive design

## 🎨 Design Token Reference

### Colors
```typescript
colors.bg.primary          // #ffffff
colors.bg.secondary        // #f9fafb
colors.bg.tertiary         // #f3f4f6
colors.bg.inverse          // #1f2937
colors.bg.dark             // #111827
colors.text.primary        // #1f2937
colors.text.secondary      // #4b5563
colors.interactive.primary // #3b82f6
colors.status.success      // #10b981
colors.status.error        // #ef4444
```

### Spacing
```typescript
spacing['0']   // 0
spacing['4']   // 0.25rem
spacing['8']   // 0.5rem
spacing['12']  // 0.75rem
spacing['16']  // 1rem
spacing['20']  // 1.25rem
spacing['24']  // 1.5rem
spacing['32']  // 2rem
spacing['40']  // 2.5rem
```

### Typography
```typescript
typography.fontSize.xs      // 0.75rem
typography.fontSize.sm      // 0.875rem
typography.fontSize.lg      // 1.125rem
typography.fontWeight.medium    // 500
typography.fontWeight.semibold  // 600
typography.lineHeight.normal    // 1.5
```

## ✅ Verification Checklist

After all refactoring:
- [ ] `npm run build` succeeds without errors
- [ ] No TypeScript errors in IDE
- [ ] All pages render correctly in browser
- [ ] Responsive design works (test on tablet/mobile)
- [ ] Hover/focus states work on all interactive elements
- [ ] Consistent spacing across all pages
- [ ] Consistent colors across all pages
- [ ] Consistent typography across all pages
- [ ] Modal and card styles consistent
- [ ] Table formatting consistent
- [ ] Button styles consistent

## 📊 Progress Tracking

- [x] Design tokens created (designTokens.ts)
- [x] CSS variables added (globals.css)
- [x] Button component (with 4 variants, 3 sizes)
- [x] Input component (with validation, labels)
- [x] Card component (with interactive variant)
- [x] Badge component (with 6 variants)
- [x] Chip component (with remove button)
- [x] Table component (with striped rows)
- [x] Select component (with custom styling)
- [x] Modal component (with overlay and header)
- [ ] Refactor pos/page.tsx
- [ ] Refactor admin/page.tsx
- [ ] Refactor login/page.tsx
- [ ] Test all pages in browser
- [ ] Verify npm run build succeeds
