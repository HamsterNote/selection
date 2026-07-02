# Task 2 Evidence — Rect Geometry Helpers (geometry.ts)

## Command
```
npm run test -- src/geometry.test.ts
```

## Output
```
 RUN  v3.2.6
 ✓ src/geometry.test.ts (28 tests) 14ms
 Test Files  1 passed (1)
      Tests  28 passed (28)
```

## Summary
All 28 geometry tests pass, including `normalizeRectFromPoints`, `isRectCreatable`, `pointFromPointer`, and `clampPointToContainer`. The rect geometry helpers correctly compute normalized rects, detect minimum size thresholds, and clamp coordinates within container bounds.
