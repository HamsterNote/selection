/**
 * @hamster-note/selection
 * React 文本选区组件库
 *
 * 用法：
 *   import { Selection } from '@hamster-note/selection';
 *   import '@hamster-note/selection/style.css';
 */

export { Selection } from './Selection';
export { useTextSelection } from './useTextSelection';
export type {
  SelectionProps,
  SelectionRange,
  UseTextSelectionResult,
  // 命令式 API 引用类型，供外部按钮调用 highlight()/clear()
  SelectionRef,
  // 鼠标位置（viewport 坐标），用于 onSelectionStart/onSelectionEnd 钩子
  MousePosition,
} from './types';
