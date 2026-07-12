import {
  type HandleRenderProps,
  type LinkedSelectionData,
  type LinkedSelectionRange,
  type MousePosition,
  type OverlayRectType,
  Selection,
  type SelectionRange,
  type SelectionRect,
  type SelectionRef,
  type SelectionTool,
} from '@hamster-note/selection';
import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * ─────────────────────────────────────────────────────────────
 * 多区域联动（Linked Mode）Demo
 * ─────────────────────────────────────────────────────────────
 * 本 Demo 展示如何用统一的 `overallData: LinkedSelectionData` 在多个
 * Selection 区域之间共享高亮数据。顶部两个面板（page-a / page-b）均
 * 启用 linkedMode 并共享同一份 overallData；底部保留一个 legacy 模式
 * 面板，使用旧的扁平 ranges 状态以验证向后兼容。
 */

// ── linked 模式文案（page-a / page-b 各包含相对定位 inline 元素）─────────
const INTRO_A = 'React 是一个用于构建用户界面的 JavaScript 库。';
const FOOTNOTE_TIP_A = '组件化拆分 UI';
const BADGE_TIP_A = 'Virtual DOM';

const INTRO_B = 'Vue 是一套用于构建用户界面的渐进式框架。';
const FOOTNOTE_TIP_B = '响应式数据绑定';
const BADGE_TIP_B = 'Single File Component';

// ── legacy 模式文案 ──────────────────────────────────────────────
const LEGACY_TEXT = '此面板使用旧版（非联动）模式，仅做兼容性验证。你可以选中文本并高亮。';

// 日志事件类型，用于 Demo 中可视化展示钩子触发顺序
type LogKind = 'start' | 'end' | 'highlight' | 'linked-select' | 'linked-update';
type LogEntry = { id: number; kind: LogKind; source: string; detail: string; ts: string };

// 联动模式选区 ID 常量
const PAGE_A = 'page-a';
const PAGE_B = 'page-b';
const LINKED_SELECTION_IDS = [PAGE_A, PAGE_B] as const;

export default function App() {
  // ─────────────────────────────────────────────────────────────
  // 联动模式：统一的 overallData 状态
  // shape: { items: LinkedSelectionRange[]; selectedRangeId: string | null; selectionOrder: string[] }
  // ─────────────────────────────────────────────────────────────
  const [overallData, setOverallData] = useState<LinkedSelectionData>({
    items: [],
    selectedRangeId: null,
    selectionOrder: [],
  });

  // ─────────────────────────────────────────────────────────────
  // Legacy 模式：保持旧的扁平 ranges 状态
  // ─────────────────────────────────────────────────────────────
  const [legacyRanges, setLegacyRanges] = useState<SelectionRange[]>([]);
  const [legacySelectedId, setLegacySelectedId] = useState<string | null>(null);

  // ── 日志 ──────────────────────────────────────────────────────
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);
  const appendLog = useCallback((kind: LogKind, source: string, detail: string) => {
    logIdRef.current += 1;
    const id = logIdRef.current;
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setLogs((prev) => [{ id, kind, source, detail, ts }, ...prev].slice(0, 30));
  }, []);

  // ── per-selection refs：每个联动面板的命令式句柄 ──────────────
  const linkedRefs = useRef<Record<string, SelectionRef | null>>({
    [PAGE_A]: null,
    [PAGE_B]: null,
  });
  // 跟踪最近被交互的联动选区 id，用于「高亮选中」按钮定位
  const [activeLinkedId, setActiveLinkedId] = useState<string>(PAGE_A);
  // legacy ref
  const legacyRef = useRef<SelectionRef>(null);

  // ── 视图切换 ──────────────────────────────────────────────────
  const [showLegacy, setShowLegacy] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // 新功能演示控制面板状态（联动和 legacy 面板共享）
  // ─────────────────────────────────────────────────────────────
  // Feature 1：自定义手柄渲染
  const [customHandleMode, setCustomHandleMode] = useState<'default' | 'square' | 'hidden'>(
    'default',
  );
  // Feature 3：标记颜色预设方案
  const [colorPreset, setColorPreset] = useState<'default' | 'blue' | 'green' | 'purple'>(
    'default',
  );
  const [overlayRectType, setOverlayRectType] = useState<OverlayRectType>('px');
  const [tool, setTool] = useState<SelectionTool>('text');

  const [rects, setRects] = useState<SelectionRect[]>([]);
  const [selectedRectId, setSelectedRectId] = useState<string | null>(null);

  // 注入旧 linked 数据（无 overlayRectType）用于向后兼容 QA
  const injectOldLinkedData = useCallback(() => {
    setOverallData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: `legacy-linked-${Date.now()}`,
          text: '旧数据兼容性测试',
          start: { selectionId: PAGE_A, offset: 0 },
          end: { selectionId: PAGE_A, offset: 8 },
          createdAt: Date.now(),
          rectsBySelectionId: {
            [PAGE_A]: [{ x: 5, y: 5, width: 40, height: 10 }],
          },
        },
      ],
      selectedRangeId: null,
    }));
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 联动模式回调
  // ─────────────────────────────────────────────────────────────

  /**
   * onLinkedDataChange 是联动模式的主状态更新入口。
   * Selection 组件在添加 / 拖拽更新后会调用此回调并传入完整的 next data，
   * 因此直接 setOverallData 即可完成 items 追加 / 不可变更新。
   */
  const handleLinkedDataChange = useCallback(
    (next: LinkedSelectionData) => {
      setOverallData({ ...next, overlayRectType: next.overlayRectType ?? overlayRectType });
      if (next.selectedRangeId !== null) {
        setLegacySelectedId(null);
        setSelectedRectId(null);
      }
    },
    [overlayRectType],
  );

  const clearLinkedSelectedRange = useCallback(() => {
    setOverallData((prev) =>
      prev.selectedRangeId === null ? prev : { ...prev, selectedRangeId: null },
    );
  }, []);

  /**
   * onLinkedSelect：联动模式下确认高亮时触发（已在 onLinkedDataChange 中完成 items 追加）。
   * 这里仅记录日志，包含 linked item id 和端点信息。
   */
  const handleLinkedSelect = useCallback(
    (range: LinkedSelectionRange) => {
      setActiveLinkedId(range.start.selectionId);
      appendLog(
        'linked-select',
        `${range.start.selectionId}→${range.end.selectionId}`,
        `[${range.id}] "${range.text.slice(0, 40)}" ` +
          `start=${range.start.selectionId}:${range.start.offset} ` +
          `end=${range.end.selectionId}:${range.end.offset}`,
      );
    },
    [appendLog],
  );

  /**
   * onLinkedUpdateRange：拖拽手柄调整范围后触发（onLinkedDataChange 同步更新 items）。
   * 这里仅记录日志。
   */
  const handleLinkedUpdateRange = useCallback(
    (range: LinkedSelectionRange) => {
      appendLog(
        'linked-update',
        `${range.start.selectionId}→${range.end.selectionId}`,
        `[update ${range.id}] "${range.text.slice(0, 40)}" ` +
          `start=${range.start.selectionId}:${range.start.offset} ` +
          `end=${range.end.selectionId}:${range.end.offset}`,
      );
    },
    [appendLog],
  );

  /**
   * onLinkedSelectRange：点击高亮切换选中 / 开始拖选新文本时触发。
   * 这条路径不经过 onLinkedDataChange，因此需自行更新 selectedRangeId。
   * 删除选中项时也需清空 selectedRangeId。
   */
  const handleLinkedSelectRange = useCallback((id: string | null) => {
    setOverallData((prev) =>
      prev.selectedRangeId === id ? prev : { ...prev, selectedRangeId: id },
    );
    setLegacySelectedId(null);
    setSelectedRectId(null);
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 联动模式：删除操作
  // ─────────────────────────────────────────────────────────────

  /** 删除当前选中的联动 item，并清空 selectedRangeId */
  const handleLinkedDeleteSelected = useCallback(() => {
    setOverallData((prev) => {
      if (!prev.selectedRangeId) return prev;
      const next: LinkedSelectionData = {
        ...prev,
        items: prev.items.filter((r) => r.id !== prev.selectedRangeId),
        selectedRangeId: null,
      };
      return next;
    });
  }, []);

  /** 从联动列表删除指定 item */
  const handleLinkedDeleteRange = useCallback((id: string) => {
    setOverallData((prev) => ({
      ...prev,
      items: prev.items.filter((r) => r.id !== id),
      selectedRangeId: prev.selectedRangeId === id ? null : prev.selectedRangeId,
    }));
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Legacy 模式回调（保持原逻辑不变）
  // ─────────────────────────────────────────────────────────────
  const handleLegacySelect = useCallback((range: SelectionRange) => {
    setLegacyRanges((prev) => [...prev, range]);
  }, []);

  const handleLegacySelectRange = useCallback(
    (id: string | null) => {
      clearLinkedSelectedRange();
      setLegacySelectedId(id);
      setSelectedRectId(null);
    },
    [clearLinkedSelectedRange],
  );

  const handleLegacyUpdateRange = useCallback((updated: SelectionRange) => {
    setLegacyRanges((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  const handleLegacyDeleteSelected = useCallback(() => {
    if (!legacySelectedId) return;
    setLegacyRanges((prev) => prev.filter((r) => r.id !== legacySelectedId));
    setLegacySelectedId(null);
  }, [legacySelectedId]);

  const handleLegacyDeleteRange = useCallback((id: string) => {
    setLegacyRanges((prev) => prev.filter((r) => r.id !== id));
    setLegacySelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const handleCreateRect = useCallback((rect: SelectionRect) => {
    setRects((prev) => [...prev, rect]);
    setSelectedRectId(rect.id);
  }, []);

  const handleSelectRect = useCallback(
    (id: string | null) => {
      clearLinkedSelectedRange();
      setLegacySelectedId(null);
      setSelectedRectId(id);
    },
    [clearLinkedSelectedRange],
  );

  const handleUpdateRect = useCallback((rect: SelectionRect) => {
    setRects((prev) => prev.map((r) => (r.id === rect.id ? rect : r)));
  }, []);

  const handleDeleteRect = useCallback((id: string) => {
    setRects((prev) => prev.filter((r) => r.id !== id));
    setSelectedRectId((prev) => (prev === id ? null : prev));
  }, []);

  const handleDeleteSelectedRect = useCallback(() => {
    if (!selectedRectId) return;
    setRects((prev) => prev.filter((r) => r.id !== selectedRectId));
    setSelectedRectId(null);
  }, [selectedRectId]);

  // ─────────────────────────────────────────────────────────────
  // 通用钩子：onSelectionStart / onSelectionEnd（联动和 legacy 共用日志逻辑）
  // ─────────────────────────────────────────────────────────────
  const makeSelectionStart = useCallback(
    (source: string) => (pos: MousePosition, sel: Selection) => {
      if (source === PAGE_A || source === PAGE_B) setActiveLinkedId(source);
      appendLog('start', source, `pos=(${pos.x},${pos.y}) "${sel.toString().slice(0, 20)}"`);
    },
    [appendLog],
  );

  const makeSelectionEnd = useCallback(
    (source: string) => (pos: MousePosition, sel: Selection) => {
      if (source === PAGE_A || source === PAGE_B) setActiveLinkedId(source);
      appendLog('end', source, `pos=(${pos.x},${pos.y}) "${sel.toString().slice(0, 40)}"`);
    },
    [appendLog],
  );

  const handleLegacyHighlight = useCallback(
    (range: SelectionRange) => {
      appendLog(
        'highlight',
        'legacy',
        `[${range.start},${range.end}] "${range.text.slice(0, 40)}"`,
      );
    },
    [appendLog],
  );

  // ── 高亮按钮（防焦点抢占）──────────────────────────────────────
  const preventFocusLoss = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
  }, []);

  const handleLinkedConfirm = useCallback((selectionId: string) => {
    linkedRefs.current[selectionId]?.confirm();
  }, []);

  const handleLinkedToolbarConfirm = useCallback(() => {
    handleLinkedConfirm(activeLinkedId);
  }, [activeLinkedId, handleLinkedConfirm]);

  const handleLegacyHighlightClick = useCallback(() => {
    legacyRef.current?.highlight();
  }, []);

  const handleConfirmRectClick = useCallback(() => {
    legacyRef.current?.confirmRect();
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Feature 2：自定义手柄渲染函数（联动和 legacy 共用）
  // ─────────────────────────────────────────────────────────────
  const renderHandle = useMemo(() => {
    if (customHandleMode === 'default') return undefined;
    return (props: HandleRenderProps) => {
      if (customHandleMode === 'hidden') return null;
      return (
        <button
          type="button"
          aria-label={props.ariaLabel}
          className={props.className}
          onPointerDown={props.onPointerDown}
          style={{
            ...props.style,
            borderRadius: 2,
            width: 12,
            height: 12,
            border: `2px solid ${props.style.borderColor ?? '#fff'}`,
            background: props.style.background ?? '#ff4fa3',
            cursor: 'grab',
            transform: props.isDragging ? 'scale(1.3)' : 'scale(1)',
            transition: 'transform 0.1s ease',
          }}
        />
      );
    };
  }, [customHandleMode]);

  const { markerStyle, selectionStyle } = useMemo<{
    markerStyle: React.CSSProperties | undefined;
    selectionStyle: React.CSSProperties | undefined;
  }>(() => {
    switch (colorPreset) {
      case 'blue':
        return {
          markerStyle: {
            backgroundColor: 'rgba(64,156,255,0.4)',
            borderColor: '#1c7ed6',
            borderWidth: 2,
            borderStyle: 'solid',
          },
          selectionStyle: {
            backgroundColor: 'rgba(64,156,255,0.35)',
            borderColor: 'rgba(64,156,255,0.6)',
            borderWidth: 1,
            borderStyle: 'solid',
          },
        };
      case 'green':
        return {
          markerStyle: {
            backgroundColor: 'rgba(64,192,87,0.4)',
            borderColor: '#2f9e44',
            borderWidth: 2,
            borderStyle: 'solid',
          },
          selectionStyle: {
            backgroundColor: 'rgba(64,192,87,0.35)',
            borderColor: 'rgba(64,192,87,0.6)',
            borderWidth: 1,
            borderStyle: 'solid',
          },
        };
      case 'purple':
        return {
          markerStyle: {
            backgroundColor: 'rgba(156,81,255,0.4)',
            borderColor: '#7048e8',
            borderWidth: 2,
            borderStyle: 'solid',
          },
          selectionStyle: {
            backgroundColor: 'rgba(156,81,255,0.35)',
            borderColor: 'rgba(156,81,255,0.6)',
            borderWidth: 1,
            borderStyle: 'solid',
          },
        };
      default:
        return {
          markerStyle: { backgroundColor: 'rgba(255, 213, 79, 0.4)' },
          selectionStyle: { backgroundColor: 'rgba(255, 105, 180, 0.45)' },
        };
    }
  }, [colorPreset]);

  // ── 共享样式工具 ──────────────────────────────────────────────
  const panelStyle: React.CSSProperties = {
    padding: 24,
    background: '#fafafa',
    borderRadius: 8,
    border: '1px solid #e8e8e8',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 8,
    color: '#495057',
  };

  // 高亮弹窗（联动模式共用删除按钮）
  const linkedPopover = (
    <button
      type="button"
      onClick={handleLinkedDeleteSelected}
      onMouseDown={preventFocusLoss}
      style={{
        padding: '4px 10px',
        background: '#fa5252',
        color: '#fff',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      }}
    >
      删除
    </button>
  );

  const makeLinkedSelectionPopover = (selectionId: string) => (
    <button
      type="button"
      onClick={() => handleLinkedConfirm(selectionId)}
      onMouseDown={preventFocusLoss}
      style={{
        padding: '4px 10px',
        background: '#1a1a1a',
        color: '#fff',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      }}
    >
      {tool === 'rect' ? '确认矩形' : '高亮'}
    </button>
  );

  return (
    <div
      style={{
        maxWidth: 920,
        margin: '0 auto',
        padding: '48px 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#1a1a1a',
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>@hamster-note/selection</h1>
      <p style={{ color: '#666', marginBottom: 16 }}>
        多区域联动 Demo：两个面板（page-a / page-b）共享同一份 overallData，支持跨区域高亮和拖拽。
        底部保留 legacy 兼容模式面板。
      </p>

      {/* ─────────── 新功能演示控制面板 ─────────── */}
      <div
        style={{
          marginBottom: 16,
          padding: 16,
          background: '#f8f9fa',
          borderRadius: 8,
          border: '1px solid #dee2e6',
        }}
      >
        <h3 style={{ fontSize: 14, margin: '0 0 12px', color: '#495057' }}>新功能演示控制</h3>

        {/* 视图切换 */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={showLegacy}
            onChange={(e) => setShowLegacy(e.target.checked)}
          />
          <span>
            <strong>显示 legacy 兼容面板</strong>
            <span style={{ color: '#888' }}> — 使用旧版扁平 ranges 状态（非联动模式）</span>
          </span>
        </label>

        {/* Feature 1：手柄渲染模式 */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 13, marginRight: 8 }}>
            <strong>renderHandle</strong>
            <span style={{ color: '#888' }}> — 手柄渲染模式：</span>
          </span>
          {(['default', 'square', 'hidden'] as const).map((mode) => (
            <label key={mode} style={{ marginRight: 12, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name="handle-mode"
                checked={customHandleMode === mode}
                onChange={() => setCustomHandleMode(mode)}
                style={{ marginRight: 4 }}
              />
              {mode === 'default' ? '内置圆形' : mode === 'square' ? '自定义方形' : '隐藏(null)'}
            </label>
          ))}
        </div>

        {/* Feature 3：样式预设 */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 13, marginRight: 8 }}>
            <strong>markerStyle / selectionStyle</strong>
            <span style={{ color: '#888' }}> — 样式预设：</span>
          </span>
          {(['default', 'blue', 'green', 'purple'] as const).map((preset) => (
            <label key={preset} style={{ marginRight: 12, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name="color-preset"
                checked={colorPreset === preset}
                onChange={() => setColorPreset(preset)}
                style={{ marginRight: 4 }}
              />
              {preset === 'default' ? '默认(黄/粉)' : preset}
            </label>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 8px' }}>
          提示：先创建一个高亮，再切换预设颜色，旧高亮会保持原先快照进数据的样式，只有新高亮才使用新预设。
        </p>

        {/* Feature 4：Overlay Rect Type */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 13, marginRight: 8 }}>
            <strong>overlayRectType</strong>
            <span style={{ color: '#888' }}> — 覆盖层坐标单位：</span>
          </span>
          {(['px', 'percent'] as const).map((mode) => (
            <label key={mode} style={{ marginRight: 12, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name="overlay-rect-type"
                value={mode}
                checked={overlayRectType === mode}
                onChange={() => {
                  setOverlayRectType(mode);
                  setOverallData((prev) => ({ ...prev, overlayRectType: mode }));
                }}
                style={{ marginRight: 4 }}
              />
              {mode === 'px' ? '像素 (SVG)' : '百分比 (div)'}
            </label>
          ))}
        </div>

        {/* Feature 5：Selection Tool */}
        <div>
          <span style={{ fontSize: 13, marginRight: 8 }}>
            <strong>tool</strong>
            <span style={{ color: '#888' }}> — 当前激活工具：</span>
          </span>
          {(['text', 'rect'] as const).map((mode) => (
            <label key={mode} style={{ marginRight: 12, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name="selection-tool"
                value={mode}
                checked={tool === mode}
                onChange={() => setTool(mode)}
                style={{ marginRight: 4 }}
              />
              {mode === 'text' ? '文本选择 (text)' : '矩形框选 (rect)'}
            </label>
          ))}
        </div>
      </div>

      {/* ─────────── 联动模式工具条 ─────────── */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 13, color: '#888' }}>高亮按钮作用于：</span>
        {LINKED_SELECTION_IDS.map((id) => (
          <label key={id} style={{ fontSize: 13, cursor: 'pointer', marginRight: 8 }}>
            <input
              type="radio"
              name="active-linked"
              checked={activeLinkedId === id}
              onChange={() => setActiveLinkedId(id)}
              style={{ marginRight: 4 }}
            />
            {id}
          </label>
        ))}
        <button
          type="button"
          onClick={handleLinkedToolbarConfirm}
          onMouseDown={preventFocusLoss}
          style={{
            padding: '6px 14px',
            background: '#1a1a1a',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {tool === 'rect' ? '确认矩形' : '高亮选中'}（{activeLinkedId}）
        </button>
        <button
          type="button"
          onClick={handleLinkedDeleteSelected}
          onMouseDown={preventFocusLoss}
          disabled={!overallData.selectedRangeId}
          style={{
            padding: '6px 14px',
            background: overallData.selectedRangeId ? '#fa5252' : '#f1f1f1',
            color: overallData.selectedRangeId ? '#fff' : '#bbb',
            border: overallData.selectedRangeId ? 'none' : '1px solid #e0e0e0',
            borderRadius: 6,
            cursor: overallData.selectedRangeId ? 'pointer' : 'not-allowed',
            fontSize: 13,
          }}
        >
          删除选中
        </button>
        <button
          type="button"
          onClick={injectOldLinkedData}
          onMouseDown={preventFocusLoss}
          style={{
            padding: '6px 14px',
            background: '#7048e8',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          注入旧 linked 数据（无 overlayRectType）
        </button>
      </div>

      {/* ─────────── 联动模式：两个面板 ─────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* page-a */}
        <div style={panelStyle}>
          <div style={labelStyle}>selectionId = "{PAGE_A}"</div>
          <Selection
            ref={(r) => {
              linkedRefs.current[PAGE_A] = r;
            }}
            selectionId={PAGE_A}
            linkedMode={true}
            linkedData={overallData}
            onLinkedDataChange={handleLinkedDataChange}
            onLinkedSelect={handleLinkedSelect}
            onLinkedUpdateRange={handleLinkedUpdateRange}
            onLinkedSelectRange={handleLinkedSelectRange}
            tool={tool}
            rects={rects}
            selectedRectId={selectedRectId}
            onCreateRect={handleCreateRect}
            onSelectRect={handleSelectRect}
            onUpdateRect={handleUpdateRect}
            // legacy 兼容回调：同区域高亮时仍会触发（用于日志）
            ranges={[]}
            selectedRangeId={null}
            onSelectionStart={makeSelectionStart(PAGE_A)}
            onSelectionEnd={makeSelectionEnd(PAGE_A)}
            renderHandle={renderHandle}
            markerStyle={markerStyle}
            selectionStyle={selectionStyle}
            popover={linkedPopover}
            selectionPopover={makeLinkedSelectionPopover(PAGE_A)}
            overlayRectType={overlayRectType}
          >
            {INTRO_A}
            {' 它的核心思想是'}
            <span
              style={{
                position: 'relative',
                padding: '0 4px',
                background: '#fff3bf',
                borderRadius: 3,
              }}
            >
              组件化
              <sup
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -10,
                  fontSize: 10,
                  color: '#fa5252',
                  background: '#fff',
                  padding: '0 4px',
                  borderRadius: 8,
                  border: '1px solid #fa5252',
                }}
              >
                NEW
              </sup>
            </span>
            {'：将 UI 拆分为独立、可复用的组件。'}
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <sup style={{ color: '#1971c2', cursor: 'help' }}>[1]</sup>
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '100%',
                  fontSize: 11,
                  color: '#666',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                {FOOTNOTE_TIP_A}
              </span>
            </span>
            {'。React 使用'}
            <span
              style={{
                position: 'relative',
                display: 'inline-block',
                padding: '2px 8px',
                margin: '0 2px',
                background: '#e7f5ff',
                border: '1px solid #74c0fc',
                borderRadius: 4,
                transform: 'translateY(-1px)',
              }}
            >
              {BADGE_TIP_A}
            </span>
            {'来高效更新 DOM。'}
          </Selection>
        </div>

        {/* page-b */}
        <div style={panelStyle}>
          <div style={labelStyle}>selectionId = "{PAGE_B}"</div>
          <Selection
            ref={(r) => {
              linkedRefs.current[PAGE_B] = r;
            }}
            selectionId={PAGE_B}
            linkedMode={true}
            linkedData={overallData}
            onLinkedDataChange={handleLinkedDataChange}
            onLinkedSelect={handleLinkedSelect}
            onLinkedUpdateRange={handleLinkedUpdateRange}
            onLinkedSelectRange={handleLinkedSelectRange}
            tool={tool}
            rects={rects}
            selectedRectId={selectedRectId}
            onCreateRect={handleCreateRect}
            onSelectRect={handleSelectRect}
            onUpdateRect={handleUpdateRect}
            ranges={[]}
            selectedRangeId={null}
            onSelectionStart={makeSelectionStart(PAGE_B)}
            onSelectionEnd={makeSelectionEnd(PAGE_B)}
            renderHandle={renderHandle}
            markerStyle={markerStyle}
            selectionStyle={selectionStyle}
            popover={linkedPopover}
            selectionPopover={makeLinkedSelectionPopover(PAGE_B)}
            overlayRectType={overlayRectType}
          >
            {INTRO_B}
            {' 与其它框架不同的是，它通过'}
            <span
              style={{
                position: 'relative',
                padding: '0 4px',
                background: '#d3f9d8',
                borderRadius: 3,
              }}
            >
              响应式
              <sup
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -10,
                  fontSize: 10,
                  color: '#2f9e44',
                  background: '#fff',
                  padding: '0 4px',
                  borderRadius: 8,
                  border: '1px solid #2f9e44',
                }}
              >
                VUE
              </sup>
            </span>
            {' 自动追踪依赖。'}
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <sup style={{ color: '#1971c2', cursor: 'help' }}>[2]</sup>
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '100%',
                  fontSize: 11,
                  color: '#666',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                {FOOTNOTE_TIP_B}
              </span>
            </span>
            {' Vue 推广'}
            <span
              style={{
                position: 'relative',
                display: 'inline-block',
                padding: '2px 8px',
                margin: '0 2px',
                background: '#fff4d6',
                border: '1px solid #ffd43b',
                borderRadius: 4,
                transform: 'translateY(-1px)',
              }}
            >
              {BADGE_TIP_B}
            </span>
            {'，将模板、逻辑和样式组合在单个文件中。'}
          </Selection>
        </div>
      </div>

      {/* ─────────── Legacy 兼容面板 ─────────── */}
      {showLegacy && (
        <>
          <h2
            style={{
              fontSize: 16,
              marginBottom: 8,
              marginTop: 24,
              padding: '8px 12px',
              background: '#f1f3f5',
              borderRadius: 6,
            }}
          >
            Legacy 兼容模式（非联动，使用旧版 ranges 状态）
          </h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleLegacyHighlightClick}
              onMouseDown={preventFocusLoss}
              style={{
                padding: '6px 14px',
                background: '#1a1a1a',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              高亮选中（legacy）
            </button>
            <button
              type="button"
              onClick={handleLegacyDeleteSelected}
              onMouseDown={preventFocusLoss}
              disabled={!legacySelectedId}
              style={{
                padding: '6px 14px',
                background: legacySelectedId ? '#fa5252' : '#f1f1f1',
                color: legacySelectedId ? '#fff' : '#bbb',
                border: legacySelectedId ? 'none' : '1px solid #e0e0e0',
                borderRadius: 6,
                cursor: legacySelectedId ? 'pointer' : 'not-allowed',
                fontSize: 13,
              }}
            >
              删除选中
            </button>
          </div>
          <div style={panelStyle}>
            <div style={labelStyle}>legacy（无 linkedMode / 无 selectionId / 无 linked props）</div>
            <Selection
              ref={legacyRef}
              tool={tool}
              rects={rects}
              selectedRectId={selectedRectId}
              onCreateRect={handleCreateRect}
              onSelectRect={handleSelectRect}
              onUpdateRect={handleUpdateRect}
              ranges={legacyRanges}
              selectedRangeId={legacySelectedId}
              onSelect={handleLegacySelect}
              onSelectRange={handleLegacySelectRange}
              onSelectionStart={makeSelectionStart('legacy')}
              onSelectionEnd={makeSelectionEnd('legacy')}
              onHighlight={handleLegacyHighlight}
              onUpdateRange={handleLegacyUpdateRange}
              renderHandle={renderHandle}
              markerStyle={markerStyle}
              selectionStyle={selectionStyle}
              popover={
                <button
                  type="button"
                  onClick={handleLegacyDeleteSelected}
                  onMouseDown={preventFocusLoss}
                  style={{
                    padding: '4px 10px',
                    background: '#fa5252',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                  }}
                >
                  删除
                </button>
              }
              selectionPopover={
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    onClick={handleLegacyHighlightClick}
                    onMouseDown={preventFocusLoss}
                    style={{
                      padding: '4px 10px',
                      background: '#1a1a1a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                    }}
                  >
                    高亮
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRectClick}
                    onMouseDown={preventFocusLoss}
                    style={{
                      padding: '4px 10px',
                      background: '#7048e8',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                    }}
                  >
                    确认矩形
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelectedRect}
                    onMouseDown={preventFocusLoss}
                    style={{
                      padding: '4px 10px',
                      background: '#fa5252',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                      display: selectedRectId ? 'block' : 'none',
                    }}
                  >
                    删矩形
                  </button>
                </div>
              }
              overlayRectType={overlayRectType}
            >
              {LEGACY_TEXT}
              <br />
              {'这里也有一些'}
              <span
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  padding: '2px 8px',
                  margin: '0 2px',
                  background: '#e7f5ff',
                  border: '1px solid #74c0fc',
                  borderRadius: 4,
                }}
              >
                相对定位元素
                <sup
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -10,
                    fontSize: 10,
                    color: '#fa5252',
                    background: '#fff',
                    padding: '0 4px',
                    borderRadius: 8,
                    border: '1px solid #fa5252',
                  }}
                >
                  OLD
                </sup>
              </span>
              {'用于继续测试坐标计算。'}
            </Selection>
          </div>
        </>
      )}

      {/* ─────────── 列表 + 日志 ─────────── */}
      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* 联动高亮列表 */}
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>联动高亮（{overallData.items.length}）</h2>
          {overallData.items.length === 0 ? (
            <p style={{ color: '#999' }}>还没有联动高亮内容</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {overallData.items.map((r) => {
                const isSelected = r.id === overallData.selectedRangeId;
                const spanLabel =
                  r.start.selectionId === r.end.selectionId
                    ? r.start.selectionId
                    : `${r.start.selectionId}→${r.end.selectionId}`;
                return (
                  <li
                    key={r.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 8px',
                      marginBottom: 4,
                      borderRadius: 4,
                      background: isSelected ? '#fff8e1' : '#fff',
                      border: isSelected ? '1px solid #ffc107' : '1px solid #eee',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleLinkedSelectRange(isSelected ? null : r.id)}
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        lineHeight: 1.6,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        color: 'inherit',
                        fontSize: 'inherit',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          color: '#888',
                          background: '#f1f1f1',
                          padding: '1px 5px',
                          borderRadius: 3,
                          marginRight: 6,
                        }}
                      >
                        {spanLabel}
                      </span>
                      「{r.text}」
                      {isSelected && (
                        <strong style={{ color: '#ff9800', fontSize: 12, marginLeft: 4 }}>
                          已选中
                        </strong>
                      )}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          backgroundColor:
                            typeof r.markerStyle?.backgroundColor === 'string'
                              ? r.markerStyle.backgroundColor
                              : '#ccc',
                          border: '1px solid #ccc',
                        }}
                        title={`markerStyle: ${JSON.stringify(r.markerStyle ?? null)}\nselectionStyle: ${JSON.stringify(r.selectionStyle ?? null)}`}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          color: '#888',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          maxWidth: 120,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        markerStyle: {JSON.stringify(r.markerStyle ?? null)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLinkedDeleteRange(r.id)}
                      style={{
                        padding: '2px 8px',
                        background: 'transparent',
                        color: '#fa5252',
                        border: '1px solid #fa5252',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 12,
                        lineHeight: 1.4,
                        flexShrink: 0,
                      }}
                    >
                      删除
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Legacy 列表（仅在 legacy 面板可见时展示） */}
          {showLegacy && (
            <>
              <h2 style={{ fontSize: 16, marginBottom: 8, marginTop: 16, color: '#888' }}>
                Legacy 高亮（{legacyRanges.length}）
              </h2>
              {legacyRanges.length === 0 ? (
                <p style={{ color: '#999' }}>还没有 legacy 高亮</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {legacyRanges.map((r) => {
                    const isSelected = r.id === legacySelectedId;
                    return (
                      <li
                        key={r.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '4px 8px',
                          marginBottom: 4,
                          borderRadius: 4,
                          background: isSelected ? '#fff8e1' : '#fff',
                          border: isSelected ? '1px solid #ffc107' : '1px solid #eee',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleLegacySelectRange(isSelected ? null : r.id)}
                          style={{
                            flex: 1,
                            textAlign: 'left',
                            lineHeight: 1.6,
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            color: 'inherit',
                            fontSize: 'inherit',
                          }}
                        >
                          「{r.text}」
                          {isSelected && (
                            <strong style={{ color: '#ff9800', fontSize: 12, marginLeft: 4 }}>
                              已选中
                            </strong>
                          )}
                          <span
                            style={{
                              display: 'block',
                              fontSize: 10,
                              color: '#888',
                              marginTop: 2,
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            }}
                          >
                            {r.overlayRectType ?? 'px'}: {JSON.stringify(r.rects ?? [])}
                          </span>
                          <span
                            style={{
                              display: 'block',
                              fontSize: 10,
                              color: '#888',
                              marginTop: 2,
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            }}
                          >
                            markerStyle: {JSON.stringify(r.markerStyle ?? null)} | selectionStyle:{' '}
                            {JSON.stringify(r.selectionStyle ?? null)}
                          </span>
                        </button>
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                        >
                          <div
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 3,
                              backgroundColor:
                                typeof r.markerStyle?.backgroundColor === 'string'
                                  ? r.markerStyle.backgroundColor
                                  : '#ccc',
                              border: '1px solid #ccc',
                            }}
                            title={`markerStyle: ${JSON.stringify(r.markerStyle ?? null)}\nselectionStyle: ${JSON.stringify(r.selectionStyle ?? null)}`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLegacyDeleteRange(r.id)}
                          style={{
                            padding: '2px 8px',
                            background: 'transparent',
                            color: '#fa5252',
                            border: '1px solid #fa5252',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 12,
                            lineHeight: 1.4,
                            flexShrink: 0,
                          }}
                        >
                          删除
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          <h2 style={{ fontSize: 16, marginBottom: 8, marginTop: 16, color: '#888' }}>
            Rect 高亮（{rects.length}）
          </h2>
          {rects.length === 0 ? (
            <p style={{ color: '#999' }}>还没有 Rect 高亮</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {rects.map((r) => {
                const isSelected = r.id === selectedRectId;
                return (
                  <li
                    key={r.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 8px',
                      marginBottom: 4,
                      borderRadius: 4,
                      background: isSelected ? '#e3fafc' : '#fff',
                      border: isSelected ? '1px solid #15aabf' : '1px solid #eee',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectRect(isSelected ? null : r.id)}
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        lineHeight: 1.6,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        color: 'inherit',
                        fontSize: 'inherit',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          fontSize: 10,
                          color: '#888',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                      >
                        id: {r.id.slice(0, 8)}... | type: {r.overlayRectType}
                        {r.selectionId ? ` | selectionId: ${r.selectionId}` : ''}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 10,
                          color: '#888',
                          marginTop: 2,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                      >
                        start: ({r.start.x.toFixed(1)}, {r.start.y.toFixed(1)}) | end: (
                        {r.end.x.toFixed(1)}, {r.end.y.toFixed(1)})
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 10,
                          color: '#888',
                          marginTop: 2,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                      >
                        rect: [x:{r.rect.x.toFixed(1)} y:{r.rect.y.toFixed(1)} w:
                        {r.rect.width.toFixed(1)} h:{r.rect.height.toFixed(1)}]
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRect(r.id)}
                      style={{
                        padding: '2px 8px',
                        background: 'transparent',
                        color: '#fa5252',
                        border: '1px solid #fa5252',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 12,
                        lineHeight: 1.4,
                        flexShrink: 0,
                      }}
                    >
                      删除
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 钩子事件日志 */}
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>钩子事件日志</h2>
          {logs.length === 0 ? (
            <p style={{ color: '#999' }}>暂无事件，试着选一段文本看看</p>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12,
                lineHeight: 1.6,
                maxHeight: 360,
                overflowY: 'auto',
              }}
            >
              {logs.map((l) => (
                <li
                  key={l.id}
                  style={{
                    padding: '4px 8px',
                    borderLeft: `3px solid ${
                      l.kind === 'start'
                        ? '#74c0fc'
                        : l.kind === 'end'
                          ? '#ffa94d'
                          : l.kind === 'highlight'
                            ? '#51cf66'
                            : l.kind === 'linked-select'
                              ? '#d0bfff'
                              : '#fcc419'
                    }`,
                    background: '#fff',
                    marginBottom: 4,
                    borderRadius: 2,
                  }}
                >
                  <span style={{ color: '#999', marginRight: 6 }}>{l.ts}</span>
                  <strong style={{ marginRight: 6 }}>{l.kind}</strong>
                  <span
                    style={{
                      color: '#888',
                      marginRight: 6,
                      fontSize: 10,
                      background: '#f1f1f1',
                      padding: '1px 5px',
                      borderRadius: 3,
                    }}
                  >
                    {l.source}
                  </span>
                  <span style={{ color: '#333' }}>{l.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ─────────── overallData JSON 检查面板（默认折叠）─────────── */}
      <details
        style={{
          marginTop: 24,
          background: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: 8,
          padding: '12px 16px',
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            color: '#495057',
            userSelect: 'none',
          }}
        >
          overallData JSON（点击展开）
        </summary>
        <pre
          style={{
            marginTop: 12,
            padding: 12,
            background: '#fff',
            border: '1px solid #e8e8e8',
            borderRadius: 6,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            lineHeight: 1.6,
            overflow: 'auto',
            whiteSpace: 'pre',
            maxHeight: 480,
          }}
        >
          {JSON.stringify(overallData, null, 2)}
        </pre>
      </details>
    </div>
  );
}
