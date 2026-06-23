import { useState } from 'react';
import { Selection } from '@hamster-note/selection';
import type { SelectionRange } from '@hamster-note/selection';

const SAMPLE_TEXT = `React 是一个用于构建用户界面的 JavaScript 库。
它的核心思想是组件化：将 UI 拆分为独立、可复用的组件，每个组件管理自己的状态和渲染逻辑。
React 使用虚拟 DOM 来高效地更新真实 DOM，只重新渲染发生变化的部分，从而保证性能。
你可以选中文本来添加高亮标记，也可以点击已有高亮来移除它们。
试试看吧！`;

export default function App() {
  const [ranges, setRanges] = useState<SelectionRange[]>([]);

  const handleSelect = (range: SelectionRange) => {
    setRanges((prev) => [...prev, range]);
  };

  const handleRemove = (id: string) => {
    setRanges((prev) => prev.filter((r) => r.id !== id));
  };

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
      <p style={{ color: '#666', marginBottom: 32 }}>
        文本选区高亮组件 — 选中下方文本，点击「高亮」按钮添加标记
      </p>

      <div
        style={{
          padding: 24,
          background: '#fafafa',
          borderRadius: 8,
          border: '1px solid #e8e8e8',
        }}
      >
        <Selection ranges={ranges} onSelect={handleSelect} onRemove={handleRemove}>
          {SAMPLE_TEXT}
        </Selection>
      </div>

      <div style={{ marginTop: 32 }}>
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
    </div>
  );
}
