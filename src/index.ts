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
  /** @deprecated 请使用 markerStyle / selectionStyle（CSSProperties）替代旧的颜色配置。 */
  MarkerColorStyle,
  /** @deprecated 请使用 markerStyle / selectionStyle（CSSProperties）替代旧的颜色配置。 */
  MarkerColors,
  /** @deprecated 请使用 markerStyle / selectionStyle（CSSProperties）替代旧的颜色配置。 */
  MarkerStrokeStyle,
  MousePosition,
  /** @deprecated 请使用 selectionStyle（CSSProperties）替代 newSelectionOptions.color。 */
  NewSelectionOptions,
  OverlayRect,
  OverlayRectType,
  PercentOverlayRect,
  SelectionEndpoint,
  SelectionHandleOwner,
  SelectionHandleType,
  SelectionProps,
  SelectionRange,
  SelectionRect,
  SelectionRectPoint,
  SelectionRef,
  SelectionTool,
  UseTextSelectionResult,
} from './types';
export { useTextSelection } from './useTextSelection';
