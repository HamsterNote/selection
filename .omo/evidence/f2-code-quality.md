# F2 Code Quality Review

Verdict: APPROVE

Scope reviewed:
- `src/types.ts`
- `src/Selection.tsx`
- `src/useTextSelection.ts`
- `src/index.ts`
- `demo/src/App.tsx`

Commands run:
- `npm run typecheck` — PASS (`tsc -b --noEmit` completed with no diagnostics)
- `npm run lint` — PASS (`eslint .` completed with no diagnostics)
- Anti-pattern grep over scoped files for `as any`, `@ts-ignore`, `@ts-expect-error`, `TODO`, `FIXME`, `console.log`, `console.warn`, bare `any`, `eslint-disable`, `biome-ignore`, DOM access, and effect/state update patterns.
- `codegraph_impact("isRangeBackward", depth=2)` — only impacts `src/useTextSelection.ts` / `useTextSelection`; no broader public API blast radius.

## Excessive complexity or oversized modules

- `src/Selection.tsx` is oversized at 912 pure LOC (`src/Selection.tsx:213` starts the main component and the file ends at `src/Selection.tsx:1142`). This is above the usual 250 LOC review threshold, but it was explicitly inherited as known debt for this plan and this review scope did not require source restructuring. The file is internally partitioned by focused helpers (`src/Selection.tsx:52`, `src/Selection.tsx:106`, `src/Selection.tsx:145`, `src/Selection.tsx:170`) and effect sections with cleanup.
- `demo/src/App.tsx` is oversized at 992 pure LOC (`demo/src/App.tsx:44` starts the demo component and ends at `demo/src/App.tsx:1118`). This is demo-only complexity combining linked-mode controls, legacy compatibility controls, logs, lists, and JSON inspector. Not a library runtime blocker, but future demo edits should consider extracting panels/controls.
- `src/useTextSelection.ts` is 245 pure LOC, below the inherited 250 LOC target. It is dense but still scoped to native selection capture, linked capture, and clear state (`src/useTextSelection.ts:206`).
- `src/types.ts` is 110 pure LOC of public model declarations and comments; no implementation complexity.
- `src/index.ts` is 33 pure LOC and only re-exports public surface.

## Stale or unreachable legacy paths

- Legacy paths remain reachable and intentionally preserved. `demo/src/App.tsx:86` gates the legacy panel with `showLegacy`; `demo/src/App.tsx:708` renders it when enabled, and it passes legacy-only props to `Selection` at `demo/src/App.tsx:760` through `demo/src/App.tsx:811`.
- Library legacy mode remains active when `linkedContext` is absent. `src/Selection.tsx:397` recomputes persisted rects from `ranges` in the `else` branch at `src/Selection.tsx:412`, and `handleConfirm` falls back to a `SelectionRange` at `src/Selection.tsx:489`.
- Linked-mode guards do not make legacy code unreachable: `getLinkedModeContext` returns null unless `linkedMode`, `linkedData`, and a non-empty normalized `selectionId` are present (`src/Selection.tsx:170`).
- No stale `TODO` / `FIXME` markers were found in the reviewed files.

## Potential render loops or excessive re-renders

- The most sensitive state update is persisted rect recomputation. `src/Selection.tsx:397` builds `next` rect groups and `src/Selection.tsx:424` uses `rectListsEqual(prev, next) ? prev : next`, preventing layout-effect setState loops.
- The layout effect at `src/Selection.tsx:430` intentionally measures DOM after render and depends only on `recomputePersistedRects`; the shallow equality guard above makes it idempotent.
- ResizeObserver/window resize listeners at `src/Selection.tsx:435` are cleaned up at `src/Selection.tsx:441`, avoiding accumulating re-render sources.
- Global selection, mouse, click, mousedown, pointermove, and pointerup listeners all have cleanup paths: `src/useTextSelection.ts:266`, `src/Selection.tsx:534`, `src/Selection.tsx:638`, `src/Selection.tsx:653`, and `src/Selection.tsx:733`.
- Bridge refs (`rangesRef`, `onUpdateRangeRef`, `linkedDataRef`, `onLinkedDataChangeRef`, `onLinkedUpdateRangeRef`, `linkedSelectionIdRef`) at `src/Selection.tsx:281` through `src/Selection.tsx:294` are appropriate for avoiding listener re-registration during drag.
- Demo callbacks are memoized for props passed into `Selection` (`demo/src/App.tsx:111`, `demo/src/App.tsx:119`, `demo/src/App.tsx:137`, `demo/src/App.tsx:155`, `demo/src/App.tsx:188`, `demo/src/App.tsx:196`, `demo/src/App.tsx:251`, `demo/src/App.tsx:280`). Inline ref callbacks at `demo/src/App.tsx:534` and `demo/src/App.tsx:623` are acceptable demo code and only update refs, not state.

## Unsafe assumptions and escape hatches

- No `as any`, `@ts-ignore`, `@ts-expect-error`, `console.log`, `debugger`, `eslint-disable`, or `biome-ignore` were found in the reviewed files.
- `console.warn` appears once at `src/Selection.tsx:309`. It is wrapped by `if (import.meta.env.DEV)` at `src/Selection.tsx:308` and reports invalid linked-mode usage (`linkedMode` without non-empty `selectionId`). This is appropriate dev-only API misuse feedback, not production console noise.
- The comment at `src/Selection.tsx:572` explicitly notes avoiding `as any`; the actual cast is `e as PointerEvent` at `src/Selection.tsx:573` after an `'pointerType' in e` guard. This is a bounded DOM-event narrowing, not an untyped escape hatch.
- DOM access is guarded by refs and platform checks where needed: container refs are checked before use (`src/Selection.tsx:315`, `src/Selection.tsx:398`, `src/Selection.tsx:436`, `src/Selection.tsx:535`, `src/Selection.tsx:639`, `src/Selection.tsx:738`), `ResizeObserver` is feature-checked at `src/Selection.tsx:437`, and native selection is null/rangeCount/collapsed checked at `src/useTextSelection.ts:219` and `src/Selection.tsx:540` / `src/Selection.tsx:546`.
- `src/useTextSelection.ts:102` calls `selection.getRangeAt(0)` inside `captureLinkedSelection`; caller path checks `selection.rangeCount === 0` before entering at `src/useTextSelection.ts:219`, so this is currently safe for internal use. If exported later, add an explicit `rangeCount` guard inside the helper.
- `isRangeBackward` at `src/useTextSelection.ts:63` is localized; codegraph impact is limited to `useTextSelection`. Its algorithm is suspect for true browser selection direction because `Range` normalizes start/end order, but it does not currently create a type/lint failure and its effect is limited to endpoint ordering in linked selection capture. Not blocking for this F2 quality verdict, but worth browser-regression coverage before relying on backward cross-selection semantics.

## Missing type exports from `src/index.ts`

- Demo imports `HandleRenderProps`, `LinkedSelectionData`, `LinkedSelectionRange`, `MarkerColors`, `MousePosition`, `SelectionRange`, and `SelectionRef` from `@hamster-note/selection` at `demo/src/App.tsx:3` through `demo/src/App.tsx:11`.
- `src/index.ts:23` through `src/index.ts:41` exports all of those types, plus the additional public linked and marker types: `HandlePosition`, `MarkerColorStyle`, `MarkerStrokeStyle`, `NewSelectionOptions`, `PercentOverlayRect`, `SelectionEndpoint`, `SelectionHandleOwner`, `SelectionHandleType`, `SelectionProps`, and `UseTextSelectionResult`.
- `Selection` is exported at `src/index.ts:10`, `useTextSelection` at `src/index.ts:42`, and linked registry / geometry helpers are exported at `src/index.ts:11` through `src/index.ts:22`. No missing public type export was found for current demo usage.

## Consistency with existing patterns

- The new linked API is additive and does not remove legacy `ranges` / `selectedRangeId` / callbacks (`src/types.ts:204` through `src/types.ts:335`).
- Legacy color props remain documented as lower priority than `markerColors` (`src/types.ts:266` through `src/types.ts:278`, `src/types.ts:329` through `src/types.ts:334`), matching implementation priority at `src/Selection.tsx:344` through `src/Selection.tsx:386`.
- Controlled-component patterns are consistent: library emits callbacks, caller owns `ranges`, `selectedRangeId`, and `linkedData` (`src/Selection.tsx:461`, `src/Selection.tsx:466`, `demo/src/App.tsx:111`, `demo/src/App.tsx:155`).
- Existing event-listener style consistently uses native listeners with cleanup rather than React container click handlers where a11y lint would be noisy (`src/Selection.tsx:636` through `src/Selection.tsx:645`).

## Prioritized follow-ups (non-blocking)

1. Split `src/Selection.tsx` by responsibility after this workstream if future feature work adds more logic; current size is known inherited debt (`src/Selection.tsx:213`).
2. Extract demo panels/controls from `demo/src/App.tsx` before adding more demo scenarios (`demo/src/App.tsx:44`).
3. Add explicit browser coverage for backward linked selections if product semantics require preserving drag direction across multiple selection containers (`src/useTextSelection.ts:63`).

Final assessment: code quality is acceptable for this scope. No blocking stale paths, render loops, unsafe escape hatches, or missing demo-used type exports were found, and required validation commands pass.
