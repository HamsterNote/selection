# selection-rect-tool Issues

## Active
(None yet)

## Resolved
- F1 verification: Percent rect creation test (`creates percent rects with % start/end values and correctly formatted rects`) was using manual per-instance `vi.spyOn` on `selectionContainerNode` and `overlay` instead of the shared `mockContainerGeometry()` helper. Additionally, it fired `fireEvent.pointerDown` on the overlay (`.hsn-selection-overlay`) instead of the container (`.hsn-selection-container`), and events weren't wrapped in `act()`. Fixed by using `mockContainerGeometry()`, firing on `selectionContainer(container)`, and using the `dragRect()` helper.
- Task 6: Switching `tool` did not clear stale active state, so old text or rect drafts could still be confirmed after switching modes. Fixed in `src/Selection.tsx` with tool-mode cleanup effect.
- Task 6: Starting a rect drag did not explicitly clear `selectedRangeId`; starting a text drag did not explicitly clear `selectedRectId`. Fixed with minimal mutual-exclusion callbacks on gesture start.
- Task 8: `npm run lint` initially failed on explicit `any` in `src/Selection.rect.test.tsx` and `src/Selection.tsx`, plus a stale hook disable comment. Fixed with typed test helpers, direct pointer coordinate reads, `dragRectAnchorRef`, `displayRects` memoization, and removal of stale disable.
- Task 8: Initial QA script had ambiguous legacy heading selector, oversized drag coordinates, and an extra rect-list click that toggled selection off before handle checks. Fixed the script selectors/coordinates/selection flow; final QA passed.
