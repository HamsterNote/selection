# F3 Manual QA Evidence

Verdict: APPROVE

## Environment

- Command: `PORT=9536 npm run dev -- --host 127.0.0.1`
- URL loaded in browser: `http://localhost:9536/`
- Readiness URL: `http://127.0.0.1:9536/`
- Browser: Playwright Chromium, headless
- Viewport: `1440x1100`
- Source inspected first: `demo/src/App.tsx`

## Screenshots

- Loaded Demo: `.omo/evidence/f3-screenshots/01-loaded.png`
- Same-page linked highlight: `.omo/evidence/f3-screenshots/02-same-page-highlight.png`
- Cross-page linked highlight: `.omo/evidence/f3-screenshots/03-cross-page-highlight.png`
- Cross item selected from `page-b`: `.omo/evidence/f3-screenshots/04-cross-selected-from-page-b.png`
- Cross item deleted: `.omo/evidence/f3-screenshots/05-cross-deleted.png`
- Expanded JSON panel: `.omo/evidence/f3-screenshots/06-json-expanded.png`
- Legacy verified: `.omo/evidence/f3-screenshots/07-legacy-verified.png`

## Scenario Results

1. Loaded the Demo via `npm run dev`: PASS.
2. Created a same-Selection highlight in `page-a`: PASS.
   - Linked item count after creation: `1`.
   - Same item id: `hsn-sel-1782308237064-47aatc`.
   - Same item text: `React 是一个`.
   - `rectsBySelectionId` keys: `page-a`.
3. Created a cross-Selection highlight from `page-a` to `page-b`: PASS.
   - Total linked item count after creation: `2`.
   - Exactly one new cross item found with both `page-a` and `page-b` rect groups.
   - Cross item id: `hsn-sel-1782308237709-sopxvn`.
   - Cross item endpoints: `start.selectionId=page-a`, `start.offset=77`, `end.selectionId=page-b`, `end.offset=88`.
4. Clicked a `page-b` rect of the cross item: PASS.
   - `overallData.selectedRangeId` became `hsn-sel-1782308237709-sopxvn`.
   - Selected rect summary contained both `page-a` and `page-b` segments.
5. Confirmed the cross item has no draggable handles: PASS.
   - Query for selected persisted handle buttons returned `[]`.
6. Deleted the selected cross item: PASS.
   - `selectedRangeId` before delete: `hsn-sel-1782308237709-sopxvn`.
   - Post-delete query for the cross id returned `[]`.
   - Remaining linked data no longer contained the cross item id.
7. Expanded the bottom JSON panel: PASS.
   - JSON included `items`, `selectedRangeId`, and `selectionOrder`.
   - Per-item fields included `id`, `text`, `start.selectionId`, `start.offset`, `end.selectionId`, `end.offset`, `createdAt`, and `rectsBySelectionId`.
8. Toggled the legacy panel and created a legacy highlight: PASS.
   - Legacy item id: `hsn-sel-1782308240093-kcr0zu`.
   - Selection/popover/global delete path worked.
   - Handle query returned two persisted handle buttons: `拖动以调整高亮起点` and `拖动以调整高亮终点`.
   - Post-delete rect count for the legacy id: `0`.

## DOM Query Evidence

```json
{
  "query": "svg rect[data-range-id=\"hsn-sel-1782308237709-sopxvn\"]",
  "count": 21,
  "distinctSelectionIds": ["page-a", "page-b"],
  "sampleRects": [
    {
      "rangeId": "hsn-sel-1782308237709-sopxvn",
      "selectionId": "page-a",
      "x": "30.828174",
      "y": "65.92191862499999",
      "width": "78.250104",
      "height": "16.9999828125"
    },
    {
      "rangeId": "hsn-sel-1782308237709-sopxvn",
      "selectionId": "page-b",
      "x": "0",
      "y": "0",
      "width": "402",
      "height": "124.515625"
    }
  ]
}
```

```json
{
  "query": "selected persisted handle buttons after selecting cross item",
  "result": []
}
```

```json
{
  "query": "postDelete svg rect[data-range-id=\"hsn-sel-1782308237709-sopxvn\"]",
  "result": []
}
```

```json
{
  "legacy": {
    "legacyId": "hsn-sel-1782308240093-kcr0zu",
    "handles": [
      {
        "aria": "拖动以调整高亮起点",
        "className": "hsn-selection-handle hsn-selection-handle--start"
      },
      {
        "aria": "拖动以调整高亮终点",
        "className": "hsn-selection-handle hsn-selection-handle--end"
      }
    ],
    "postDeleteRectCount": 0
  }
}
```

## JSON Panel Evidence

After deleting the cross item and expanding the JSON panel, the rendered JSON was parseable and contained:

```json
{
  "items": [
    {
      "id": "hsn-sel-1782308237064-47aatc",
      "text": "React 是一个",
      "start": { "selectionId": "page-a", "offset": 0 },
      "end": { "selectionId": "page-a", "offset": 9 },
      "createdAt": 1782308237064,
      "rectsBySelectionId": {
        "page-a": [{ "x": 0, "y": 5.3927, "width": 23.4453, "height": 18.335 }]
      }
    }
  ],
  "selectedRangeId": null,
  "selectionOrder": ["page-a", "page-b"]
}
```

## Notes

- No source code was modified.
- Temporary Playwright automation was kept outside the repo at `/tmp/opencode/f3_manual_qa.py`.
- Raw automation result was written outside the repo at `/tmp/opencode/f3_manual_qa_results.json`.
