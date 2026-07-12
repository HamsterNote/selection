---
slug: selection-rect-tool
status: drafting
intent: clear
pending-action: write .omo/plans/selection-rect-tool.md
approach: add controlled tool switching with independent rect data/callbacks; rect drag creates an active rectangle confirmed through selectionPopover; preserve text defaults
---

# Draft: selection-rect-tool

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

| API/data model | Expose `tool='text'|'rect'` and independent rect data/callbacks without overloading text `SelectionRange` | active | `src/types.ts:14-47`, `src/types.ts:322-469` |
| Rect gesture state | Draw active rect with pointer coordinates and do not trigger native/text selection lifecycle in rect mode | active | `src/Selection.tsx:834-928`, `src/Selection.tsx:1323-1505` |
| Rect render/unit conversion | Render active/persisted rects in px or percent using existing overlay/unit conventions | active | `src/Selection.tsx:1647-1744`, `src/geometry.ts:22-35`, `src/geometry.ts:89-95` |
| Rect confirmation/popover/selection | Confirm active rect via selectionPopover and select persisted rects without calling text callbacks | active | `src/Selection.tsx:729-791`, `src/Selection.tsx:1507-1557`, `src/Selection.tsx:1153-1167` |
| Rect handles/resize | Place start/end handles at rect diagonal endpoints and resize via pointer geometry, not caret offsets | active | `src/types.ts:190-247`, `src/Selection.tsx:1581-1632`, `src/Selection.tsx:1793-1897` |
| Demo/tests/exports | Export new types, show minimal demo tool switch, and test text compatibility plus rect px/percent/create/resize flows | active | `src/index.ts:10-48`, `demo/src/App.tsx:94`, `demo/src/App.tsx:278-302`, `package.json:40-50` |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

| `tool` API shape | Pure controlled prop `tool?: SelectionTool`, default `'text'`; Demo owns local tool state | Component is currently controlled by props for persisted data; default preserves existing users | yes |
| Rect data scope | Rects are local to one `Selection` instance; no linked rect persistence in `LinkedSelectionData.items` | Existing linked data is text endpoint-based and rect linked support would explode scope | yes, future feature |
| Rect ownership in linkedMode | If `linkedMode && tool='rect'`, allow local rect creation with optional `selectionId` on rect data, but do not mutate linked text data except clearing text active/selected state as needed | Lets a linked page draw local regions without corrupting linked text model | yes |
| Rect geometry | Store normalized non-negative `rect`; keep `start` and `end` points as endpoint metadata in the same unit as stored data | User requested start/end plus resize handles; normalized rect simplifies rendering/hit-test | yes |
| Drag normalization | Reverse drags and handles crossing are allowed; normalize x/y/width/height to positive dimensions | Natural drawing behavior and testable | yes |
| Bounds | Clamp pointer coordinates to container bounds before creating/updating rect; percent output stays in 0-100 | Prevents negative/out-of-container percent data | yes |
| Minimum size | Ignore active rect creation/confirmation below 2px width or height after clamping | Avoid accidental clicks producing invisible rects | yes |
| Styles | Reuse `selectionStyle` for active rect and `markerStyle` for persisted rect; snapshot them into rect data like text ranges | Consistent with existing visual API; no new style props unless needed later | yes |
| Popover props | Reuse existing `selectionPopover` for active rect confirmation and `popover` for selected persisted rect; anchor at rect top-center | User chose conceptual selectionPopover confirmation; avoids more API for MVP | yes |
| Selection mutual exclusion | Within one component, active/selected text and active/selected rect are behaviorally mutually exclusive; starting one clears the other through callbacks | Prevents two popovers/handle sets colliding | yes |

## Findings (cited - path:lines)

- `src/types.ts:14-47` defines text `SelectionRange` with `text/start/end` as text content and character offsets; rect data must not overload it.
- `src/types.ts:59-74` defines `PercentOverlayRect` and `OverlayRect`; rect data can reuse these shapes for normalized geometry.
- `src/types.ts:190-247` defines existing start/end handle props with px/percent `positionUnit`; rect handles can reuse or extend this with a rect owner/type context.
- `src/types.ts:304-314` exposes `SelectionRef.highlight()` and `clear()`; `highlight()` currently means text highlight, so rect confirmation needs either a safe generalized confirm path or a rect-specific method without breaking `highlight()`.
- `src/types.ts:322-469` contains `SelectionProps` without tool or rect props.
- `src/Selection.tsx:373-402` destructures current props; worker must add tool/rect props here and default `tool` to text.
- `src/Selection.tsx:444-451` always uses `useTextSelection`; rect mode needs separate active rect state and should not drive `selectedText/startIndex/endIndex`.
- `src/Selection.tsx:729-791` confirms only text because it rejects missing active text; this is incompatible with rect confirmation through `selectionPopover` unless ref/confirm logic is extended.
- `src/Selection.tsx:834-928` starts/ends text selection on container mousedown/mouseup; rect mode must gate this path off and avoid firing `onSelectionStart/onSelectionEnd`.
- `src/Selection.tsx:1092-1098` clears selected text range when active text selection appears; equivalent mutual exclusion is needed for rect selected state.
- `src/Selection.tsx:1153-1167` uses container click hit-testing for persisted text rects because overlays have pointer-events none; rect persisted hit-test should follow the same strategy.
- `src/Selection.tsx:1323-1505` resizes text handles by caret offsets; rect handles need a separate pointer-coordinate resize path.
- `src/Selection.tsx:1507-1557` anchors text popovers at top-center of the top rect; rect popover should anchor at top-center of the single normalized rect.
- `src/Selection.tsx:1647-1744` renders px overlays as SVG rects and percent overlays as absolutely positioned divs; rect rendering should reuse this split.
- `src/geometry.ts:22-35` and `src/geometry.ts:41-52` convert px/percent lists by container size; single rect helpers can wrap these functions.
- `src/geometry.ts:89-95` stores rect lists as px or percent based on `overlayRectType`; rect confirmation/update should reuse equivalent behavior.
- `src/style.css:47-65` and `src/style.css:86-103` keep overlays pointer-events none; rect overlays must not intercept pointer events.
- `src/index.ts:10-48` exports public component/types; new `SelectionTool` and rect public types must be exported.
- `demo/src/App.tsx:94` already controls `overlayRectType`; add a minimal `tool` toggle near this UI.
- `demo/src/App.tsx:278-302` demonstrates `renderHandle`; rect handles must remain compatible.
- `package.json:40-50` provides verification commands: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`.

## Decisions (with rationale)

- User chose 1A: add independent rect data structure/callbacks rather than overloading text `SelectionRange`; rationale: text ranges use character offsets and text confirmation/resize logic would reject or corrupt rect data.
- User chose 2B: rect drag produces an active rect first and confirmation uses the conceptual `selectionPopover` flow; rationale: matches existing active-selection UX while keeping mouseup from immediately persisting accidental drawings.
- Adopted default: `tool` is a pure controlled prop defaulting to `'text'`, so existing callers are unchanged.
- Adopted default: rect creation/update internally uses pixel coordinates, clamps to container bounds, normalizes to positive geometry, then emits px/percent according to each rect's `overlayRectType`.
- Adopted default: linkedMode rects are local rect annotations with optional `selectionId`; no rects are stored in `LinkedSelectionData.items`.
- Adopted default: no move/rotate/multi-select/labels/keyboard shortcuts in this plan.

## Scope IN

- Public API: `SelectionTool`, independent rect data/point types, rect controlled props/callbacks, optional safe ref method for confirming active rect if needed.
- Core behavior: `tool='text'` preserves current text selection; `tool='rect'` draws active rect via pointer drag and confirms through `selectionPopover`.
- Geometry: px and percent storage/rendering for rect creation and resize, including reverse drag normalization, clamping, and tiny-drag threshold.
- UI: active/persisted rect rendering, active/persisted rect popover anchoring, persisted rect hit-testing/select/toggle/outside-clear, start/end rect handles and resize.
- Demo: minimal text/rect tool toggle, controlled rect state, rect confirmation/delete/update display.
- Tests: text compatibility, rect px/percent creation/confirmation, tool switching, popover click protection, persisted selection, handle resize, linkedMode non-corruption.

## Scope OUT (Must NOT have)

- Must not overload `SelectionRange` or call text `onSelect/onHighlight/onUpdateRange` for rect operations.
- Must not store rects in `LinkedSelectionData.items` or modify `LinkedSelectionRange` semantics.
- Must not implement rect move/drag body, rotate, labels, multi-select, grouping, keyboard shortcuts, snapping, aspect-ratio lock, or four-corner/eight-edge handles.
- Must not rewrite the component wholesale or remove existing text/mobile/linked behavior.
- Must not touch unrelated dirty `.omo/evidence/*`, `.omo/run-continuation/*`, or prior QA artifacts except new evidence files for this plan.

## Open questions

None blocking. User approved 1A and 2B. All remaining forks are resolved by adopted defaults above.

## Approval gate
status: approved
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->

User explicitly replied: “批准”. Approval authorizes writing `.omo/plans/selection-rect-tool.md` only, not implementation.

## Metis review integration

- Added hard constraints against overloading `SelectionRange` and against text callbacks for rect operations.
- Added explicit resolution for `selectionPopover` conflict with current text-only `highlight()` path: worker must add a safe generalized confirm path or rect-specific confirm method while keeping `highlight()` backward compatible.
- Added tool event gating requirements and negative tests so rect drag does not fire text lifecycle callbacks.
- Added linkedMode default: rects are local and do not mutate `LinkedSelectionData.items`.
- Added geometry defaults: clamp, normalize, tiny-drag threshold, percent conversion expectations.
- Added selected-state mutual exclusion and popover anchor requirements.
