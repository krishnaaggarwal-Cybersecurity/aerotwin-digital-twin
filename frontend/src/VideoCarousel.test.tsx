import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoCarousel } from './VideoCarousel'

describe('project video carousel', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  })

  afterEach(() => vi.restoreAllMocks())

  it('starts with the narrated walkthrough and English captions', () => {
    const { container } = render(<VideoCarousel />)
    const videos = container.querySelectorAll('video')

    expect(videos).toHaveLength(3)
    expect(videos[0].getAttribute('src')).toContain('/demo/project-walkthrough.mp4')
    expect(videos[0].getAttribute('poster')).toContain('/demo/project-walkthrough-poster.jpg')
    expect(videos[0].querySelector('track[kind="captions"][srclang="en"]')?.getAttribute('src')).toContain('/demo/project-walkthrough-en.vtt')
    expect(screen.getByRole('button', { name: 'Turn captions off' })).toBeTruthy()
    expect(screen.getAllByText('Prototype walkthrough / 3')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Show Emergency concept clip' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show Flight HUD concept clip' })).toBeTruthy()
  })
})
