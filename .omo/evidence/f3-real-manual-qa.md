# F3 Real Manual QA — Selection Rect Tool

## Verdict

APPROVE

## Commands Run

```bash
npm run dev -- --host 127.0.0.1 --port 9536 > /tmp/selection-f3-vite.log 2>&1 & printf '%s' $!
# PID: 249727

node .omo/evidence/selection-rect-tool-final-qa.mjs

node -e "require('node:fs').copyFileSync('.omo/evidence/selection-rect-tool-final.png', '.omo/evidence/f3-real-manual-qa.png')"
```

## Browser QA Evidence

- Demo URL opened successfully: `http://127.0.0.1:9536`.
- Final screenshot saved to: `.omo/evidence/f3-real-manual-qa.png`.
- Existing independent QA script used: `.omo/evidence/selection-rect-tool-final-qa.mjs`.
- The script also refreshed prior evidence at `.omo/evidence/selection-rect-tool-final.md` and `.omo/evidence/selection-rect-tool-final.png`.

## Observed Behavior

Playwright output from the browser run:

```text
opened http://127.0.0.1:9536
default tool is text
enabled legacy panel for rect/text demo QA
switched to rect tool
popover click protection: drew and confirmed rect; Rect 高亮 count is 1
selected persisted rect and deleted it via popover delete button
px overlayRectType: drew and confirmed rect; Rect 高亮 count is 1
percent overlayRectType: drew and confirmed rect; Rect 高亮 count is 2
start handle: resized via handle drag (-18, -12)
end handle: resized via handle drag (22, 18)
switched back to text tool
text tool: created legacy text highlight; Legacy 高亮 count is 1
saved screenshot: /home/zhangxiao/frontend/HamsterNote/selection/.omo/evidence/selection-rect-tool-final.png
QA notes written to /home/zhangxiao/frontend/HamsterNote/selection/.omo/evidence/selection-rect-tool-final.md
```

Scenario checklist:

- [x] Default tool is text.
- [x] Rect tool draws and confirms a rectangle.
- [x] Persisted rect can be selected and deleted.
- [x] `overlayRectType="px"` works.
- [x] `overlayRectType="percent"` works.
- [x] Start handle resizes a selected rect.
- [x] End handle resizes a selected rect.
- [x] Popover click protection works: confirming via popover preserves the active rect long enough to persist it.
- [x] Switching back to text still permits/highlights text selection.

## Notes

- The legacy compatibility panel must be enabled for this QA because the demo's rect tool wiring is attached to the legacy `Selection` instance.
- No scenario failed during the browser run, so the final verdict is APPROVE.
