import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * 管理后台列表通用状态：加载中/失败/重试，与组件卸载后的竞态防护。
 * fetcher 在每次 reload 时调用，页面自行决定查询参数与响应解包。
 */
export function useAdminList<T>(fetcher: (client: typeof api) => Promise<T[]>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    fetcherRef
      .current(api)
      .then((result) => {
        if (alive) setItems(result);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setItems([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  return { items, loading, failed, reload };
}
