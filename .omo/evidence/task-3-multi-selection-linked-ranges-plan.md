# Task 3 Evidence — Multi-selection Linked Ranges

## Typecheck

Command:

```bash
npm run typecheck
```

Output:

```text
> @hamster-note/selection@0.0.0 typecheck
> tsc -b --noEmit
```

Result: passed.

## DOM Assertion Note

With static linked data, a `Selection` rendered with `linkedMode` and `selectionId="page-a"` derives visible items only when their endpoints or `rectsBySelectionId` include `page-a`, converts only `rectsBySelectionId["page-a"]` through `percentRectsToPixelRects`, and emits SVG rects with `data-range-id={item.id}` plus `data-selection-id="page-a"`. Geometry for other Selection ids is not rendered by this component.
