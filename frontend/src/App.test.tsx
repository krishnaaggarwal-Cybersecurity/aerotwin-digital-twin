import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

class MockWebSocket {
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  constructor(_: string) { setTimeout(() => this.onopen?.(), 0) }
  close() { this.onclose = null }
}

describe('landing page', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('renders the engineering project value proposition', () => {
    render(<App />)
    expect(screen.getByText(/AI-enabled/i)).toBeTruthy()
    expect(screen.getByText(/Launch Digital Twin/i)).toBeTruthy()
    expect(screen.getByText(/Health Monitoring/i)).toBeTruthy()
  })
})
