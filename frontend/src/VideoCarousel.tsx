import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Expand, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import './videoCarousel.css'

const DEMO_VIDEOS = [
  { src: '/demo/project-demo-1.mp4', label: 'Video 1' },
  { src: '/demo/project-demo-2.mp4', label: 'Video 2' },
] as const

const HOLD_AFTER_END_MS = 1000
const FALLBACK_VIDEO_DURATION_MS = 10_000
const TRANSITION_MS = 460
const SWIPE_THRESHOLD_PX = 52

type Direction = 'forward' | 'backward'

function getPlayableIndexes(available: boolean[]) {
  return available.flatMap((isAvailable, index) => isAvailable ? [index] : [])
}

export function VideoCarousel() {
  const carouselRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([])
  const fallbackTimer = useRef<number | undefined>()
  const holdTimer = useRef<number | undefined>()
  const transitionTimer = useRef<number | undefined>()
  const progressFrame = useRef<number | undefined>()
  const mutedRef = useRef(true)
  const moveByRef = useRef<(amount: number) => void>(() => undefined)
  const dragRef = useRef({ active: false, startX: 0, currentX: 0 })

  const [available, setAvailable] = useState(() => DEMO_VIDEOS.map(() => true))
  const [activeIndex, setActiveIndex] = useState(0)
  const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null)
  const [direction, setDirection] = useState<Direction>('forward')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const [slideProgress, setSlideProgress] = useState(0)
  const [mediaTime, setMediaTime] = useState({ current: 0, duration: 0 })

  const playableIndexes = useMemo(() => getPlayableIndexes(available), [available])
  const canNavigate = playableIndexes.length > 1

  const clearSlideTimers = useCallback(() => {
    if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current)
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
    if (progressFrame.current) window.cancelAnimationFrame(progressFrame.current)
    fallbackTimer.current = undefined
    holdTimer.current = undefined
    progressFrame.current = undefined
  }, [])

  const changeSlide = useCallback((nextIndex: number, nextDirection: Direction) => {
    if (!canNavigate || nextIndex === activeIndex || isTransitioning || !available[nextIndex]) return

    clearSlideTimers()
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current)
    setOutgoingIndex(activeIndex)
    setDirection(nextDirection)
    setActiveIndex(nextIndex)
    setSlideProgress(0)
    setIsPlaying(false)
    setIsTransitioning(true)
    transitionTimer.current = window.setTimeout(() => {
      setOutgoingIndex(null)
      setIsTransitioning(false)
      transitionTimer.current = undefined
    }, TRANSITION_MS)
  }, [activeIndex, available, canNavigate, clearSlideTimers, isTransitioning])

  const moveBy = useCallback((amount: number) => {
    if (!canNavigate) return
    const currentPosition = playableIndexes.indexOf(activeIndex)
    const nextPosition = (currentPosition + amount + playableIndexes.length) % playableIndexes.length
    changeSlide(playableIndexes[nextPosition], amount > 0 ? 'forward' : 'backward')
  }, [activeIndex, canNavigate, changeSlide, playableIndexes])

  useEffect(() => { moveByRef.current = moveBy }, [moveBy])

  useEffect(() => {
    mutedRef.current = isMuted
    videoRefs.current.forEach(video => { if (video) video.muted = isMuted })
  }, [isMuted])

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === carouselRef.current)
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  useEffect(() => {
    if (available[activeIndex]) return
    const replacement = getPlayableIndexes(available)[0]
    if (replacement !== undefined) setActiveIndex(replacement)
  }, [activeIndex, available])

  useEffect(() => {
    clearSlideTimers()
    const activeVideo = videoRefs.current[activeIndex]
    if (!activeVideo || !available[activeIndex]) return undefined

    videoRefs.current.forEach((video, index) => {
      if (!video || index === activeIndex) return
      video.pause()
      try { video.currentTime = 0 } catch { /* media metadata may not be ready */ }
    })

    const startProgress = (totalMs: number) => {
      const startedAt = performance.now()
      const updateProgress = (now: number) => {
        const percentage = Math.min(100, ((now - startedAt) / totalMs) * 100)
        setSlideProgress(percentage)
        if (percentage < 100) progressFrame.current = window.requestAnimationFrame(updateProgress)
      }
      progressFrame.current = window.requestAnimationFrame(updateProgress)
    }

    const moveToNext = () => moveByRef.current(1)
    const prepareActiveVideo = () => {
      const durationMs = Number.isFinite(activeVideo.duration) && activeVideo.duration > 0
        ? activeVideo.duration * 1000
        : FALLBACK_VIDEO_DURATION_MS
      const slideDuration = durationMs + HOLD_AFTER_END_MS

      try { activeVideo.currentTime = 0 } catch { /* metadata can arrive a frame later */ }
      setMediaTime({ current: 0, duration: durationMs / 1000 })
      activeVideo.muted = mutedRef.current
      const playback = activeVideo.play()
      if (playback) playback.then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
      startProgress(slideDuration)

      if (canNavigate) {
        // This safeguards the loop if an ended event is delayed or suppressed.
        fallbackTimer.current = window.setTimeout(moveToNext, slideDuration)
      }
    }

    if (activeVideo.readyState >= HTMLMediaElement.HAVE_METADATA) prepareActiveVideo()
    else activeVideo.addEventListener('loadedmetadata', prepareActiveVideo, { once: true })

    return () => {
      activeVideo.removeEventListener('loadedmetadata', prepareActiveVideo)
      clearSlideTimers()
    }
  }, [activeIndex, available, canNavigate, clearSlideTimers])

  useEffect(() => () => {
    clearSlideTimers()
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current)
  }, [clearSlideTimers])

  const handleEnded = (index: number) => {
    if (index !== activeIndex || !canNavigate) return
    if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current)
    fallbackTimer.current = undefined
    // The video frame remains visible for the deliberate one-second hold.
    holdTimer.current = window.setTimeout(() => moveBy(1), HOLD_AFTER_END_MS)
  }

  const handleVideoError = (index: number) => setAvailable(previous => previous.map((value, itemIndex) => itemIndex === index ? false : value))

  const handleSeek = (value: number) => {
    const activeVideo = videoRefs.current[activeIndex]
    if (!activeVideo || !Number.isFinite(value)) return
    activeVideo.currentTime = value
    setMediaTime(previous => ({ ...previous, current: value }))
  }

  const togglePlayback = () => {
    const activeVideo = videoRefs.current[activeIndex]
    if (!activeVideo) return
    if (activeVideo.paused) {
      const playback = activeVideo.play()
      if (playback) playback.then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
    } else {
      activeVideo.pause()
      setIsPlaying(false)
    }
  }

  const toggleFullscreen = () => {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : carouselRef.current?.requestFullscreen?.()
    // Some embedded webviews do not grant fullscreen. A normal browser click
    // still enters native fullscreen, while restricted hosts fail quietly.
    request?.catch(() => setIsFullscreen(false))
  }

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input')) return
    dragRef.current = { active: true, startX: event.clientX, currentX: event.clientX }
    setIsDragging(true)
    setDragOffset(0)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const continueDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    dragRef.current.currentX = event.clientX
    setDragOffset(Math.max(-90, Math.min(90, event.clientX - dragRef.current.startX)))
  }

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    const distance = dragRef.current.currentX - dragRef.current.startX
    dragRef.current.active = false
    setIsDragging(false)
    setDragOffset(0)
    if (Math.abs(distance) >= SWIPE_THRESHOLD_PX) moveBy(distance < 0 ? 1 : -1)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); moveBy(-1) }
    if (event.key === 'ArrowRight') { event.preventDefault(); moveBy(1) }
    if (event.key === ' ') { event.preventDefault(); togglePlayback() }
    if (event.key === 'Escape' && document.fullscreenElement) document.exitFullscreen()
  }

  if (!playableIndexes.length) {
    return <div className="video-unavailable"><b>Demonstration video unavailable.</b><span>The supplied media files could not be loaded.</span></div>
  }

  return <section className="video-carousel" aria-label="Project demonstration video carousel">
    <div
      ref={carouselRef}
      className={`video-carousel-stage ${isDragging ? 'is-dragging' : ''}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={beginDrag}
      onPointerMove={continueDrag}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      aria-roledescription="carousel"
      aria-label={`Project demonstration ${activeIndex + 1} of ${DEMO_VIDEOS.length}`}
    >
      <div className="video-carousel-slides" style={{ '--drag-offset': `${dragOffset}px` } as React.CSSProperties}>
        {DEMO_VIDEOS.map((video, index) => {
          const isActive = index === activeIndex
          const isOutgoing = index === outgoingIndex
          const slideClass = [
            'video-carousel-slide',
            isActive ? 'is-active' : '',
            isActive && direction === 'backward' ? 'enter-backward' : '',
            isOutgoing ? `is-outgoing ${direction}` : '',
          ].filter(Boolean).join(' ')
          return <div className={slideClass} key={video.src} aria-hidden={!isActive}>
            <video
              ref={element => { videoRefs.current[index] = element }}
              src={video.src}
              preload={isActive ? 'auto' : 'metadata'}
              muted={isMuted}
              playsInline
              onEnded={() => handleEnded(index)}
              onError={() => handleVideoError(index)}
              onPlay={() => isActive && setIsPlaying(true)}
              onPause={() => isActive && setIsPlaying(false)}
              onTimeUpdate={event => {
                if (isActive) setMediaTime({ current: event.currentTarget.currentTime, duration: event.currentTarget.duration || 0 })
              }}
            >
              Your browser does not support HTML5 video.
            </video>
          </div>
        })}
      </div>

      <button className="video-arrow previous" type="button" aria-label="Previous video" disabled={!canNavigate || isTransitioning} onClick={() => moveBy(-1)}><ChevronLeft /></button>
      <button className="video-arrow next" type="button" aria-label="Next video" disabled={!canNavigate || isTransitioning} onClick={() => moveBy(1)}><ChevronRight /></button>

      <div className="video-carousel-overlay">
        <div className="video-carousel-title"><span>PROJECT DEMONSTRATION</span><b>{DEMO_VIDEOS[activeIndex].label} / {DEMO_VIDEOS.length}</b></div>
        <div className="video-carousel-controls" aria-label="Video controls">
          <input className="video-carousel-seek" type="range" min="0" max={Math.max(mediaTime.duration, 0.01)} step="0.01" value={Math.min(mediaTime.current, Math.max(mediaTime.duration, 0.01))} aria-label="Seek active video" onChange={event => handleSeek(Number(event.target.value))} />
          <div className="video-carousel-actions">
            <button type="button" aria-label={isPlaying ? 'Pause video' : 'Play video'} onClick={togglePlayback}>{isPlaying ? <Pause /> : <Play />}</button>
            <button type="button" aria-label={isMuted ? 'Unmute video' : 'Mute video'} onClick={() => setIsMuted(value => !value)}>{isMuted ? <VolumeX /> : <Volume2 />}</button>
            <button type="button" aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen video'} onClick={toggleFullscreen}>{isFullscreen ? <Minimize /> : <Expand />}</button>
          </div>
        </div>
      </div>
      <div className="video-carousel-progress" aria-label="Eleven second carousel progress"><i style={{ width: `${slideProgress}%` }} /></div>
    </div>

    <div className="video-carousel-footer">
      <span>{DEMO_VIDEOS[activeIndex].label} / {DEMO_VIDEOS.length}</span>
      <div className="video-carousel-indicators" aria-label="Choose demonstration video">
        {DEMO_VIDEOS.map((video, index) => <button key={video.src} type="button" aria-label={`Show ${video.label}`} aria-current={index === activeIndex ? 'true' : undefined} disabled={!available[index] || isTransitioning} onClick={() => changeSlide(index, index > activeIndex ? 'forward' : 'backward')}><i /></button>)}
      </div>
      <small>Auto-advances after video playback + 1 second hold</small>
    </div>
  </section>
}
