/// <reference types="vitest/globals" />

import { act, fireEvent, render } from '@testing-library/react';
import { Selection } from './Selection';
import type { SelectionRange } from './types';

const CONTAINER_RECT = new DOMRect(0, 0, 400, 300);
const TEXT_RECT = new DOMRect(40, 30, 80, 24);

const selectedRange: SelectionRange = {
  id: 'text-1',
  text: 'Deterministic',
  start: 0,
  end: 13,
  createdAt: 1000,
  overlayRectType: 'px',
  rects: [{ x: 40, y: 30, width: 80, height: 24 }],
};

function mockGeometry(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(CONTAINER_RECT);
  if (!('getClientRects' in Range.prototype)) {
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: vi.fn(),
    });
  }
  const rects = {
    0: TEXT_RECT,
    length: 1,
    item: (index: number) => (index === 0 ? TEXT_RECT : null),
    [Symbol.iterator]: () => [TEXT_RECT].values(),
  } satisfies DOMRectList;
  vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue(rects);
}

function selectionContainer(host: HTMLElement): HTMLElement {
  const element = host.querySelector('.hsn-selection-container');
  if (element instanceof HTMLElement) return element;
  throw new TypeError('Expected Selection container');
}

function dispatchMousePointerDown(target: EventTarget): void {
  const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  target.dispatchEvent(event);
}

function dispatchTouchPointerDown(
  target: EventTarget,
  isPrimary = true,
  point = { clientX: 300, clientY: 200 },
): void {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    clientX: point.clientX,
    clientY: point.clientY,
  });
  Object.defineProperties(event, {
    pointerId: { value: isPrimary ? 2 : 3 },
    pointerType: { value: 'touch' },
    isPrimary: { value: isPrimary },
  });
  target.dispatchEvent(event);
}

function selectText(container: HTMLElement): void {
  const textNode = container.querySelector('p')?.firstChild;
  if (!(textNode instanceof Text)) throw new TypeError('Expected paragraph text node');

  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, 13);
  const nativeSelection = document.getSelection();
  if (!nativeSelection) throw new TypeError('Expected document selection');
  nativeSelection.removeAllRanges();
  nativeSelection.addRange(range);

  act(() => {
    fireEvent.mouseDown(container, { clientX: 40, clientY: 30 });
    document.dispatchEvent(new Event('selectionchange'));
    fireEvent.mouseUp(container, { clientX: 90, clientY: 42 });
  });
}

describe('Selection page-level deselection', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
  });

  it('clears a persisted selection when an external button is clicked', () => {
    // Given: a persisted text range is selected and an unrelated action lives outside the container.
    mockGeometry();
    const onSelectRange = vi.fn();
    const { getByRole } = render(
      <>
        <button type="button">Outside action</button>
        <Selection ranges={[selectedRange]} selectedRangeId="text-1" onSelectRange={onSelectRange}>
          <p>Deterministic paragraph for outside click.</p>
        </Selection>
      </>,
    );

    // When: the user starts clicking the external action.
    act(() => {
      dispatchMousePointerDown(getByRole('button', { name: 'Outside action' }));
    });

    // Then: page-level click semantics clear the selected range.
    expect(onSelectRange).toHaveBeenCalledWith(null);
  });

  it('clears a persisted selection before an outside target stops propagation', () => {
    // Given: an outside integration stops bubbling pointer events.
    mockGeometry();
    const onSelectRange = vi.fn();
    const { getByTestId } = render(
      <>
        <div data-testid="outside" onPointerDown={(event) => event.stopPropagation()} />
        <Selection ranges={[selectedRange]} selectedRangeId="text-1" onSelectRange={onSelectRange}>
          <p>Deterministic paragraph for outside click.</p>
        </Selection>
      </>,
    );

    // When: that outside integration is clicked.
    act(() => {
      dispatchMousePointerDown(getByTestId('outside'));
    });

    // Then: capture-phase page handling still clears the selected range.
    expect(onSelectRange).toHaveBeenCalledWith(null);
  });

  it('clears an active text selection when the page outside the container is clicked', () => {
    // Given: the user has an unconfirmed text selection with its action popover visible.
    mockGeometry();
    const { container } = render(
      <Selection ranges={[]} selectionPopover={<button type="button">Highlight</button>}>
        <p>Deterministic paragraph for outside click.</p>
      </Selection>,
    );
    selectText(selectionContainer(container));
    expect(container.querySelector('.hsn-selection-popover')).toBeInTheDocument();

    // When: the user clicks elsewhere on the page.
    act(() => {
      dispatchMousePointerDown(document.body);
    });

    // Then: the active selection and its actions are dismissed.
    expect(container.querySelector('.hsn-selection-popover')).not.toBeInTheDocument();
    expect(document.getSelection()?.isCollapsed).toBe(true);
  });

  it('clears a persisted selection when the page outside is touched', () => {
    // Given: a persisted range is selected on a primary-touch device.
    mockGeometry();
    const onSelectRange = vi.fn();
    render(
      <Selection ranges={[selectedRange]} selectedRangeId="text-1" onSelectRange={onSelectRange}>
        <p>Deterministic paragraph for outside touch.</p>
      </Selection>,
    );

    // When: the primary finger touches document space outside Selection.
    act(() => {
      dispatchTouchPointerDown(document.body);
    });

    // Then: touch follows the same page-level deselection contract as mouse.
    expect(onSelectRange).toHaveBeenCalledWith(null);
  });

  it('clears an active text selection when the page outside is touched', () => {
    // Given: an unconfirmed custom text selection and its Popover are visible.
    mockGeometry();
    const { container } = render(
      <Selection ranges={[]} selectionPopover={<button type="button">Highlight</button>}>
        <p>Deterministic paragraph for outside touch.</p>
      </Selection>,
    );
    selectText(selectionContainer(container));
    expect(container.querySelector('.hsn-selection-popover')).toBeInTheDocument();

    // When: the primary finger touches blank document space outside Selection.
    act(() => {
      dispatchTouchPointerDown(document.body);
    });

    // Then: the active custom selection is dismissed.
    expect(container.querySelector('.hsn-selection-popover')).not.toBeInTheDocument();
    expect(document.getSelection()?.isCollapsed).toBe(true);
  });

  it('preserves the active selection for Popover and secondary touches', () => {
    // Given: an active custom selection exposes its Popover and handles.
    mockGeometry();
    const { container, getByRole } = render(
      <Selection ranges={[]} selectionPopover={<button type="button">Highlight</button>}>
        <p>Deterministic paragraph for touch exclusions.</p>
      </Selection>,
    );
    selectText(selectionContainer(container));

    // When: touch starts in the Popover or comes from a secondary finger outside Selection.
    act(() => {
      dispatchTouchPointerDown(getByRole('button', { name: 'Highlight' }));
      dispatchTouchPointerDown(document.body, false);
    });

    // Then: these gestures do not dismiss the active selection.
    expect(container.querySelector('.hsn-selection-popover')).toBeInTheDocument();
    expect(container.querySelectorAll('.hsn-selection-handle')).toHaveLength(2);
    expect(document.getSelection()?.isCollapsed).toBe(false);
  });

  it('preserves a persisted selection when its custom Handle is touched', () => {
    // Given: a persisted range is selected and exposes custom drag handles.
    mockGeometry();
    const onSelectRange = vi.fn();
    const { container } = render(
      <Selection ranges={[selectedRange]} selectedRangeId="text-1" onSelectRange={onSelectRange}>
        <p>Deterministic paragraph for handle touch.</p>
      </Selection>,
    );
    const handle = container.querySelector('.hsn-selection-handle');
    if (!(handle instanceof HTMLElement)) throw new TypeError('Expected selection handle');

    // When: the primary finger starts a gesture on the custom Handle.
    act(() => {
      dispatchTouchPointerDown(handle);
    });

    // Then: document-level touch cancellation excludes Handle interaction.
    expect(onSelectRange).not.toHaveBeenCalledWith(null);
  });

  it('does not swallow a highlight click after outside touch deselection', () => {
    // Given: a primary outside touch clears a controlled persisted selection.
    mockGeometry();
    const onSelectRange = vi.fn();
    const { container, rerender } = render(
      <Selection ranges={[selectedRange]} selectedRangeId="text-1" onSelectRange={onSelectRange}>
        <p>Deterministic paragraph for touch click scope.</p>
      </Selection>,
    );
    act(() => {
      dispatchTouchPointerDown(document.body, true, { clientX: 300, clientY: 200 });
    });
    expect(onSelectRange).toHaveBeenCalledWith(null);
    rerender(
      <Selection ranges={[selectedRange]} selectedRangeId={null} onSelectRange={onSelectRange}>
        <p>Deterministic paragraph for touch click scope.</p>
      </Selection>,
    );
    onSelectRange.mockClear();

    // When: an immediate synthetic click lands on the highlight at a different point.
    act(() => {
      fireEvent.click(selectionContainer(container), { clientX: 50, clientY: 40 });
    });

    // Then: the unrelated outside touch token does not consume this valid range selection.
    expect(onSelectRange).toHaveBeenCalledWith('text-1');
  });
});
