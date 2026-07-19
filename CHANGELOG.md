# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-07-19

### 修复

- 联动模式下无原生选区时发布激活范围的问题

### 新增

- `overlayRectType` 的测试覆盖 (`Selection.overlayRectType.test.tsx`)

## [0.1.0] - 2026-07-12

### 新增

- 矩形工具模式，支持跨工具选区兼容
- 新测试套件：`demo.app.test.tsx`、扩展的 `Selection.rect.test.tsx`

### 变更

- 重构 `Selection.tsx` 核心渲染和交互逻辑 (+1031/-531 行)
- 更新 `styleUtils.ts` 和 `useTextSelection.ts` 以支持矩形工具
- 扩展所有选区模块的测试覆盖

### 修复

- 矩形工具手柄渲染和联动模式跨容器守卫
- 移动端选区：基于令牌的点击跳过、多指守卫、空白点击清除
- 滚动时选区覆盖层重新计算
- 演示应用中日志键重复
- CI 配置：添加测试步骤、忽略 `.omo/`、为 vitest 设置包别名

## [0.0.2-beta.1] - 2026-07-02

### 变更

- 版本号迭代更新，无功能性变更

## [0.0.1-beta.2] - 2026-07-02

### 变更

- 版本号迭代更新，无功能性变更

## [0.0.1-beta] - 2026-07-02

### 新增

- 移动端触摸选区支持，包含共享联动激活范围
- `markerStyle` 和 `selectionStyle` 属性，支持样式快照持久化
- `overlayRectType` 属性，支持 px/百分比 覆盖层渲染
- 联动选区几何图形和类型扩展
- 联动项交互支持
- 跨选区范围捕获
- 联动容器注册
- 联动作用域几何图形渲染
- 选区弹窗、拖拽手柄和新选区选项
- 手柄渲染、标记颜色和手柄行为优化
- 弹窗交互和拖拽手柄改进

### 变更

- 将 `hideHandlesOnSelection` 替换为联动拖拽状态同步
- 增强选区交互和跨容器拖拽支持
- 优化选区覆盖矩形和弹窗交互
- 将 `hideHandlesOnFirstSelection` 重命名为 `hideHandlesOnSelection`

### 修复

- 三个移动端选区 bug：结束回调、弹窗点击和点击取消选中
- 重新选择期间隐藏激活弹窗，改进拖拽手柄处理
- 选择文本时隐藏选区弹窗
- 当 `overlayRectType` 为百分比时，使用百分比定位手柄和弹窗
- 选中高亮样式处理和 `overlayRectType` 默认值
