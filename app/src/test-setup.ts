import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

Element.prototype.scrollIntoView = vi.fn()

// jsdom doesn't ship ResizeObserver
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
