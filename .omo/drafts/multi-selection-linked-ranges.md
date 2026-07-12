# multi-selection-linked-ranges Draft

status: awaiting-approval
pending_action: write `.omo/plans/multi-selection-linked-ranges.md` after explicit user approval
intent: clear
classify: architecture

## User Request

支持跨多个 Selection 区域选择文字；单个 Selection 内 SVG 以百分比形式存放图形大小和定位；多个 Selection 的受控数据统一使用一份，在需要联动时使用；增加标记 Selection id 的 prop 和标记多个 Selection 联动状态的布尔 prop；每个 Selection 从外部数据中取出自己需要的内部部分；高亮选中时区分标记；跨 Selection 选择文字时每次选择是 1 条数据，标记起始结束位置；Range 图形按 id 区分 map，每个页面 id 下有自己的 Range 图形数据；Demo 最底部展示当前整体数据，默认收缩，可点击展开查看，JSON 格式化。

## Components Ledger

- C1 types-api: extend public data model and props without breaking current single-Selection usage. Evidence: `src/types.ts` defines `SelectionRange`, `OverlayRect`, `SelectionProps`, and exported public types.
- C2 selection-core: update Selection to filter unified controlled data by page/selection id, emit scoped callbacks, and store/render SVG geometry by selection id. Evidence: `src/Selection.tsx` owns props, `handleConfirm`, `recomputePersistedRects`, SVG rect rendering, hit testing, handle dragging.
- C3 selection-hook: support active selection state for same-container and linked multi-container flows. Evidence: `src/useTextSelection.ts` currently rejects selections whose `range.commonAncestorContainer` is not inside one container.
- C4 demo: demonstrate multiple pages/Selection instances sharing one controlled data object and expose formatted collapsed JSON at the bottom. Evidence: `demo/src/App.tsx` currently has one `ranges` array, one `selectedRangeId`, one `Selection` instance, and no JSON viewer.
- C5 validation: no automated tests exist; use existing scripts and manual Demo QA. Evidence: `package.json` has `build`, `build:demo`, `lint`, `typecheck`, no `test`; no `*.test.*`/`*.spec.*` files found.

## Discovered Facts

- Current range model is flat: `SelectionRange` has `id`, `text`, `start`, `end`, `createdAt` only.
- Current component API is controlled but single-region scoped: `ranges: SelectionRange[]`, `selectedRangeId?: string | null`, `onSelect`, `onSelectRange`, `onUpdateRange`.
- Current SVG overlay renders `<rect>` with pixel `x`, `y`, `width`, `height` from `Range.getClientRects()`.
- Current `useTextSelection` only accepts selections whose `commonAncestorContainer` is inside the current container, so browser-native cross-page selections are currently ignored by each Selection.
- Current hit testing and handles use pixel rects in component state; any stored percentage geometry must still be convertible to pixels for pointer hit testing and handle placement.
- Demo already has controlled list/delete/update UI, logs, marker color presets, custom handle controls, and one `selectionRef`.
- There is no test infra; plan should not add a full test framework unless explicitly requested because the existing project relies on type/build/lint scripts.

## Adopted Defaults

- Preserve backward compatibility: existing single Selection usage with `ranges: SelectionRange[]` remains valid when `selectionId`/linked mode is omitted.
- Add new multi-selection data types rather than replacing `SelectionRange[]` outright: use a unified controlled data object keyed by Selection id/page id, with adapters inside `Selection`.
- Store SVG geometry as percentages in controlled data, but compute ephemeral pixel rects inside `Selection` for hit testing, popover anchors, and handles.
- Represent cross-Selection highlight as one top-level record with one generated id, `start` and `end` endpoints carrying `selectionId` plus local offsets, and `rectsBySelectionId`/page map for visual geometry.
- For linked mode, `Selection` filters external unified data by its own `selectionId`; non-linked mode behaves as now.
- Demo should show at least two Selection/page panels to prove cross-Selection shared state, plus the existing single-range interactions where feasible.
- JSON inspector goes at the very bottom, collapsed by default via `<details>`, using `JSON.stringify(data, null, 2)`.

## Plan Approach Pending Approval

1. Scaffold the plan with `node /home/zhangxiao/.cache/opencode/packages/oh-my-openagent@latest/node_modules/oh-my-openagent/dist/skills/ulw-plan/scripts/scaffold-plan.mjs multi-selection-linked-ranges --clear`.
2. Run mandatory Metis gap review before finalizing todos.
3. Append todos covering public types, scoped Selection filtering/emission, percentage geometry conversion, cross-Selection aggregation, Demo refactor, JSON inspector, and verification.
4. Verification strategy: `npm run typecheck`, `npm run build`, `npm run build:demo`, and manual Demo QA instructions because no automated tests exist.

## Approval Gate Brief

If approved, the plan will instruct the worker to implement a backward-compatible multi-Selection API centered on `selectionId` and `linkedSelections`, add unified controlled data types keyed by Selection/page id, store SVG rect geometry in percentages, keep internal pixel geometry for interactions, and update the Demo with multiple pages plus a collapsed formatted JSON data panel.

Open user decision: none blocking. Recommended defaults above will be used unless the user changes scope before approval.
