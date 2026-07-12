import { getEffectiveLinkedOverlayRectType, storeRectsForOverlayRectType } from './geometry';
import type { RegisteredLinkedContainer } from './linkedRegistry';
import type { LinkedSelectionRange, OverlayRect, SelectionEndpoint } from './types';
import type { RangeStyleSnapshot } from './styleUtils';

type BoundaryPoint = {
  readonly node: Node;
  readonly offset: number;
};

type OrderedEndpoints = {
  readonly start: SelectionEndpoint;
  readonly end: SelectionEndpoint;
};

type LinkedRangeUpdateInput = {
  readonly item: LinkedSelectionRange;
  readonly fixedEndpoint: SelectionEndpoint;
  readonly movingEndpoint: SelectionEndpoint;
  readonly containers: readonly RegisteredLinkedContainer[];
  readonly fallbackStyleSnapshot?: RangeStyleSnapshot;
};

type LinkedDomRangeInput = {
  readonly fixedEndpoint: SelectionEndpoint;
  readonly movingEndpoint: SelectionEndpoint;
  readonly containers: readonly RegisteredLinkedContainer[];
};

function endpointKey(endpoint: SelectionEndpoint): string {
  return `${endpoint.selectionId}:${endpoint.offset}`;
}

function getEndpointOrderIndex(
  endpoint: SelectionEndpoint,
  containers: readonly RegisteredLinkedContainer[],
): number {
  return containers.findIndex((entry) => entry.selectionId === endpoint.selectionId);
}

function orderEndpoints(
  first: SelectionEndpoint,
  second: SelectionEndpoint,
  containers: readonly RegisteredLinkedContainer[],
): OrderedEndpoints | null {
  if (endpointKey(first) === endpointKey(second)) return null;

  const firstIndex = getEndpointOrderIndex(first, containers);
  const secondIndex = getEndpointOrderIndex(second, containers);
  if (firstIndex < 0 || secondIndex < 0) return null;

  if (firstIndex < secondIndex) return { start: first, end: second };
  if (firstIndex > secondIndex) return { start: second, end: first };
  return first.offset < second.offset
    ? { start: first, end: second }
    : { start: second, end: first };
}

function getBoundaryPointFromOffset(container: HTMLElement, offset: number): BoundaryPoint | null {
  if (offset < 0) return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let textLength = 0;
  let lastTextNode: Text | null = null;
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) {
      const nextTextLength = textLength + node.length;
      if (offset <= nextTextLength) {
        return { node, offset: offset - textLength };
      }
      textLength = nextTextLength;
      lastTextNode = node;
    }
    node = walker.nextNode();
  }

  if (lastTextNode && offset === textLength) {
    return { node: lastTextNode, offset: lastTextNode.length };
  }
  return null;
}

function getContainerBySelectionId(
  selectionId: string,
  containers: readonly RegisteredLinkedContainer[],
): HTMLElement | null {
  return containers.find((entry) => entry.selectionId === selectionId)?.element ?? null;
}

function createRangeFromLinkedEndpoints(
  endpoints: OrderedEndpoints,
  containers: readonly RegisteredLinkedContainer[],
): Range | null {
  const startContainer = getContainerBySelectionId(endpoints.start.selectionId, containers);
  const endContainer = getContainerBySelectionId(endpoints.end.selectionId, containers);
  if (!startContainer || !endContainer) return null;

  const start = getBoundaryPointFromOffset(startContainer, endpoints.start.offset);
  const end = getBoundaryPointFromOffset(endContainer, endpoints.end.offset);
  if (!start || !end) return null;

  try {
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range.collapsed ? null : range;
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }
}

export function createLinkedDomRangeFromEndpoints({
  fixedEndpoint,
  movingEndpoint,
  containers,
}: LinkedDomRangeInput): Range | null {
  const endpoints = orderEndpoints(fixedEndpoint, movingEndpoint, containers);
  if (!endpoints) return null;
  return createRangeFromLinkedEndpoints(endpoints, containers);
}

function createTextFragmentRange(range: Range, textNode: Text): Range | null {
  if (!range.intersectsNode(textNode)) return null;

  const textRange = document.createRange();
  textRange.selectNodeContents(textNode);

  let startOffset = 0;
  let endOffset = textNode.length;

  if (range.compareBoundaryPoints(Range.START_TO_START, textRange) > 0) {
    if (range.startContainer !== textNode) return null;
    startOffset = range.startOffset;
  }

  if (range.compareBoundaryPoints(Range.END_TO_END, textRange) < 0) {
    if (range.endContainer !== textNode) return null;
    endOffset = range.endOffset;
  }

  if (endOffset <= startOffset) return null;

  const fragment = document.createRange();
  fragment.setStart(textNode, startOffset);
  fragment.setEnd(textNode, endOffset);

  if (fragment.collapsed || !fragment.toString()) return null;
  return fragment;
}

function createContainerFragmentRange(range: Range, container: HTMLElement): Range | null {
  if (!range.intersectsNode(container)) return null;

  const containerRange = document.createRange();
  containerRange.selectNodeContents(container);
  const fragment = document.createRange();

  try {
    if (range.compareBoundaryPoints(Range.START_TO_START, containerRange) <= 0) {
      fragment.setStart(containerRange.startContainer, containerRange.startOffset);
    } else {
      fragment.setStart(range.startContainer, range.startOffset);
    }

    if (range.compareBoundaryPoints(Range.END_TO_END, containerRange) >= 0) {
      fragment.setEnd(containerRange.endContainer, containerRange.endOffset);
    } else {
      fragment.setEnd(range.endContainer, range.endOffset);
    }
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }

  if (fragment.collapsed || !fragment.toString().trim()) return null;
  return fragment;
}

function rangeToOverlayRects(range: Range, container: HTMLElement): OverlayRect[] {
  const containerRect = container.getBoundingClientRect();
  const out: OverlayRect[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) {
      const textFragment = createTextFragmentRange(range, node);
      if (textFragment) {
        const rects = textFragment.getClientRects();
        for (let index = 0; index < rects.length; index += 1) {
          const rect = rects[index];
          if (!rect || rect.width <= 0 || rect.height <= 0) continue;
          out.push({
            x: rect.left - containerRect.left,
            y: rect.top - containerRect.top,
            width: rect.width,
            height: rect.height,
          });
        }
      }
    }
    node = walker.nextNode();
  }
  return out;
}

export function updateLinkedRangeFromEndpoints({
  item,
  fixedEndpoint,
  movingEndpoint,
  containers,
  fallbackStyleSnapshot,
}: LinkedRangeUpdateInput): LinkedSelectionRange | null {
  const endpoints = orderEndpoints(fixedEndpoint, movingEndpoint, containers);
  if (!endpoints) return null;

  const range = createRangeFromLinkedEndpoints(endpoints, containers);
  if (!range) return null;

  const rectsBySelectionId: LinkedSelectionRange['rectsBySelectionId'] = {};
  let text = '';

  for (const entry of containers) {
    const fragment = createContainerFragmentRange(range, entry.element);
    if (!fragment) continue;

    const pixelRects = rangeToOverlayRects(fragment, entry.element);
    const overlayRectType = getEffectiveLinkedOverlayRectType(item);
    const storedRects = storeRectsForOverlayRectType(pixelRects, overlayRectType, entry.element);
    if (storedRects.length === 0) continue;

    text += fragment.toString();
    rectsBySelectionId[entry.selectionId] = storedRects;
  }

  if (!text.trim()) return null;

  return {
    ...item,
    text,
    start: endpoints.start,
    end: endpoints.end,
    overlayRectType: getEffectiveLinkedOverlayRectType(item),
    rectsBySelectionId,
    markerStyle: item.markerStyle ?? fallbackStyleSnapshot?.markerStyle,
    selectionStyle: item.selectionStyle ?? fallbackStyleSnapshot?.selectionStyle,
  };
}
