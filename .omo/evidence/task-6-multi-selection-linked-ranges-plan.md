# Task 6: Upgrade selection, popover, hit testing, deletion, and handle behavior for linked items

## Summary

Modified `src/Selection.tsx` to support drag-handle behavior for same-Selection linked items, hide handles for cross-Selection linked items, and wire up `onLinkedUpdateRange` + `onLinkedDataChange` for linked drag operations. Legacy mode behavior is unchanged.

## Changes in `src/Selection.tsx`

### 1. Import `pixelRectsToPercentRects`
Added `pixelRectsToPercentRects` to the import from `./geometry` so that handle dragging in linked mode can convert new pixel rects back to percent rects for `LinkedSelectionRange.rectsBySelectionId`.

### 2. Ref wiring for `onLinkedUpdateRange` and `linkedSelectionId`
- Created `onLinkedUpdateRangeRef` (bridging ref, same pattern as existing `rangesRef` / `onUpdateRangeRef`) to let pointermove listener read the latest `onLinkedUpdateRange` without re-registering.
- Created `linkedSelectionIdRef` to let `startHandleDrag` (a `useCallback` with `[]` deps) access the current `linkedSelectionId` to decide same-Selection vs cross-Selection.
- Removed `void onLinkedUpdateRange;` — it is now wired via the ref.

### 3. `startHandleDrag` — linked mode anchor
When `rangeId` is set (persisted range handle drag), the function now checks:
- If `linkedDataRef.current` and `linkedSelectionIdRef.current` are both non-null (linked mode):
  - Finds the linked item by id in `linkedData.items`.
  - If both endpoints match `linkedSelectionId` (same-Selection): sets `dragAnchorRef` to the opposite endpoint's local offset (mirrors legacy behavior).
  - If cross-Selection: sets `dragAnchorRef` to `-1`, which blocks dragging in the pointermove handler.
- Otherwise (legacy mode): unchanged — uses `rangesRef.current.find()` as before.

### 4. Drag `pointermove` effect — linked branch
When `dragPersistedIdRef.current` is set and linked mode is active:
- Finds the linked item by persisted id.
- Rejects cross-Selection items (returns early).
- Computes `lo`/`hi` from `dragAnchorRef` and `newOffset` (same algorithm as legacy).
- Creates DOM Range from `lo`/`hi`, extracts text and pixel rects.
- Converts pixel rects to percent rects via `pixelRectsToPercentRects`.
- Builds `updatedItem: LinkedSelectionRange` with new `start.offset`, `end.offset`, `text`, and updated `rectsBySelectionId[currentSelId]`.
- Builds `nextData: LinkedSelectionData` with the item replaced.
- Calls `onLinkedUpdateRangeRef.current?.(updatedItem)` and `onLinkedDataChangeRef.current?.(nextData)`.
- Does NOT call `onUpdateRange` for linked items.
Legacy branch is unchanged and falls through when not in linked mode.

### 5. Persisted handle rendering condition
Changed from:
```
{!linkedContext && !hasSelection && currentSelectedRangeId && (() => { ... })}
```
to:
```
{!hasSelection && currentSelectedRangeId && (() => {
  // Linked mode: only render handles for same-Selection items
  if (linkedContext) {
    const item = linkedContext.data.items.find(it => it.id === currentSelectedRangeId);
    if (!item) return null;
    if (item.start.selectionId !== linkedContext.selectionId || item.end.selectionId !== linkedContext.selectionId) return null;
  }
  // ... existing handle rendering
})}
```
This allows handles in linked mode for same-Selection items and hides them for cross-Selection items.

### 6. Hit testing, popover anchoring, and selection — no changes needed
- `handleContainerClick` already loops `persistedRects` and calls `selectRange` (which is `onLinkedSelectRange` in linked mode). It works in linked mode because it's always attached regardless of mode.
- `popoverAnchor` derives from `persistedRects.find(p => p.id === currentSelectedRangeId)` — works in linked mode since `persistedRects` is populated and `currentSelectedRangeId` is `linkedContext.data.selectedRangeId`.
- `selectionPopoverAnchor` uses the active selection's `rects` — works in both modes.
- Active-selection handle drag (no `dragPersistedId`) is unchanged in both modes.

## Verification

```
npm run typecheck → PASS (no output, exit 0)
npm run build     → PASS (7 modules transformed, dist files produced)
npm run lint      → PASS (no errors)
```

## Files Modified
- `src/Selection.tsx` (only file modified)