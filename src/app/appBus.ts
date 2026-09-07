/**
 * 极薄的类型化事件总线：组件间通信、导航切换、跨视图刷新统一走它，
 * 取代脆弱易漏的 root 冒泡 CustomEvent。订阅生命周期由可选 signal 托管。
 */
export type AppEventMap = {
  "app-navigate": { name: string; applicationId?: string };
  "app-data-changed": void;
  "resumes-changed": { count: number };
  "interview-updated": void;
  "review-saved": void;
};

export interface AppBus {
  emit<K extends keyof AppEventMap>(type: K, detail: AppEventMap[K]): void;
  on<K extends keyof AppEventMap>(
    type: K,
    handler: (detail: AppEventMap[K]) => void,
  ): () => void;
}

export function createAppBus(signal?: AbortSignal): AppBus {
  const handlers = new Map<string, Set<(detail: unknown) => void>>();
  signal?.addEventListener("abort", () => handlers.clear());
  return {
    emit(type, detail) {
      if (signal?.aborted) return;
      handlers.get(type as string)?.forEach((handler) => handler(detail));
    },
    on(type, handler) {
      const set = handlers.get(type as string) ?? new Set();
      set.add(handler as (detail: unknown) => void);
      handlers.set(type as string, set);
      return () => set.delete(handler as (detail: unknown) => void);
    },
  };
}
