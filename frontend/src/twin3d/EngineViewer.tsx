import { Component, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import * as THREE from 'three'
import { ComponentRiskManager } from './ComponentRiskManager'
import type { ComponentId, EngineTwinState, RiskLevel } from './types'
import './engineViewer.css'

useGLTF.setDecoderPath('/draco/')

const MODEL_URL = '/models/wright-flyer-engine.glb'

const riskColor = (level: RiskLevel) => ({ HEALTHY: '#55d8b0', WARNING: '#f2b65e', HIGH: '#ff6b55', CRITICAL: '#ff344b' }[level])

const riskClass = (level: RiskLevel) => level.toLowerCase().replace(' ', '-')

interface EngineViewerProps {
  state: EngineTwinState
  selected: ComponentId | null
  inspectionMode: boolean
  onSelect: (component: ComponentId) => void
  onToggleInspection: () => void
  focusRequest: number
}

function CanvasLoader() {
  const { progress } = useProgress()
  return <Html center><div className="engine-canvas-loader"><span className="engine-loader-spinner" /><b>LOADING ENGINE DIGITAL TWIN</b><small>{Math.round(progress || 8)}% · local CC0 model</small></div></Html>
}

function FallbackEngine({ retry }: { retry: () => void }) {
  return <Html center><div className="engine-canvas-error"><b>3D engine model could not be loaded.</b><span>The live Digital Twin data remains available.</span><button onClick={retry}>Retry model</button></div></Html>
}

class ModelBoundary extends Component<{ children: ReactNode; onError: () => void; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_: Error, __: ErrorInfo) { this.props.onError() }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function ManualOrbitControls() {
  return <OrbitControls
    // The camera is entirely operator-controlled: no damping, auto rotation,
    // focus animation, or programmatic target updates are enabled here.
    enableDamping={false}
    minDistance={2.15}
    maxDistance={10.5}
    autoRotate={false}
    mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
    touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
  />
}

function SceneLights() {
  return <>
    <hemisphereLight args={['#dce8ef', '#09232b', 2.05]} />
    <directionalLight position={[4.5, 5.4, 4.6]} intensity={2.5} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
    <directionalLight position={[-4, 1.6, -3]} color="#8cc8dc" intensity={1.25} />
    <pointLight position={[0, -1, 3]} color="#f8d5a9" intensity={0.7} distance={8} />
  </>
}

function RiskMarker({ component, position, onSelect }: { component: EngineTwinState['components'][ComponentId]; position: [number, number, number]; onSelect: () => void }) {
  const group = useRef<THREE.Group>(null)
  const phase = useRef(Math.random() * Math.PI)
  const pulseSpeed = component.riskLevel === 'CRITICAL' ? 7.3 : component.riskLevel === 'HIGH' ? 5.1 : 2.6
  const color = riskColor(component.riskLevel)

  useFrame(({ clock }) => {
    const pulse = .9 + Math.sin(clock.elapsedTime * pulseSpeed + phase.current) * .19
    group.current?.scale.setScalar(pulse)
  })

  return <group ref={group} position={position}>
    <pointLight color={color} intensity={component.riskLevel === 'CRITICAL' ? 2.7 : 1.55} distance={2.6} />
    <mesh onClick={(event) => { event.stopPropagation(); onSelect() }} onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = 'auto' }}>
      <sphereGeometry args={[0.115, 22, 22]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3.2} roughness={0.28} />
    </mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.18, 0.225, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
    </mesh>
    <Html distanceFactor={2.9} zIndexRange={[20, 0]}><button className={`risk-marker-label ${riskClass(component.riskLevel)}`} onClick={onSelect}><i />{component.shortName}</button></Html>
  </group>
}

function ComponentZone({ component, position, selected, inspectionMode, onSelect }: { component: EngineTwinState['components'][ComponentId]; position: [number, number, number]; selected: boolean; inspectionMode: boolean; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false)
  const visible = selected || hovered || inspectionMode
  const color = component.riskLevel === 'HEALTHY' ? '#63d7e4' : riskColor(component.riskLevel)
  return <group position={position}>
    <mesh
      onClick={(event) => { event.stopPropagation(); onSelect() }}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
      scale={selected ? 1.25 : 1}
    >
      <sphereGeometry args={[0.2, 18, 18]} />
      <meshBasicMaterial color={color} transparent opacity={visible ? .25 : .035} depthWrite={false} />
    </mesh>
    {visible && <Html distanceFactor={2.5} zIndexRange={[10, 0]}><button className={`component-hotspot ${selected ? 'selected' : ''}`} onClick={onSelect}>{component.shortName}</button></Html>}
  </group>
}

function EngineModel({ state, selected, inspectionMode, onSelect, onReady }: { state: EngineTwinState; selected: ComponentId | null; inspectionMode: boolean; onSelect: (id: ComponentId) => void; onReady: () => void }) {
  const gltf = useGLTF(MODEL_URL)
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  const { positions } = useMemo(() => {
    model.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      // The Smithsonian delivery contains normal/AO maps but intentionally no
      // albedo map. Give the scanned metal a neutral aerospace finish while
      // retaining its high-frequency scan detail rather than letting it sink
      // into the dark inspection background.
      const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      const sourceStandard = source as THREE.MeshStandardMaterial
      mesh.material = new THREE.MeshStandardMaterial({
        color: '#bdc7c8',
        roughness: .42,
        metalness: .16,
        normalMap: sourceStandard.normalMap || null,
        normalScale: new THREE.Vector2(.72, .72),
        aoMap: sourceStandard.aoMap || null,
        aoMapIntensity: .72,
        emissive: '#102d35',
        emissiveIntensity: .28,
        side: THREE.DoubleSide,
      })
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    const bounds = new THREE.Box3().setFromObject(model)
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const scale = 3.9 / Math.max(size.x, size.y, size.z)
    // Position participates outside the mesh scale in Three's transform matrix.
    // Scale the centre offset too so the scanned object is genuinely centred at
    // the viewer origin rather than displaced by its source coordinates.
    model.position.copy(center.multiplyScalar(-scale))
    model.scale.setScalar(scale)
    const scaled = size.multiplyScalar(scale)
    const positions = Object.fromEntries(Object.entries(state.components).map(([id, component]) => {
      const [x, y, z] = component.anchor
      return [id, [x * scaled.x / 2, y * scaled.y / 2, z * scaled.z / 2] as [number, number, number]]
    })) as Record<ComponentId, [number, number, number]>
    return { positions }
  // The source asset is static. State is intentionally excluded from geometry measurement.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  useEffect(() => { onReady() }, [onReady])
  const risky = ComponentRiskManager.affectedComponents(state)

  return <group>
    <primitive object={model} onClick={() => onSelect('mechanical_integrity')} />
    {Object.values(state.components).map(component => <ComponentZone key={component.id} component={component} position={positions[component.id]} selected={selected === component.id} inspectionMode={inspectionMode} onSelect={() => onSelect(component.id)} />)}
    {risky.map(component => <RiskMarker key={`risk-${component.id}`} component={component} position={positions[component.id]} onSelect={() => onSelect(component.id)} />)}
  </group>
}

function ViewerScene({ state, selected, inspectionMode, onSelect, onReady, onError, retry }: { state: EngineTwinState; selected: ComponentId | null; inspectionMode: boolean; onSelect: (id: ComponentId) => void; onReady: () => void; onError: () => void; retry: () => void }) {
  return <Canvas
    shadows
    dpr={[1, 1.65]}
    camera={{ position: [3.87, 2.32, 4.35], fov: 38, near: .01, far: 100 }}
    gl={{ antialias: true, powerPreference: 'high-performance' }}
  >
    <color attach="background" args={['#07151d']} />
    <fog attach="fog" args={['#07151d', 8, 17]} />
    <SceneLights />
    <Suspense fallback={<CanvasLoader />}>
      <ModelBoundary onError={onError} fallback={<FallbackEngine retry={retry} />}>
        <EngineModel state={state} selected={selected} inspectionMode={inspectionMode} onSelect={onSelect} onReady={onReady} />
      </ModelBoundary>
    </Suspense>
    <ManualOrbitControls />
    <gridHelper args={[12, 24, '#25515d', '#16333e']} position={[0, -1.8, 0]} />
  </Canvas>
}

export function EngineViewer({ state, selected, inspectionMode, onSelect, onToggleInspection, focusRequest }: EngineViewerProps) {
  const container = useRef<HTMLElement>(null)
  const [modelState, setModelState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retryId, setRetryId] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === container.current)
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else container.current?.requestFullscreen?.()
  }
  const retry = () => { useGLTF.clear(MODEL_URL); setModelState('loading'); setRetryId(id => id + 1) }
  // Selecting a model region only updates the inspection details; it never
  // changes the camera. The user alone controls orientation and zoom.
  const interactiveSelect = (id: ComponentId) => onSelect(id)

  // Kept in the public props contract for the existing inspector panel. Focus
  // requests intentionally do not reposition this manual-only viewer.
  void focusRequest

  return <section className={`engine-viewer ${fullscreen ? 'viewer-fullscreen' : ''}`} ref={container} aria-label="Interactive three-dimensional Wright Flyer engine digital twin">
    <div className="engine-viewer-hud">
      <div><span className="engine-hud-title">ENGINE DIGITAL TWIN</span><span className={`engine-live ${modelState === 'error' ? 'offline' : ''}`}><i />{modelState === 'error' ? 'MODEL OFFLINE' : 'LIVE · WEBSOCKET'}</span></div>
      <div className="engine-model-chip">REAL CC0 3D SCAN · 1903 WRIGHT FLYER ENGINE</div>
    </div>
    <div className="engine-canvas-wrap">
      <ViewerScene key={retryId} state={state} selected={selected} inspectionMode={inspectionMode} onSelect={interactiveSelect} onReady={() => setModelState('ready')} onError={() => setModelState('error')} retry={retry} />
      <div className="engine-status-overlay">
        <span><i className="status-dot" />{state.status}</span><b>{state.overallHealth.toFixed(1)}<small>HEALTH</small></b>
        <small>RISK {state.prediction.risk} · RUL {state.rul} h</small>
      </div>
      <div className="engine-legend" aria-label="Risk legend"><span><i className="healthy" />HEALTHY</span><span><i className="warning" />WARNING</span><span><i className="high" />HIGH RISK</span><span><i className="critical" />CRITICAL</span></div>
      {inspectionMode && <div className="inspection-banner">INSPECTION MODE · select a labelled subsystem or a pulsing risk beacon</div>}
    </div>
    <div className="engine-viewer-controls">
      <div className="viewer-actions">
        <button className={inspectionMode ? 'active' : ''} onClick={onToggleInspection}>{inspectionMode ? 'EXIT INSPECTION' : 'INSPECTION MODE'}</button>
        <button onClick={toggleFullscreen}>{fullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}</button>
      </div>
    </div>
    <div className="engine-interaction-help"><b>Manual interaction</b><span>Left drag rotate</span><span>Scroll zoom</span><span>Right drag pan</span><span>Click inspect</span><span>Touch: drag / pinch / two-finger pan</span></div>
  </section>
}
