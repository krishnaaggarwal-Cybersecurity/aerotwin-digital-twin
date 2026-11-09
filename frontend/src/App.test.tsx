import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { staticAssistantResponse, staticSnapshot } from './staticDemo'

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
    expect(screen.getByText(/Enter the flightline/i)).toBeTruthy()
    expect(screen.getByText(/engine intelligence/i)).toBeTruthy()
  })

  it('answers distinct browser assistant questions with the matching twin evidence', () => {
    const twin = staticSnapshot()
    const temperature = staticAssistantResponse('What is the cylinder temperature?', twin)
    const mission = staticAssistantResponse('Explain mission risk', twin)
    const fuel = staticAssistantResponse('What is the fuel pressure?', twin)

    expect(temperature).toContain(`${twin.telemetry.cylinder_temperature} °C`)
    expect(mission).toContain(`${twin.mission.reliability_score}%`)
    expect(fuel).toContain(`${twin.telemetry.fuel_pressure} bar`)
    expect(fuel).not.toContain('oil pressure')
    expect(temperature).not.toBe(mission)
  })
})
