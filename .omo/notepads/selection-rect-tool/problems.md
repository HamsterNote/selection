# selection-rect-tool Problems

## Known Risks
- Tight coupling of text selection in `Selection.tsx` may make rect gating error-prone.
- Existing handle drag path uses `caretInfoFromPoint` and DOM Range; rect handles need a separate geometry-only path.
- Must ensure pointer-events remain none on rect overlays.

## Mitigations
- Add comprehensive regression tests before and after changes.
- Keep existing text tests passing.
