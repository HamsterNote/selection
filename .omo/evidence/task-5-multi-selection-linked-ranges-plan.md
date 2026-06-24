# Task 5 Evidence — Linked Multi-Container Capture

## Design Notes

- `useTextSelection(containerRef)` remains source-compatible; the second argument is optional and legacy callers keep the original containment filter based on the local container.
- Linked mode bypasses the legacy `commonAncestorContainer` containment check, resolves native start/end with `resolveEndpoint()`, and rejects selections whose endpoints are outside registered linked containers.
- Linked capture is limited to same-document light DOM by requiring each native endpoint root to be `document`; Shadow DOM and iframe endpoints are rejected.
- Registered linked containers are read through `getRegisteredContainers()`. Each intersecting container receives a clipped Range fragment, local plain-text offsets, transient pixel rects, and persisted percent rects via `pixelRectsToPercentRects()`.
- Confirming in linked mode appends exactly one `LinkedSelectionRange`, calls `onLinkedDataChange`, `onLinkedSelect`, and `onLinkedSelectRange`, then clears the native selection.
- Same-container linked selections still use the linked item shape. Legacy compatibility callbacks fire only when both linked endpoints belong to the current local `selectionId`.
- Follow-up fix: linked capture now detects backward native selections and swaps resolved endpoints so `LinkedSelectionRange.start` and `LinkedSelectionRange.end` always use document order; `rectsBySelectionId` remains direction-independent.

## Verification

- `npm run typecheck` — passed.
- `npm run build` — passed.
- Pure LOC check — `src/useTextSelection.ts` is 237 after local simplification; `src/Selection.tsx` remains an inherited oversized file at 905 pure LOC and was not split in this task to avoid unrelated UI-system refactoring.
- `lsp_diagnostics` attempted for `src/useTextSelection.ts` and `src/Selection.tsx`; tool reported `Connection closed` / `Not connected`, so no LSP diagnostics could be collected from the MCP session.

## Browser QA Notes

- Not run in browser. Expected manual QA: drag across two linked `Selection` containers, call `highlight()`, and verify one item with two keys in `rectsBySelectionId`; select outside all linked containers and verify no item is added.
