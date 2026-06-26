---
slug: multi-selection-linked-ranges-plan
status: drafting
intent: clear
pending-action: write .omo/plans/multi-selection-linked-ranges-plan.md
approach: Backward-compatible linked multi-Selection API with `selectionId`, `linkedMode`, unified controlled data keyed by selection/page id, persisted SVG percentage geometry, and a multi-page demo JSON inspector.
---

# Draft: multi-selection-linked-ranges-plan

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
- C1 | Public data model and props express legacy single Selection plus linked multi Selection | active | src/types.ts:7
- C2 | Selection core filters unified data by `selectionId`, emits scoped linked items, and renders percentage geometry | active | src/Selection.tsx:170
- C3 | Selection hook/selection-end logic permits linked-mode cross-container ranges without breaking single-container behavior | active | src/useTextSelection.ts:84
- C4 | Demo shows at least two linked Selection/page regions sharing one controlled data object and a collapsed formatted JSON inspector | active | demo/src/App.tsx:24
- C5 | Validation relies on existing lint/type/build/demo-build and scripted/manual DOM assertions because no tests exist | active | package.json:40

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
- API compatibility | Keep legacy `ranges: SelectionRange[]` usable when `linkedMode` is false/omitted | avoids breaking current consumers | yes
- Naming | Use `selectionId`, not `id`, for the Selection region prop | avoids DOM `id` ambiguity | yes
- Linked item selection | `selectedRangeId` selects the whole cross-Selection item; all visible segments for that id render selected | matches “每次选择是 1 条数据” | yes
- Geometry persistence | Store percentage rects relative to each Selection container/content box; derive pixels internally for hit testing, handles, and popovers | satisfies stored SVG percentage requirement while preserving interactions | yes
- Drag handles in linked mode | Only show/update handles on the Selection that owns the true start/end endpoint; do not invent handles on middle segments | avoids ambiguous cross-page dragging | yes
- Popover in linked mode | Anchor popover to the first visible segment in the current Selection; if selected item has no segment in a Selection, that Selection renders no popover | deterministic per component | yes
- Testing | Do not add Vitest/Playwright dependencies unless user separately requests; use existing scripts plus browser/DOM QA instructions | repo has no test infra | yes

## Findings (cited - path:lines)
- `SelectionRange` is currently flat with `id`, `text`, local `start`, local `end`, `createdAt`. src/types.ts:7
- `OverlayRect` is pixel-shaped (`x`, `y`, `width`, `height`). src/types.ts:23
- `SelectionProps` currently accepts `ranges: SelectionRange[]`, `selectedRangeId`, and callbacks; no `selectionId` or linked-mode prop exists. src/types.ts:164
- `useTextSelection` rejects any native range whose `commonAncestorContainer` is not inside the current container. src/useTextSelection.ts:16
- `Selection.tsx` computes persisted rects from all `ranges` using local offsets against one container. src/Selection.tsx:281
- SVG `<rect>` currently receives numeric pixel `x`, `y`, `width`, `height`. src/Selection.tsx:726
- Click hit testing returns only a range id and uses component-local pixel rects. src/Selection.tsx:442
- Demo has one `Selection`, one `ranges` array, one `selectedRangeId`, and no JSON inspector. demo/src/App.tsx:24
- Existing validation scripts are `dev`, `build`, `build:demo`, `lint`, `typecheck`; there is no `test` script. package.json:40

## Decisions (with rationale)
- Add linked multi-Selection types beside legacy types: endpoint `{ selectionId, offset }`, percentage rect `{ x, y, width, height }` where values are 0-100, and linked item with `id`, `text`, `start`, `end`, `createdAt`, and `rectsBySelectionId` map.
- Add `selectionId?: string` and `linkedMode?: boolean` props; require a non-empty unique `selectionId` when `linkedMode` is true.
- Keep legacy single Selection mode as the default path; worker must not force all consumers onto the linked data object.
- In linked mode, Selection filters unified data by `selectionId` and renders only the item segments/geometry for its own id.
- Cross-Selection selection produces one item, not one item per page; start/end endpoints identify where the selection began and ended.
- Store persisted rect geometry as percentages in controlled data; compute transient pixel rects when needed for DOM rendering/interactions.
- Use `data-range-id` and `data-selection-id` on SVG rects for QA, debugging, and reliable DOM assertions.

## Scope IN
- Public TypeScript API additions in `src/types.ts` and `src/index.ts`.
- Selection linked-mode behavior in `src/Selection.tsx` and, if needed, `src/useTextSelection.ts`.
- Percentage geometry helpers for pixel-to-percent and percent-to-pixel conversion.
- Demo refactor to multiple linked Selection regions sharing one unified controlled state.
- Bottom collapsed formatted JSON inspector in the Demo.
- Existing build/lint/type validation and browser QA instructions/evidence.

## Scope OUT (Must NOT have)
- Do not build a document pagination framework; page/Selection id is just an external key.
- Do not split one cross-Selection highlight into multiple top-level range items.
- Do not persist pixel rect geometry in the linked controlled data.
- Do not remove or break existing single-Selection legacy usage.
- Do not introduce a new testing framework or dependencies without separate approval.
- Do not redesign unrelated controls like `markerColors`, `renderHandle`, or `hideHandlesOnSelection`.

## Open questions
- None blocking; use adopted defaults above.

## Approval gate
status: approved
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
approved_by_user: m0012 “批准”
