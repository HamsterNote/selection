# selection-rect-tool Decisions

## Architectural
- `SelectionTool = 'text' | 'rect'`; default is `'text'` when omitted.
- `SelectionRect` has `id`, `createdAt`, `overlayRectType`, `start`, `end`, `rect` (OverlayRect or PercentOverlayRect), plus optional `selectionId`, `markerStyle`, `selectionStyle`.
- `HandleRenderProps` extended with `target: 'text' | 'rect'` and `rectId: string | null` (non-breaking extras).
- `SelectionRef` gets `confirm()` (tool-dispatching) and `confirmRect()` (rect-only).

## State Separation
- Rect callbacks (`onCreateRect`, `onSelectRect`, `onUpdateRect`) must never call text callbacks.
- Text callbacks (`onSelect`, `onHighlight`, `onSelectionStart`, `onSelectionEnd`, `onUpdateRange`) must never fire for rect operations.
- Mutual exclusion: starting text clears selected rect; starting rect clears selected text.
