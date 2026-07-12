from pathlib import Path
from playwright.sync_api import sync_playwright, expect


BASE_URL = "http://localhost:9536/"
EVIDENCE_DIR = Path(".omo/evidence")
SCREENSHOT_DIR = EVIDENCE_DIR / "task-9-screenshots"
REPORT_PATH = EVIDENCE_DIR / "task-9-manual-qa.md"


def add_note(notes, title, data):
    notes.append((title, data))


def selection_script(start_text, start_offset, end_text, end_offset):
    return """
    ([startText, startOffset, endText, endOffset]) => {
      const textNodes = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      function locate(needle, offset) {
        const node = textNodes.find((n) => n.nodeValue && n.nodeValue.includes(needle));
        if (!node) throw new Error(`Text not found: ${needle}`);
        return { node, offset: node.nodeValue.indexOf(needle) + offset };
      }

      const start = locate(startText, startOffset);
      const end = locate(endText, endOffset);
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      return sel.toString();
    }
    """


def select_text(page, start_text, start_offset, end_text=None, end_offset=None):
    if end_text is None:
        end_text = start_text
    if end_offset is None:
        end_offset = len(start_text)
    selected = page.evaluate(
        selection_script(start_text, start_offset, end_text, end_offset),
        [start_text, start_offset, end_text, end_offset],
    )
    page.wait_for_timeout(250)
    # 触发容器 mouseup，让 Selection 内部设置 selectionPopoverReady，
    # 从而正确渲染活跃选区 Popover（真实用户拖拽选区也会走这条路径）。
    page.evaluate("""
      () => {
        const container = document.querySelector('.hsn-selection-container');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        container.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 10,
          clientY: rect.top + 10,
          view: window,
        }));
      }
    """)
    page.wait_for_timeout(100)
    return selected


def open_json_panel(page):
    details = page.locator("details").last
    if not details.evaluate("el => el.open"):
        details.locator("summary").click()
    page.wait_for_timeout(100)
    return page.locator("details pre").inner_text()


def linked_items(page):
    text = open_json_panel(page)
    import json
    return json.loads(text)["items"]


def rect_summary(page, item_id):
    query = f'document.querySelectorAll(\'svg rect[data-range-id="{item_id}"]\')'
    result = page.evaluate(
        """
        (id) => Array.from(document.querySelectorAll(`svg rect[data-range-id="${id}"]`)).map((rect) => ({
          rangeId: rect.getAttribute('data-range-id'),
          selectionId: rect.getAttribute('data-selection-id'),
          className: rect.getAttribute('class'),
          x: rect.getAttribute('x'),
          y: rect.getAttribute('y'),
          width: rect.getAttribute('width'),
          height: rect.getAttribute('height'),
        }))
        """,
        item_id,
    )
    return query, result


def click_rect_center(page, item_id, selection_id):
    box = page.evaluate(
        """
        ([id, selectionId]) => {
          const rect = document.querySelector(`svg rect[data-range-id="${id}"][data-selection-id="${selectionId}"]`);
          if (!rect) throw new Error(`Missing rect ${id}/${selectionId}`);
          const box = rect.getBoundingClientRect();
          return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        }
        """,
        [item_id, selection_id],
    )
    page.mouse.click(box["x"], box["y"])
    page.wait_for_timeout(250)


def button_by_text(page, text):
    return page.get_by_role("button", name=text).first


def element_center(page, selector):
    box = page.locator(selector).first.bounding_box()
    assert box, f"Missing box for {selector}"
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def start_drag_first_handle(page):
    x, y = element_center(page, ".hsn-selection-handle")
    page.mouse.move(x, y)
    page.mouse.down()
    page.wait_for_timeout(100)


def clear_active_selection(page):
    # 清除浏览器原生选区，避免后续点击高亮 rect 时被活跃选区逻辑拦截。
    page.evaluate("() => { window.getSelection()?.removeAllRanges(); document.dispatchEvent(new Event('selectionchange')); }")
    page.wait_for_timeout(150)


def delete_linked_list_item(page, item_text):
    item = page.locator("li").filter(has_text=item_text[:20]).first
    item.get_by_role("button", name="删除").click()
    page.wait_for_timeout(300)


def drag_select_legacy(page):
    """在 legacy 面板内执行真实鼠标拖拽选区，返回选中的文本。"""
    el = page.locator("text=旧版（非联动）").first
    box = el.bounding_box()
    assert box, "legacy text not found"
    start_x = box["x"] + 5
    start_y = box["y"] + box["height"] / 2
    end_x = box["x"] + box["width"] - 5
    end_y = start_y
    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.wait_for_timeout(100)
    page.mouse.move(end_x, end_y)
    page.wait_for_timeout(100)
    page.mouse.up()
    page.wait_for_timeout(300)
    return page.evaluate("""() => window.getSelection().toString()""")


def main():
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    notes = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 1100})
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")
        page.screenshot(path=str(SCREENSHOT_DIR / "00-initial.png"), full_page=True)

        details_closed = page.locator("details").last.evaluate("el => !el.open")
        add_note(notes, "Initial layout", {"url": BASE_URL, "detailsCollapsedByDefault": details_closed})

        selected = select_text(page, "React 是一个", 0)
        button_by_text(page, "高亮选中（page-a）").click()
        page.wait_for_timeout(300)
        same_items = linked_items(page)
        assert len(same_items) == 1, same_items
        same_id = same_items[0]["id"]
        same_query, same_rects = rect_summary(page, same_id)
        assert {r["selectionId"] for r in same_rects} == {"page-a"}, same_rects
        add_note(notes, "Same-Selection linked highlight", {
            "selectedText": selected,
            "itemCount": len(same_items),
            "itemId": same_id,
            "query": same_query,
            "rects": same_rects,
        })

        selected = select_text(page, "将 UI", 0, "Vue 是一套", len("Vue 是一套"))
        button_by_text(page, "高亮选中（page-a）").click()
        page.wait_for_timeout(300)
        cross_items = linked_items(page)
        assert len(cross_items) == 2, cross_items
        cross_item = [item for item in cross_items if item["id"] != same_id][0]
        cross_id = cross_item["id"]
        cross_query, cross_rects = rect_summary(page, cross_id)
        cross_selection_ids = sorted({r["selectionId"] for r in cross_rects})
        assert cross_selection_ids == ["page-a", "page-b"], cross_rects
        assert sorted(cross_item["rectsBySelectionId"].keys()) == ["page-a", "page-b"], cross_item
        page.screenshot(path=str(SCREENSHOT_DIR / "01-linked-cross-created.png"), full_page=True)

        # 跨区域活跃选区拖拽：拖动手柄时，所有关联容器中的活跃选区手柄与 Popover 都应隐藏。
        select_text(page, "React 是一个", 0, "Vue 是一套", len("Vue 是一套"))
        page.wait_for_timeout(300)
        active_handles_before = page.locator(".hsn-selection-handle").count()
        active_popovers_before = page.locator(".hsn-selection-popover").count()
        assert active_handles_before >= 1, active_handles_before
        assert active_popovers_before >= 1, active_popovers_before
        try:
            start_drag_first_handle(page)
            active_handles_during = page.locator(".hsn-selection-handle").count()
            active_popovers_during = page.locator(".hsn-selection-popover").count()
            assert active_handles_during == 0, active_handles_during
            assert active_popovers_during == 0, active_popovers_during
            page.screenshot(path=str(SCREENSHOT_DIR / "02-linked-active-drag-hidden.png"), full_page=True)
            add_note(notes, "Cross-region active-selection drag hides chrome", {
                "handlesBefore": active_handles_before,
                "popoversBefore": active_popovers_before,
                "handlesDuringDrag": active_handles_during,
                "popoversDuringDrag": active_popovers_during,
            })
        finally:
            page.mouse.up()
            page.wait_for_timeout(200)
        clear_active_selection(page)

        add_note(notes, "Cross-Selection linked highlight", {
            "selectedText": selected,
            "totalLinkedItems": len(cross_items),
            "itemId": cross_id,
            "rectsBySelectionIdKeys": sorted(cross_item["rectsBySelectionId"].keys()),
            "requiredDomQuery": cross_query,
            "distinctDataSelectionIds": cross_selection_ids,
            "rects": cross_rects,
        })

        click_rect_center(page, cross_id, "page-b")
        selected_rects = page.evaluate(
            """
            (id) => Array.from(document.querySelectorAll(`svg rect[data-range-id="${id}"]`)).map((rect) => ({
              selectionId: rect.getAttribute('data-selection-id'),
              selected: rect.getAttribute('class').includes('hsn-selection-rect--selected'),
            }))
            """,
            cross_id,
        )
        selected_json = open_json_panel(page)
        handle_count_cross = page.locator(".hsn-selection-handle").count()
        assert all(r["selected"] for r in selected_rects), selected_rects
        assert handle_count_cross == 2, handle_count_cross
        add_note(notes, "Click page-b rect selects whole cross item", {
            "itemId": cross_id,
            "selectedRangeIdPresentInJson": f'"selectedRangeId": "{cross_id}"' in selected_json,
            "selectedRects": selected_rects,
            "handleCountForCrossItem": handle_count_cross,
        })

        delete_linked_list_item(page, cross_item["text"])
        after_delete_items = linked_items(page)
        deleted_rect_count = page.evaluate(
            '(id) => document.querySelectorAll(`svg rect[data-range-id="${id}"]`).length',
            cross_id,
        )
        assert len(after_delete_items) == 1, after_delete_items
        assert deleted_rect_count == 0, deleted_rect_count
        page.screenshot(path=str(SCREENSHOT_DIR / "03-cross-deleted.png"), full_page=True)
        add_note(notes, "Deleting selected cross item", {
            "remainingLinkedItems": len(after_delete_items),
            "deletedItemVisibleRectCount": deleted_rect_count,
        })

        pretty_json = open_json_panel(page)
        add_note(notes, "overallData JSON panel", {
            "collapsedByDefault": details_closed,
            "prettyPrintedHasNewlines": "\n  \"items\"" in pretty_json,
            "requiredFieldsPresent": all(field in pretty_json for field in ["items", "selectedRangeId", "selectionOrder", "rectsBySelectionId", "createdAt"]),
            "sample": pretty_json[:500],
        })

        page.get_by_label("显示 legacy 兼容面板").check()
        page.wait_for_timeout(150)

        # 真实拖拽选区：验证 mouseup 后活跃选区不会消失（regression 防护）。
        drag_selected = drag_select_legacy(page)
        assert drag_selected.strip(), drag_selected
        active_rects_after_drag = page.locator("svg rect.hsn-selection-rect--active").count()
        drag_handles = page.locator(".hsn-selection-handle").count()
        drag_popovers = page.locator(".hsn-selection-popover").count()
        assert active_rects_after_drag >= 1, active_rects_after_drag
        assert drag_handles >= 2, drag_handles
        assert drag_popovers >= 1, drag_popovers
        page.screenshot(path=str(SCREENSHOT_DIR / "03b-legacy-drag-selection.png"), full_page=True)
        add_note(notes, "Legacy real-drag selection survives mouseup", {
            "selectedText": drag_selected,
            "activeRects": active_rects_after_drag,
            "handleCount": drag_handles,
            "popoverCount": drag_popovers,
        })
        clear_active_selection(page)

        selected = select_text(page, "此面板使用旧版", 0)
        button_by_text(page, "高亮选中（legacy）").click()
        page.wait_for_timeout(300)
        legacy_count_text = page.locator("h2", has_text="Legacy 高亮").inner_text()
        legacy_rects = page.evaluate(
            """
            () => Array.from(document.querySelectorAll('svg rect[data-range-id]:not([data-range-id=""])')).filter((rect) => rect.getAttribute('data-selection-id') === '').map((rect) => ({
              rangeId: rect.getAttribute('data-range-id'),
              selectionId: rect.getAttribute('data-selection-id'),
              className: rect.getAttribute('class'),
            }))
            """
        )
        assert legacy_rects, legacy_rects
        legacy_id = legacy_rects[0]["rangeId"]
        click_rect_center(page, legacy_id, "")
        legacy_selected_rects = page.evaluate(
            """
            (id) => Array.from(document.querySelectorAll(`svg rect[data-range-id="${id}"]`)).map((rect) => ({
              selectionId: rect.getAttribute('data-selection-id'),
              selected: rect.getAttribute('class').includes('hsn-selection-rect--selected'),
            }))
            """,
            legacy_id,
        )
        legacy_handle_count = page.locator(".hsn-selection-handle").count()
        legacy_popover_delete_visible = page.locator(".hsn-selection-popover button", has_text="删除").count() > 0
        assert all(r["selected"] for r in legacy_selected_rects), legacy_selected_rects
        assert legacy_handle_count == 2, legacy_handle_count
        assert legacy_popover_delete_visible
        page.screenshot(path=str(SCREENSHOT_DIR / "04-legacy-selected.png"), full_page=True)
        page.locator(".hsn-selection-popover button", has_text="删除").first.click()
        page.wait_for_timeout(300)
        legacy_deleted_rect_count = page.evaluate(
            '(id) => document.querySelectorAll(`svg rect[data-range-id="${id}"]`).length',
            legacy_id,
        )
        assert legacy_deleted_rect_count == 0, legacy_deleted_rect_count
        add_note(notes, "Legacy compatibility flow", {
            "selectedText": selected,
            "legacyCountHeadingAfterCreate": legacy_count_text,
            "legacyRangeId": legacy_id,
            "selectedRects": legacy_selected_rects,
            "popoverDeleteVisible": legacy_popover_delete_visible,
            "sameItemHandleCount": legacy_handle_count,
            "visibleRectCountAfterDelete": legacy_deleted_rect_count,
        })

        page.screenshot(path=str(SCREENSHOT_DIR / "05-final.png"), full_page=True)
        browser.close()

    lines = [
        "# Task 9 Manual QA",
        "",
        "## Screenshots",
        "- `.omo/evidence/task-9-screenshots/00-initial.png`",
        "- `.omo/evidence/task-9-screenshots/01-linked-cross-created.png`",
        "- `.omo/evidence/task-9-screenshots/02-linked-active-drag-hidden.png`",
        "- `.omo/evidence/task-9-screenshots/03-cross-deleted.png`",
        "- `.omo/evidence/task-9-screenshots/03b-legacy-drag-selection.png`",
        "- `.omo/evidence/task-9-screenshots/04-legacy-selected.png`",
        "- `.omo/evidence/task-9-screenshots/05-final.png`",
        "",
        "## QA Notes",
    ]
    import json
    for title, data in notes:
        lines.extend(["", f"### {title}", "", "```json", json.dumps(data, ensure_ascii=False, indent=2), "```"])
    lines.extend(["", "## Result", "", "PASS: linked same-Selection, linked cross-Selection, cross-region active-selection drag chrome hiding, JSON panel, deletion, cross-region handles visible when selected, legacy real-drag selection survival, and legacy highlight/delete flow were exercised in browser.", ""])
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
