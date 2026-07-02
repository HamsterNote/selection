# Manual QA: Hide Popover During Text Selection

Date: 2026-06-27
URL: http://127.0.0.1:9536 (Vite demo, legacy panel)
Browser: Playwright Chromium (headless)

## Scenarios Verified

### S1 — Active selection popover hides during drag-select and reappears after mouseup
- **Before drag**: active text selection exists, `高亮` popover visible at top of selection.
- **During drag** (`popover-hide-active-during-drag.png`): text is highlighted (pink), `高亮` popover is NOT visible.
- **After mouseup** (`popover-hide-active-after-mouseup.png`): `高亮` popover reappears at top of selection.
- **Result**: PASS

### S2 — Clicking inside active selection popover does not flicker/hide it before action
- Popover button `高亮` is visible before click (`popover-hide-active-popover-button.png`).
- Clicking it converts the selection into a persisted highlight (`popover-hide-after-popover-click.png`); the popover disappears because the active selection is consumed, not because mousedown inside it triggered a hide.
- Unit test `S2.active-popover.clicking-inside-popover-does-not-hide` provides the precise no-flicker contract.
- **Result**: PASS

### S3 — Persisted range popover hides during a new text-selection drag
- **Before drag** (`popover-hide-persisted-before-drag.png`): persisted range highlighted (yellow), `删除` popover visible at top of range.
- **During new drag** (`popover-hide-persisted-during-drag.png`): persisted range still highlighted (yellow), new active selection in progress (pink), `删除` popover is NOT visible.
- **Result**: PASS

## Evidence Files

- `.omo/evidence/popover-hide-active-during-drag.png`
- `.omo/evidence/popover-hide-active-after-mouseup.png`
- `.omo/evidence/popover-hide-active-popover-button.png`
- `.omo/evidence/popover-hide-after-popover-click.png`
- `.omo/evidence/popover-hide-persisted-before-drag.png`
- `.omo/evidence/popover-hide-persisted-during-drag.png`
