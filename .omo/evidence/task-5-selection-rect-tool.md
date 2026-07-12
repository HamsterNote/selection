# Task 5 Evidence — Rect Handle & Resize Tests

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
All 24 Selection rect tests pass, including handle tests: `renders handles for active drawing and persisted selected rect`, `drags rect handle to resize persisted rect`, and `drags active rect handle`. Start/end handles render correctly for both active drawing and persisted selected rects, and drag gestures produce correct updated coordinates.
