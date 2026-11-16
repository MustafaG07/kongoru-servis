import { useEffect, useMemo, useState, type RefObject } from 'react';

export interface MasonrySizedItem {
  rowsCount: number;
  order: number;
}

export function distributeMasonryItems<T extends MasonrySizedItem>(
  items: readonly T[],
  colCount: number,
): T[][] {
  if (colCount <= 1) return [items.slice()];
  const sorted = [...items].sort((a, b) => b.rowsCount - a.rowsCount || a.order - b.order);
  const columns: T[][] = Array.from({ length: colCount }, () => []);
  const weights = new Array<number>(colCount).fill(0);

  for (const item of sorted) {
    let minIdx = 0;
    for (let i = 1; i < colCount; i += 1) {
      if (weights[i] < weights[minIdx]) minIdx = i;
    }
    columns[minIdx].push(item);
    weights[minIdx] += 1 + item.rowsCount * 2;
  }
  return columns;
}

export function useMasonryColumns<T extends MasonrySizedItem>(
  containerRef: RefObject<HTMLElement | null>,
  items: readonly T[],
  minColWidth: number,
): T[][] {
  const [containerWidth, setContainerWidth] = useState<number>(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setContainerWidth(el.clientWidth);
    };
    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  return useMemo(() => {
    if (items.length <= 1) return [items.slice()];
    const width = containerWidth || (typeof window !== 'undefined' ? Math.max(320, window.innerWidth - 320) : 900);
    const isNarrowViewport = typeof window !== 'undefined' && window.innerWidth < 900;
    const colCount = isNarrowViewport
      ? 1
      : Math.max(1, Math.min(items.length, Math.floor((width + 12) / (minColWidth + 12))));
    return distributeMasonryItems(items, colCount);
  }, [containerWidth, items, minColWidth]);
}
