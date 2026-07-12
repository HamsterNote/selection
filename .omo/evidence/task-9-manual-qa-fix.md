# Task 9 Manual QA Fix — Cross-Selection Text Filtering

```json
{
  "url": "http://127.0.0.1:9536/",
  "browser": "/home/zhangxiao/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
  "nativeSelectionContainedInterstitialLabel": true,
  "linkedItemTextContainsInterstitialLabel": false,
  "linkedItemText": "将 UI 拆分为独立、可复用的组件。[1]组件化拆分 UI。React 使用Virtual DOM来高效更新 DOM。高亮Vue 是一套",
  "sanitizedJsonSnippet": {
    "id": "hsn-sel-1782309510394-exkllo",
    "text": "将 UI 拆分为独立、可复用的组件。[1]组件化拆分 UI。React 使用Virtual DOM来高效更新 DOM。高亮Vue 是一套",
    "start": {
      "selectionId": "page-a",
      "offset": 47
    },
    "end": {
      "selectionId": "page-b",
      "offset": 7
    },
    "rectsBySelectionIdKeys": [
      "page-a",
      "page-b"
    ]
  },
  "distinctDataSelectionIds": [
    "page-a",
    "page-b"
  ]
}
```

PASS: Cross-container linked highlight was re-tested in a real browser. The native selection still crosses interstitial Demo label text, but `overallData.items[0].text` excludes `selectionId = "page-b"` and keeps rect geometry for both `page-a` and `page-b`.
