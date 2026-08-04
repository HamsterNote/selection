import { act, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../demo/src/App';

const CONTAINER_RECT = new DOMRect(0, 0, 400, 300);
const TEXT_RECT = new DOMRect(40, 30, 120, 24);

function makeDomRectList(rects: DOMRect[]): DOMRectList {
  const list: Partial<DOMRectList> & { [index: number]: DOMRect } = {};
  rects.forEach((rect, index) => {
    list[index] = rect;
  });
  Object.defineProperty(list, 'length', { value: rects.length });
  list.item = (index: number) => list[index];
  return list as DOMRectList;
}

function mockGeometry(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(CONTAINER_RECT);
  if (!('getClientRects' in Range.prototype)) {
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: vi.fn(),
    });
  }
  vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue(makeDomRectList([TEXT_RECT]));
}

function selectionContainer(host: HTMLElement, index: number): HTMLElement {
  const element = host.querySelectorAll('.hsn-selection-container')[index];
  if (element instanceof HTMLElement) return element;
  throw new TypeError(`Expected Selection container at index ${index}`);
}

function firstTextNode(container: HTMLElement): Text {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  const currentNode = walker.nextNode();
  if (currentNode instanceof Text) return currentNode;
  throw new TypeError('Expected a text node inside Selection container');
}

function installNativeSelection(container: HTMLElement): Selection {
  const range = document.createRange();
  const textNode = firstTextNode(container);
  range.setStart(textNode, 0);
  range.setEnd(textNode, Math.min(8, textNode.textContent?.length ?? 0));
  const selection = document.getSelection();
  if (!selection) throw new TypeError('Expected document selection');
  selection.removeAllRanges();
  selection.addRange(range);
  if (vi.isMockFunction(window.getSelection)) {
    window.getSelection.mockReturnValue(selection);
    return selection;
  }
  vi.spyOn(window, 'getSelection').mockReturnValue(selection);
  return selection;
}

function selectText(container: HTMLElement): void {
  installNativeSelection(container);
  act(() => {
    fireEvent.mouseDown(container, { clientX: 40, clientY: 30 });
    document.dispatchEvent(new Event('selectionchange'));
    fireEvent.mouseUp(container, { clientX: 110, clientY: 42 });
  });
}

function dragRect(container: HTMLElement): void {
  const dispatchPointer = (target: EventTarget, type: string, clientX: number, clientY: number) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    target.dispatchEvent(event);
  };
  act(() => {
    dispatchPointer(container, 'pointerdown', 40, 30);
    dispatchPointer(document, 'pointermove', 120, 90);
    dispatchPointer(document, 'pointerup', 120, 90);
  });
}

describe('Demo app selection mutual exclusion', () => {
  beforeEach(() => {
    mockGeometry();
  });

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
  });

  it('clicking linked and legacy text highlights keeps only the latest selected item', () => {
    const { container } = render(<App />);

    const showLegacyToggle = screen.getByLabelText(/显示 legacy 兼容面板/i);
    fireEvent.click(showLegacyToggle);

    const linkedContainer = selectionContainer(container, 0);
    selectText(linkedContainer);
    fireEvent.click(screen.getByRole('button', { name: '高亮选中（page-a）' }));

    const legacyContainer = selectionContainer(container, 2);
    selectText(legacyContainer);
    fireEvent.click(screen.getByRole('button', { name: '高亮选中（legacy）' }));

    const linkedHeading = screen.getByRole('heading', { name: /联动高亮（1）/i });
    const linkedList = linkedHeading.nextElementSibling;
    if (!(linkedList instanceof HTMLElement)) {
      throw new TypeError('Expected linked highlight list');
    }
    const linkedItemButton = within(linkedList).getByRole('button', { name: /「React/u });

    const legacyHeading = screen.getByRole('heading', { name: /Legacy 高亮（1）/i });
    const legacyList = legacyHeading.nextElementSibling;
    if (!(legacyList instanceof HTMLElement)) {
      throw new TypeError('Expected legacy highlight list');
    }
    const legacyItemButton = within(legacyList).getByRole('button', { name: /「此面板使用旧版/u });

    fireEvent.click(linkedItemButton);
    expect(within(linkedList).getByText('已选中')).toBeInTheDocument();
    expect(within(legacyList).queryByText('已选中')).not.toBeInTheDocument();

    fireEvent.click(legacyItemButton);
    expect(within(legacyList).getByText('已选中')).toBeInTheDocument();
    expect(within(linkedList).queryByText('已选中')).not.toBeInTheDocument();
  });

  it('clicking a persisted linked highlight reselects it after outside deselection', () => {
    // Given: a linked text highlight remains stored after an outside pointer deselects it.
    const { container } = render(<App />);
    const linkedContainer = selectionContainer(container, 0);
    selectText(linkedContainer);
    fireEvent.click(screen.getByRole('button', { name: '高亮选中（page-a）' }));
    const linkedHeading = screen.getByRole('heading', { name: /联动高亮（1）/i });
    const linkedList = linkedHeading.nextElementSibling;
    if (!(linkedList instanceof HTMLElement)) throw new TypeError('Expected linked highlight list');
    fireEvent.pointerDown(document.body, { pointerType: 'mouse', clientX: 300, clientY: 200 });
    expect(within(linkedList).queryByText('已选中')).not.toBeInTheDocument();
    document.getSelection()?.removeAllRanges();

    // When: the user clicks the persisted overlay geometry in the Selection container.
    fireEvent.click(linkedContainer, { clientX: 50, clientY: 40 });

    // Then: the linked item becomes selected again instead of being cleared by onSelectRect(null).
    expect(within(linkedList).getByText('已选中')).toBeInTheDocument();
  });

  it('clicking a persisted rectangle reselects it after outside deselection', () => {
    // Given: rect mode has one confirmed rectangle that was deselected outside the container.
    const { container } = render(<App />);
    fireEvent.click(screen.getByLabelText(/矩形框选 \(rect\)/i));
    const linkedContainer = selectionContainer(container, 0);
    dragRect(linkedContainer);
    fireEvent.click(screen.getByRole('button', { name: '确认矩形' }));
    const rectHeading = screen.getByRole('heading', { name: /Rect 高亮（1）/i });
    const rectList = rectHeading.nextElementSibling;
    if (!(rectList instanceof HTMLElement)) throw new TypeError('Expected rectangle list');
    const rectItem = within(rectList)
      .getByRole('button', { name: /type: px/u })
      .closest('li');
    if (!(rectItem instanceof HTMLElement)) throw new TypeError('Expected rectangle list item');
    fireEvent.pointerDown(document.body, { pointerType: 'mouse', clientX: 300, clientY: 200 });
    expect(rectItem).toHaveStyle({ background: '#fff', border: '1px solid #eee' });

    // When: the user clicks inside the persisted rectangle geometry.
    fireEvent.click(linkedContainer, { clientX: 60, clientY: 50 });

    // Then: the rectangle becomes selected again instead of being cleared by selectRange(null).
    expect(rectItem).toHaveStyle({ background: '#e3fafc', border: '1px solid #15aabf' });
  });
});
