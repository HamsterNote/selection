# multi-selection-linked-ranges-plan - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** <fill last - deliverables in human terms, 1-2 sentences>
A backward-compatible Selection component that can link multiple page/region instances, create one highlight across them, store its visual rectangles as percentages per region, and show the shared state in the Demo. The Demo will include multiple selectable regions and a collapsed formatted JSON viewer at the bottom.

**Why this approach:** <fill last - the one or two load-bearing decisions and why>
It keeps the current single-Selection API working while adding an explicit linked-mode data model for cross-region selections. It stores percentage geometry for persistence/responsiveness, but derives pixels internally for hit testing, popovers, and drag handles where the browser still needs real coordinates.

**What it will NOT do:** <fill last - 1-3 plain lines mirroring Must NOT have>
It will not build a pagination system, split one cross-region highlight into multiple data records, or add a new test framework. It will not rewrite unrelated visual controls.

**Effort:** Large
**Risk:** High - the current code assumes one container and local pixel offsets in selection, rendering, hit testing, popovers, and drag handles.
**Decisions to sanity-check:** Linked mode uses `selectionId`, keeps legacy mode by default, treats a cross-region highlight as one selected item, and shows endpoint handles only where the true start/end live.

Your next move: start work now, or run a high-accuracy review first. Full execution detail follows below.

---

> TL;DR (machine): Large/high-risk linked multi-Selection feature; add explicit linked data model, `selectionId`/`linkedMode`, percentage geometry maps, Demo multi-page shared state, and existing-script validation.

## Scope
### Must have
- Preserve current single-Selection behavior by default: existing consumers using `ranges: SelectionRange[]`, `selectedRangeId`, `onSelect`, `onUpdateRange`, and `onSelectRange` must continue to compile and work when linked mode is omitted.
- Add public linked-mode types in `src/types.ts`: a selection/page endpoint carrying `selectionId` and local text offset; a percent rect type with `x`, `y`, `width`, `height` values in 0-100; a linked/cross Selection range item with one `id`, `text`, `start`, `end`, `createdAt`, and `rectsBySelectionId` map.
- Add Selection props for `selectionId` and linked multi-Selection mode. Use `selectionId`, not `id`, to avoid DOM id ambiguity. `linkedMode=true` requires a non-empty unique `selectionId`.
- Add a unified controlled data path for linked mode. Each `Selection` receives the same overall data, filters items/geometry by its own `selectionId`, and renders only the matching segments.
- Use this exact linked-mode public API contract unless a compile-time conflict forces a narrower equivalent:
  - `SelectionEndpoint = { selectionId: string; offset: number }` where `offset` is local plain-text offset inside that Selection.
  - `PercentOverlayRect = { x: number; y: number; width: number; height: number }` where each value is percentage of the Selection overlay viewport.
  - `LinkedSelectionRange = { id: string; text: string; start: SelectionEndpoint; end: SelectionEndpoint; createdAt: number; rectsBySelectionId: Record<string, PercentOverlayRect[]> }`.
  - `LinkedSelectionData = { items: LinkedSelectionRange[]; selectedRangeId: string | null; selectionOrder: string[] }`.
  - `SelectionProps` gains `selectionId?: string`, `linkedMode?: boolean`, `linkedData?: LinkedSelectionData`, `onLinkedDataChange?: (next: LinkedSelectionData) => void`, `onLinkedSelect?: (range: LinkedSelectionRange) => void`, `onLinkedUpdateRange?: (range: LinkedSelectionRange) => void`, and `onLinkedSelectRange?: (id: string | null) => void`.
  - In `linkedMode=true`, linked callbacks/data are authoritative; legacy callbacks may still be fired as compatibility notifications only when the action can be represented as a single local `SelectionRange`.
- Implement a module-local linked Selection registry/context without new dependencies: it must map `selectionId -> HTMLElement`, preserve DOM order for registered linked containers, clean up on unmount, reject/ignore duplicate ids with a development warning, and expose helpers for resolving native Selection endpoints to registered containers.
- Create one data item for every cross-Selection highlight. The item must mark start/end endpoint selection ids and offsets, and its visual Range geometry must be keyed by selection/page id.
- Store SVG geometry in percentage form in linked controlled data. Internally derive pixel rects for `Selection.tsx` hit testing, popovers, handle positions, and DOM assertions.
- Percent geometry coordinate system is the SVG overlay viewport for the owning Selection, based on that Selection container `getBoundingClientRect()`: convert `Range.getClientRects()` viewport coordinates to overlay-local pixels by subtracting the container rect left/top, then divide by container rect width/height and round to 4 decimals. Do not use content wrapper padding separately unless the existing overlay is moved.
- Linked cross-container selection supports only same-document, non-Shadow-DOM, non-iframe containers that the browser can represent as one native Selection. If a selection crosses non-linked content between linked containers, include only text/rect fragments inside registered linked containers; if either endpoint is outside all registered linked containers, reject the highlight.
- Linked `start` and `end` endpoints use document order, not drag direction. Do not attempt to preserve browser anchor/focus direction in this plan.
- Ensure SVG rect markup can distinguish both item id and region id using `data-range-id` and `data-selection-id`.
- Update Demo to render at least two linked Selection/page regions that share one controlled data object.
- Add a bottom Demo JSON panel that is collapsed by default, expandable by click, and renders `JSON.stringify(overallData, null, 2)`.
- Keep existing marker color, render handle, hide handles, popover, delete, and update interactions working for legacy and same-Selection linked items. Cross-Selection linked items must not expose draggable update handles; hide handles for those items and keep delete/select/popover behavior working.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- Must not split one cross-Selection highlight into several top-level range records.
- Must not persist pixel geometry in linked-mode controlled data.
- Must not remove legacy `SelectionRange` or force a breaking migration for current single Selection users.
- Must not introduce a document/page framework; `selectionId`/page id remains an external key only.
- Must not add Vitest, Playwright, Testing Library, or other test dependencies unless separately approved.
- Must not rewrite unrelated UI systems or restyle the Demo beyond what is needed to show linked Selection state and JSON.
- Must not rely on worker-invented prop names, registry shape, percentage coordinate basis, or cross-Selection handle policy; these are fixed in this plan.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: none + existing project scripts only; no automated test framework exists and none should be added in this plan.
- Evidence: each todo writes command output, DOM assertion notes, or QA notes to `.omo/evidence/task-<N>-multi-selection-linked-ranges-plan.md`.
- Required final commands: `npm run typecheck`, `npm run build`, `npm run build:demo`, and `npm run lint` from the repo root. If lint fails for pre-existing unrelated reasons, capture exact output and file/line evidence.
- Before writing evidence, run `mkdir -p .omo/evidence` from the repo root.
- Required Demo QA: run `npm run dev`, create a same-Selection highlight, create a cross-Selection highlight spanning two regions, select/delete/update where applicable, open the bottom JSON panel, and confirm the data shape and SVG `data-*` attributes.
- Required DOM assertion: after one cross-Selection highlight exists, querying `svg rect[data-range-id="<id>"]` in the browser must find rects with at least two distinct `data-selection-id` values.
- Required legacy QA: render/use a Selection without `linkedMode`, `selectionId`, or linked data props and confirm old `ranges` selection, selected styling, popover, delete, and same-item handle behavior still work.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
- Wave 1 is foundational and mostly sequential: public types, conversion helpers, and linked data adapters.
- Wave 2 updates Selection internals: selection capture, filtering/rendering, hit testing, popover/handles, and callbacks.
- Wave 3 updates Demo and validation: shared state, multi-region layout, JSON inspector, compatibility pass, and final scripts/QA.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 3, 4, 5, 6, 7, 8 | none |
| 2 | 1 | 3, 4, 5, 6, 7, 9 | none |
| 3 | 1, 2 | 4, 5, 6, 7, 9 | none |
| 4 | 1, 2, 3 | 5, 6, 7, 9 | none |
| 5 | 1, 2, 3, 4 | 6, 7, 9 | none |
| 6 | 1, 2, 3, 4, 5 | 7, 8, 9 | none |
| 7 | 1, 6 | 9 | none |
| 8 | 1, 6, 7 | 9 | none |
| 9 | 1-8 | final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Define linked public data model and compatible props
  What to do / Must NOT do: In `src/types.ts`, add explicit linked-mode public types without deleting legacy `SelectionRange`. Define exactly: `SelectionEndpoint = { selectionId: string; offset: number }`, `PercentOverlayRect = { x: number; y: number; width: number; height: number }`, `LinkedSelectionRange = { id: string; text: string; start: SelectionEndpoint; end: SelectionEndpoint; createdAt: number; rectsBySelectionId: Record<string, PercentOverlayRect[]> }`, and `LinkedSelectionData = { items: LinkedSelectionRange[]; selectedRangeId: string | null; selectionOrder: string[] }`. Extend `SelectionProps` with `selectionId?: string`, `linkedMode?: boolean`, `linkedData?: LinkedSelectionData`, `onLinkedDataChange?: (next: LinkedSelectionData) => void`, `onLinkedSelect?: (range: LinkedSelectionRange) => void`, `onLinkedUpdateRange?: (range: LinkedSelectionRange) => void`, and `onLinkedSelectRange?: (id: string | null) => void`. Keep legacy `ranges`, `onSelect`, `onHighlight`, `onUpdateRange`, `selectedRangeId`, and `onSelectRange` usable. Export new types from `src/index.ts`. Must NOT name the region prop `id`; must NOT replace `SelectionRange[]` as the only accepted input.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 3, 4, 5, 6, 7, 8
  References (executor has NO interview context - be exhaustive): `src/types.ts:7`, `src/types.ts:23`, `src/types.ts:164`, `src/types.ts:286`, `src/index.ts:12`, `demo/src/App.tsx:3`
  Acceptance criteria (agent-executable): `npm run typecheck` reaches at least the next implementation-related error, not a missing exported type or invalid public prop type; `src/index.ts` exports every new public type used by the Demo.
  QA scenarios (name the exact tool + invocation): Happy: `npm run typecheck 2>&1 | tee .omo/evidence/task-1-multi-selection-linked-ranges-plan.md` and verify no “has no exported member” for new linked types. Failure: intentionally inspect linked-mode prop definitions and confirm `linkedMode` can be omitted for legacy callers; record notes in the same evidence file.
  Commit: Y | feat(types): add linked selection data model

- [x] 2. Add percentage geometry conversion helpers and rect comparison rules
  What to do / Must NOT do: In `src/Selection.tsx` or a small local helper module under `src/`, add pure helpers to convert pixel `OverlayRect` values to percentage rects relative to the owning Selection SVG overlay viewport. Use the Selection container `getBoundingClientRect()` as the geometry basis: `localX = clientRect.left - containerRect.left`, `localY = clientRect.top - containerRect.top`, percent values are local pixel values divided by container width/height and multiplied by 100. Round to 4 decimals; clamp only to prevent tiny floating overflow outside 0-100. Convert back to pixels using the current container width/height for hit testing, handles, and popovers. Existing same-container active selection can still use transient pixel rects. Must NOT write pixel rects into linked controlled data.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 4, 5, 6, 8
  References (executor has NO interview context - be exhaustive): `src/types.ts:23`, `src/useTextSelection.ts:36`, `src/Selection.tsx:107`, `src/Selection.tsx:124`, `src/Selection.tsx:272`, `src/Selection.tsx:281`, `src/Selection.tsx:704`
  Acceptance criteria (agent-executable): `npm run typecheck` accepts the new helper types; code search shows linked controlled item geometry fields use percent rect types, while hit-test/handle functions consume derived pixel rects.
  QA scenarios (name the exact tool + invocation): Happy: run `npm run typecheck 2>&1 | tee .omo/evidence/task-2-multi-selection-linked-ranges-plan.md` and record the helper precision/clamping policy. Failure: inspect code to confirm no linked-mode controlled data property is named or typed as pixel `OverlayRect[]`; append grep/search evidence to the file.
  Commit: Y | feat(selection): add percent geometry helpers

- [x] 3. Implement linked-mode Selection data filtering and rendering
  What to do / Must NOT do: Update `src/Selection.tsx` so legacy mode still uses `ranges`, while linked mode validates `selectionId`, reads the unified linked data prop, filters to items whose endpoints or `rectsBySelectionId` include this `selectionId`, derives pixel rects for this component, and renders only this Selection’s rects. Add `data-range-id` and `data-selection-id` to every SVG rect, including selected and active linked rects where applicable. Preserve current marker color priority and selected highlight behavior. Must NOT render geometry for other Selection ids in this component.
  Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 4, 5, 6, 8
  References (executor has NO interview context - be exhaustive): `src/Selection.tsx:170`, `src/Selection.tsx:200`, `src/Selection.tsx:228`, `src/Selection.tsx:272`, `src/Selection.tsx:281`, `src/Selection.tsx:442`, `src/Selection.tsx:704`, `src/Selection.tsx:726`, `src/style.css:38`
  Acceptance criteria (agent-executable): With static linked data containing one item with geometry for `page-a` and `page-b`, a `Selection` rendered with `selectionId="page-a"` emits SVG rects only with `data-selection-id="page-a"`; no rect from `page-b` appears in that component.
  QA scenarios (name the exact tool + invocation): Happy: run `npm run typecheck 2>&1 | tee .omo/evidence/task-3-multi-selection-linked-ranges-plan.md`; then use Demo/dev or a temporary browser check to inspect `svg rect[data-selection-id]`. Failure: feed linked data for a missing/other `selectionId` and verify no rects render for the current component; record DOM query notes.
  Commit: Y | feat(selection): render linked scoped geometry

- [x] 4. Add linked Selection container registry and endpoint resolution
  What to do / Must NOT do: Implement a module-local registry/context in `src/Selection.tsx` or a focused helper file with no new dependencies. On mount in `linkedMode`, register `selectionId -> container HTMLElement`; on unmount, unregister it. Preserve DOM order by sorting registered containers with `Node.compareDocumentPosition`, and keep `LinkedSelectionData.selectionOrder` synchronized when `onLinkedDataChange` is available. Detect duplicate `selectionId` and warn in development while ignoring the later duplicate for linked calculations. Provide helpers to resolve a native node/offset to `{ selectionId, offset }` by finding the containing registered container and computing local plain-text offset. Must NOT use global document queries by class name as the primary registry.
  Parallelization: Wave 2 | Blocked by: 1, 2, 3 | Blocks: 5, 6, 7, 9
  References (executor has NO interview context - be exhaustive): `src/Selection.tsx:193`, `src/Selection.tsx:352`, `src/Selection.tsx:691`, `src/useTextSelection.ts:9`, `src/types.ts:164`
  Acceptance criteria (agent-executable): Mounting two linked Demo Selection instances with ids `page-a` and `page-b` registers both in DOM order; unmounting removes them; duplicate ids do not corrupt the registry and produce a development warning.
  QA scenarios (name the exact tool + invocation): Happy: run `npm run typecheck 2>&1 | tee .omo/evidence/task-4-multi-selection-linked-ranges-plan.md` and record registry helper names/behavior. Failure: temporarily or via Demo state inspect duplicate `selectionId` handling and confirm only one registry entry participates; record notes.
  Commit: Y | feat(selection): register linked containers

- [x] 5. Capture same-container and cross-container linked selections as one item
  What to do / Must NOT do: Update `useTextSelection` and/or `Selection.tsx` selection start/end handling so linked mode does not reject a native Selection solely because `commonAncestorContainer` is outside the local container. Use the registry from Todo 4 to identify endpoint containers and all registered containers intersected by the native Range. Support only same-document, non-Shadow-DOM, non-iframe linked containers that the browser can represent as one native Selection. If either endpoint is outside all registered containers, reject the highlight. If the native Range crosses non-linked content between linked containers, include only text and rect fragments inside registered linked containers. Use document-order endpoints for `start` and `end`; do not preserve anchor/focus drag direction. Compute local offsets and percentage rects per involved `selectionId`, then emit exactly one linked item through `onLinkedDataChange` and `onLinkedSelect`. Same-container linked selections also use the linked item shape. Legacy mode must keep current containment filtering. Must NOT create multiple top-level items for one drag spanning two Selection regions.
  Parallelization: Wave 2 | Blocked by: 1, 2, 3, 4 | Blocks: 6, 7, 9
  References (executor has NO interview context - be exhaustive): `src/useTextSelection.ts:9`, `src/useTextSelection.ts:16`, `src/useTextSelection.ts:84`, `src/Selection.tsx:319`, `src/Selection.tsx:352`, `src/Selection.tsx:363`, `src/Selection.tsx:366`, `src/Selection.tsx:691`, `demo/src/App.tsx:105`
  Acceptance criteria (agent-executable): In Demo, selecting from text in the first linked Selection into text in the second linked Selection and clicking highlight creates exactly one linked item whose `start.selectionId` and `end.selectionId` refer to different Selection ids and whose `rectsBySelectionId` has both keys.
  QA scenarios (name the exact tool + invocation): Happy: run `npm run dev`, create a cross-Selection selection, highlight it, open JSON, and save notes/screenshots or DOM query output to `.omo/evidence/task-5-multi-selection-linked-ranges-plan.md`. Failure: attempt selection entirely outside linked Selection containers and confirm no new item is added; record before/after JSON item counts.
  Commit: Y | feat(selection): capture cross selection ranges

- [x] 6. Upgrade selection, popover, hit testing, deletion, and handle behavior for linked items
  What to do / Must NOT do: Ensure `selectedRangeId` still selects a whole item id in legacy mode, and `linkedData.selectedRangeId`/`onLinkedSelectRange` selects a whole linked item id in linked mode. Clicking any rect segment for a linked item must select/toggle that whole item, causing all visible segments with that id to use selected styling. Popover anchoring in linked mode should use the first visible segment in the current Selection. Same-Selection linked items may keep draggable update handles and call `onLinkedUpdateRange` plus `onLinkedDataChange`. Cross-Selection linked items must hide draggable handles entirely; do not show disabled or misleading middle-segment handles. Deletion should remove the whole linked item from unified data. Legacy `onUpdateRange` must not be used for linked cross-item updates.
  Parallelization: Wave 2 | Blocked by: 1, 2, 3, 4, 5 | Blocks: 7, 9
  References (executor has NO interview context - be exhaustive): `src/types.ts:174`, `src/types.ts:184`, `src/types.ts:210`, `src/Selection.tsx:413`, `src/Selection.tsx:442`, `src/Selection.tsx:491`, `src/Selection.tsx:530`, `src/Selection.tsx:613`, `src/Selection.tsx:626`, `src/Selection.tsx:804`, `src/Selection.tsx:837`, `demo/src/App.tsx:68`
  Acceptance criteria (agent-executable): Clicking a segment of a cross-Selection item selects the same item id across all linked Selection segments; deleting from the popover or list removes the one linked item and all its visible rects.
  QA scenarios (name the exact tool + invocation): Happy: run Demo, create a cross-Selection highlight, click a rect in page B, verify rects in page A and B share selected state/data id, then delete and verify zero rects remain for that id; write notes to `.omo/evidence/task-6-multi-selection-linked-ranges-plan.md`. Failure: select a cross-Selection item and verify no handles appear for that item; record handle count and endpoint ownership notes.
  Commit: Y | feat(selection): support linked item interactions

- [x] 7. Refactor Demo to shared linked data across multiple Selection regions
  What to do / Must NOT do: In `demo/src/App.tsx`, replace the single-region demo state with `overallData: LinkedSelectionData` whose top-level shape is exactly `{ items, selectedRangeId, selectionOrder }`. Render at least two labeled page/Selection panels with distinct `selectionId` values such as `page-a` and `page-b`, and pass `linkedMode={true}`, `linkedData={overallData}`, `onLinkedDataChange={setOverallData}`, and linked callbacks to each. Each Selection receives the same overall data and callbacks that add/update/delete one linked item. Keep existing controls for handle visibility, custom handle mode, marker colors, logs, and list controls adapted to linked items. Also keep a small legacy compatibility section or toggle that renders one Selection without `linkedMode`, `selectionId`, or linked data props and uses the old flat `ranges` state. Must NOT remove useful existing logs/list controls unless they are adapted to the unified data model.
  Parallelization: Wave 3 | Blocked by: 1, 2, 3, 4, 5, 6 | Blocks: 8, 9
  References (executor has NO interview context - be exhaustive): `demo/src/App.tsx:24`, `demo/src/App.tsx:54`, `demo/src/App.tsx:63`, `demo/src/App.tsx:68`, `demo/src/App.tsx:182`, `demo/src/App.tsx:333`, `demo/src/App.tsx:464`, `src/types.ts:164`
  Acceptance criteria (agent-executable): Demo renders at least two Selection/page panels, both use linked mode with unique `selectionId`s, and creating highlights updates one shared state object instead of per-component arrays.
  QA scenarios (name the exact tool + invocation): Happy: `npm run build:demo 2>&1 | tee .omo/evidence/task-7-multi-selection-linked-ranges-plan.md`; then run Demo and create highlights in page A, page B, and across A→B, confirming the list count increments by one per highlight. Failure: verify a Selection with `selectionId="page-a"` does not render data that only belongs to `page-b`; append DOM notes.
  Commit: Y | feat(demo): show linked multi selection pages

- [x] 8. Add collapsed formatted overall JSON inspector at Demo bottom
  What to do / Must NOT do: Add a bottom-of-page JSON data panel in `demo/src/App.tsx` using native `<details>` or equivalent, default collapsed. The expanded content must be formatted JSON via `JSON.stringify(overallData, null, 2)` and include `items`, `selectedRangeId`, `selectionOrder`, and for every item: `id`, `text`, `start.selectionId`, `start.offset`, `end.selectionId`, `end.offset`, `createdAt`, and `rectsBySelectionId`. Style it minimally and keep it below existing lists/logs. Must NOT truncate or minify the JSON by default.
  Parallelization: Wave 3 | Blocked by: 1, 7 | Blocks: 9
  References (executor has NO interview context - be exhaustive): `demo/src/App.tsx:464`, `demo/src/App.tsx:570`, `src/types.ts:7`, `src/types.ts:164`
  Acceptance criteria (agent-executable): On first page load, the JSON panel content is not visible; after toggling it open, the JSON is pretty-printed with two-space indentation and contains the unified linked data object.
  QA scenarios (name the exact tool + invocation): Happy: run Demo, verify `<details>` is closed by default, click/open it, and save copied JSON or DOM text evidence to `.omo/evidence/task-8-multi-selection-linked-ranges-plan.md`. Failure: after creating a cross-Selection highlight, verify JSON contains exactly one new item with both involved Selection ids, not two top-level items.
  Commit: Y | feat(demo): add overall data inspector

- [x] 9. Run compatibility, validation, and evidence pass
  What to do / Must NOT do: First run `mkdir -p .omo/evidence`. Run the full existing validation set and perform browser QA for legacy/same-Selection and linked/cross-Selection paths. Fix only issues caused by this feature. Capture command outputs and QA notes under `.omo/evidence/`. If `npm run lint` fails for unrelated existing code, record exact file/line output and do not “fix” unrelated code. Must NOT declare done based only on typecheck if Demo behavior was not exercised.
  Parallelization: Wave 3 | Blocked by: 1, 2, 3, 4, 5, 6, 7, 8 | Blocks: final verification
  References (executor has NO interview context - be exhaustive): `package.json:40`, `src/Selection.tsx:170`, `src/useTextSelection.ts:84`, `demo/src/App.tsx:24`, `demo/src/App.tsx:333`, `.omo/drafts/multi-selection-linked-ranges-plan.md:1`
  Acceptance criteria (agent-executable): `npm run typecheck`, `npm run build`, `npm run build:demo`, and `npm run lint` complete successfully or produce documented unrelated failures; Demo QA confirms same-Selection highlight, cross-Selection highlight as one item, selected state across segments, deletion, percentage geometry JSON, and collapsed JSON panel.
  QA scenarios (name the exact tool + invocation): Happy: `mkdir -p .omo/evidence`, `npm run typecheck 2>&1 | tee .omo/evidence/task-9-typecheck.md`, `npm run build 2>&1 | tee .omo/evidence/task-9-build.md`, `npm run build:demo 2>&1 | tee .omo/evidence/task-9-build-demo.md`, `npm run lint 2>&1 | tee .omo/evidence/task-9-lint.md`; run `npm run dev` and record browser QA in `.omo/evidence/task-9-manual-qa.md`. Failure: deliberately check invalid/other-selection data does not render in the wrong Selection and external/outside selections do not add items; record results.
  Commit: Y | feat(selection): validate linked multi selection

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit: read `.omo/plans/multi-selection-linked-ranges-plan.md` and diff, verify every Must Have is implemented and every Must NOT is respected; evidence `.omo/evidence/f1-plan-compliance.md`.
- [x] F2. Code quality review: inspect `src/types.ts`, `src/Selection.tsx`, `src/useTextSelection.ts`, `src/index.ts`, and `demo/src/App.tsx` for excessive complexity, stale legacy paths, render loops, unsafe assumptions, and missing type exports; evidence `.omo/evidence/f2-code-quality.md`.
- [x] F3. Real manual QA: use the Demo in a browser to create same-page and cross-page highlights, inspect SVG data attributes, select/delete/update items, and expand JSON; evidence `.omo/evidence/f3-manual-qa.md`.
- [x] F4. Scope fidelity: verify no new dependencies/test frameworks/page framework/unrelated UI rewrite were introduced; evidence `.omo/evidence/f4-scope-fidelity.md`.

## Commit strategy
- Use small atomic commits matching todo boundaries if the user asks the worker to commit. Do not commit automatically unless explicitly requested.
- Suggested sequence: types, geometry helpers, Selection rendering, cross-selection capture, interactions, Demo multi-page state, JSON inspector, validation fixes.
- Updated suggested sequence: types/API contract, percentage helpers, scoped rendering, registry, cross-selection capture, interactions, Demo multi-page state, JSON inspector, validation fixes.
- Commit messages should use concise conventional style shown in each todo.

## Success criteria
- Existing legacy single-Selection API remains source-compatible and functional when linked mode is omitted.
- Linked mode uses explicit `selectionId` and one unified controlled data object.
- Linked-mode prop/callback names and data shape match the API contract in Scope.
- Linked containers are registered, ordered by DOM position, cleaned up on unmount, and guarded against duplicate ids.
- A cross-Selection highlight creates exactly one top-level data item with start/end endpoint selection ids and offsets.
- Linked controlled data stores rect geometry as percentage values keyed by Selection/page id.
- Percent geometry is relative to the Selection SVG overlay viewport using container `getBoundingClientRect()` and 4-decimal precision.
- Each Selection renders only its own scoped geometry and marks SVG rects with `data-range-id` and `data-selection-id`.
- Cross-Selection linked items do not show draggable update handles; same-Selection/legacy handle behavior remains intact.
- Demo has at least two linked Selection/page regions and a bottom collapsed formatted JSON inspector.
- Demo `overallData` top-level shape is `{ items, selectedRangeId, selectionOrder }`.
- `npm run typecheck`, `npm run build`, `npm run build:demo`, and `npm run lint` are executed and evidenced.
