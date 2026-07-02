# selection-rect-tool Learnings

## Conventions
- Project uses Chinese comments in source files.
- `OverlayRectType` is `'px' | 'percent'`.
- `SelectionProps` is in `src/types.ts:322-469`; `SelectionRef` in `src/types.ts:304-314`.
- `Selection.tsx` has text selection tightly coupled; rect feature must be gated by `tool` prop.
- Existing handle pipeline uses `renderSingleHandle` with `HandleRenderProps`.
- Persisted rects are computed into `PersistedRectGroup[]` and rendered via SVG (px) or div (percent).
- Demo uses controlled state for ranges and linked data.

## Decisions
- Rect data lives independently from `SelectionRange`.
- Rects are local even in linked mode; do not store in `LinkedSelectionData.items`.
- Active rect confirms through `selectionPopover` and `ref.confirm()` / `ref.confirmRect()`.
- Only start/end handles; no move/rotate/labels/multi-select.

## Wave 1 — Type Contract (types.ts)
- 新增 `SelectionTool`、`SelectionRectPoint`、`SelectionRect` 类型，插入在 `OverlayRectType` 之后、`SelectionRange` 之前。
- `SelectionProps` 新增 `tool`、`rects`、`selectedRectId`、`onCreateRect`、`onSelectRect`、`onUpdateRect`，放在 `onUpdateRange` 之后、`highlightColor` 之前。
- `SelectionRef` 新增 `confirm()`（按 tool 分发）和 `confirmRect()`（rect 专用），`highlight()` 保留为文本专用向后兼容别名。
- `HandleRenderProps` 新增 `target: 'text' | 'rect'` 和 `rectId: string | null`；文本手柄传 `target='text', rectId=null`，矩形手柄传 `target='rect'`。
- `Selection.tsx` 需要最小 stub 以通过类型检查：ref 暴露 `confirm`/`confirmRect` 占位，handle props 填入 `target='text', rectId=null`。
- `geometry.test.ts` 有 6 个 TS6133 未使用导入错误，为前 wave 遗留，不影响本次修改。
- 所有新 props 均为可选（`?`），不破坏现有消费者。

## Wave 4 — Rect Rendering and Hit Testing
- Added `persistedSelectionRects` state similar to `persistedRects` but for `SelectionRect` array passed to `rects` prop.
- Updated `useLayoutEffect` / `useEffect` with ResizeObserver to recalculate pixel/percent coordinates for selection rects upon window/container resize.
- Added `<rect>` elements in SVG overlay for rendering active and persisted `px` rects, reusing existing marker styles logic.
- Added `<div>` elements in percent overlay for rendering active and persisted `percent` rects.
- Updated `handleContainerClick` to hit-test against `persistedSelectionRects` BEFORE `persistedRects`. Clicking selects a rect (triggers `onSelectRect`) and clears text selection (`selectRange(null)`).
- Clicking outside or on active rect clears rect selection.
- `popoverAnchor` and `selectionPopoverAnchor` updated to read active/persisted rect geometry when rect is active/selected.
- Skipped `onUpdateRect` usage for now (marked as `_onUpdateRect` to pass TS) since handles drag logic belongs to later task.
## Task 4 Missing Acceptance Tests
- Removed `if (!selectRange) return;` from `handleContainerClick` since `onSelectRect` hit testing relies on it and might run without text handlers. Used optional chaining `selectRange?.(null)` instead.
- Added comprehensive unit tests to `src/Selection.rect.test.tsx` covering all requested criteria.

## Task 6 — Text/Rect Tool Compatibility Regression Tests
- Added `Selection text and rect tool compatibility` coverage to `src/Selection.rect.test.tsx` for omitted/default text mode, explicit `tool="text"`, rect-mode text callback isolation, tool switching cleanup, selected text/rect mutual exclusion, and linked-mode rect non-corruption.
- `tool` switching needed a minimal `Selection.tsx` effect: entering rect clears active text selection; leaving rect clears active rect draft so stale `ref.highlight()` / `ref.confirmRect()` calls cannot confirm old state.
- Rect pointerdown now clears the active/selected text range via `selectRange?.(null)`; text mousedown now clears selected rect via `onSelectRect?.(null)`.
- Linked rect creation remains local: `onCreateRect` fires with `selectionId`, but `LinkedSelectionData.items` is not appended with rect-shaped data.
## Wave 5 - Public API & Demo Wiring
- Exported all new rect types from `src/index.ts`.
- Added tool toggle between text/rect in demo app.
- Reused `legacyRef` to attach rect creation handlers and render rect list.
- Extended selectionPopover to display a Delete Rect button when a rect is selected, calling `handleDeleteSelectedRect`.

## Task 8 — Final Gates and Browser QA
- Final command gates were run directly: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run build:demo`; all passed after minimal lint fixes.
- Browser QA script saved at `.omo/evidence/selection-rect-tool-final-qa.mjs`; final notes at `.omo/evidence/selection-rect-tool-final.md`; screenshot at `.omo/evidence/selection-rect-tool-final.png`.
- Playwright QA needs legacy panel enabled because rect tool wiring in the demo is attached to the legacy `Selection` instance, not linked page-a/page-b.
- Demo legacy panel height is short; rect drag coordinates must stay within container height or the active rect may not become creatable / popover-visible.
- Confirmed browser flow covers default text tool, rect draw/confirm, persisted rect delete, px and percent rect creation, start/end handle resize, tool switch back to text, and text highlight creation.
- Lint cleanup replaced explicit `any` with typed DOMRectList / HandleRenderProps usage and added a dedicated `dragRectAnchorRef` for rect handle anchors.

## F2 Code Quality Review — Rejected
- `npm run typecheck` and `npm run lint` passed with no diagnostics during F2 review.
- Forbidden-token scan found no product-code `TODO`, `FIXME`, `ts-ignore`, or `console.log`; only test `expect.any(Object)` and a comment mentioning avoided `as any`.
- Medium issue: percent-mode active rect is rendered twice. The generic `activePercentRects` path renders correct normalized percent geometry, then the rect-specific block renders `activeRect.rect` pixel values as percent at `src/Selection.tsx:2193-2203`.
- Medium issue: rect handle props/styles use `positionUnit='percent'` while passing raw pixel `start/end` points for active and persisted rect handles (`src/Selection.tsx:2274-2307`, `src/Selection.tsx:2372-2408`), violating `HandleRenderProps` percent-coordinate contract.
- Low cleanup note: `OverlayRect` is declared twice in `src/types.ts`; identical declaration merging is harmless but should be deduplicated later.

## F4 Scope Fidelity Review
- Verdict recorded at `.omo/evidence/f4-scope-fidelity-review.md`: **REJECT** because `git status` was not clean and contained broad staged/unstaged/untracked state, including `.omo/boulder.json`, screenshot binary changes, demo changes, and multiple source/test files.
- Linked rect non-corruption check passed: `handleConfirmRect()` emits `SelectionRect` through `onCreateRect` and does not append rect-shaped data to `LinkedSelectionData.items`; regression test `selection.linked-rect.create-does-not-corrupt-linked-items` exists.
- Overlay pointer-events check passed: `.hsn-selection-overlay`, `.hsn-selection-rect`, `.hsn-selection-percent-overlay`, and `.hsn-selection-percent-rect` all keep `pointer-events: none`.
- Scope-creep check found no move/rotate/multi-select/label feature; only start/end rect handles are present, consistent with earlier rect-tool decisions.
- `npm run test` passed with 6 files / 119 tests, including `src/Selection.rect.test.tsx`.

## F3 — Independent Real Manual QA
- Final reviewer started the demo with `npm run dev -- --host 127.0.0.1 --port 9536` and reran `.omo/evidence/selection-rect-tool-final-qa.mjs` against `http://127.0.0.1:9536`.
- Required screenshot was copied to `.omo/evidence/f3-real-manual-qa.png`; command log, observations, and verdict were saved in `.omo/evidence/f3-real-manual-qa.md`.
- Verified scenarios: default text tool, rect draw/confirm/delete, `px` and `percent` `overlayRectType`, start/end handle resizing, popover click protection, and switching back to text with successful highlight creation.
- F3 verdict: APPROVE; no required QA scenario failed in the browser run.

## F1 Verification Re-run — Test Fix & Evidence
- The percent-rect test was failing because it didn't use `mockContainerGeometry()` and fired pointer events on `.hsn-selection-overlay` instead of `.hsn-selection-container`. The container-level `pointerdown` listener (Selection.tsx:1047) only fires on the container, not the overlay.
- `dragRect()` helper wraps pointerdown/move/up in a single `act()` block with manually constructed `MouseEvent` + `pointerId` defineProperty. Using `fireEvent.pointerDown` without `act()` wrapping causes React state updates (setActiveRect) to not flush synchronously, so the active rect div never renders.
- `pointFromPointer` reads `containerRef.current.getBoundingClientRect()` — when `mockContainerGeometry()` is active, the prototype-level mock ensures all HTMLElement instances return the 400×300 container rect, which is critical for percent coordinate calculation.
- Evidence files now exist for tasks 1, 2, 3, and 5 at `.omo/evidence/task-{1,2,3,5}-selection-rect-tool.md`.

## F1 — Plan Compliance Audit
- Verdict recorded at `.omo/evidence/f1-plan-compliance-audit.md`: **REJECT**.
- Blocking evidence gap: task evidence files were only found for Tasks 4, 6, 7, and 8; Tasks 1, 2, 3, and 5 lack `.omo/evidence/task-<N>-selection-rect-tool.md` files.
- Blocking implementation gap: percent-mode rect creation/update stores `SelectionRect.rect` as percent but leaves `start`/`end` as pixel coordinates; persisted percent handles then interpret those endpoints as percent positions.
- Blocking rendering gap: active percent rects are rendered once via converted `activePercentRects` and again via raw pixel `activeRect.rect` values as `%`, causing duplicate/wrong percent overlay geometry.
- Scope concern: current git status includes broad unrelated/pre-existing `.omo` dirty/untracked files, so the plan guardrail against unrelated evidence/run-continuation changes cannot be approved from this worktree state.

## F2 Final Verification Wave — Approved
- Verdict recorded at `.omo/evidence/f2-code-quality-review.md`: **APPROVE**.
- Required file review covered `src/types.ts`, `src/Selection.tsx`, and `src/Selection.rect.test.tsx`; required commands `npm run typecheck`, `npm run lint`, and `npm run test` all passed (`120` tests).
- Prior F2 blockers are fixed: active percent rect now renders once through the percent overlay path, and percent-mode rect creation stores `start`/`end` as 0-100 values so handles can pass `positionUnit='percent'` without pixel/percent mixing.
- Rect/text state and callbacks remain isolated: rect mode clears active text state, text mode clears active rect drafts, and rect confirmation only emits rect callbacks.
- Rect pointer/global drag/touch listener cleanup was verified; forbidden-token scan found no product-code `TODO`, `FIXME`, `ts-ignore`, or `console.log`.
- Low non-blocking cleanup remains: duplicate `OverlayRect` declarations in `src/types.ts` can be deduplicated later.

## F4 Final Verification Wave — Scope Fidelity Review
- Verdict recorded at `.omo/evidence/f4-scope-fidelity-review.md`: **APPROVE**.
- This F4 rerun explicitly does **not** reject for `.omo` planning/evidence artifacts; those are intentional review artifacts and not scope violations.
- Required reads/greps covered `src/Selection.tsx`, `src/style.css`, and `src/Selection.rect.test.tsx`.
- Linked rect creation remains isolated from `LinkedSelectionData.items`: `handleConfirmRect()` emits a `SelectionRect` through `onCreateRect` and does not append rect-shaped records to linked text items; regression test `selection.linked-rect.create-does-not-corrupt-linked-items` verifies this.
- Overlay pointer-events are preserved: SVG overlay/rect and percent overlay/rect all keep `pointer-events: none`; only popovers/handles intentionally use interactive pointer behavior.
- Scope check found no move/rotate/multi-select/label feature creep; rect behavior is limited to draw/create, single selection hit-test/toggle, and start/end endpoint resizing.
- `npm run test` passed with 6 files / 120 tests.

## F1 Final Verification Wave — Plan Compliance Audit Approved
- Verdict recorded at `.omo/evidence/f1-plan-compliance-audit.md`: **APPROVE**.
- Required plan/file audit covered `.omo/plans/selection-rect-tool.md`, `src/types.ts`, `src/geometry.ts`, `src/Selection.tsx`, `src/index.ts`, `demo/src/App.tsx`, and `src/Selection.rect.test.tsx`.
- Evidence glob found all task evidence files for tasks 1-8 under `.omo/evidence/task-*-selection-rect-tool.md`.
- The previous F1 blockers are fixed: percent-mode rect creation stores `start`/`end` as 0-100 container-relative values; active percent rect rendering uses a single converted percent overlay path; rect callbacks remain isolated from text callbacks.
- `tool` defaults to `'text'`, new rect props remain optional/non-breaking, and new public rect/tool types are exported from `src/index.ts`.
- Verification commands run for this audit: `npm run typecheck` passed and `npm run test` passed with 6 files / 120 tests.
