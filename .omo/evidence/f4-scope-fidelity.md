# F4 Scope Fidelity Evidence

Verdict: APPROVE

## Dependency and Framework Boundary

- `package.json` current contents match `HEAD:package.json`; `GIT_MASTER=1 git diff -- package.json` produced no output.
- Existing dependency sections remain unchanged: `peerDependencies` only contains `react` and `react-dom` at `package.json:50`; `devDependencies` remain the existing ESLint/Prettier/React/TypeScript/Vite toolchain at `package.json:54`.
- No new runtime dependencies or devDependencies were added.
- Import scan found only existing package imports (`react`, `react-dom/client`, `@hamster-note/selection`, `node:path`, `vite`, `@vitejs/plugin-react`, `vite-plugin-dts`) plus local imports. No added imports from Vitest, Playwright, Testing Library, Jest, Mocha, Chai, Cypress, Next, Remix, Astro, Vue, or Svelte.
- No document/page framework was introduced; the demo remains the existing Vite/React demo using `demo/src/App.tsx` and existing Vite config imports.

## Changed File Classification

`GIT_MASTER=1 git diff --stat -- ':!node_modules'` reported tracked changes in:

- `.omo/boulder.json` — in-scope project/task state tracking.
- `.omo/notepads/multi-selection-linked-ranges-plan/learnings.md` — in-scope plan learning log.
- `.omo/plans/multi-selection-linked-ranges-plan.md` — in-scope plan bookkeeping.
- `demo/src/App.tsx` — in-scope demo update to show linked shared state, linked list, event logs, legacy compatibility, and JSON inspector.
- `src/types.ts` — in-scope public type additions for linked mode while preserving legacy types.

`GIT_MASTER=1 git status --porcelain -- ':!node_modules'` also shows untracked artifacts:

- `.omo/drafts/*`, `.omo/notepads/multi-selection-linked-ranges-plan/{decisions,issues,problems}.md`, `.omo/run-continuation/*` — in-scope planning/continuation artifacts.
- `.omo/evidence/task-*` and `.omo/evidence/task-9-screenshots/*` — in-scope validation evidence artifacts.
- `src/geometry.ts` — in-scope helper for percent/pixel rect conversion needed to avoid persisting pixel geometry in linked controlled data.

No changed file appears to be an out-of-scope dependency, test framework, page framework, or unrelated product UI rewrite.

## Legacy SelectionRange Boundary

- Legacy `SelectionRange` remains exported and structurally intact at `src/types.ts:7` with `id`, `text`, `start`, `end`, and `createdAt` fields through `src/types.ts:18`.
- `SelectionProps` still requires the legacy `ranges: SelectionRange[]` prop at `src/types.ts:221` and legacy callbacks such as `onSelect?: (range: SelectionRange) => void` at `src/types.ts:230`, `onSelectRange` at `src/types.ts:238`, and `onUpdateRange` at `src/types.ts:264`.
- `demo/src/App.tsx` preserves a legacy state path with `legacyRanges: SelectionRange[]` at `demo/src/App.tsx:58`, legacy callbacks at `demo/src/App.tsx:188`, and a legacy `Selection` without linked props at `demo/src/App.tsx:760`.

## Linked Data Shape and Pixel Persistence

- Linked controlled geometry is typed as percent data: `LinkedSelectionRange.rectsBySelectionId: Record<string, PercentOverlayRect[]>` at `src/types.ts:47`.
- `PercentOverlayRect` is separate from pixel `OverlayRect`; it is defined at `src/types.ts:30`, while pixel `OverlayRect` remains a transient absolute-positioning shape at `src/types.ts:63`.
- Linked capture initializes `rectsBySelectionId` as `Record<string, PercentOverlayRect[]>` at `src/useTextSelection.ts:119`, converts local pixel rects to percent rects at `src/useTextSelection.ts:143`, and stores only those percent rects at `src/useTextSelection.ts:145` and `src/useTextSelection.ts:163`.
- `src/geometry.ts:16` converts `OverlayRect[]` to `PercentOverlayRect[]`; its comment at `src/geometry.ts:14` explicitly states the return is for linked controlled persistence to avoid writing pixel rects. `src/geometry.ts:35` converts percent rects back to pixel rects for transient UI only, with the comment at `src/geometry.ts:33` saying these should not be written back to controlled data.
- `Selection` renders persisted linked overlay by reading percent rects from `item.rectsBySelectionId[linkedContext.selectionId]` at `src/Selection.tsx:404` and converting them to transient pixels via `percentRectsToPixelRects` at `src/Selection.tsx:409`.
- Same-selection linked drag updates recalculate pixel rects transiently at `src/Selection.tsx:778`, convert to percent rects at `src/Selection.tsx:779`, and write percent rects back to `rectsBySelectionId` at `src/Selection.tsx:785`.

## Cross-Selection Item Fidelity

- A linked native selection is captured into one `LinkedSelectionRange` object returned as `item` at `src/useTextSelection.ts:156`; it contains one `id`, one `text`, one `start`, one `end`, one `createdAt`, and one `rectsBySelectionId` map at `src/useTextSelection.ts:157`.
- During capture, the code iterates all registered containers only to fill `rectsBySelectionId` by `selectionId` at `src/useTextSelection.ts:124`, `src/useTextSelection.ts:143`, and `src/useTextSelection.ts:145`; it does not create separate top-level items per container.
- Confirming a linked selection appends exactly one item with `items: [...linkedContext.data.items, linkedRange]` at `src/Selection.tsx:463` and selects that single item via `selectedRangeId: linkedRange.id` at `src/Selection.tsx:464`.
- The linked demo list maps one list row per `overallData.items` entry at `demo/src/App.tsx:861`; cross-selection spans are represented as a label `${r.start.selectionId}→${r.end.selectionId}` at `demo/src/App.tsx:864`, not as multiple rows/items.
- Task 9 manual QA evidence independently recorded that cross-Selection page-a→page-b creates exactly one linked item with `rectsBySelectionId` keys `page-a` and `page-b` in `.omo/evidence/task-9-manual-qa.md`.

## UI Scope

- `demo/src/App.tsx` updates are limited to showing linked state, linked controls, event logs, legacy compatibility, and the required JSON panel.
- The JSON inspector is a native collapsed `<details>` panel at `demo/src/App.tsx:1078` and pretty-prints `overallData` with `JSON.stringify(overallData, null, 2)` at `demo/src/App.tsx:1113`.
- No new UI library, design system, router/page framework, or unrelated app shell rewrite was introduced.

## Final Verdict

APPROVE — scope boundaries are respected. No dependency/test/page framework additions were found; legacy `SelectionRange` remains intact; linked controlled data persists percent rects rather than pixel rects; cross-Selection highlights are represented as exactly one top-level `LinkedSelectionRange` item; and UI changes are scoped to the linked-state/JSON demo needs.
