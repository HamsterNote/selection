import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const selectionStyles = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

describe('touch text selection styles', () => {
  it('keeps the content selectable when the primary pointer is coarse', () => {
    // Given: Selection 的基础内容层允许浏览器完成文本命中。
    expect(selectionStyles).toMatch(
      /\.hsn-selection-content\s*\{[^}]*user-select:\s*text;[^}]*-webkit-user-select:\s*text;/s,
    );

    // When: 设备以触摸粗指针作为主要输入。
    // Then: 不得覆盖为 none，否则旧版 WebKit 的 caretRangeFromPoint 会返回 null。
    expect(selectionStyles).not.toMatch(
      /@media\s*\(pointer:\s*coarse\)\s*\{[^}]*\.hsn-selection-content\s*\{[^}]*-webkit-user-select:\s*none;/s,
    );
  });

  it('hides native selection paint and keeps custom popover text non-selectable', () => {
    // Given: Selection 使用自定义 Overlay、Handle 与 Popover 呈现移动端选区。
    // When: 浏览器准备绘制原生选区或在 Popover 内启动文字选择。
    // Then: 原生高亮透明，且 WebKit 不得选择 Popover 文本或显示触摸呼出菜单。
    expect(selectionStyles).toMatch(
      /\.hsn-selection-content::selection,[^{]*\{[^}]*background:\s*transparent;/s,
    );
    expect(selectionStyles).toMatch(
      /\.hsn-selection-popover\s*\{[^}]*user-select:\s*none;[^}]*-webkit-user-select:\s*none;[^}]*-webkit-touch-callout:\s*none;/s,
    );
  });

  it('reserves touch gestures for rectangle drawing while the rect tool is active', () => {
    // Given: the rectangle tool draws from pointerdown through pointerup on the content layer.
    // When: a touch pointer moves across that layer.
    // Then: browser panning must not cancel the drawing pointer sequence.
    expect(selectionStyles).toMatch(
      /\.hsn-selection-container--rect-tool\s+\.hsn-selection-content\s*\{[^}]*touch-action:\s*none;/s,
    );
  });
});
