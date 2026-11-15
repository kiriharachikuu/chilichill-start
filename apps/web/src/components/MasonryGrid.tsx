import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface MasonryGridProps<T> {
  items: T[];
  getId: (item: T, index: number) => string;
  // 宽高比（宽/高）；null 表示未知，按 4:5 占位
  getAspectRatio: (item: T) => number | null;
  renderItem: (item: T, index: number) => ReactNode;
}

// 瀑布流网格：测量容器宽度自适应列数（<640 2 列 / <1024 3 列 / 其余 4 列），
// 按最短列优先分配保持阅读顺序，已知宽高比时预占位避免布局跳动。
export default function MasonryGrid<T>({ items, getId, getAspectRatio, renderItem }: MasonryGridProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [columnCount, setColumnCount] = useState(2);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      const width = node.clientWidth;
      setColumnCount(width >= 1024 ? 4 : width >= 640 ? 3 : 2);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const columns = useMemo(() => {
    const heights = new Array<number>(columnCount).fill(0);
    const buckets: { item: T; index: number }[][] = Array.from({ length: columnCount }, () => []);
    items.forEach((item, index) => {
      const ratio = getAspectRatio(item);
      // 估算高度：单位列宽下的相对高度（1/ratio）；未知时按 4:5，另加信息条余量
      const estimated = ratio && ratio > 0 ? 1 / ratio : 1.25;
      let shortest = 0;
      for (let i = 1; i < columnCount; i++) {
        if (heights[i] < heights[shortest]) shortest = i;
      }
      buckets[shortest].push({ item, index });
      heights[shortest] += estimated + 0.12;
    });
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, columnCount, getAspectRatio]);

  return (
    <div ref={containerRef} className="flex items-start gap-3 sm:gap-4">
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-3 sm:gap-4">
          {column.map(({ item, index }) => (
            <div key={getId(item, index)}>{renderItem(item, index)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
