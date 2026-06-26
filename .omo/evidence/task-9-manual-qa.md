# Task 9 Manual QA

## Screenshots
- `.omo/evidence/task-9-screenshots/00-initial.png`
- `.omo/evidence/task-9-screenshots/01-linked-cross-created.png`
- `.omo/evidence/task-9-screenshots/02-linked-active-drag-hidden.png`
- `.omo/evidence/task-9-screenshots/03-cross-deleted.png`
- `.omo/evidence/task-9-screenshots/03b-legacy-drag-selection.png`
- `.omo/evidence/task-9-screenshots/04-legacy-selected.png`
- `.omo/evidence/task-9-screenshots/05-final.png`

## QA Notes

### Initial layout

```json
{
  "url": "http://localhost:9536/",
  "detailsCollapsedByDefault": true
}
```

### Same-Selection linked highlight

```json
{
  "selectedText": "React 是一个",
  "itemCount": 1,
  "itemId": "hsn-sel-1782456418892-5px24p",
  "query": "document.querySelectorAll('svg rect[data-range-id=\"hsn-sel-1782456418892-5px24p\"]')",
  "rects": [
    {
      "rangeId": "hsn-sel-1782456418892-5px24p",
      "selectionId": "page-a",
      "className": "hsn-selection-rect hsn-selection-rect--highlight",
      "x": "0",
      "y": "5.00004403125",
      "width": "94.250106",
      "height": "16.9999828125"
    }
  ]
}
```

### Cross-region active-selection drag hides chrome

```json
{
  "handlesBefore": 2,
  "popoversBefore": 1,
  "handlesDuringDrag": 0,
  "popoversDuringDrag": 0
}
```

### Cross-Selection linked highlight

```json
{
  "selectedText": "将 UI 拆分为独立、可复用的组件。[1]组件化拆分 UI。React 使用Virtual DOM来高效更新 DOM。\nselectionId = \"page-b\"\nVue 是一套",
  "totalLinkedItems": 2,
  "itemId": "hsn-sel-1782456419763-538rps",
  "rectsBySelectionIdKeys": [
    "page-a",
    "page-b"
  ],
  "requiredDomQuery": "document.querySelectorAll('svg rect[data-range-id=\"hsn-sel-1782456419763-538rps\"]')",
  "distinctDataSelectionIds": [
    "page-a",
    "page-b"
  ],
  "rects": [
    {
      "rangeId": "hsn-sel-1782456419763-538rps",
      "selectionId": "page-a",
      "className": "hsn-selection-rect hsn-selection-rect--selected",
      "x": "151.99981799999998",
      "y": "33.7969115625",
      "width": "248.890662",
      "height": "16.9999828125"
    },
    {
      "rangeId": "hsn-sel-1782456419763-538rps",
      "selectionId": "page-a",
      "className": "hsn-selection-rect hsn-selection-rect--selected",
      "x": "0",
      "y": "61.59371465625",
      "width": "14.828172",
      "height": "15.000039375"
    },
    {
      "rangeId": "hsn-sel-1782456419763-538rps",
      "selectionId": "page-a",
      "className": "hsn-selection-rect hsn-selection-rect--selected",
      "x": "0",
      "y": "92.71875",
      "width": "69.062394",
      "height": "12.000031499999999"
    },
    {
      "rangeId": "hsn-sel-1782456419763-538rps",
      "selectionId": "page-a",
      "className": "hsn-selection-rect hsn-selection-rect--selected",
      "x": "14.828172",
      "y": "65.92191862499999",
      "width": "94.250106",
      "height": "16.9999828125"
    },
    {
      "rangeId": "hsn-sel-1782456419763-538rps",
      "selectionId": "page-a",
      "className": "hsn-selection-rect hsn-selection-rect--selected",
      "x": "120.07820400000001",
      "y": "64.9218541875",
      "width": "86.843658",
      "height": "16.9999828125"
    },
    {
      "rangeId": "hsn-sel-1782456419763-538rps",
      "selectionId": "page-a",
      "className": "hsn-selection-rect hsn-selection-rect--selected",
      "x": "217.92178800000002",
      "y": "65.92191862499999",
      "width": "137.78107799999998",
      "height": "16.9999828125"
    },
    {
      "rangeId": "hsn-sel-1782456419763-538rps",
      "selectionId": "page-b",
      "className": "hsn-selection-rect hsn-selection-rect--selected",
      "x": "0",
      "y": "5.0000494374999995",
      "width": "80.328042",
      "height": "16.999993765625"
    }
  ]
}
```

### Click page-b rect selects whole cross item

```json
{
  "itemId": "hsn-sel-1782456419763-538rps",
  "selectedRangeIdPresentInJson": true,
  "selectedRects": [
    {
      "selectionId": "page-a",
      "selected": true
    },
    {
      "selectionId": "page-a",
      "selected": true
    },
    {
      "selectionId": "page-a",
      "selected": true
    },
    {
      "selectionId": "page-a",
      "selected": true
    },
    {
      "selectionId": "page-a",
      "selected": true
    },
    {
      "selectionId": "page-a",
      "selected": true
    },
    {
      "selectionId": "page-b",
      "selected": true
    }
  ],
  "handleCountForCrossItem": 2
}
```

### Deleting selected cross item

```json
{
  "remainingLinkedItems": 1,
  "deletedItemVisibleRectCount": 0
}
```

### overallData JSON panel

```json
{
  "collapsedByDefault": true,
  "prettyPrintedHasNewlines": true,
  "requiredFieldsPresent": true,
  "sample": "{\n  \"items\": [\n    {\n      \"id\": \"hsn-sel-1782456418892-5px24p\",\n      \"text\": \"React 是一个\",\n      \"start\": {\n        \"selectionId\": \"page-a\",\n        \"offset\": 0\n      },\n      \"end\": {\n        \"selectionId\": \"page-a\",\n        \"offset\": 9\n      },\n      \"createdAt\": 1782456418892,\n      \"rectsBySelectionId\": {\n        \"page-a\": [\n          {\n            \"x\": 0,\n            \"y\": 5.3927,\n            \"width\": 23.4453,\n            \"height\": 18.335\n          }\n        ]\n      }\n    }\n  ],\n  \"selected"
}
```

### Legacy real-drag selection survives mouseup

```json
{
  "selectedText": "这里也有一些相对定位元素OLD用于继续测试坐标计算。",
  "activeRects": 4,
  "handleCount": 2,
  "popoverCount": 1
}
```

### Legacy compatibility flow

```json
{
  "selectedText": "此面板使用旧版",
  "legacyCountHeadingAfterCreate": "Legacy 高亮（1）",
  "legacyRangeId": "hsn-sel-1782456424490-z52jgu",
  "selectedRects": [
    {
      "selectionId": "",
      "selected": true
    }
  ],
  "popoverDeleteVisible": true,
  "sameItemHandleCount": 2,
  "visibleRectCountAfterDelete": 0
}
```

## Result

PASS: linked same-Selection, linked cross-Selection, cross-region active-selection drag chrome hiding, JSON panel, deletion, cross-region handles visible when selected, legacy real-drag selection survival, and legacy highlight/delete flow were exercised in browser.
