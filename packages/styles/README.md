# @chilichill/styles（已拆分为独立仓库）

本样式库已从 monorepo **物理拆分**为独立仓库，独立维护版本与发布：

> **仓库位置**：`e:\code\chilichill-styles`
> **计划远程地址**：`https://github.com/kiriharachikuu/chilichill-styles`（预留）

- 包名：`@chilichill/styles`（原 `@spaceport/styles`）
- 目录结构、构建、预览、令牌说明见独立仓库的 [README](../../../chilichill-styles/README.md)

## 常用命令（在独立仓库内执行）

```bash
npm install       # 安装构建依赖
npm run build     # 产出 dist/index.css / index.min.css / tokens
npm run preview   # 组件预览页 http://localhost:4321
```

## 引用方式

```bash
npm install @chilichill/styles
```

```js
import '@chilichill/styles';      // 开发版
import '@chilichill/styles/min';  // 生产压缩版
```

独立发布 npm 包前，也可直接复制 `dist/index.css` 到项目内引用。

> 主站（apps/web）当前使用 Tailwind 自建组件体系，暂未依赖本包；组件库按独立节奏更新。
