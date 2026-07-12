# selection-rect-tool - Work Plan

## TL;DR (For humans)

**What you'll get:** The selection component will support switching between normal text selection and a new rectangle-selection tool. Rectangles can be drawn, previewed, confirmed, selected, resized from their start/end handles, and stored/rendered correctly in either pixel or percent mode.

**Why this approach:** Rectangle data is kept separate from text highlight data so text offsets and rectangle coordinates never get mixed. The rectangle tool reuses the existing “active selection + confirmation popover” experience you chose, while preserving text selection as the default behavior.

**What it will NOT do:** It will not turn the component into a full drawing canvas. It will not add moving, rotating, labels, multi-select, snapping, or linked cross-page rectangle ranges. It will not change existing text behavior when no tool is provided.

**Effort:** Medium
**Risk:** Medium - the component’s current active selection, popover, and handle logic is tightly coupled to text ranges, so the worker must split rect-specific state without regressing text behavior.
**Decisions to sanity-check:** Rects are local to each component even in linked mode; `selectionPopover` is reused for rect confirmation; start/end handles are the two diagonal endpoints only.

Your next move: choose whether to start implementation now or run an optional high-accuracy plan review first. Full execution detail follows below.

---

> TL;DR (machine): Medium-risk component API/interaction extension: add controlled `tool='text'|'rect'`, independent rect data/callbacks, active-rect popover confirmation, px/percent rect storage/rendering, start/end resize handles, demo and regression tests.

## Scope
### Must have
- Add public `SelectionTool = 'text' | 'rect'`, with `Selection` defaulting to `tool='text'` when omitted.
- Add independent rectangle data types and controlled props/callbacks; do not reuse or overload text `SelectionRange`.
- Implement `tool='rect'` pointer drawing: pointerdown records a start point, pointermove previews a normalized rectangle, pointerup ends drawing but leaves an active rect awaiting confirmation.
- Reuse the conceptual `selectionPopover` active-selection flow for rect confirmation. The confirmation path must work for rects even though current text `highlight()` rejects empty text.
- Store and emit rect geometry according to `overlayRectType`: px stores pixel coordinates; percent stores 0-100 container-relative coordinates.
- Render active and persisted rects in the existing overlay system: px through SVG rects, percent through absolutely positioned divs.
- Render exactly two rect handles (`start` and `end`) at the rectangle’s stored diagonal endpoints; dragging either endpoint resizes the active or selected persisted rect.
- Keep text selection fully backward compatible when `tool` is omitted or `tool='text'`.
- Keep rect operations separate from text callbacks: rect create/update/select must not call text `onSelect`, `onHighlight`, `onUpdateRange`, `onSelectionStart`, or `onSelectionEnd`.
- Update the demo with a minimal text/rect toggle, controlled rect state, rect confirmation, delete/select, and geometry display.
- Export all new public rect/tool types from the package entrypoint.
- Add automated tests covering text compatibility, rect px/percent creation, popover confirmation, tool switching, rect selection, and rect handle resize.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Must not store rects in `LinkedSelectionData.items`, modify `LinkedSelectionRange`, or make linked cross-container rectangle ranges.
- Must not overload text `SelectionRange` with coordinate data, empty text, fake text offsets, or discriminated unions that force existing text consumers to handle rects.
- Must not implement rectangle body move, rotation, labels, multi-select, grouping, snapping, aspect-ratio locks, keyboard shortcuts, or four/eight-handle resize.
- Must not rewrite the whole component or remove existing mobile long-press, linked text, popover, style persistence, or handle customization behavior.
- Must not allow rect overlays to intercept pointer events; hit-testing should remain container-coordinate based like existing text overlays.
- Must not touch unrelated dirty `.omo/evidence/*`, `.omo/run-continuation/*`, or previous QA files except to add new evidence files for this plan.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after with Vitest/Testing Library for component behavior, plus TypeScript typecheck, lint, build, and one browser/demo QA evidence pass.
- Evidence: `.omo/evidence/task-<N>-selection-rect-tool.{md,png,json}` for per-task QA; final summary in `.omo/evidence/selection-rect-tool-final.md`.
- Required commands before completion:
  - `npm run test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
- Required manual/browser QA: run the demo, switch text/rect tools, draw and confirm px and percent rects, resize start/end handles, verify text selection still works, and save notes/screenshots under `.omo/evidence/`.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
- Wave 1: API/types/geometry test scaffolding and focused implementation tests can begin together after reading the referenced files.
- Wave 2: Core Selection implementation should proceed after API decisions are in place; rendering, popover, hit-test, and handle resize are related and should be integrated carefully in one component pass.
- Wave 3: Demo/export polishing and full verification after component tests pass.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 API/types contract | none | 2, 3, 4, 5, 6, 7 | none |
| 2 Geometry helpers/tests | 1 | 3, 5 | 7 |
| 3 Rect active gesture/confirmation | 1, 2 | 4, 5, 6 | none |
| 4 Rect rendering/popover/hit-test | 1, 3 | 5, 6 | none |
| 5 Rect handles/resize | 1, 2, 4 | 6 | none |
| 6 Tool switching/mutual exclusion/backcompat tests | 1, 3, 4, 5 | 8 | none |
| 7 Exports/demo | 1 | 8 | 2 |
| 8 Full verification/browser QA | 1-7 | final verification wave | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. `src/types.ts`: Add rect/tool public API contract without changing text range semantics - expect TypeScript consumers can use rects independently
  What to do / Must NOT do: Add exactly `export type SelectionTool = 'text' | 'rect'`; add exactly `export interface SelectionRectPoint { x: number; y: number; }`; add exactly `export interface SelectionRect { id: string; createdAt: number; overlayRectType: OverlayRectType; start: SelectionRectPoint; end: SelectionRectPoint; rect: OverlayRect | PercentOverlayRect; selectionId?: string; markerStyle?: CSSProperties; selectionStyle?: CSSProperties; }`. Add `tool?: SelectionTool`, `rects?: SelectionRect[]`, `selectedRectId?: string | null`, `onCreateRect?: (rect: SelectionRect) => void`, `onSelectRect?: (id: string | null) => void`, and `onUpdateRect?: (rect: SelectionRect) => void` to `SelectionProps`. Extend `SelectionRef` with exactly `confirm: () => void` (generic: confirm the current active target for the current tool) and `confirmRect: () => void` (rect-only active confirmation); keep existing `highlight(): void` as the text-only backward-compatible alias and do not change its text semantics. Extend `HandleRenderProps` backward-compatibly with `target: 'text' | 'rect'` and `rectId: string | null`; text handles pass `target: 'text'`, the existing `rangeId`, and `rectId: null`; rect handles pass `target: 'rect'`, `rangeId: null`, and `rectId` for persisted rects or `null` for active rects. Keep existing `type`, `owner`, `position`, `positionUnit`, `onPointerDown`, `ariaLabel`, `className`, and `style` fields. Must NOT overload `SelectionRange`, modify `LinkedSelectionRange`, or call text callbacks for rect operations.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 3, 4, 5, 6, 7
  References (executor has NO interview context - be exhaustive): `src/types.ts:8` (`OverlayRectType`); `src/types.ts:14-47` (text-only `SelectionRange`); `src/types.ts:59-74` (`PercentOverlayRect`/`OverlayRect`); `src/types.ts:190-247` (`HandleRenderProps`); `src/types.ts:304-314` (`SelectionRef`); `src/types.ts:322-469` (`SelectionProps`). User decisions: independent rect data (1A), active rect confirmed through `selectionPopover` (2B). Adopted defaults: local rects in linked mode, no linked rect persistence.
  Acceptance criteria (agent-executable): `npm run typecheck` passes after API additions; a type-level or component test can pass `tool="rect"`, `rects`, `selectedRectId`, `onCreateRect`, `onSelectRect`, and `onUpdateRect` without using `SelectionRange`; `SelectionRef` exposes `highlight`, `confirm`, and `confirmRect` with the semantics above; custom handle tests can branch on `props.target === 'rect'`; existing text-only component invocations still typecheck without `tool` and existing `renderHandle` consumers continue working because added handle props are non-breaking extras.
  QA scenarios (name the exact tool + invocation): Happy: run `npm run typecheck` and save output to `.omo/evidence/task-1-selection-rect-tool.md`. Failure: add/verify a test or type assertion that rect creation callback type is not assignable to text `onSelect`; no fake `SelectionRange` is required for rects. Evidence `.omo/evidence/task-1-selection-rect-tool.md`.
  Commit: Y | `feat(api): add rectangle selection tool types`

- [x] 2. `src/geometry.ts` + tests: Add single-rect geometry helpers for normalize/clamp/px-percent storage - expect deterministic rect math
  What to do / Must NOT do: Add small helpers around existing list conversion rather than duplicating math: clamp a point to container bounds, normalize two points into a non-negative `OverlayRect`, ignore tiny rects below 2px width or height, convert/store a single pixel rect according to `overlayRectType`, and convert stored percent rects back to pixels for hit-test/handles. Must NOT change existing `pixelRectsToPercentRects`, `percentRectsToPixelRects`, or `storeRectsForOverlayRectType` semantics for text.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 5
  References (executor has NO interview context - be exhaustive): `src/geometry.ts:22-35` pixel-to-percent conversion; `src/geometry.ts:41-52` percent-to-pixel conversion; `src/geometry.ts:89-95` storage by `overlayRectType`; `src/geometry.test.ts` existing geometry test location.
  Acceptance criteria (agent-executable): Add tests showing container `400x300`, drag `(40,30)->(120,90)` stores px `{x:40,y:30,width:80,height:60}` and percent `{x:10,y:10,width:20,height:20}`; reverse drag `(120,90)->(40,30)` normalizes to the same rect; out-of-bounds points clamp into 0..container; `<2px` width or height returns no creatable rect.
  QA scenarios (name the exact tool + invocation): Happy: `npm run test -- src/geometry.test.ts` passes with new rect helper tests. Failure: intentionally covered by tiny-drag and reverse-drag test cases; save command output to `.omo/evidence/task-2-selection-rect-tool.md`.
  Commit: Y | `feat(geometry): add rectangle coordinate helpers`

- [x] 3. `src/Selection.tsx`: Implement rect active drawing and confirmation path - expect rect draft appears after drag and confirms through popover/ref without text callbacks
  What to do / Must NOT do: Add `tool` defaulting to `'text'` in props destructuring. Gate existing text mousedown/mouseup/touch text-selection start/end logic so it only runs in text mode. Add active rect draft state driven by pointer events in rect mode: pointerdown clamps start, pointermove updates preview, pointerup stops drawing and leaves active rect visible if above threshold. Ensure browser native selection is cleared/prevented during rect drawing. Implement `SelectionRef.confirm()` as the method the existing `selectionPopover` button should call: when `tool='text'`, it delegates to the existing text confirmation behavior; when `tool='rect'`, it confirms the active rect. Implement `SelectionRef.confirmRect()` as a rect-only convenience that confirms the active rect and is a no-op without one. Preserve `highlight()` as text-only/backward-compatible and do not require callers to use it for rects. Rect confirmation emits `onCreateRect` with stored px/percent data, calls `onSelectRect(newRect.id)` after creation, and clears active rect. Must NOT call `onSelectionStart`, `onSelectionEnd`, `onSelect`, or `onHighlight` for rect draw/confirm.
  Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 4, 5, 6
  References (executor has NO interview context - be exhaustive): `src/Selection.tsx:373-402` props; `src/Selection.tsx:444-451` current text hook; `src/Selection.tsx:729-791` text-only confirm; `src/Selection.tsx:817-824` ref exposure; `src/Selection.tsx:834-928` mousedown/mouseup text flow; `src/Selection.tsx:955-1090` mobile touch text flow; `src/types.ts:304-314` ref API; user decision 2B: active rect confirmed through `selectionPopover`.
  Acceptance criteria (agent-executable): Create and use `src/Selection.rect.test.tsx`. Tests verify: `tool="rect"` drag creates active rect and shows `selectionPopover`; clicking a popover button that calls `ref.current?.confirm()` triggers `onCreateRect` exactly once and `onSelectRect(newRect.id)`; `ref.current?.confirmRect()` also confirms an active rect; `ref.current?.highlight()` remains text-only and does not confirm rects; `onSelect`, `onHighlight`, `onSelectionStart`, and `onSelectionEnd` are not called; `tool` omitted still supports existing text `ref.highlight()` behavior, and `ref.confirm()` also confirms text in text mode.
  QA scenarios (name the exact tool + invocation): Happy: run exactly `npm run test -- src/Selection.rect.test.tsx` and expect all active-rect creation/confirmation tests to pass. Failure: in that same exact command, negative assertions cover text callbacks in rect mode and no active rect below threshold. Evidence `.omo/evidence/task-3-selection-rect-tool.md`.
  Commit: Y | `feat(selection): add active rectangle drawing`

- [x] 4. `src/Selection.tsx` + `src/style.css`: Render rect overlays, popovers, and hit-testing - expect active/persisted rects are visible/selectable in px and percent modes
  What to do / Must NOT do: Build rect display groups analogous to text `persistedRects` without merging data models. Render active rect using `selectionStyle` and persisted rects using stored/current `markerStyle`; for px use SVG rects and for percent use percent divs. Anchor active and persisted rect popovers at rect top-center. Add container-coordinate hit-testing for persisted rects with pointer-events remaining none on overlays. Implement selected rect toggle/outside-clear via `onSelectRect`, and ensure rect selected state and text selected state are mutually exclusive through callbacks. Must NOT enable pointer events on overlay shapes or let rect click handling break text hit-test behavior.
  Parallelization: Wave 2 | Blocked by: 1, 3 | Blocks: 5, 6
  References (executor has NO interview context - be exhaustive): `src/Selection.tsx:1092-1098` text active/selected mutual exclusion; `src/Selection.tsx:1107-1180` container hit-test click flow; `src/Selection.tsx:1507-1557` top-center popover anchors; `src/Selection.tsx:1647-1744` px/percent overlay rendering; `src/style.css:47-65` SVG overlay pointer-events; `src/style.css:86-103` percent overlay pointer-events; `src/styleUtils.ts:166-186`, `src/styleUtils.ts:202-211` style conversion/building.
  Acceptance criteria (agent-executable): Tests verify px active/persisted rect renders an SVG rect, percent active/persisted rect renders a percent div with percent CSS values, popover is positioned at top-center, clicking a persisted rect calls `onSelectRect(id)`, clicking it again or outside calls `onSelectRect(null)`, clicking inside popover does not clear/unmount before button click, and text persisted hit-testing still works.
  QA scenarios (name the exact tool + invocation): Happy: run exactly `npm run test -- src/Selection.rect.test.tsx` and verify DOM assertions prove SVG-vs-percent rendering, class/style values, top-center anchor values, and select/toggle/outside-clear behavior. Failure: in the same exact Vitest invocation, tests assert rect overlays have no pointer-event interception side effects and do not call text selection callbacks. Save command and assertion summary to `.omo/evidence/task-4-selection-rect-tool.md`.
  Commit: Y | `feat(selection): render and select rectangle ranges`

- [x] 5. `src/Selection.tsx`: Add rect start/end handles and resize behavior - expect selected or active rect dimensions update by endpoint drag
  What to do / Must NOT do: Reuse/extend the existing `renderHandle` pipeline so rect handles pass `target: 'rect'`, `rangeId: null`, `rectId` (`null` for active rect, persisted id for selected rect), `type: 'start' | 'end'`, owner context, `position`, `positionUnit`, className, ariaLabel, and style. Text handles must pass `target: 'text'`, the existing `rangeId`, and `rectId: null`. For rects, start/end are the two stored diagonal endpoints; if stored data is percent, handle positions should be percent. Add a separate rect pointer-resize path that uses container-relative pointer coordinates, clamps, normalizes, and updates active rect state or emits `onUpdateRect` for persisted rects. Must NOT use `caretInfoFromPoint`, DOM Range, `createRangeFromOffsets`, or text `onUpdateRange` for rect resize.
  Parallelization: Wave 2 | Blocked by: 1, 2, 4 | Blocks: 6
  References (executor has NO interview context - be exhaustive): `src/types.ts:190-247` handle props and `positionUnit`; `src/Selection.tsx:1219-1319` text handle drag start setup; `src/Selection.tsx:1323-1505` text caret-based drag path to avoid for rect; `src/Selection.tsx:1559-1632` handle style/render function; `src/Selection.tsx:1793-1897` current text handle placement; `demo/src/App.tsx:278-302` custom `renderHandle` sample.
  Acceptance criteria (agent-executable): Tests verify selected persisted rect renders two handles; custom `renderHandle` receives `target='rect'`, `rangeId=null`, `rectId=<selected id>`, and `positionUnit='px'` or `'percent'` matching rect data; active rect handles pass `target='rect'` and `rectId=null`; text handles continue to pass `target='text'` and their existing `rangeId`; dragging end handle updates width/height and calls `onUpdateRect`; dragging start handle updates x/y/width/height; dragging across the opposite point normalizes positive geometry; no `onUpdateRange` call occurs.
  QA scenarios (name the exact tool + invocation): Happy: run exactly `npm run test -- src/Selection.rect.test.tsx` and verify pointer-event tests cover px and percent rect handles, `props.target/rectId/rangeId`, start-handle drag, end-handle drag, crossing normalization, and `onUpdateRect` payloads. Failure: in the same exact Vitest invocation, assert `onUpdateRange` is not called and caret/DOM Range paths are not used for rect handle drag. Save command and assertion summary to `.omo/evidence/task-5-selection-rect-tool.md`.
  Commit: Y | `feat(selection): resize rectangles with endpoint handles`

- [x] 6. `src/Selection*.test.tsx`: Lock tool switching, mutual exclusion, linked non-corruption, and text backward compatibility - expect old text behavior and new rect mode coexist safely
  What to do / Must NOT do: Add regression tests across the completed component behavior. Cover default text mode, explicit text mode, rect mode, switching between tools, selected text-vs-rect mutual exclusion, and linkedMode behavior. For linkedMode + `tool='rect'`, verify local rect callbacks can run with optional `selectionId` but `linkedData.items` is not mutated by rect creation. Must NOT weaken or delete existing tests to make new behavior pass.
  Parallelization: Wave 2 | Blocked by: 1, 3, 4, 5 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `src/Selection.overlayRectType.test.tsx:113-389` existing px/percent and handle tests; `src/Selection.overlayRectType.test.tsx:393-568` popover hiding/click protection patterns; `src/Selection.overlayRectType.test.tsx:581-729` linked/mobile patterns; `src/useTextSelection.ts:242-259` text active state; `src/types.ts:121-148` linked data shape.
  Acceptance criteria (agent-executable): `npm run test` passes; tests verify omitted `tool` remains text; `tool='rect'` drag does not call text lifecycle callbacks; switching text→rect clears active text and hides text popover; switching rect→text clears active rect; starting rect clears selected text via `onSelectRange(null)`; starting text clears selected rect via `onSelectRect(null)`; linked text tests still pass and rects do not enter `LinkedSelectionData.items`.
  QA scenarios (name the exact tool + invocation): Happy: full `npm run test` output saved. Failure: tests include negative spies for wrong callbacks and linked data mutation. Evidence `.omo/evidence/task-6-selection-rect-tool.md`.
  Commit: Y | `test(selection): cover rectangle tool coexistence`

- [x] 7. `src/index.ts` + `demo/src/App.tsx`: Export API and add minimal demo UI - expect users can try text/rect and inspect emitted geometry
  What to do / Must NOT do: Export new public types from `src/index.ts`. In the demo, add `tool` state near the existing `overlayRectType` controls, add controlled rects/selectedRectId state, wire `onCreateRect`, `onSelectRect`, `onUpdateRect`, and a simple delete action through popover. Show a compact rect data list with id, unit, start/end/rect geometry. Ensure `overlayRectType` affects newly created text and rect selections. Must NOT add a large drawing UI, new UI framework, or unrelated demo redesign.
  Parallelization: Wave 3 | Blocked by: 1 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `src/index.ts:10-48` exports; `demo/src/App.tsx:84-95` existing feature controls including `overlayRectType`; `demo/src/App.tsx:278-302` custom handle rendering; `demo/src/App.tsx:616-637`, `demo/src/App.tsx:705-725`, `demo/src/App.tsx:843-894` Selection usages; `demo/src/App.tsx:1103` existing geometry display pattern.
  Acceptance criteria (agent-executable): `npm run typecheck` passes for demo imports/usages; `npm run build:demo` passes; browser QA can switch tools, draw/confirm/delete rects, switch px/percent, and still text-highlight.
  QA scenarios (name the exact tool + invocation): Happy: run exactly `npm run build:demo`; then start the demo with exactly `npm run dev -- --host 127.0.0.1 --port 9536`; create a temporary Playwright QA script at `.omo/evidence/task-7-selection-rect-tool-qa.mjs` and run exactly `node .omo/evidence/task-7-selection-rect-tool-qa.mjs`. The script must open `http://127.0.0.1:9536`, switch `text -> rect`, draw a rect, click the `selectionPopover` confirm button, select/delete a persisted rect, switch `overlayRectType` between `px` and `percent`, resize start and end handles, then switch back to text and create a text highlight. Save steps, observed geometry, and a screenshot to `.omo/evidence/task-7-selection-rect-tool.md` and `.omo/evidence/task-7-selection-rect-tool.png`. Failure: in the same Playwright script/notes, verify demo does not store rects in linked text data list and text controls still work after rect interactions. Evidence `.omo/evidence/task-7-selection-rect-tool.md`.
  Commit: Y | `docs(demo): showcase rectangle selection tool`

- [x] 8. `package scripts`: Run complete quality gates and browser QA - expect implementation is shippable and evidence-backed
  What to do / Must NOT do: Run final command suite and real demo QA after all implementation tests pass. Record exact commands, outputs, and any screenshots/notes. Fix any failures in the smallest relevant todo area; do not skip lint/type/build or treat subagent summaries as verification. Must NOT commit or push unless explicitly requested by the user after this plan is executed.
  Parallelization: Wave 3 | Blocked by: 1, 2, 3, 4, 5, 6, 7 | Blocks: final verification wave
  References (executor has NO interview context - be exhaustive): `package.json:40-50` scripts; `vite.demo.config.ts:16-24` demo server/preview port 9536; `package.json` devDependencies include `playwright`; `.omo/evidence/` for evidence storage; dirty worktree risk from planning: unrelated `.omo/evidence/*` and `.omo/run-continuation/*` existed before this work and must not be overwritten.
  Acceptance criteria (agent-executable): `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run build:demo` pass; browser QA notes prove text default, rect draw/confirm, px/percent, resize, and popover behavior.
  QA scenarios (name the exact tool + invocation): Happy: run exactly `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run build:demo`; start the demo with exactly `npm run dev -- --host 127.0.0.1 --port 9536`; create/run `.omo/evidence/selection-rect-tool-final-qa.mjs` with `node .omo/evidence/selection-rect-tool-final-qa.mjs` to repeat the Task 7 Playwright flow; save `.omo/evidence/selection-rect-tool-final.md`. Failure: if any command fails, fix and rerun the exact command, preserving failure and fix notes in evidence. Evidence `.omo/evidence/task-8-selection-rect-tool.md` and `.omo/evidence/selection-rect-tool-final.md`.
  Commit: N | no commit unless user explicitly requests

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE before the worker may report completion; surface the verification results with evidence paths in the final response. Do not require additional user interview to complete verification.
- [x] F1. Plan compliance audit: independently compare changed files against this plan. APPROVE only if every Must Have is implemented, every Must NOT Have is absent, and each todo has evidence.
- [x] F2. Code quality review: inspect API naming, type safety, state separation, event listener cleanup, pointer/touch behavior, and absence of text/rect callback mixing. APPROVE only if no high/medium issues remain.
- [x] F3. Real manual QA: run the demo in a browser and exercise text default, rect draw/confirm/delete, px/percent, resize handles, popover click protection, and tool switching. APPROVE only with screenshot/notes evidence.
- [x] F4. Scope fidelity/security-ish review: verify no linked text data corruption, no unrelated dirty files overwritten, no pointer-events regression, and no scope creep features (move/rotate/multi-select/etc.). APPROVE only if clean.

## Commit strategy
- Suggested atomic commits if the user later asks to commit:
  1. `feat(api): add rectangle selection tool types`
  2. `feat(geometry): add rectangle coordinate helpers`
  3. `feat(selection): add rectangle drawing and rendering`
  4. `feat(selection): resize rectangles with endpoint handles`
  5. `test(selection): cover rectangle tool behavior`
  6. `docs(demo): showcase rectangle selection tool`
- Do not commit planning artifacts or `.omo/evidence` unless the repo normally tracks them and the user explicitly requests it.
- Before any commit: inspect `git status`, `git diff`, and `git log --oneline -10`; stage only intended product/test/demo files and avoid pre-existing unrelated dirty `.omo` artifacts.

## Success criteria
- Existing text selection API and behavior remain compatible when `tool` is omitted.
- Consumers can choose `tool='rect'` and receive independent rect create/select/update callbacks with no fake text ranges.
- Rect data includes start/end endpoint metadata plus normalized rect geometry, stored in px or percent according to `overlayRectType`.
- Rect active selection uses `selectionPopover` confirmation and does not fire text lifecycle callbacks.
- Active and persisted rects render correctly in both px and percent modes.
- Persisted rects can be selected/toggled/cleared via container hit-test without overlay pointer interception.
- Start/end rect handles resize active or persisted rects through pointer geometry and preserve positive normalized dimensions.
- Linked text mode remains intact; rects do not enter linked text data.
- Demo shows the feature minimally and builds successfully.
- Full `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, and demo build/browser QA pass with evidence saved under `.omo/evidence/`.
