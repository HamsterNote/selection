/// <reference types="vitest/globals" />
import { act, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { Selection } from './Selection';
import { SelectionMagnifier } from './SelectionMagnifier';
import type { SelectionRange } from './types';

const TEXT_RECT = new DOMRect(40, 30, 80, 24);

function makeDomRectList(rects: readonly DOMRect[]): DOMRectList {
  return Object.assign([...rects], {
    item: (index: number): DOMRect | null => rects[index] ?? null,
  });
}

function selectedRange(): SelectionRange {
  return {
    id: 'selected-range',
    text: 'Magnifier',
    start: 0,
    end: 9,
    createdAt: 1,
    overlayRectType: 'px',
    rects: [{ x: 40, y: 30, width: 80, height: 24 }],
  };
}

function renderSelectedRange(showSelectionMagnifier?: boolean): HTMLElement {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: vi.fn(() => makeDomRectList([TEXT_RECT])),
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: vi.fn(() => TEXT_RECT),
  });
  const view = render(
    <Selection
      ranges={[selectedRange()]}
      selectedRangeId="selected-range"
      onSelectRange={vi.fn()}
      showSelectionMagnifier={showSelectionMagnifier}
    >
      Magnifier selection fixture
    </Selection>,
  );
  return view.container;
}

function dispatchPointerMove(clientX: number, clientY: number): void {
  const event = new MouseEvent('pointermove', {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  document.dispatchEvent(event);
}

describe('Selection magnifier', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render while dragging when the opt-in prop is omitted', () => {
    // Given: 默认配置和一个已选中的文本 range。
    const container = renderSelectedRange();
    const handle = container.querySelector('.hsn-selection-handle--start');
    if (!(handle instanceof HTMLElement)) throw new TypeError('Expected start handle');

    // When: 开始拖动文本手柄。
    fireEvent.pointerDown(handle);

    // Then: 默认关闭，不创建 portal surface。
    expect(document.querySelector('.hsn-selection-magnifier')).toBeNull();
  });

  it('renders only for the duration of an enabled text-handle drag', () => {
    // Given: 显式开启放大镜。
    const container = renderSelectedRange(true);
    const handle = container.querySelector('.hsn-selection-handle--start');
    if (!(handle instanceof HTMLElement)) throw new TypeError('Expected start handle');
    vi.spyOn(handle, 'getBoundingClientRect').mockReturnValue(new DOMRect(26, 18, 28, 36));

    // When: 按下文本手柄。
    fireEvent.pointerDown(handle, { clientX: 40, clientY: 42 });

    // Then: body portal 中出现放大镜和内容快照。
    const magnifier = document.querySelector('.hsn-selection-magnifier');
    expect(magnifier).not.toBeNull();
    expect(magnifier?.textContent).toContain('Magnifier selection fixture');

    // When: 拖动会话结束。
    act(() => {
      fireEvent.pointerUp(document, { clientX: 40, clientY: 42 });
    });

    // Then: 放大镜立即消失。
    expect(document.querySelector('.hsn-selection-magnifier')).toBeNull();
  });

  it('captures the selection overlay together with the content', () => {
    // Given: 一个带选中框的持久文本 range，并开启放大镜。
    const container = renderSelectedRange(true);
    const handle = container.querySelector('.hsn-selection-handle--start');
    if (!(handle instanceof HTMLElement)) throw new TypeError('Expected start handle');

    // When: 开始拖动文本手柄并创建首张快照。
    fireEvent.pointerDown(handle, { clientX: 40, clientY: 42 });

    // Then: 快照以完整 Selection 容器为根，内容和选框都包含在同一次克隆中。
    const snapshotRoot = document.querySelector(
      '.hsn-selection-magnifier__snapshot > .hsn-selection-container',
    );
    expect(snapshotRoot).not.toBeNull();
    expect(snapshotRoot?.querySelector('.hsn-selection-content')?.textContent ?? '').toContain(
      'Magnifier selection fixture',
    );
    expect(snapshotRoot?.querySelector('.hsn-selection-rect--selected')).not.toBeNull();
  });

  it('forwards the raw pointer coordinate for caret hit testing', () => {
    // Given: 起点手柄已进入拖动状态。
    const container = renderSelectedRange(true);
    const handle = container.querySelector('.hsn-selection-handle--start');
    const text = container.querySelector('.hsn-selection-content')?.firstChild;
    if (!(handle instanceof HTMLElement)) throw new TypeError('Expected start handle');
    if (!(text instanceof Text)) throw new TypeError('Expected content text');
    vi.spyOn(handle, 'getBoundingClientRect').mockReturnValue(new DOMRect(26, 18, 28, 36));
    const caretRange = document.createRange();
    caretRange.setStart(text, 1);
    caretRange.collapse(true);
    const caretRangeFromPoint = vi.fn(() => caretRange);
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: caretRangeFromPoint,
    });
    fireEvent.pointerDown(handle, { clientX: 40, clientY: 42 });

    // When: 指针移动到新的屏幕坐标。
    act(() => {
      dispatchPointerMove(60, 43);
    });

    // Then: caret 命中与放大镜都使用原始指针坐标。
    expect(caretRangeFromPoint).toHaveBeenLastCalledWith(60, 43);
    expect(
      document.querySelector<HTMLElement>('.hsn-selection-magnifier__snapshot')?.style.transform,
    ).toBe('translate3d(-60px, -26px, 0) scale(2)');
  });

  it('keeps moving both the lens and snapshot when the caret position stays unchanged', () => {
    // Given: 两次移动都会命中同一个字符位置。
    const container = renderSelectedRange(true);
    const handle = container.querySelector('.hsn-selection-handle--start');
    const text = container.querySelector('.hsn-selection-content')?.firstChild;
    if (!(handle instanceof HTMLElement)) throw new TypeError('Expected start handle');
    if (!(text instanceof Text)) throw new TypeError('Expected content text');
    vi.spyOn(handle, 'getBoundingClientRect').mockReturnValue(new DOMRect(26, 18, 28, 36));
    const caretRange = document.createRange();
    caretRange.setStart(text, 1);
    caretRange.collapse(true);
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: vi.fn(() => caretRange),
    });
    fireEvent.pointerDown(handle, { clientX: 40, clientY: 42 });

    // When: 鼠标在同一字符命中区内进行两次细粒度移动。
    act(() => dispatchPointerMove(200, 80));
    const firstTransform = document.querySelector<HTMLElement>('.hsn-selection-magnifier')?.style
      .transform;
    const firstSnapshotTransform = document.querySelector<HTMLElement>(
      '.hsn-selection-magnifier__snapshot',
    )?.style.transform;
    act(() => dispatchPointerMove(207, 83));

    // Then: 外壳和内部快照都持续跟随原始指针。
    expect(firstTransform).toBe('translate3d(140px, 98px, 0)');
    expect(firstSnapshotTransform).toBe('translate3d(-340px, -100px, 0) scale(2)');
    expect(document.querySelector<HTMLElement>('.hsn-selection-magnifier')?.style.transform).toBe(
      'translate3d(147px, 101px, 0)',
    );
    expect(
      document.querySelector<HTMLElement>('.hsn-selection-magnifier__snapshot')?.style.transform,
    ).toBe('translate3d(-354px, -106px, 0) scale(2)');
  });

  it('switches the magnifier snapshot to the content that owns the resolved caret', () => {
    // Given: 从当前 Selection 开始拖动，但 caret 命中另一个 linked 内容容器。
    const container = renderSelectedRange(true);
    const handle = container.querySelector('.hsn-selection-handle--start');
    if (!(handle instanceof HTMLElement)) throw new TypeError('Expected start handle');
    vi.spyOn(handle, 'getBoundingClientRect').mockReturnValue(new DOMRect(26, 18, 28, 36));
    const linkedContent = document.createElement('div');
    linkedContent.className = 'hsn-selection-content';
    linkedContent.textContent = 'Linked destination';
    document.body.append(linkedContent);
    const linkedText = linkedContent.firstChild;
    if (!(linkedText instanceof Text)) throw new TypeError('Expected linked content text');
    const caretRange = document.createRange();
    caretRange.setStart(linkedText, 1);
    caretRange.collapse(true);
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: vi.fn(() => caretRange),
    });
    fireEvent.pointerDown(handle, { clientX: 40, clientY: 42 });

    // When: 指针移动并解析到 linked 内容。
    act(() => {
      dispatchPointerMove(60, 43);
    });

    // Then: 镜片克隆 caret 所属内容，而不是拖动发起容器。
    expect(document.querySelector('.hsn-selection-magnifier')?.textContent).toContain(
      'Linked destination',
    );
    linkedContent.remove();
  });

  it('preserves computed presentation when the content snapshot is portaled', () => {
    // Given: 内容层具有应随 portal 快照保留的字体、颜色、方向和主题变量。
    const container = renderSelectedRange(true);
    const content = container.querySelector('.hsn-selection-content');
    if (!(content instanceof HTMLElement)) throw new TypeError('Expected selection content');
    content.style.fontFamily = 'serif';
    content.style.color = 'rgb(12, 34, 56)';
    content.style.direction = 'rtl';
    content.style.setProperty('--selection-test-color', 'rgb(78, 90, 12)');
    const handle = container.querySelector('.hsn-selection-handle--start');
    if (!(handle instanceof HTMLElement)) throw new TypeError('Expected start handle');

    // When: 开始拖动并把内容克隆到 document.body portal。
    fireEvent.pointerDown(handle, { clientX: 40, clientY: 42 });

    // Then: 克隆根保留源内容计算后的继承样式。
    const snapshotContent = document.querySelector(
      '.hsn-selection-magnifier__snapshot > .hsn-selection-container .hsn-selection-content',
    );
    if (!(snapshotContent instanceof HTMLElement)) {
      throw new TypeError('Expected magnifier snapshot content');
    }
    expect(snapshotContent.style.fontFamily).toBe('serif');
    expect(snapshotContent.style.color).toBe('rgb(12, 34, 56)');
    expect(snapshotContent.style.direction).toBe('rtl');
    expect(snapshotContent.style.getPropertyValue('--selection-test-color')).toBe(
      'rgb(78, 90, 12)',
    );
  });

  it('measures an unchanged source only once while the point keeps moving', () => {
    // Given: 同一个内容源和一次已挂载的放大镜拖动会话。
    const source = document.createElement('div');
    source.className = 'hsn-selection-content';
    source.textContent = 'Stable source';
    document.body.append(source);
    const measureSource = vi
      .spyOn(source, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(40, 30, 180, 90));
    const view = render(<SelectionMagnifier point={{ x: 60, y: 42 }} source={source} />);

    // When: 高频拖动只改变镜片采样点，不改变内容源。
    view.rerender(<SelectionMagnifier point={{ x: 72, y: 48 }} source={source} />);
    view.rerender(<SelectionMagnifier point={{ x: 84, y: 54 }} source={source} />);

    // Then: 源几何只在 source 建立时读取一次，坐标帧不重复触发布局测量。
    expect(measureSource).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector<HTMLElement>('.hsn-selection-magnifier__snapshot')?.style.transform,
    ).toBe('translate3d(-28px, 12px, 0) scale(2)');
    source.remove();
  });

  it('remeasures an unchanged source after scrolling before the next point update', () => {
    // Given: 已挂载镜片的内容源在滚动前位于固定视口坐标。
    const source = document.createElement('div');
    source.className = 'hsn-selection-content';
    source.textContent = 'Scrollable source';
    document.body.append(source);
    const measureSource = vi
      .spyOn(source, 'getBoundingClientRect')
      .mockReturnValueOnce(new DOMRect(40, 30, 180, 90))
      .mockReturnValue(new DOMRect(40, 10, 180, 90));
    const magnifierRef = createRef<React.ComponentRef<typeof SelectionMagnifier>>();
    render(<SelectionMagnifier ref={magnifierRef} point={{ x: 60, y: 42 }} source={source} />);

    // When: 祖先滚动使同一 source 上移，随后到达新的 caret 点。
    fireEvent.scroll(document);
    act(() => magnifierRef.current?.moveLens({ x: 60, y: 22 }));

    // Then: 下一帧按新 BCR 映射，而不是继续使用挂载时的视口坐标。
    expect(measureSource).toHaveBeenCalledTimes(2);
    expect(
      document.querySelector<HTMLElement>('.hsn-selection-magnifier__snapshot')?.style.transform,
    ).toBe('translate3d(20px, 36px, 0) scale(2)');
    source.remove();
  });
});
