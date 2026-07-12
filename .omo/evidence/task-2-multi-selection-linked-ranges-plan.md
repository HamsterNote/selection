# Task 2 Evidence — Multi Selection Linked Ranges Plan

## Typecheck

Command:

```bash
npm run typecheck
```

Output:

```text
> @hamster-note/selection@0.0.0 typecheck
> tsc -b --noEmit
```

Result: passed.

## Geometry Type Note

- `src/types.ts` keeps linked controlled geometry on `LinkedSelectionRange.rectsBySelectionId` as `Record<string, PercentOverlayRect[]>`.
- Code search found no linked-mode controlled data property typed as pixel `OverlayRect[]`.
- `src/geometry.ts` now exposes helpers that convert `OverlayRect[]` to `PercentOverlayRect[]` before linked persistence, and convert `PercentOverlayRect[]` back to transient `OverlayRect[]` for hit testing, handles, and popovers.
