# Task 3 Evidence — Active Rect Drawing & Confirmation Tests

## Command
```
npm run test -- src/Selection.rect.test.tsx
```

## Output
```
 RUN  v3.2.6
 ✓ src/Selection.rect.test.tsx (24 tests) 294ms
 Test Files  1 passed (1)
      Tests  24 passed (24)
```

## Summary
All 24 Selection rect tests pass, including active-drawing tests: `selection.rect-draft.drag-shows-active-rect-and-selection-popover`, `selection.rect-confirm.popover-button-ref-confirm-creates-rect-without-text-callbacks`, `selection.rect-confirm.confirmRect-confirms-active-rect`, and `selection.rect-confirm.highlight-is-text-only-and-does-not-confirm-rects`. Percent rect creation with `overlayRectType="percent"` correctly produces 10%/10%/30%/30% geometry from 400×300 container coordinates.
