import { useCallback, useRef, useState } from 'react';
import { Selection } from '@hamster-note/selection';
import type {
  MousePosition,
  SelectionRange,
  SelectionRef,
} from '@hamster-note/selection';

/**
 * Demo 文案。
 * 内嵌少量带相对定位的 inline 元素（脚注/徽标/嵌套 span），
 * 用于测试 Selection 在子节点存在 position: relative 时的坐标计算是否正确。
 */
const INTRO = 'React 是一个用于构建用户界面的 JavaScript 库。';
const FOOTNOTE_TIP = '组件化拆分 UI';
const BADGE_TIP = 'Virtual DOM';

// 日志事件类型，用于 Demo 中可视化展示钩子触发顺序
type LogKind = 'start' | 'end' | 'highlight';
type LogEntry = { id: number; kind: LogKind; detail: string; ts: string };

export default function App() {
  const [ranges, setRanges] = useState<SelectionRange[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  // 命令式句柄，按钮通过它调用组件的 highlight()
  const selectionRef = useRef<SelectionRef>(null);
  // 日志自增 id，避免 React key 冲突
  const logIdRef = useRef(0);

  const appendLog = useCallback((kind: LogKind, detail: string) => {
    logIdRef.current += 1;
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setLogs((prev) => [{ id: logIdRef.current, kind, detail, ts }, ...prev].slice(0, 20));
  }, []);

  const handleSelect = useCallback((range: SelectionRange) => {
    setRanges((prev) => [...prev, range]);
  }, []);

  const handleRemove = useCallback((id: string) => {
    setRanges((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleSelectionStart = useCallback(
    (pos: MousePosition, sel: Selection) => {
      appendLog('start', `pos=(${pos.x},${pos.y}) anchor="${sel.toString().slice(0, 20)}"`);
    },
    [appendLog],
  );

  const handleSelectionEnd = useCallback(
    (pos: MousePosition, sel: Selection) => {
      appendLog('end', `pos=(${pos.x},${pos.y}) text="${sel.toString().slice(0, 40)}"`);
    },
    [appendLog],
  );

  const handleHighlight = useCallback(
    (range: SelectionRange) => {
      appendLog('highlight', `[${range.start},${range.end}] "${range.text.slice(0, 40)}"`);
    },
    [appendLog],
  );

  // 高亮按钮：mousedown 阻止默认行为，防止按钮抢焦点导致选区被浏览器清空
  const handleHighlightClick = useCallback(() => {
    selectionRef.current?.highlight();
  }, []);
  const handleHighlightMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
  }, []);

  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '48px 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#1a1a1a',
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>@hamster-note/selection</h1>
      <p style={{ color: '#666', marginBottom: 16 }}>
        选中下方文本后，点击右上方的「高亮」按钮添加标记；点击已有高亮可移除。
      </p>

      {/* 工具条：高亮按钮已外置到组件外部，仅通过 ref 调用组件暴露的 highlight() 命令式 API */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 12,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={handleHighlightClick}
          onMouseDown={handleHighlightMouseDown}
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
          高亮选中
        </button>
        <button
          type="button"
          onClick={() => selectionRef.current?.clear()}
          onMouseDown={handleHighlightMouseDown}
          style={{
            padding: '6px 14px',
            background: '#fff',
            color: '#1a1a1a',
            border: '1px solid #d4d4d4',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          清除选区
        </button>
      </div>

      <div
        style={{
          padding: 24,
          background: '#fafafa',
          borderRadius: 8,
          border: '1px solid #e8e8e8',
        }}
      >
        <Selection
          ref={selectionRef}
          ranges={ranges}
          onSelect={handleSelect}
          onRemove={handleRemove}
          onSelectionStart={handleSelectionStart}
          onSelectionEnd={handleSelectionEnd}
          onHighlight={handleHighlight}
        >
          {/*
            混合内容：纯文本 + 多种相对定位 inline 元素。
            目的：验证 Selection 跨节点选择时 OverlayRect 计算（基于 Range.getClientRects 与
            containerRef 的相对坐标）在存在 position: relative 子节点时仍然准确。
          */}
          {INTRO}
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
            {/* 上标徽标：脱离文本流的绝对定位元素，不应影响选区坐标 */}
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
          {'：将 UI 拆分为独立、可复用的组件，每个组件管理自己的状态和渲染逻辑'}
          {/* 内联脚注：position: relative 的 inline-block，含一个 absolute 的 tooltip */}
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
              {FOOTNOTE_TIP}
            </span>
          </span>
          {'。'}
          <br />
          {'React 使用'}
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
            {BADGE_TIP}
          </span>
          {'来高效地更新真实 DOM，只重新渲染发生变化的部分。'}
          <br />
          {'你可以选中文本来添加高亮标记，也可以点击已有高亮来移除它们。试试看吧！'}
        </Selection>
      </div>

      <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>当前高亮（{ranges.length}）</h2>
          {ranges.length === 0 ? (
            <p style={{ color: '#999' }}>还没有高亮内容</p>
          ) : (
            <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
              {ranges.map((r) => (
                <li key={r.id}>「{r.text}」</li>
              ))}
            </ul>
          )}
        </div>
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
                maxHeight: 280,
                overflowY: 'auto',
              }}
            >
              {logs.map((l) => (
                <li
                  key={l.id}
                  style={{
                    padding: '4px 8px',
                    borderLeft: `3px solid ${
                      l.kind === 'start' ? '#74c0fc' : l.kind === 'end' ? '#ffa94d' : '#51cf66'
                    }`,
                    background: '#fff',
                    marginBottom: 4,
                    borderRadius: 2,
                  }}
                >
                  <span style={{ color: '#999', marginRight: 6 }}>{l.ts}</span>
                  <strong style={{ marginRight: 6 }}>{l.kind}</strong>
                  <span style={{ color: '#333' }}>{l.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
