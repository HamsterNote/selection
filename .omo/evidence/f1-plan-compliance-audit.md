# F1 Plan Compliance Audit — selection-rect-tool

Verdict: **APPROVE**

Audit target: `.omo/plans/selection-rect-tool.md`  
Audit date: 2026-07-02  
Auditor: F1 final verification wave

## Commands run

- `npm run typecheck` — PASS (`tsc -b --noEmit` completed with exit 0)
- `npm run test` — PASS (6 files, 120 tests passed)

## Evidence files

`glob .omo/evidence/task-*-selection-rect-tool.md` found all required task evidence files:

- `.omo/evidence/task-1-selection-rect-tool.md`
- `.omo/evidence/task-2-selection-rect-tool.md`
- `.omo/evidence/task-3-selection-rect-tool.md`
- `.omo/evidence/task-4-selection-rect-tool.md`
- `.omo/evidence/task-5-selection-rect-tool.md`
- `.omo/evidence/task-6-selection-rect-tool.md`
- `.omo/evidence/task-7-selection-rect-tool.md`
- `.omo/evidence/task-8-selection-rect-tool.md`

## Must Have compliance

1. **Public `SelectionTool = 'text' | 'rect'`, default text mode** — PASS.
   - `src/types.ts:14-15` defines `SelectionTool`.
   - `src/Selection.tsx:385-403` destructures `tool = 'text'`.

2. **Independent rectangle data/callback API; no text range overloading** — PASS.
   - `src/types.ts:17-50` defines `SelectionRectPoint` and independent `SelectionRect` with `start`, `end`, `rect`, styles, and optional `selectionId`.
   - `src/types.ts:463-474` adds optional `tool`, `rects`, `selectedRectId`, `onCreateRect`, `onSelectRect`, `onUpdateRect` props.
   - `src/types.ts:56-89` keeps `SelectionRange` text-oriented; no rect discriminant/coordinate overload added.

3. **Rect pointer drawing with active draft and popover confirmation** — PASS.
   - `src/Selection.tsx:984-1057` registers rect-mode pointerdown/move/up; pointerdown records start, move previews normalized creatable rect, pointerup leaves active rect.
   - `src/Selection.tsx:1945-1955` anchors `selectionPopover` for active rects.
   - `src/Selection.rect.test.tsx:352-373` verifies active rect + selection popover after drag.

4. **Rect confirmation works despite text `highlight()` empty-text guard** — PASS.
   - `src/Selection.tsx:922-957` implements `handleConfirmRect()` independently of text selected text.
   - `src/Selection.tsx:959-965` dispatches `confirm()` by current tool.
   - `src/Selection.tsx:970-981` exposes `highlight`, `confirm`, `confirmRect` on the ref.
   - `src/Selection.rect.test.tsx:375-430` verifies popover button `ref.confirm()` creates rect and avoids text callbacks; `src/Selection.rect.test.tsx:432-454` verifies `confirmRect()`.

5. **Rect geometry stored/emitted by `overlayRectType`; percent start/end are 0-100** — PASS.
   - `src/geometry.ts:173-180` stores a single rect as px or percent.
   - `src/Selection.tsx:930-950` converts confirmed percent-mode `start`/`end` and `rect` into 0-100 container-relative coordinates before `onCreateRect`.
   - `src/Selection.tsx:1667-1708` converts percent persisted resize endpoints and stored rects back to percent before `onUpdateRect`.
   - `src/Selection.rect.test.tsx:845-883` explicitly verifies percent rect creation emits `start: {x:10,y:10}`, `end: {x:30,y:30}` for a 400x300 container drag from 40,30 to 120,90.

6. **Active/persisted rect rendering in existing overlay system; no duplicate incorrect percent active render** — PASS.
   - `src/Selection.tsx:2107-2134` renders persisted px rects via SVG `<rect>`.
   - `src/Selection.tsx:2156-2169` renders active px rect via SVG `<rect>`.
   - `src/Selection.tsx:2199-2220` renders persisted percent rects as percent-positioned divs.
   - `src/Selection.tsx:2222-2233` renders active percent overlays through `activePercentRects`; there is no second active-percent rect block mixing pixel coordinates with `%`.
   - `src/Selection.rect.test.tsx:743-759` and `src/Selection.rect.test.tsx:845-868` verify exactly one active percent rect and correct percent CSS.

7. **Exactly two rect handles at diagonal endpoints; resize selected/active rects** — PASS.
   - `src/Selection.tsx:2304-2355` renders active rect start/end handles at draft endpoints.
   - `src/Selection.tsx:2419-2455` renders selected persisted rect start/end handles at stored endpoints.
   - `src/Selection.tsx:1560-1595` starts rect handle drag without text caret paths.
   - `src/Selection.tsx:1658-1720` handles rect resize using pointer geometry, normalization, and `onUpdateRect`/active state.
   - `src/Selection.rect.test.tsx:508-616`, `src/Selection.rect.test.tsx:618-667`, and `src/Selection.rect.test.tsx:669-700` cover handle props and resize behavior.

8. **Text selection remains backward compatible when `tool` omitted or text** — PASS.
   - `src/Selection.tsx:403` defaults `tool` to text.
   - `src/Selection.tsx:1063-1162` gates mouse text selection to `isTextTool`.
   - `src/Selection.tsx:1194-1325` gates mobile text long-press handling to `isTextTool`.
   - `src/Selection.rect.test.tsx:120-160` verifies omitted and explicit text modes keep text highlight callbacks working.

9. **Rect/text callback isolation** — PASS.
   - Rect draw path clears/selects via rect callbacks and `selectRange(null)` only; it does not call `onSelectionStart`, `onSelectionEnd`, `onSelect`, `onHighlight`, or `onUpdateRange` (`src/Selection.tsx:992-1057`, `src/Selection.tsx:922-957`, `src/Selection.tsx:1658-1720`).
   - `src/Selection.rect.test.tsx:162-193` verifies rect drag does not call text callbacks.
   - `src/Selection.rect.test.tsx:375-430` verifies rect confirm does not call text callbacks.
   - `src/Selection.rect.test.tsx:618-667` verifies rect resize calls `onUpdateRect` and not `onUpdateRange`.

10. **Demo updated with minimal text/rect toggle, controlled rect state, confirmation/delete/select/update, geometry display** — PASS.
    - `demo/src/App.tsx:96-100` adds `overlayRectType`, `tool`, `rects`, and `selectedRectId` state.
    - `demo/src/App.tsx:237-259` wires controlled rect create/select/update/delete handlers.
    - `demo/src/App.tsx:570-589` renders text/rect tool controls.
    - `demo/src/App.tsx:898-993` wires rect props and rect confirmation/delete controls into the legacy demo `Selection`.
    - `demo/src/App.tsx:1254-1346` renders the rect list with id/start/end/rect geometry and delete/select UI.

11. **Exports for new public rect/tool types** — PASS.
    - `src/index.ts:45-48` exports `SelectionRect`, `SelectionRectPoint`, `SelectionRef`, and `SelectionTool`.

12. **Automated tests cover required scenarios** — PASS.
    - `src/Selection.rect.test.tsx` covers default text compatibility, rect creation/confirmation, percent creation, popover behavior, tool switching, rect selection/toggle/outside clear, linked non-corruption, and handle resize.
    - Full suite result: 120 tests passed.

## Must NOT Have / guardrail compliance

- **No rects in `LinkedSelectionData.items` / no linked cross-container rect ranges** — PASS. Text linked item shape remains in `src/types.ts:122-149`; rects use independent `SelectionRect` and optional local `selectionId` (`src/types.ts:27-50`). `src/Selection.rect.test.tsx:291-342` verifies rect creation in linked mode does not mutate linked `items`.
- **No text `SelectionRange` coordinate overload/fake empty text rects** — PASS. `SelectionRange` remains text offset/text/rect-list oriented (`src/types.ts:56-89`), while rects are separate (`src/types.ts:27-50`).
- **No scope-creep features (body move, rotate, labels, multi-select, snapping, aspect locks, keyboard shortcuts, four/eight handles)** — PASS. Implementation only contains draw/confirm/select/delete via callbacks and two endpoint handles.
- **No wholesale component rewrite/removal of existing behavior** — PASS. Existing text, linked, mobile long-press, popover, style persistence, and handle customization paths remain present and tested.
- **Rect overlays do not intercept pointer events** — PASS. CSS keeps SVG and percent overlays non-interactive (`src/style.css:51-64`, `src/style.css:92-100`); hit-testing is container-coordinate based in `src/Selection.tsx:1391-1424`.
- **Do not reject for `.omo` planning/evidence artifacts or unrelated dirty files** — PASS. This audit considered `.omo/evidence/task-*` files intentional evidence and did not use unrelated dirty worktree state as a rejection reason.

## Final decision

**APPROVE** — The current implementation satisfies every Must Have, avoids the Must NOT Have scope boundaries, includes task evidence for tasks 1-8, stores percent rect `start`/`end` as 0-100 percentages, avoids duplicate/incorrect percent active rendering, isolates rect callbacks from text callbacks, keeps `tool` defaulting to `'text'`, and keeps new rect props optional/non-breaking. Typecheck and full tests pass.
