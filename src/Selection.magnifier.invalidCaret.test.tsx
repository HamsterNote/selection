/// <reference types="vitest/globals" />
import { act, fireEvent, render } from '@testing-library/react';
import { Selection } from './Selection';
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

function renderDragFixture(): { readonly handle: HTMLElement; readonly text: Text } {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: vi.fn(() => makeDomRectList([TEXT_RECT])),
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: vi.fn(() => TEXT_RECT),
  });
  const view = render(
    <Selection ranges={[selectedRange()]} selectedRangeId="selected-range" showSelectionMagnifier>
      Magnifier selection fixture
    </Selection>,
  );
  const handle = view.container.querySelector('.hsn-selection-handle--start');
  const text = view.container.querySelector('.hsn-selection-content')?.firstChild;
  if (!(handle instanceof HTMLElement)) throw new TypeError('Expected start handle');
  if (!(text instanceof Text)) throw new TypeError('Expected content text');
  vi.spyOn(handle, 'getBoundingClientRect').mockReturnValue(new DOMRect(26, 18, 28, 36));
  return { handle, text };
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

function snapshotTransform(): string | undefined {
  return document.querySelector<HTMLElement>('.hsn-selection-magnifier__snapshot')?.style.transform;
}

function expectLatestPointer(): void {
  expect(document.querySelector<HTMLElement>('.hsn-selection-magnifier')?.style.transform).toBe(
    'translate3d(147px, 101px, 0)',
  );
  expect(snapshotTransform()).toBe('translate3d(-354px, -106px, 0) scale(2)');
}

describe('Selection magnifier invalid caret movement', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps following the pointer when caret hit testing temporarily fails', () => {
    // Given: 首次移动得到有效 caret，下一次移动落到行间空白而无法解析 caret。
    const { handle, text } = renderDragFixture();
    const caretRange = document.createRange();
    caretRange.setStart(text, 1);
    caretRange.collapse(true);
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: vi.fn().mockReturnValueOnce(caretRange).mockReturnValue(null),
    });
    fireEvent.pointerDown(handle, { clientX: 40, clientY: 42 });
    act(() => dispatchPointerMove(200, 80));

    // When: 原始指针继续移动，但本帧没有可用 caret。
    act(() => dispatchPointerMove(207, 83));

    // Then: 外壳和内部快照都继续跟随最新原始指针。
    expectLatestPointer();
  });

  it('keeps following the pointer when the resolved caret has no visible height', () => {
    // Given: 首次移动得到可见 caret，下一次 caret range 暂时没有可见几何。
    const { handle, text } = renderDragFixture();
    const caretRange = document.createRange();
    caretRange.setStart(text, 1);
    caretRange.collapse(true);
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: vi.fn(() => caretRange),
    });
    fireEvent.pointerDown(handle, { clientX: 40, clientY: 42 });
    act(() => dispatchPointerMove(200, 80));
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: vi.fn(() => makeDomRectList([])),
    });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: vi.fn(() => new DOMRect(60, 30, 0, 0)),
    });

    // When: 指针继续移动，但 caret 几何高度为零。
    act(() => dispatchPointerMove(207, 83));

    // Then: caret 几何无效时外壳和内部快照都不冻结。
    expectLatestPointer();
  });
});
