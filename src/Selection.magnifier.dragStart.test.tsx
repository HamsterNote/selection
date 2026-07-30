/// <reference types="vitest/globals" />
import { act, fireEvent, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Selection } from './Selection';
import { SelectionMagnifier } from './SelectionMagnifier';
import type { HandleRenderProps, SelectionRange } from './types';

const TEXT_RECT = new DOMRect(40, 30, 80, 24);
const CARET_RECT = new DOMRect(60, 30, 0, 24);
const originalCaretRangeFromPoint = Object.getOwnPropertyDescriptor(
  document,
  'caretRangeFromPoint',
);
const originalRangeClientRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
const originalRangeBoundingRect = Object.getOwnPropertyDescriptor(
  Range.prototype,
  'getBoundingClientRect',
);

function makeDomRectList(rects: readonly DOMRect[]): DOMRectList {
  return Object.assign([...rects], {
    item: (index: number): DOMRect | null => rects[index] ?? null,
  });
}

function percentRange(): SelectionRange {
  return {
    id: 'percent-range',
    text: 'Pointer',
    start: 0,
    end: 7,
    createdAt: 1,
    overlayRectType: 'percent',
    rects: [{ x: 10, y: 10, width: 20, height: 8 }],
  };
}

function installRangeGeometry(): void {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: vi.fn(() => makeDomRectList([TEXT_RECT])),
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: vi.fn(() => CARET_RECT),
  });
}

function installCaretHit(text: Text): ReturnType<typeof vi.fn> {
  const caretRange = document.createRange();
  caretRange.setStart(text, 1);
  caretRange.collapse(true);
  const caretRangeFromPoint = vi.fn(() => caretRange);
  Object.defineProperty(document, 'caretRangeFromPoint', {
    configurable: true,
    value: caretRangeFromPoint,
  });
  return caretRangeFromPoint;
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

function dispatchPointerDown(target: HTMLElement, clientX: number, clientY: number): void {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  target.dispatchEvent(event);
}

function restoreCaretRangeFromPoint(): void {
  if (originalCaretRangeFromPoint) {
    Object.defineProperty(document, 'caretRangeFromPoint', originalCaretRangeFromPoint);
    return;
  }
  Reflect.deleteProperty(document, 'caretRangeFromPoint');
}

function restoreRangeGeometry(): void {
  if (originalRangeClientRects) {
    Object.defineProperty(Range.prototype, 'getClientRects', originalRangeClientRects);
  } else {
    Reflect.deleteProperty(Range.prototype, 'getClientRects');
  }
  if (originalRangeBoundingRect) {
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalRangeBoundingRect);
  } else {
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  }
}

describe('Selection magnifier drag start', () => {
  afterEach(() => {
    restoreCaretRangeFromPoint();
    restoreRangeGeometry();
    vi.restoreAllMocks();
  });

  it('positions the first magnifier frame at the raw pointerdown coordinate', () => {
    // Given: 手柄中心与实际按下坐标明显不同。
    installRangeGeometry();
    const view = render(
      <Selection
        ranges={[{ ...percentRange(), overlayRectType: 'px', rects: [TEXT_RECT] }]}
        selectedRangeId="percent-range"
        showSelectionMagnifier
      >
        Pointer selection fixture
      </Selection>,
    );
    const handle = view.container.querySelector('.hsn-selection-handle--start');
    if (!(handle instanceof HTMLElement)) throw new TypeError('Expected start handle');
    vi.spyOn(handle, 'getBoundingClientRect').mockReturnValue(new DOMRect(26, 18, 28, 36));

    // When: 鼠标在远离手柄中心的位置按下。
    act(() => dispatchPointerDown(handle, 200, 80));

    // Then: 首帧外壳与内部快照都直接跟随原始按下坐标。
    expect(document.querySelector<HTMLElement>('.hsn-selection-magnifier')?.style.transform).toBe(
      'translate3d(140px, 98px, 0)',
    );
    expect(
      document.querySelector<HTMLElement>('.hsn-selection-magnifier__snapshot')?.style.transform,
    ).toBe('translate3d(-340px, -100px, 0) scale(2)');
  });

  it('uses the raw pointer coordinate with percent-positioned handles', () => {
    // Given: 一个使用百分比坐标定位的文本手柄。
    installRangeGeometry();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 400, 300),
    );
    const view = render(
      <Selection
        ranges={[percentRange()]}
        selectedRangeId="percent-range"
        overlayRectType="percent"
      >
        Pointer selection fixture
      </Selection>,
    );
    const handle = view.container.querySelector('.hsn-selection-handle--start');
    const text = view.container.querySelector('.hsn-selection-content')?.firstChild;
    if (!(handle instanceof HTMLElement)) throw new TypeError('Expected start handle');
    if (!(text instanceof Text)) throw new TypeError('Expected content text');
    vi.spyOn(handle, 'getBoundingClientRect').mockReturnValue(new DOMRect(26, 18, 28, 36));
    const caretRangeFromPoint = installCaretHit(text);
    fireEvent.pointerDown(handle, { clientX: 40, clientY: 42 });

    // When: 指针移动到新的屏幕坐标。
    act(() => dispatchPointerMove(60, 43));

    // Then: caret 命中直接使用原始指针坐标。
    expect(caretRangeFromPoint).toHaveBeenLastCalledWith(60, 43);
  });

  it('uses the raw pointer coordinate through document capture start', () => {
    // Given: 自定义手柄消费公开 onPointerDown。
    installRangeGeometry();
    const renderHandle = (props: HandleRenderProps): ReactElement => (
      <button
        type="button"
        className={props.className}
        style={props.style}
        onPointerDown={props.onPointerDown}
      />
    );
    const view = render(
      <Selection
        ranges={[{ ...percentRange(), overlayRectType: 'px', rects: [TEXT_RECT] }]}
        selectedRangeId="percent-range"
        renderHandle={renderHandle}
      >
        Pointer selection fixture
      </Selection>,
    );
    const handle = view.container.querySelector('.hsn-selection-handle--start');
    const text = view.container.querySelector('.hsn-selection-content')?.firstChild;
    if (!(handle instanceof HTMLElement)) throw new TypeError('Expected custom start handle');
    if (!(text instanceof Text)) throw new TypeError('Expected content text');
    vi.spyOn(handle, 'getBoundingClientRect').mockReturnValue(new DOMRect(26, 18, 28, 36));
    const caretRangeFromPoint = installCaretHit(text);
    fireEvent.pointerDown(handle, { clientX: 40, clientY: 42 });

    // When: document capture 已抢先开始拖动，随后发生首次移动。
    act(() => dispatchPointerMove(60, 43));

    // Then: capture 路径同样直接使用原始指针坐标。
    expect(caretRangeFromPoint).toHaveBeenLastCalledWith(60, 43);
  });
});

describe('SelectionMagnifier render purity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('measures a switched source only after the render phase completes', () => {
    // Given: 两个可切换内容源，并记录每次布局读取是否发生在 React render 内。
    const firstSource = document.createElement('div');
    const secondSource = document.createElement('div');
    firstSource.textContent = 'First source';
    secondSource.textContent = 'Second source';
    document.body.append(firstSource, secondSource);
    let isRendering = false;
    const renderPhaseReads: boolean[] = [];
    vi.spyOn(firstSource, 'getBoundingClientRect').mockImplementation(() => {
      renderPhaseReads.push(isRendering);
      return new DOMRect(10, 20, 100, 40);
    });
    vi.spyOn(secondSource, 'getBoundingClientRect').mockImplementation(() => {
      renderPhaseReads.push(isRendering);
      return new DOMRect(30, 40, 120, 50);
    });
    const RenderFinished = (): null => {
      isRendering = false;
      return null;
    };
    const Harness = ({ source }: { readonly source: HTMLDivElement }): ReactElement => {
      isRendering = true;
      return (
        <>
          <SelectionMagnifier point={{ x: 60, y: 80 }} source={source} />
          <RenderFinished />
        </>
      );
    };
    const view = render(<Harness source={firstSource} />);

    // When: React render 切换到另一个 source。
    view.rerender(<Harness source={secondSource} />);

    // Then: 所有 BCR 读取都发生在已提交的 layout phase，而不是 render phase。
    expect(renderPhaseReads).toEqual([false, false]);
    firstSource.remove();
    secondSource.remove();
  });
});
