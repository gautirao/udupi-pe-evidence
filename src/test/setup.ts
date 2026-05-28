import "@testing-library/jest-dom";

// Durable in-memory Storage shim. The generated Supabase client
// (src/integrations/supabase/client.ts) is created with
// `auth: { storage: localStorage, autoRefreshToken: true }`. Its background
// auto-refresh timer can fire AFTER jsdom teardown, when window.localStorage is
// already gone, producing "storage.getItem is not a function" unhandled
// rejections that force the suite to exit 1. Installing a complete in-memory
// Storage on both globalThis and window that survives teardown prevents this.
class InMemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? (this.store.get(key) as string) : null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}
const memoryStorage = new InMemoryStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage });
Object.defineProperty(window, "localStorage", { configurable: true, value: memoryStorage });

// Radix UI Slider (and other layout-aware components) use ResizeObserver.
// jsdom does not implement it, so we provide a no-op stub.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
