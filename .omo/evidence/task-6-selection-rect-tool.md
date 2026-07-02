# Task 6 — Selection Rect Tool Regression Evidence

## Scope
- Added regression coverage in `src/Selection.rect.test.tsx` for text/rect tool compatibility and linked-mode rect isolation.
- Applied minimal mutual-exclusion fixes in `src/Selection.tsx` only where tests exposed missing cleanup behavior.
- Updated `.omo/notepads/selection-rect-tool/learnings.md` and `.omo/notepads/selection-rect-tool/issues.md` with findings.

## Acceptance Criteria Covered
1. Default omitted `tool` remains text mode: drag-to-highlight + `ref.highlight()` still emit text callbacks.
2. Explicit `tool="text"` behaves the same as omitted text mode.
3. `tool="rect"` drag does not call text callbacks: `onSelectionStart`, `onSelectionEnd`, `onSelect`, `onHighlight`, `onUpdateRange`.
4. Switching text → rect clears active text selection and hides text selection popover; stale text cannot be confirmed.
5. Switching rect → text clears active rect draft; stale rect cannot be confirmed.
6. Starting rect drag while `selectedRangeId` is set calls `onSelectRange(null)`.
7. Starting text drag while `selectedRectId` is set calls `onSelectRect(null)`.
8. Linked mode rect creation fires local `onCreateRect` without appending or mutating `linkedData.items` into rect-shaped entries.
9. Existing tests were not skipped or weakened.

## Verification

### Focused red/green check
Command:
```bash
npm run test -- src/Selection.rect.test.tsx
```

Result:
```text
✓ src/Selection.rect.test.tsx (23 tests) 234ms
Test Files  1 passed (1)
Tests  23 passed (23)
```

### Full test suite
Command:
```bash
npm run test
```

Result:
```text
✓ src/index.test.ts (2 tests) 17ms
✓ src/styleUtils.test.ts (37 tests) 16ms
✓ src/geometry.test.ts (28 tests) 21ms
✓ src/Selection.stylePersistence.test.tsx (9 tests) 289ms
✓ src/Selection.rect.test.tsx (23 tests) 316ms
✓ src/Selection.overlayRectType.test.tsx (20 tests) 393ms

Test Files  6 passed (6)
Tests  119 passed (119)
```

### Type/LSP-equivalent check
Command:
```bash
npm run typecheck
```

Result:
```text
> @hamster-note/selection@0.0.0 typecheck
> tsc -b --noEmit
```

Exit status: passed with no diagnostics.
