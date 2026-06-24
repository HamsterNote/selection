/**
 * @hamster-note/selection
 * React 文本选区组件库
 *
 * 用法：
 *   import { Selection } from '@hamster-note/selection';
 *   import '@hamster-note/selection/style.css';
 */

export { Selection } from './Selection';
export {
  getRegisteredContainers,
  registerLinkedContainer,
  resolveEndpoint,
  syncSelectionOrder,
} from './linkedRegistry';
export type { RegisteredLinkedContainer } from './linkedRegistry';
export {
  percentRectListsEqual,
  percentRectsToPixelRects,
  pixelRectsToPercentRects,
} from './geometry';
export type {
  HandlePosition,
  HandleRenderProps,
  LinkedSelectionData,
  LinkedSelectionRange,
  MarkerColorStyle,
  MarkerColors,
  MarkerStrokeStyle,
  MousePosition,
  NewSelectionOptions,
  PercentOverlayRect,
  SelectionEndpoint,
  SelectionHandleOwner,
  SelectionHandleType,
  SelectionProps,
  SelectionRange,
  SelectionRef,
  UseTextSelectionResult,
} from './types';
export { useTextSelection } from './useTextSelection';
