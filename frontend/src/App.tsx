import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Bot, Boxes, CheckCircle2,
  ChevronRight, CircleGauge, Clock3, Cog, Database, FileUp, Gauge, HeartPulse,
  History, Layers3, MapPin, Menu, MessageCircle, Moon, Network, Pause, Plane,
  Play, Radar, RefreshCcw, Route, Satellite, Send, Settings2, ShieldAlert, Volume2, VolumeX,
  SlidersHorizontal, Sparkles, Thermometer, Upload, Video, Wrench, X, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { VideoCarousel } from './VideoCarousel'
import { staticAssistantResponse, staticCommand, staticControlVehicle, staticCsvAnalysis, staticFleet, staticSelect, staticSnapshot, staticTick, staticUav, staticUavControl } from './staticDemo'

const DigitalTwin3DPanel = lazy(() => import('./twin3d/DigitalTwin3DPanel').then(module => ({ default: module.DigitalTwin3DPanel })))

type Twin = Record<string, any>
// During Vite development use the configured same-origin proxy. This keeps the
// REST and WebSocket twin link local, avoids cross-origin browser restrictions,
// and mirrors the production Nginx setup. A deployed build may still supply an
// explicit API URL when it is not hosted behind that proxy.
const API_BASE = (import.meta as any).env?.DEV ? '' : (import.meta as any).env?.VITE_API_URL || ''
const api = (path: string) => `${API_BASE}${path}`
const STATIC_DEMO = Boolean((import.meta as any).env?.VITE_STATIC_DEMO)

type NavigationItem = [string, string, LucideIcon]
const navigationGroups: { label: string, items: NavigationItem[] }[] = [
  { label: 'MISSION DESK', items: [['Dashboard', '/dashboard', CircleGauge], ['Fleet', '/fleet', Layers3], ['Virtual UAV', '/uav', Plane], ['Digital Twin', '/digital-twin', Boxes]] },
  { label: 'ENGINE INTELLIGENCE', items: [['Telemetry', '/telemetry', Activity], ['Health', '/health', HeartPulse], ['Fault Prediction', '/prediction', Bot], ['Mission Reliability', '/mission', Route], ['Maintenance', '/maintenance', Wrench], ['History', '/history', History]] },
  { label: 'WORKBENCH', items: [['Simulation', '/simulation', SlidersHorizontal], ['Data Lab', '/data-lab', FileUp], ['N-CMAPSS Research', '/ncmapss', Database], ['AI Assistant', '/assistant', MessageCircle], ['Project Video', '/video', Video], ['Architecture', '/architecture', Network], ['About', '/about', Sparkles]] },
]
const navigation = navigationGroups.flatMap(group => group.items)

const faultOptions = [
  ['normal', 'Normal operation', 'Healthy synthetic baseline'],
  ['overheating', 'Overheating', 'Thermal signal escalation'],
  ['low_oil_pressure', 'Low oil pressure', 'Lubrication risk trend'],
  ['excessive_vibration', 'Excessive vibration', 'Mechanical condition signal'],
  ['abnormal_fuel_flow', 'Fuel abnormality', 'Fuel-flow / pressure deviation'],
  ['cooling_degradation', 'Cooling degradation', 'Progressive thermal-management loss'],
  ['sensor_anomaly', 'Sensor anomaly', 'Telemetry consistency deviation'],
  ['progressive_degradation', 'Progressive degradation', 'Multi-system health decline'],
]

function useTwin() {
  const [twin, setTwin] = useState<Twin | null>(() => STATIC_DEMO ? staticSnapshot() : null)
  const [history, setHistory] = useState<Twin[]>([])
  const [fleet, setFleet] = useState<Twin[]>(() => STATIC_DEMO ? staticFleet() : [])
  const [connected, setConnected] = useState(STATIC_DEMO)
  const [error, setError] = useState('')

  const refreshFleet = useCallback(async () => {
    if (STATIC_DEMO) { setFleet(staticFleet()); return }
    const response = await fetch(api('/api/fleet'))
    if (!response.ok) throw new Error(`Fleet refresh failed (${response.status})`)
    setFleet(await response.json())
  }, [])

  const hydrate = useCallback(async () => {
    if (STATIC_DEMO) {
      const current = staticSnapshot()
      setTwin(current)
      setFleet(staticFleet())
      setHistory(previous => [...previous, current].slice(-180))
      setError('')
      return
    }
    try {
      const [engine, health, telemetry, prediction, mission, maintenance, alerts, snapshots, vehicles] = await Promise.all(
        ['/api/engine', '/api/health', '/api/telemetry/latest', '/api/prediction', '/api/mission', '/api/maintenance', '/api/alerts', '/api/history?limit=180', '/api/fleet']
          .map(path => fetch(api(path)).then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      )
      setTwin({ ...engine, health, telemetry, prediction, mission, maintenance, alerts: alerts.live || [] })
      setHistory(Array.isArray(snapshots) ? snapshots.slice(-180) : [])
      setFleet(vehicles)
      setError('')
    } catch {
      setError('Backend unavailable. Start the local FastAPI service to enable the live twin.')
    }
  }, [])

  useEffect(() => {
    if (STATIC_DEMO) {
      const timer = window.setInterval(() => {
        const current = staticTick()
        setTwin(current)
        setFleet(staticFleet())
        setHistory(previous => [...previous, current].slice(-180))
      }, 1000)
      return () => clearInterval(timer)
    }
    hydrate()
    let socket: WebSocket | undefined
    let retry: number | undefined
    const connect = () => {
      const base = API_BASE ? API_BASE.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
      socket = new WebSocket(`${base}/ws/telemetry`)
      socket.onopen = () => { setConnected(true); setError('') }
      socket.onmessage = event => {
        const incoming = JSON.parse(event.data)
        setTwin(incoming)
        setHistory(previous => [...previous, incoming].slice(-180))
      }
      socket.onerror = () => socket?.close()
      socket.onclose = () => { setConnected(false); retry = window.setTimeout(connect, 2500) }
    }
    connect()
    const fleetRefresh = window.setInterval(() => {
      refreshFleet().catch(() => setError('Fleet status could not be refreshed.'))
    }, 3000)
    return () => { if (retry) clearTimeout(retry); clearInterval(fleetRefresh); socket?.close() }
  }, [hydrate, refreshFleet])

  const command = useCallback(async (path: string, body?: unknown) => {
    if (STATIC_DEMO) {
      const result = staticCommand(path, body)
      setTwin(result)
      setFleet(staticFleet())
      if (path === '/api/fleet/select') setHistory([result])
      else setHistory(previous => [...previous, result].slice(-180))
      return result
    }
    const response = await fetch(api(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    if (!response.ok) throw new Error(`Command failed (${response.status})`)
    const result = await response.json()
    if (result.telemetry) {
      setTwin(result)
      if (path === '/api/fleet/select') setHistory([result])
      else setHistory(previous => {
          const latest = previous[previous.length - 1]
          return latest?.updated_at === result.updated_at ? previous : [...previous, result].slice(-180)
        })
    }
    if (path === '/api/fleet/select') await refreshFleet()
    return result
  }, [refreshFleet])

  const controlVehicle = useCallback(async (engineId: string, action: string, fault?: string) => {
    if (STATIC_DEMO) {
      const vehicles = staticControlVehicle(engineId, action, fault)
      setFleet(vehicles)
      if (engineId === twin?.engine_id) {
        const current = staticSnapshot(engineId)
        setTwin(current)
        setHistory(previous => [...previous, current].slice(-180))
      }
      return
    }
    const isFault = action === 'fault'
    const path = isFault ? `/api/fleet/${encodeURIComponent(engineId)}/fault` : `/api/fleet/${encodeURIComponent(engineId)}/control`
    const body = isFault ? { fault } : { action }
    const response = await fetch(api(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) throw new Error(`UAV control failed (${response.status})`)
    const result = await response.json()
    if (twin?.engine_id === engineId) {
      setTwin(result)
      setHistory(previous => [...previous, result].slice(-180))
    }
    await refreshFleet()
    return result
  }, [refreshFleet, twin?.engine_id])

  return { twin, history, fleet, connected, error, hydrate, command, controlVehicle }
}

function navigate(path: string) {
  if (STATIC_DEMO) {
    history.pushState({}, '', `#${path}`)
    window.dispatchEvent(new Event('popstate'))
    return
  }
  history.pushState({}, '', path)
  window.dispatchEvent(new Event('popstate'))
}

function usePath() {
  const readPath = () => STATIC_DEMO ? (location.hash.slice(1) || '/') : location.pathname
  const [path, setPath] = useState(readPath)
  useEffect(() => { const change = () => setPath(readPath()); addEventListener('popstate', change); return () => removeEventListener('popstate', change) }, [])
  return path
}

function formatTime(timestamp?: string) {
  if (!timestamp) return '—'
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp))
}

function severityClass(value = '') { return value.toLowerCase().replaceAll(' ', '-') }
function riskColor(value?: number) { return (value || 0) >= 75 ? '#f16673' : (value || 0) >= 50 ? '#efb45e' : '#48d5b1' }
function healthColor(value?: number) { return (value || 0) >= 90 ? '#49d7b1' : (value || 0) >= 75 ? '#68b9f5' : (value || 0) >= 50 ? '#f4bc62' : '#f16673' }

function Badge({ value }: { value: string }) { return <span className={`badge ${severityClass(value)}`}>{value}</span> }

function MetricCard({ label, value, unit, icon: Icon, tone = 'cyan', caption }: { label: string, value: string | number, unit?: string, icon: any, tone?: string, caption?: string }) {
  return <article className={`metric-card tone-${tone}`}>
    <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17} /></span></div>
    <div className="metric-value">{value}<small>{unit}</small></div>
    {caption && <p>{caption}</p>}
  </article>
}

function Panel({ title, action, children, className = '' }: { title?: string, action?: any, children: any, className?: string }) {
  return <section className={`panel ${className}`}>{title && <div className="panel-heading"><h2>{title}</h2>{action}</div>}{children}</section>
}

function EngineSchematic({ twin, hero = false }: { twin: Twin, hero?: boolean }) {
  const tel = twin?.telemetry || {}
  const health = twin?.health?.overall || 96
  const heat = Math.max(0, Math.min(1, ((tel.cylinder_temperature || 148) - 125) / 75))
  const fault = activeFault(twin)
  const marker = imageFaultMarkers[fault]
  return <div className={`engine-scene ${hero ? 'hero-engine' : ''}`} aria-label="Animated synthetic generic aero piston engine schematic">
    <div className="scene-grid" />
    <div className="orbital orbital-a" /><div className="orbital orbital-b" />
    <div className="engine-halo" style={{ '--health': healthColor(health) } as any} />
    <div className="engine-core" style={{ '--heat': `hsl(${190 - heat * 175} 78% 58%)` } as any}>
      <div className="propeller"><i /><i /><i /></div>
      <div className="engine-block"><span /><span /><span /><span /></div>
      <div className="engine-label">APT<br /><b>SIM</b></div>
    </div>
    <div className="node node-rpm"><b>{Math.round(tel.rpm || 2240)}</b><small>RPM</small></div>
    <div className="node node-temp"><b>{Math.round(tel.cylinder_temperature || 148)}°</b><small>CYL TEMP</small></div>
    <div className="node node-oil"><b>{tel.oil_pressure || 4.1}</b><small>OIL BAR</small></div>
    <div className="node node-health"><b>{health}%</b><small>HEALTH</small></div>
    {!hero && marker && <div className={`fault-marker ${marker.position}`}><i /><span>{marker.label}</span></div>}
  </div>
}

function activeFault(twin: Twin) {
  const scenario = twin?.settings?.active_fault
  return scenario && scenario !== 'normal' ? scenario : twin?.prediction?.predicted_fault
}

const imageFaultMarkers: Record<string, { label: string, position: string }> = {
  overheating: { label: 'THERMAL FAULT', position: 'thermal' },
  low_oil_pressure: { label: 'OIL FAULT', position: 'oil' },
  excessive_vibration: { label: 'MECHANICAL FAULT', position: 'mechanical' },
  abnormal_fuel_flow: { label: 'FUEL FAULT', position: 'fuel' },
  cooling_degradation: { label: 'COOLING FAULT', position: 'thermal' },
  sensor_anomaly: { label: 'SENSOR FAULT', position: 'sensor' },
  progressive_degradation: { label: 'SYSTEM FAULT', position: 'system' },
}

const faultModelTargets: Record<string, { label: string, parts: string[] }> = {
  overheating: { label: 'Thermal / cylinder assembly', parts: ['cylinders', 'cooling'] },
  low_oil_pressure: { label: 'Lubrication pump', parts: ['oil-pump'] },
  excessive_vibration: { label: 'Crankcase / propeller assembly', parts: ['crankcase', 'propeller'] },
  abnormal_fuel_flow: { label: 'Fuel rail', parts: ['fuel-rail'] },
  cooling_degradation: { label: 'Cooling manifold', parts: ['cooling', 'cylinders'] },
  sensor_anomaly: { label: 'Telemetry sensor module', parts: ['sensor'] },
  progressive_degradation: { label: 'Multi-system engine assembly', parts: ['cylinders', 'crankcase', 'oil-pump', 'fuel-rail'] },
}

function CadEngineModel({ twin }: { twin: Twin }) {
  const drag = useRef<{ x: number, y: number, rotateX: number, rotateY: number } | null>(null)
  const [rotation, setRotation] = useState({ rotateX: -13, rotateY: -28 })
  const fault = activeFault(twin)
  const target = faultModelTargets[fault] || null
  const isFaulty = (part: string) => target?.parts.includes(part) || false

  const moveModel = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag.current) return
    setRotation({
      rotateX: Math.max(-58, Math.min(30, drag.current.rotateX - (event.clientY - drag.current.y) * .28)),
      rotateY: drag.current.rotateY + (event.clientX - drag.current.x) * .38,
    })
  }

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY, ...rotation }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const stopDrag = () => { drag.current = null }
  const modelStyle = { '--cad-x': `${rotation.rotateX}deg`, '--cad-y': `${rotation.rotateY}deg` } as any

  return <section
    className="cad-engine-viewer"
    aria-label="Interactive three-dimensional CAD-style engine model"
    onPointerMove={moveModel}
    onPointerDown={startDrag}
    onPointerUp={stopDrag}
    onPointerCancel={stopDrag}
    onPointerLeave={stopDrag}
  >
    <div className="cad-viewer-bar"><span><Boxes size={15} /> 3D CAD TWIN</span><small>{target ? <><i className="fault-dot" /> FAULT: {target.label}</> : 'LEFT-CLICK + DRAG TO ROTATE'}</small></div>
    <div className="cad-stage">
      <div className="cad-grid" />
      <div className="cad-assembly" style={modelStyle}>
        <div className={`cad-part cad-propeller ${isFaulty('propeller') ? 'faulty' : ''}`}><i /><i /><i /><i /><b>PROP</b></div>
        <div className={`cad-part cad-crankcase ${isFaulty('crankcase') ? 'faulty' : ''}`}><span className="cad-case-face" /><span className="cad-case-side" /><b>CRANKCASE</b></div>
        <div className={`cad-part cad-cylinder-bank left ${isFaulty('cylinders') ? 'faulty' : ''}`}><i /><i /><i /><b>CYL A</b></div>
        <div className={`cad-part cad-cylinder-bank right ${isFaulty('cylinders') ? 'faulty' : ''}`}><i /><i /><i /><b>CYL B</b></div>
        <div className={`cad-part cad-cooling ${isFaulty('cooling') ? 'faulty' : ''}`}><i /><i /><i /><i /><b>COOLING</b></div>
        <div className={`cad-part cad-oil-pump ${isFaulty('oil-pump') ? 'faulty' : ''}`}><i /><b>OIL</b></div>
        <div className={`cad-part cad-fuel-rail ${isFaulty('fuel-rail') ? 'faulty' : ''}`}><i /><i /><i /><b>FUEL</b></div>
        <div className={`cad-part cad-sensor ${isFaulty('sensor') ? 'faulty' : ''}`}><i /><b>SENSOR</b></div>
      </div>
      <p className="cad-instruction">Left-click and drag to rotate</p>
    </div>
  </section>
}

function LiveChart({ data, lines, height = 260 }: { data: Twin[], lines: { key: string, name: string, color: string, axis?: 'right', domain?: [number | string, number | string] }[], height?: number }) {
  const cleaned = data.map((entry: any, index) => ({ t: formatTime(entry.telemetry?.timestamp || entry.timestamp) || `${index}`, ...(entry.telemetry || entry) }))
  const leftDomain = lines.find(line => !line.axis)?.domain
  const rightDomain = lines.find(line => line.axis === 'right')?.domain
  return <div className="chart" style={{ height }}><ResponsiveContainer width="100%" height="100%"><LineChart data={cleaned} margin={{ left: 0, right: 0, top: 12, bottom: 0 }}>
    <CartesianGrid vertical={false} stroke="#213641" strokeDasharray="3 5" />
    <XAxis dataKey="t" minTickGap={52} tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} />
    <YAxis yAxisId="left" domain={leftDomain || ['auto', 'auto']} tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} width={42} />
    {lines.some(line => line.axis === 'right') && <YAxis yAxisId="right" orientation="right" domain={rightDomain || ['auto', 'auto']} tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} width={46} />}
    <Tooltip contentStyle={{ background: '#0d202b', border: '1px solid #34515c', borderRadius: 8 }} labelStyle={{ color: '#c7d9e0' }} />
    {lines.map(line => <Line key={line.key} yAxisId={line.axis === 'right' ? 'right' : 'left'} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />)}
  </LineChart></ResponsiveContainer></div>
}

function Shell({ path, twin, connected, soundEnabled, onToggleSound, children }: any) {
  const [menuOpen, setMenuOpen] = useState(false)
  const activeTitle = navigation.find(n => n[1] === path)?.[0] || 'AeroTwin'
  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <button className="brand" onClick={() => navigate('/')} aria-label="Go to AeroTwin home"><span className="brand-mark"><Satellite size={20} /></span><span>AERO<span>TWIN</span><small>DIGITAL TWIN SYSTEM</small></span></button>
      <div className="demo-flag"><span className="pulse" /> DEMO MODE <small>SYNTHETIC DATA</small></div>
      <nav id="primary-navigation" aria-label="Primary navigation">{navigationGroups.map(group => <div className="nav-group" key={group.label}><span className="nav-group-label">{group.label}</span>{group.items.map(([label, href, Icon]) => <button key={href} className={path === href ? 'active' : ''} aria-current={path === href ? 'page' : undefined} onClick={() => { navigate(href); setMenuOpen(false) }}><Icon size={17} /><span>{label}</span><ChevronRight className="nav-chevron" size={13} /></button>)}</div>)}</nav>
      <div className="side-bottom"><span><span className={`connection-dot ${connected ? '' : 'off'}`} />{connected ? 'LIVE LINK' : 'RECONNECTING'}</span><small>Generic aero piston engine<br />MALE UAV simulation</small></div>
    </aside>
    <main id="main-content" className="main-content" tabIndex={-1}>
      <header className="topbar"><button className="mobile-menu" aria-controls="primary-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}><Menu size={20} /></button><div><div className="breadcrumb">AEROTWIN <span>/ {activeTitle.toUpperCase()}</span></div><h1>{activeTitle}</h1></div><div className="top-status"><span className="topbar-engine"><Plane size={14} />{twin?.engine_id}</span><span className={`live-pill ${connected ? '' : 'offline'}`}><i />{connected ? 'LIVE' : 'DISCONNECTED'}</span><span className="time-stamp">{formatTime(twin?.updated_at)}</span><button aria-label={soundEnabled ? 'Mute sound alerts' : 'Enable sound alerts'} aria-pressed={soundEnabled} title={soundEnabled ? 'Mute sound alerts' : 'Enable sound alerts'} onClick={onToggleSound}>{soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><button aria-label="Settings" onClick={() => navigate('/simulation')}><Settings2 size={18} /></button></div></header>
      <div className="page-content">{children}</div>
    </main>
  </div>
}

function Landing({ twin }: { twin: Twin | null }) {
  return <div className="landing">
    <header className="landing-nav"><button className="brand" onClick={() => navigate('/')}><span className="brand-mark"><Satellite size={20} /></span><span>AERO<span>TWIN</span><small>DIGITAL TWIN SYSTEM</small></span></button><div className="landing-links"><button onClick={() => navigate('/fleet')}>Fleet</button><button onClick={() => navigate('/uav')}>Virtual UAV</button><button onClick={() => navigate('/architecture')}>Architecture</button><button className="button primary compact" onClick={() => navigate('/dashboard')}>Launch Twin <ArrowRight size={15} /></button></div></header>
    <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="pulse" /> FLIGHTLINE CONDITION LAB · SYNTHETIC ENGINEERING CONSOLE</div><h1>AI-enabled<br /><em>engine intelligence</em><br />for long missions.</h1><p>Trace every sensor signal into a live engine-health story: explainable fault evidence, a linked virtual aircraft, and a mission picture that updates with the twin.</p><div className="hero-buttons"><button className="button primary" onClick={() => navigate('/dashboard')}>Enter the flightline <ArrowRight size={17} /></button><button className="button ghost" onClick={() => navigate('/video')}><Play size={16} /> Watch demonstration</button></div><div className="hero-stats"><span><b>01 / LIVE</b> sensor telemetry</span><span><b>02 / EXPLAIN</b> fault evidence</span><span><b>03 / SIMULATE</b> mission state</span></div></div><EngineSchematic twin={twin || {}} hero /></section>
    <section className="landing-strip"><div><Radar /><span><b>Detect</b> anomaly signals against an Isolation Forest baseline.</span></div><div><Bot /><span><b>Predict</b> fault classes with explainable ML confidence.</span></div><div><Route /><span><b>Assess</b> health-driven simulated mission reliability.</span></div><div><Plane /><span><b>Connect</b> a virtual UAV view to the selected engine twin.</span></div></section>
    <section className="landing-features"><div className="section-intro"><span>ENGINEERING INTELLIGENCE</span><h2>One connected health narrative.</h2><p>Every screen reads the same continuously evolving synthetic twin—not static dashboard values.</p></div><div className="feature-grid"><Feature icon={Activity} title="Live telemetry" text="Correlated RPM, thermal, pressure, fuel, vibration, altitude and flight-state signals." /><Feature icon={ShieldAlert} title="Early warning" text="Dynamic alert severity and affected-parameter explanations keep risk understandable." /><Feature icon={Wrench} title="Predictive maintenance" text="High-level condition recommendations are generated from twin health and AI evidence." /><Feature icon={Layers3} title="Multi-UAV fleet" text="Monitor independent virtual engines, switch the active twin and inject isolated demo faults." /><Feature icon={FileUp} title="Measured-data lab" text="Upload CSV telemetry to surface configured limit breaches and persistent trend changes." /><Feature icon={MessageCircle} title="Twin-aware assistant" text="Ask questions grounded in the selected engine snapshot with an optional server-side AI model." /></div></section>
    <footer>© 2026 AeroTwin • Software research & monitoring demonstrator • All values are simulated/synthetic</footer>
  </div>
}

function Feature({ icon: Icon, title, text }: any) { return <article className="feature"><span><Icon size={22} /></span><h3>{title}</h3><p>{text}</p><button onClick={() => navigate('/dashboard')}>Explore <ChevronRight size={15} /></button></article> }

function Dashboard({ twin, data, command }: any) {
  const tel = twin.telemetry, pred = twin.prediction, health = twin.health, mission = twin.mission
  const coolingDrillActive = twin.settings.active_fault === 'cooling_degradation'
  const nominal = health.state === 'HEALTHY' && pred.risk === 'LOW'
  const statusLabel = nominal ? 'Baseline stable' : 'Condition review'
  const statusSummary = pred.affected_parameters?.length
    ? `Review ${pred.affected_parameters.slice(0, 2).join(' and ').toLowerCase()} signals in the active simulation.`
    : nominal
      ? 'Current synthetic signals are tracking within the learned baseline.'
      : `Twin health is ${health.state.toLowerCase()} with ${pred.risk.toLowerCase()} modeled fault risk. Review the evidence.`
  return <>
    <div className="page-intro"><div><span className="eyebrow">LIVE ENGINE TWIN · SYNTHETIC DATA · {twin.engine_id}</span><h2>Flightline overview</h2><p>Mission-oriented view of the selected virtual engine and its current condition.</p></div><button className="button ghost compact" onClick={() => command(twin.settings.running ? '/api/simulation/pause' : '/api/simulation/start')} >{twin.settings.running ? <Pause size={15} /> : <Play size={15} />}{twin.settings.running ? 'Pause simulation' : 'Resume simulation'}</button></div>
    <section className={`flightline-hero ${nominal ? 'nominal' : 'review'}`} aria-label="Simulation condition summary">
      <div className="flightline-copy">
        <div className="flightline-kicker"><span className="pulse" /> SIMULATION CONDITION <span className="flightline-divider">/</span> {twin.operating_state}</div>
        <h3>{statusLabel}</h3>
        <p>{statusSummary}</p>
        <div className="flightline-health">
          <div><span>ENGINE CONDITION INDEX</span><b>{health.overall}<small> / 100</small></b></div>
          <div className="flightline-progress"><i style={{ width: `${health.overall}%` }} /></div>
        </div>
        <div className="flightline-links">
          <button className="flightline-link" onClick={() => navigate('/digital-twin')}>Inspect twin <ArrowRight size={14} /></button>
          <button className="flightline-link" onClick={() => navigate('/mission')}>Mission profile <ArrowRight size={14} /></button>
          <button className={`flightline-link demo-action ${coolingDrillActive ? 'drill-active' : ''}`} title="Changes the synthetic demo only; no physical system is connected." onClick={() => command('/api/simulation/fault', { fault: coolingDrillActive ? 'normal' : 'cooling_degradation' })}>{coolingDrillActive ? 'Reset to normal' : 'Try cooling drill'} <Zap size={14} /></button>
        </div>
      </div>
      <div className="flightline-instruments" aria-label="Key live readings">
        <article><span>ENGINE SPEED</span><b>{Math.round(tel.rpm).toLocaleString()}</b><small>RPM</small></article>
        <article><span>CYLINDER TEMP</span><b>{tel.cylinder_temperature}</b><small>°C</small></article>
        <article><span>OIL PRESSURE</span><b>{tel.oil_pressure}</b><small>BAR</small></article>
        <article className={pred.anomaly_score >= 35 ? 'instrument-alert' : ''}><span>ANOMALY SCORE</span><b>{pred.anomaly_score}</b><small>/ 100 · {pred.anomaly_status}</small></article>
      </div>
    </section>
    <div className="metrics-grid dashboard-kpis"><MetricCard label="Overall health" value={health.overall} unit="%" icon={HeartPulse} tone={health.state === 'HEALTHY' ? 'green' : 'orange'} caption={health.state} /><MetricCard label="Fault risk" value={pred.risk} icon={ShieldAlert} tone={pred.risk === 'LOW' ? 'cyan' : 'red'} caption={`${pred.confidence}% model confidence`} /><MetricCard label="Mission reliability" value={mission.reliability_score} unit="%" icon={Route} tone={mission.reliability_score > 78 ? 'green' : 'red'} caption={`${mission.mission_risk} simulated risk`} /><MetricCard label="Estimated RUL" value={twin.estimated_rul_hours} unit=" h" icon={Clock3} tone="blue" caption="Synthetic condition indicator" /></div>
    <div className="dashboard-main"><Panel title="Live engine trends" action={<span className="panel-note"><i className="signal" /> RPM · CYLINDER TEMP · 1 SEC</span>}><LiveChart data={data} height={300} lines={[{ key: 'rpm', name: 'RPM', color: '#147fa3', domain: ['dataMin - 100', 'dataMax + 100'] }, { key: 'cylinder_temperature', name: 'Cylinder °C', color: '#e59a36', axis: 'right', domain: ['dataMin - 5', 'dataMax + 5'] }]} /></Panel><Panel title="Digital twin status" className="twin-summary"><EngineSchematic twin={twin} /><div className="twin-status-line"><span>OPERATING STATE</span><b>{twin.operating_state}</b></div><div className="twin-status-line"><span>ACTIVE SCENARIO</span><b>{twin.settings.fault_label}</b></div><div className="twin-status-line"><span>LAST UPDATE</span><b>{formatTime(twin.updated_at)}</b></div><button className="text-button" onClick={() => navigate('/digital-twin')}>Inspect virtual twin <ArrowRight size={14} /></button></Panel></div>
    <div className="dashboard-bottom"><Panel title="AI fault assessment"><div className="assessment"><div className="prediction-orb" style={{ '--progress': `${pred.confidence}%`, '--color': riskColor(pred.confidence) } as any}><b>{pred.confidence}%</b><small>CONFIDENCE</small></div><div><Badge value={pred.risk} /><h3>{pred.predicted_fault_label}</h3><p>{pred.affected_parameters?.length ? `Signals requiring attention: ${pred.affected_parameters.slice(0, 3).join(', ')}.` : 'All monitored signals match the learned normal operating baseline.'}</p><button className="text-button" onClick={() => navigate('/prediction')}>View explainable AI <ArrowRight size={14} /></button></div></div></Panel><Alerts alerts={twin.alerts} command={command} /></div>
    <EmergencyResponsePanel twin={twin} />
  </>
}

function EmergencyResponsePanel({ twin }: { twin: Twin }) {
  const [previewOpen, setPreviewOpen] = useState(false)
  return <Panel className="emergency-panel" title="Emergency response" action={<span className="emergency-status"><i /> DEMO · DISPATCH NOT CONNECTED</span>}>
    <div className="emergency-summary">
      <span className="emergency-icon"><ShieldAlert size={20} /></span>
      <div><b>Crash-response workflow preview</b><p>This prototype can prepare an incident summary for operator review, but it does not detect real crashes or contact emergency services.</p></div>
      <button className="button danger compact" onClick={() => setPreviewOpen(value => !value)}>{previewOpen ? 'Close drill' : 'Preview SOS drill'}</button>
    </div>
    {previewOpen && <div className="sos-preview" role="status">
      <div className="sos-preview-heading"><span><MapPin size={16} /> SIMULATED INCIDENT BRIEF</span><Badge value="NOT SENT" /></div>
      <dl>
        <div><dt>Vehicle</dt><dd>{twin.engine_id} · simulation only</dd></div>
        <div><dt>Last telemetry</dt><dd>{formatTime(twin.updated_at)} · simulated</dd></div>
        <div><dt>Position</dt><dd>GNSS coordinates unavailable in this demo</dd></div>
        <div><dt>Nearest response center</dt><dd>Unavailable · no verified directory connected</dd></div>
      </dl>
      <p>For a real deployment, connect validated crash-detection and GNSS sources to an approved emergency-routing provider, then require an authorized operator to verify the incident and confirm dispatch. This drill never sends an SOS.</p>
    </div>}
  </Panel>
}

function Alerts({ alerts, command }: any) { return <Panel title="Recent alerts" action={<button className="text-button" onClick={() => navigate('/history')}>Timeline <ArrowRight size={14} /></button>}><div className="alerts-list">{alerts?.length ? alerts.slice(0, 5).map((alert: any) => <article className={`alert-row ${severityClass(alert.severity)}`} key={alert.id}><span className="alert-symbol"><AlertTriangle size={15} /></span><div><div><Badge value={alert.severity} /><time>{formatTime(alert.timestamp)}</time></div><p>{alert.message}</p></div>{!alert.acknowledged && <button aria-label="Acknowledge alert" onClick={() => command(`/api/alerts/${alert.id}/acknowledge`)}><CheckCircle2 size={16} /></button>}</article>) : <Empty text="No active alerts — monitoring live baseline." />}</div></Panel> }

function DigitalTwinPage({ twin }: any) { return <><div className="page-intro"><div><span className="eyebrow">LIVE 3D ENGINE INSPECTION · CC0 REFERENCE MODEL</span><h2>Digital Twin</h2><p>Real scanned aero piston engine geometry, synchronized with this application’s existing WebSocket telemetry and AI condition state.</p></div><Badge value={twin.health.state} /></div><Suspense fallback={<Panel title="Interactive 3D engine inspection"><div className="empty"><Boxes size={18} /><span>Loading 3D inspection workspace…</span></div></Panel>}><DigitalTwin3DPanel twin={twin} /></Suspense><ComponentHealth components={twin.component_health} /><div className="two-col"><Panel title="Twin health rationale"><p className="info-copy">The overall health index combines virtual component condition, temperature and pressure deviations, vibration, fuel behavior, anomaly evidence, model confidence, and operating-hour age. It is a synthetic demonstrator indicator, not a certified airworthiness metric.</p></Panel><Panel title="Current state transitions"><div className="state-track"><span className={twin.health.overall >= 90 ? 'active' : ''}>Healthy</span><span className={twin.health.overall < 90 && twin.health.overall >= 75 ? 'active' : ''}>Watch</span><span className={twin.health.overall < 75 && twin.health.overall >= 50 ? 'active' : ''}>Degraded</span><span className={twin.health.overall < 50 ? 'active critical' : ''}>Critical</span></div><p className="muted">Current degradation rate: {twin.health.degradation_rate} index points / simulated minute</p></Panel></div></> }

function ComponentHealth({ components }: { components: Record<string, number> }) { return <Panel title="Virtual component health"><div className="component-grid">{Object.entries(components || {}).map(([key, value]) => <article key={key} className="component"><div><span>{key.replaceAll('_', ' ')}</span><b style={{ color: healthColor(value) }}>{value}%</b></div><div className="progress"><i style={{ width: `${value}%`, background: healthColor(value) }} /></div></article>)}</div></Panel> }

function TelemetryPage({ twin, data, command }: any) { const tel = twin.telemetry; const sensorCards = [['RPM', tel.rpm, 'rpm', Gauge], ['Cylinder temperature', tel.cylinder_temperature, '°C', Thermometer], ['Exhaust temperature', tel.exhaust_temperature, '°C', Thermometer], ['Oil temperature', tel.oil_temperature, '°C', Thermometer], ['Oil pressure', tel.oil_pressure, 'bar', Activity], ['Vibration', tel.vibration, 'mm/s', Activity], ['Fuel flow', tel.fuel_flow, 'L/h', Zap], ['Fuel pressure', tel.fuel_pressure, 'bar', Activity], ['Manifold pressure', tel.manifold_pressure, 'kPa', Gauge], ['Airspeed', tel.airspeed, 'kt', Satellite]] as any[]; return <><div className="page-intro"><div><span className="eyebrow">SENSOR TELEMETRY · BOUNDED STREAM</span><h2>Telemetry console</h2><p>Latest synthetic sensor values with continuously updating time-series evidence.</p></div><div className="button-group"><button className="button ghost compact" onClick={() => command(twin.settings.running ? '/api/simulation/pause' : '/api/simulation/start')}>{twin.settings.running ? <Pause size={15} /> : <Play size={15} />}{twin.settings.running ? 'Pause' : 'Live'}</button><span className="panel-note">Range: live / 3 min buffer</span></div></div><div className="sensor-grid">{sensorCards.map(([label, value, unit, Icon]) => <article className="sensor-card" key={label}><span><Icon size={16} /></span><small>{label}</small><b>{value}<em>{unit}</em></b></article>)}</div><div className="two-col telemetry-charts"><Panel title="Thermal state"><LiveChart data={data} lines={[{ key: 'cylinder_temperature', name: 'Cylinder temp', color: '#f4a960' }, { key: 'oil_temperature', name: 'Oil temp', color: '#e76d78' }, { key: 'exhaust_temperature', name: 'Exhaust temp', color: '#d799e8' }]} /></Panel><Panel title="Mechanical and lubrication"><LiveChart data={data} lines={[{ key: 'oil_pressure', name: 'Oil pressure', color: '#55d8e7' }, { key: 'vibration', name: 'Vibration', color: '#f4b95f' }]} /></Panel></div><Panel title="Signal operating envelope"><div className="threshold-table"><div><span>RPM</span><b>{Math.round(tel.rpm)} rpm</b><small>Expected 1,500–2,900 rpm</small></div><div><span>Cylinder temperature</span><b>{tel.cylinder_temperature} °C</b><small>Expected 118–168 °C</small></div><div><span>Oil pressure</span><b>{tel.oil_pressure} bar</b><small>Expected 3.5–5.0 bar</small></div><div><span>Vibration</span><b>{tel.vibration} mm/s</b><small>Expected &lt; 4.5 mm/s</small></div></div></Panel></> }

function HealthPage({ twin, data }: any) { const healthData = data.map((x: any) => ({ time: formatTime(x.updated_at), health: x.health?.overall, anomaly: x.prediction?.anomaly_score })); return <><div className="page-intro"><div><span className="eyebrow">MULTI-FACTOR CONDITION INDEX</span><h2>Engine health</h2><p>Explainable component and system-level condition tracking.</p></div><div className="health-ring" style={{ '--progress': `${twin.health.overall}%`, '--color': healthColor(twin.health.overall) } as any}><b>{twin.health.overall}</b><small>HEALTH</small></div></div><ComponentHealth components={twin.component_health} /><div className="two-col"><Panel title="Health & anomaly trend"><div className="chart" style={{ height: 285 }}><ResponsiveContainer><AreaChart data={healthData}><defs><linearGradient id="healthFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#49d7b1" stopOpacity={.4} /><stop offset="100%" stopColor="#49d7b1" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#213641" strokeDasharray="3 5" /><XAxis dataKey="time" minTickGap={52} tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#0d202b', border: '1px solid #34515c', borderRadius: 8 }} /><Area dataKey="health" name="Health index" stroke="#49d7b1" fill="url(#healthFill)" strokeWidth={2} /><Line dataKey="anomaly" name="Anomaly score" stroke="#efb45e" strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer></div></Panel><Panel title="Index interpretation"><div className="interpretation"><div><b>90–100</b><span>Healthy</span></div><div><b>75–89</b><span>Watch</span></div><div><b>50–74</b><span>Degraded</span></div><div><b>25–49</b><span>Critical</span></div><div><b>0–24</b><span>Severe</span></div></div><p className="info-copy">Index calculation weights component health, telemetry deviation, anomaly score, ML fault probability, engine age, and degradation trend. Thresholds are visible to keep the synthetic decision path auditable.</p><span className="fact-line">Estimated RUL <b>{twin.estimated_rul_hours} h</b></span></Panel></div></> }

function PredictionPage({ twin }: any) { const pred = twin.prediction; const probabilities = Object.entries(pred.probabilities || {}).map(([name, value]) => ({ name, value })); return <><div className="page-intro"><div><span className="eyebrow">RANDOM FOREST + ISOLATION FOREST</span><h2>Fault prediction</h2><p>Model results trained exclusively on reproducible, project-generated synthetic data.</p></div><Badge value={pred.risk} /></div><div className="prediction-hero"><Panel className="current-prediction"><span className="prediction-kicker">CURRENT PREDICTED FAULT</span><h2>{pred.predicted_fault_label}</h2><div className="prediction-numbers"><div><b>{pred.confidence}%</b><span>model confidence</span></div><div><b>{pred.anomaly_score}</b><span>anomaly / 100</span></div><div><b>{pred.risk}</b><span>risk tier</span></div></div><p>Classification probability is generated by the saved local model; anomaly status is independently evaluated against a normal-operation Isolation Forest baseline.</p></Panel><Panel title="Fault probability distribution"><div className="chart probability-chart"><ResponsiveContainer><BarChart data={probabilities} layout="vertical" margin={{ left: 14, right: 20 }}><XAxis type="number" domain={[0, 100]} hide /><YAxis type="category" dataKey="name" width={142} tick={{ fill: '#b9cad2', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#0d202b', border: '1px solid #34515c', borderRadius: 8 }} formatter={(v: any) => `${v}%`} /><Bar dataKey="value" radius={[0, 5, 5, 0]}>{probabilities.map((item, i) => <Cell key={i} fill={item.name === pred.predicted_fault_label ? '#f2b861' : '#397e93'} />)}</Bar></BarChart></ResponsiveContainer></div></Panel></div><Panel title="Explainable AI · contributing signals" action={<span className="panel-note">Expected ranges are synthetic monitoring baselines</span>}><div className="explain-grid">{pred.explanations?.map((item: any) => <article key={item.parameter} className={`explain-card ${severityClass(item.deviation)}`}><div><h3>{item.parameter}</h3><Badge value={item.deviation} /></div><b>{item.current_value} <em>{item.unit}</em></b><p>Expected: {item.expected_range}</p><div className="contribution"><span>Risk contribution</span><i><b style={{ width: `${Math.max(4, item.contribution)}%` }} /></i><strong>{item.contribution}%</strong></div></article>)}</div></Panel><div className="model-note"><Bot size={17} /><span>Model card: Random Forest classifier plus Isolation Forest detector • synthetic-data evaluation • not certified for operational use.</span></div></> }

function MissionPage({ twin }: any) { const mission = twin.mission; const pie = [{ name: 'Reliability', value: mission.reliability_score }, { name: 'Risk', value: 100 - mission.reliability_score }]; return <><div className="page-intro"><div><span className="eyebrow">SIMULATED MISSION RELIABILITY</span><h2>Mission impact</h2><p>Transparent, load-weighted reliability effects across a non-operational UAV simulation.</p></div><Badge value={mission.mission_risk} /></div><div className="mission-summary"><Panel title="Mission reliability score"><div className="mission-gauge"><ResponsiveContainer><PieChart><Pie data={pie} dataKey="value" startAngle={180} endAngle={0} innerRadius="65%" outerRadius="88%" paddingAngle={2}>{pie.map((item, i) => <Cell key={i} fill={i ? '#233b46' : healthColor(mission.reliability_score)} />)}</Pie></PieChart></ResponsiveContainer><div><b>{mission.reliability_score}%</b><span>SIMULATED RELIABILITY</span></div></div></Panel><MetricCard label="Mission risk" value={mission.mission_risk} icon={ShieldAlert} tone={mission.mission_risk === 'LOW' ? 'green' : 'red'} caption="Load-weighted health risk" /><MetricCard label="Engine failure risk" value={mission.engine_failure_risk} unit="%" icon={AlertTriangle} tone="orange" caption="Synthetic risk indicator" /><MetricCard label="Completion probability" value={mission.mission_completion_probability} unit="%" icon={CheckCircle2} tone="cyan" caption="Current twin state" /></div><Panel title="Simulated mission phases" action={<span className="panel-note">{mission.method}</span>}><div className="mission-table"><div className="table-head"><span>Phase</span><span>Load</span><span>Duration</span><span>Health</span><span>Risk</span><span>Reliability</span></div>{mission.phases.map((phase: any) => <div className="table-row" key={phase.phase}><b>{phase.phase}</b><span>{phase.engine_load}%</span><span>{phase.expected_duration_min} min</span><span>{phase.engine_health}%</span><span><Badge value={phase.risk} /></span><strong style={{ color: healthColor(phase.reliability_contribution) }}>{phase.reliability_contribution}%</strong></div>)}</div></Panel><div className="model-note"><Route size={17} /><span>Method: phase risk = health deficit × load factor + anomaly adjustment; mission reliability is a duration-weighted mean. It is a planning demonstrator, not an operational flight or combat system.</span></div></> }

function MaintenancePage({ twin, command }: any) { const item = twin.maintenance; return <><div className="page-intro"><div><span className="eyebrow">CONDITION-BASED MAINTENANCE</span><h2>Maintenance recommendation</h2><p>High-level, non-procedural condition guidance derived from current twin evidence.</p></div><Badge value={item.priority} /></div><Panel className="maintenance-card"><div className="maintenance-icon"><Wrench size={31} /></div><div><span className="prediction-kicker">{item.priority} PRIORITY</span><h2>{item.title}</h2><p>{item.reason}</p><dl className="maintenance-details"><div><dt>Recommended action</dt><dd>{item.recommended_action}</dd></div><div><dt>Most affected indicator</dt><dd>{item.weakest_subsystem}</dd></div><div><dt>Estimated RUL</dt><dd>{twin.estimated_rul_hours} simulated hours</dd></div></dl><button className="button ghost compact" onClick={() => command('/api/simulation/fault', { fault: 'normal' })}><RefreshCcw size={15} /> Return to normal scenario</button></div></Panel><div className="two-col"><Panel title="Maintenance decision evidence"><div className="evidence-list"><span><Thermometer /> Thermal state and cooling trend</span><span><Activity /> Pressure and vibration condition</span><span><Bot /> ML prediction and anomaly evidence</span><span><Route /> Simulated mission reliability effect</span></div></Panel><Panel title="Scope boundary"><p className="info-copy">AeroTwin does not provide real-world repair steps, flight clearance, or autonomous action. Recommendations are intentionally high-level monitoring prompts for this local research demonstration.</p></Panel></div></> }

function HistoryPage({ twin, data }: any) { const alertRows = twin.alerts || []; return <><div className="page-intro"><div><span className="eyebrow">SESSION HISTORY · SQLITE PERSISTENCE</span><h2>Historical analysis</h2><p>Bounded live buffer with telemetry, prediction, alert, and mission records persisted locally.</p></div><span className="panel-note">{data.length} live samples this session</span></div><Panel title="Historical health and RUL"><div className="chart" style={{ height: 280 }}><ResponsiveContainer><LineChart data={data.map((entry: any) => ({ time: formatTime(entry.updated_at), health: entry.health?.overall, rul: entry.estimated_rul_hours }))}><CartesianGrid vertical={false} stroke="#213641" strokeDasharray="3 5" /><XAxis dataKey="time" minTickGap={52} tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis yAxisId="left" domain={[0, 100]} tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis yAxisId="right" orientation="right" tick={{ fill: '#88a6b2', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#0d202b', border: '1px solid #34515c', borderRadius: 8 }} /><Line yAxisId="left" dataKey="health" stroke="#49d7b1" strokeWidth={2} dot={false} /><Line yAxisId="right" dataKey="rul" stroke="#65b6f2" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></Panel><Panel title="Event & alert timeline"><div className="timeline">{alertRows.length ? alertRows.map((alert: any) => <article key={alert.id}><span className={`timeline-dot ${severityClass(alert.severity)}`} /><div><time>{formatTime(alert.timestamp)}</time><Badge value={alert.severity} /><p>{alert.message}</p><small>{alert.details}</small></div></article>) : <Empty text="Events will appear as live or simulated conditions change." />}</div></Panel><div className="model-note"><Database size={17} /><span>SQLite tables: engines, telemetry, fault_events, predictions, missions, alerts, and maintenance_events. Data remains local to the demo machine.</span></div></> }

function SimulationPage({ twin, command }: any) { const [settings, setSettings] = useState({ speed: twin.settings.speed, throttle: twin.settings.throttle, load: twin.settings.load, altitude: twin.settings.altitude, ambient_temperature: twin.settings.ambient_temperature }); const update = (key: string, value: number) => setSettings(previous => ({ ...previous, [key]: value })); const apply = () => command('/api/simulation/settings', settings); return <><div className="page-intro"><div><span className="eyebrow">FAULT INJECTION & FLIGHT ENVIRONMENT</span><h2>Simulation control</h2><p>Control the local synthetic data stream and demonstrate progressive condition changes.</p></div><div className="button-group"><button className="button ghost compact" onClick={() => command(twin.settings.running ? '/api/simulation/pause' : '/api/simulation/start')}>{twin.settings.running ? <Pause size={15} /> : <Play size={15} />}{twin.settings.running ? 'Pause' : 'Start'}</button><button className="button danger compact" onClick={() => command('/api/simulation/reset')}><RefreshCcw size={15} /> Reset</button></div></div><div className="sim-grid"><Panel title="Operating environment"><div className="controls"><Control label="Simulation speed" value={settings.speed} min={1} max={10} suffix="×" step={1} onChange={(v: number) => update('speed', v)} /><Control label="Throttle" value={settings.throttle} min={15} max={100} suffix="%" onChange={(v: number) => update('throttle', v)} /><Control label="Engine load" value={settings.load} min={10} max={100} suffix="%" onChange={(v: number) => update('load', v)} /><Control label="Altitude" value={settings.altitude} min={0} max={10000} suffix=" m" step={100} onChange={(v: number) => update('altitude', v)} /><Control label="Ambient temperature" value={settings.ambient_temperature} min={-20} max={50} suffix=" °C" onChange={(v: number) => update('ambient_temperature', v)} /></div><button className="button primary full" onClick={apply}>Apply environment settings <CheckCircle2 size={16} /></button></Panel><Panel title="Fault injection scenarios"><p className="muted">Each injection changes correlated signals gradually rather than instantly forcing a hardcoded outcome.</p><div className="fault-grid">{faultOptions.map(([key, title, description]) => <button key={key} className={`fault-option ${twin.settings.active_fault === key ? 'selected' : ''}`} onClick={() => command('/api/simulation/fault', { fault: key })}><span>{twin.settings.active_fault === key ? <CheckCircle2 size={15} /> : <Zap size={15} />}</span><b>{title}</b><small>{description}</small></button>)}</div></Panel></div><Panel title="Active scenario status"><div className="scenario-status"><div><span>Scenario</span><b>{twin.settings.fault_label}</b></div><div><span>Progress</span><b>{twin.settings.fault_progress}%</b></div><div className="progress wide"><i style={{ width: `${twin.settings.fault_progress}%` }} /></div><p>Fault injection affects only this local synthetic simulation. No physical engine, aircraft, or external system is connected.</p></div></Panel></> }

function Control({ label, value, min, max, suffix, step = 1, onChange }: any) { return <label className="control"><span>{label}<b>{value}{suffix}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label> }

function FleetPage({ twin, fleet, command, controlVehicle }: any) {
  const [error, setError] = useState('')
  const run = async (engineId: string, action: string, fault?: string) => {
    try { await controlVehicle(engineId, action, fault); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Fleet command failed.') }
  }
  return <>
    <div className="page-intro"><div><span className="eyebrow">SIMULATED FLEET · ENGINE-SYNCHRONIZED</span><h2>Multiple UAV control</h2><p>Monitor each virtual aircraft twin, choose the active vehicle, and control its isolated synthetic scenario.</p></div><Badge value="DEMO FLEET" /></div>
    <div className="fleet-summary"><MetricCard label="Virtual aircraft" value={fleet.length} icon={Plane} tone="cyan" caption="Isolated twin instances" /><MetricCard label="Active vehicle" value={twin.engine_id} icon={Satellite} tone="blue" caption="Feeds the main dashboard" /><MetricCard label="In simulation" value={fleet.filter((vehicle: Twin) => vehicle.operating_state === 'RUNNING').length} icon={Activity} tone="green" caption="Synthetic telemetry streams" /></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <div className="fleet-grid">{fleet.map((vehicle: Twin) => <Panel key={vehicle.engine_id} className={`fleet-card ${vehicle.selected ? 'fleet-selected' : ''}`}>
      <div className="fleet-card-head"><span className="fleet-icon"><Plane size={19} /></span><div><b>{vehicle.engine_id}</b><small>{vehicle.selected ? 'ACTIVE TWIN · MAIN DASHBOARD' : 'VIRTUAL ENGINE LINK'}</small></div><Badge value={vehicle.operating_state} /></div>
      <div className="fleet-health"><div><span>ENGINE HEALTH</span><b style={{ color: healthColor(vehicle.health.overall) }}>{vehicle.health.overall}%</b></div><div><span>FAULT RISK</span><b>{vehicle.prediction.risk}</b></div><div><span>CURRENT RPM</span><b>{Math.round(vehicle.telemetry.rpm)}</b></div></div>
      <div className="fleet-fault"><label htmlFor={`fault-${vehicle.engine_id}`}>Synthetic scenario</label><select id={`fault-${vehicle.engine_id}`} value={vehicle.settings.active_fault} onChange={event => run(vehicle.engine_id, 'fault', event.target.value)}>{faultOptions.map(([key, title]) => <option value={key} key={key}>{title}</option>)}</select></div>
      <div className="fleet-actions"><button className="button ghost compact" onClick={() => command('/api/fleet/select', { engine_id: vehicle.engine_id })} disabled={vehicle.selected}>{vehicle.selected ? 'Selected twin' : 'Open twin'}</button><button className="button ghost compact" onClick={() => run(vehicle.engine_id, vehicle.operating_state === 'RUNNING' ? 'pause' : 'start')}>{vehicle.operating_state === 'RUNNING' ? <Pause size={14} /> : <Play size={14} />}{vehicle.operating_state === 'RUNNING' ? 'Pause' : 'Start'}</button></div>
    </Panel>)}</div>
    <div className="model-note"><ShieldAlert size={17} /><span>Every card is a software-only vehicle simulation. Fleet controls change only local demo twins; no radio, autopilot, flight controller, or real UAV is connected.</span></div>
  </>
}

function routePosition(progress: number) {
  const points = [[48, 168], [130, 82], [220, 122], [323, 52], [430, 155]]
  const segment = Math.min(points.length - 2, Math.floor(progress / 100 * (points.length - 1)))
  const fraction = progress / 100 * (points.length - 1) - segment
  const [x1, y1] = points[segment], [x2, y2] = points[segment + 1]
  return { x: x1 + (x2 - x1) * fraction, y: y1 + (y2 - y1) * fraction }
}

function VirtualUAVPage({ twin }: any) {
  const [uav, setUav] = useState<Twin | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (STATIC_DEMO) { setUav(staticUav()); return }
    const response = await fetch(api('/api/uav'))
    if (!response.ok) throw new Error(`UAV status unavailable (${response.status})`)
    setUav(await response.json())
  }, [])
  useEffect(() => {
    let active = true
    const refresh = () => load().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'UAV status unavailable.') })
    refresh()
    const timer = window.setInterval(refresh, 1200)
    return () => { active = false; clearInterval(timer) }
  }, [load, twin.engine_id])
  const control = async (action: string) => {
    setBusy(true)
    try {
      if (STATIC_DEMO) {
        setUav(staticUavControl(action))
        setError('')
        return
      }
      const response = await fetch(api('/api/uav/control'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      if (!response.ok) throw new Error(`UAV control failed (${response.status})`)
      setUav(await response.json())
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'UAV control failed.') }
    finally { setBusy(false) }
  }
  const position = routePosition(uav?.progress_pct || 0)
  return <>
    <div className="page-intro"><div><span className="eyebrow">VIRTUAL UAV · ENGINE DATA LINK ACTIVE</span><h2>Flight simulator</h2><p>A separate, illustrative vehicle view linked to {twin.engine_id} and its changing engine health.</p></div><Badge value={uav?.flight_state || 'CONNECTING'} /></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <div className="uav-layout">
      <Panel className="uav-map-panel" title="Illustrative mission route" action={<span className="panel-note"><MapPin size={12} /> NOT A NAVIGATION MAP</span>}>
        <div className="uav-map">
          <div className="map-grid" />
          <svg viewBox="0 0 480 220" role="img" aria-label="Illustrative virtual UAV route and simulated position">
            <path className="route-line" d="M48 168 L130 82 L220 122 L323 52 L430 155" />
            <path className="route-trail" pathLength="100" style={{ strokeDasharray: `${uav?.progress_pct || 0} 100` }} d="M48 168 L130 82 L220 122 L323 52 L430 155" />
            {[[48, 168], [130, 82], [220, 122], [323, 52], [430, 155]].map(([x, y], index) => <circle key={index} className="route-waypoint" cx={x} cy={y} r={index === 0 || index === 4 ? 5 : 4} />)}
            <g className="uav-marker" transform={`translate(${position.x} ${position.y}) rotate(${uav?.heading_deg || 0})`}><path d="M0 -12 L4 2 L13 7 L13 10 L3 7 L2 13 L6 16 L6 18 L0 16 L-6 18 L-6 16 L-2 13 L-3 7 L-13 10 L-13 7 L-4 2 Z" /></g>
            <text x="35" y="194">START</text><text x="397" y="181">RETURN</text>
          </svg>
          <div className="map-label">{uav?.route_name || 'Loading route'} · {uav?.progress_pct || 0}% complete</div>
        </div>
        <div className="route-options">{[['coastal-survey', 'Coastal survey'], ['mountain-patrol', 'Mountain patrol'], ['training-circuit', 'Training circuit']].map(([id, name]) => <button className={`route-chip ${uav?.route_id === id ? 'selected' : ''}`} key={id} onClick={() => control(id)} disabled={busy}>{name}</button>)}</div>
      </Panel>
      <div className="uav-side"><Panel title="Live virtual aircraft"><div className="uav-identity"><span className="uav-avatar"><Plane size={24} /></span><div><b>{uav?.uav_id || `VT-${twin.engine_id}`}</b><small>SIM LINK · {twin.engine_id}</small></div></div>
        <div className="uav-metrics"><div><span>ALTITUDE</span><b>{uav?.altitude_m ?? twin.telemetry.altitude}<small> m</small></b></div><div><span>AIRSPEED</span><b>{uav?.airspeed_kt ?? twin.telemetry.airspeed}<small> kt</small></b></div><div><span>HEADING</span><b>{uav?.heading_deg ?? 0}<small> °</small></b></div><div><span>ENGINE RPM</span><b>{Math.round(twin.telemetry.rpm)}</b></div></div>
        <div className="linked-health"><span>LINKED ENGINE HEALTH</span><b style={{ color: healthColor(twin.health.overall) }}>{twin.health.overall}%</b><div className="progress"><i style={{ width: `${twin.health.overall}%`, background: healthColor(twin.health.overall) }} /></div></div>
        <div className="uav-controls"><button className="button primary compact" onClick={() => control(uav?.flight_state === 'EN ROUTE' ? 'pause' : 'start')} disabled={busy}>{uav?.flight_state === 'EN ROUTE' ? <Pause size={15} /> : <Play size={15} />}{uav?.flight_state === 'EN ROUTE' ? 'Pause simulation' : 'Resume simulation'}</button><button className="button ghost compact" onClick={() => control('reset')} disabled={busy}><RefreshCcw size={15} /> Reset route</button></div>
      </Panel><div className="uav-scope-note"><ShieldAlert size={16} /><span>Virtual controls animate a local scenario only. This page sends no commands to an aircraft and provides no flight-navigation data.</span></div></div>
    </div>
  </>
}

const sampleTelemetry = `timestamp,cylinder_temperature,oil_pressure,vibration,fuel_flow
2026-01-01T10:00:00Z,145,4.2,2.1,17.1
2026-01-01T10:01:00Z,146,4.2,2.0,17.2
2026-01-01T10:02:00Z,144,4.3,2.1,17.0
2026-01-01T10:03:00Z,145,4.2,2.2,17.1
2026-01-01T10:04:00Z,146,4.1,2.0,17.2
2026-01-01T10:05:00Z,145,4.2,2.1,17.0
2026-01-01T10:06:00Z,144,4.3,2.0,17.1
2026-01-01T10:07:00Z,145,4.2,2.1,17.2
2026-01-01T10:08:00Z,173,3.8,2.3,17.4
2026-01-01T10:09:00Z,178,3.7,2.4,17.6
2026-01-01T10:10:00Z,181,3.6,2.5,17.7
2026-01-01T10:11:00Z,184,3.4,2.7,17.9
2026-01-01T10:12:00Z,186,3.3,2.8,18.1`

function DataLabPage() {
  const [result, setResult] = useState<Twin | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const analyze = async (filename: string, csvText: string) => {
    if (csvText.length > 2_000_000) { setError('CSV exceeds the 2 MB analysis limit.'); return }
    setBusy(true)
    setError('')
    try {
      if (STATIC_DEMO) {
        setResult(staticCsvAnalysis(filename, csvText))
        return
      }
      const response = await fetch(api('/api/telemetry/analyze-csv'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename, csv_text: csvText }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail || `Analysis failed (${response.status})`)
      setResult(payload)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'CSV analysis failed.') }
    finally { setBusy(false) }
  }
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) await analyze(file.name, await file.text())
    event.target.value = ''
  }
  return <>
    <div className="page-intro"><div><span className="eyebrow">MEASURED DATA · EVIDENCE-FIRST ANALYSIS</span><h2>Telemetry data lab</h2><p>Upload an engine telemetry CSV to find the first configured threshold breach or persistent change from its measured baseline.</p></div><Badge value="CSV ANALYSIS" /></div>
    <div className="data-lab-grid"><Panel title="Analyze a telemetry file"><div className="upload-zone"><FileUp size={26} /><h3>Bring your own telemetry</h3><p>CSV, up to 2 MB and 5,000 rows. Include timestamps plus any supported numeric sensor columns.</p><label className="button primary compact"><Upload size={15} />{busy ? 'Analyzing…' : 'Choose CSV'}<input type="file" accept=".csv,text/csv" onChange={upload} disabled={busy} /></label><button className="text-button" onClick={() => analyze('AeroTwin synthetic example.csv', sampleTelemetry)} disabled={busy}>Run the built-in example</button></div><div className="supported-signals"><b>Supported columns</b><span>cylinder_temperature · exhaust_temperature · oil_pressure · oil_temperature · vibration · fuel_flow · fuel_pressure · rpm</span><small>At least 8 valid rows and one supported sensor column are required.</small></div></Panel>
      <Panel title="How detections are timed"><div className="detection-steps"><div><b>01</b><span><strong>Build baseline</strong><small>First 5–50 samples define a robust median/MAD reference.</small></span></div><div><b>02</b><span><strong>Check limits</strong><small>Every sample is checked against the visible monitoring envelope.</small></span></div><div><b>03</b><span><strong>Confirm drift</strong><small>Persistent deviation requires 3 consecutive samples before flagging.</small></span></div></div><p className="info-copy">No generic synthetic-trained classifier is applied to an uploaded dataset. The report uses only its measurements and explicit demo thresholds.</p></Panel>
    </div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {result && <><div className="data-result-heading"><div><span className="eyebrow">ANALYSIS COMPLETE · {result.sample_count} SAMPLES</span><h2>{result.filename}</h2></div><span className="panel-note">{result.parameters.map((item: Twin) => item.label).join(' · ')}</span></div>
      {result.first_detection ? <Panel className="first-detection"><span className="detection-label"><AlertTriangle size={15} /> FIRST DETECTION · SAMPLE {result.first_detection.sample_index}</span><div className="first-detection-body"><div><small>{result.first_detection.timestamp}</small><h3>{result.first_detection.fault}</h3><p>{result.first_detection.reason}</p></div><div className="detection-reading"><b>{result.first_detection.value}</b><small>{result.first_detection.unit}</small></div></div></Panel> : <Panel className="no-detection"><CheckCircle2 size={18} /><div><b>No configured failure signature detected</b><p>All analyzed values stayed within configured ranges and did not sustain the baseline-drift rule.</p></div></Panel>}
      <Panel title={`First occurrence by signal · ${result.detected_events.length} signatures`}><div className="detection-table">{result.detected_events.length ? result.detected_events.map((event: Twin) => <div key={event.fault}><Badge value={event.severity} /><b>{event.fault}</b><span>{event.parameter}: {event.value} {event.unit}</span><time>{event.timestamp}</time></div>) : <Empty text="No threshold or persistent-baseline events were found." />}</div></Panel>
      <div className="model-note"><Database size={17} /><span>{result.detection_method} {result.scope_note}</span></div>
    </>}
  </>
}

function AssistantPage({ twin }: any) {
  const [messages, setMessages] = useState<{ role: string, content: string, source?: string }[]>([])
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<Twin | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (STATIC_DEMO) { setStatus({ configured: false, provider: 'browser-only simulation' }); return }
    fetch(api('/api/assistant/status')).then(response => {
      if (!response.ok) throw new Error(`Assistant status failed (${response.status})`)
      return response.json()
    }).then(setStatus).catch(() => setStatus({ configured: false, provider: 'local evidence mode' }))
  }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])
  const send = async (event?: React.FormEvent) => {
    event?.preventDefault()
    const prompt = question.trim()
    if (!prompt || busy) return
    setQuestion('')
    setError('')
    setMessages(previous => [...previous, { role: 'user', content: prompt }])
    setBusy(true)
    try {
      if (STATIC_DEMO) {
        const current = staticSnapshot()
        setMessages(previous => [...previous, { role: 'assistant', content: staticAssistantResponse(prompt, current), source: 'local browser assistant · live synthetic evidence' }])
        return
      }
      const response = await fetch(api('/api/assistant/chat'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: prompt }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail || `Assistant request failed (${response.status})`)
      setMessages(previous => [...previous, { role: 'assistant', content: payload.answer, source: `${payload.source} · ${payload.model} · ${payload.engine_id}` }])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Assistant request failed.') }
    finally { setBusy(false) }
  }
  return <>
    <div className="page-intro"><div><span className="eyebrow">LIVE DATA CONTEXT · {twin.engine_id}</span><h2>Flightline analyst</h2><p>Ask about the selected engine’s current telemetry, anomaly signals, prediction evidence, and simulated mission impact.</p></div><Badge value={status?.configured ? 'AI CONNECTED' : 'LIVE EVIDENCE MODE'} /></div>
    <div className="assistant-layout"><Panel className="assistant-chat-panel" title="Twin-aware analysis" action={<span className="context-indicator"><i /> DATA ATTACHED ON EVERY PROMPT</span>}>
      <div className="assistant-messages">{messages.length === 0 && <div className="assistant-welcome"><span><Bot size={24} /></span><h3>Ask the twin about its current state</h3><p>Each request includes the latest selected UAV telemetry, health, fault probabilities, alerts, maintenance guidance, and mission score.</p><div className="prompt-suggestions">{['Summarize engine health', 'What signal is most concerning?', 'Explain current mission risk'].map(prompt => <button key={prompt} onClick={() => setQuestion(prompt)}>{prompt}<ArrowRight size={13} /></button>)}</div></div>}
        {messages.map((item, index) => <article key={index} className={`chat-message ${item.role}`}><span className="chat-avatar">{item.role === 'assistant' ? <Bot size={16} /> : <MessageCircle size={16} />}</span><div><small>{item.role === 'assistant' ? 'AEROTWIN ASSISTANT' : 'YOU'}</small><p>{item.content}</p>{item.source && <em>{item.source}</em>}</div></article>)}
        {busy && <div className="chat-thinking"><span className="pulse" /> Reviewing the latest twin evidence…</div>}
        <div ref={endRef} />
      </div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <form className="assistant-input" onSubmit={send}><textarea aria-label="Ask about current engine data" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder="Ask a question about this twin’s latest data…" maxLength={2000} /><button className="button primary" type="submit" disabled={busy || !question.trim()}><Send size={16} /> Send</button></form>
    </Panel><div className="assistant-context"><Panel title="Attached live evidence"><div className="context-metrics"><div><span>ENGINE</span><b>{twin.engine_id}</b></div><div><span>HEALTH</span><b style={{ color: healthColor(twin.health.overall) }}>{twin.health.overall}% · {twin.health.state}</b></div><div><span>CLASSIFIER</span><b>{twin.prediction.predicted_fault_label} · {twin.prediction.confidence}%</b></div><div><span>ANOMALY</span><b>{twin.prediction.anomaly_score} / 100</b></div><div><span>MISSION</span><b>{twin.mission.reliability_score}% simulated</b></div><div><span>TELEMETRY TIME</span><b>{formatTime(twin.updated_at)}</b></div></div></Panel>
      <div className="assistant-provider"><Sparkles size={16} /><div><b>{status?.configured ? `${status.provider} · ${status.model}` : STATIC_DEMO ? 'Browser evidence assistant' : 'Live evidence assistant'}</b><p>{status?.configured ? 'AI responses are grounded in the live snapshot and clearly labeled.' : STATIC_DEMO ? 'Question-aware answers use the selected UAV’s live browser simulation. An external language model is not connected to this public static demo.' : 'Question-aware live evidence answers work without a cloud model. Set OPENAI_API_KEY on the backend for optional generated responses; the key never goes to the browser.'}</p></div></div>
      <div className="model-note"><ShieldAlert size={17} /><span>Answers are monitoring summaries, not airworthiness assessments, maintenance instructions, or flight-control decisions. The built-in fault classifier is trained on synthetic data.</span></div>
    </div></div>
  </>
}

function VideoPage() { return <><div className="page-intro"><div><span className="eyebrow">PROJECT DEMONSTRATION</span><h2>AeroTwin, explained</h2><p>Start with the narrated prototype walkthrough, then browse the two illustrative concept clips. Captions are enabled; unmute the player to hear the narration.</p></div></div><Panel className="video-panel"><VideoCarousel /></Panel><div className="two-col"><Panel title="What the walkthrough covers"><div className="evidence-list"><span><Activity /> Telemetry and the connected digital twin</span><span><Bot /> Synthetic-trained anomaly and fault models</span><span><Route /> Fleet, virtual UAV, mission and operator tools</span></div></Panel><Panel title="Prototype safety boundary"><p className="info-copy">The two short supplied clips are illustrative concepts, not footage of the connected prototype. All engine and UAV behavior here is simulated. The SOS drill only previews a brief; it does not detect crashes or contact responders.</p></Panel></div></> }

function ArchitecturePage() { const stages = [['Telemetry Simulator', Activity], ['Data Ingestion', Database], ['Digital Twin', Boxes], ['Feature Engineering', Layers3], ['Anomaly Detection', Radar], ['Fault Prediction', Bot], ['Health & RUL', HeartPulse], ['Mission Reliability', Route], ['Dashboard & Alerts', CircleGauge]]; return <><div className="page-intro"><div><span className="eyebrow">TECHNICAL ARCHITECTURE</span><h2>Connected intelligence pipeline</h2><p>Local-first, explainable processing from synthetic telemetry to an engineer-facing decision view.</p></div></div><Panel className="architecture-panel"><div className="architecture-flow">{stages.map(([label, Icon]: any, i) => <div className="architecture-step" key={label}><div><Icon size={23} /></div><b>{label}</b>{i < stages.length - 1 && <span className="architecture-arrow">↓</span>}</div>)}</div></Panel><div className="architecture-grid"><Panel title="Frontend"><p>React, TypeScript, Vite, Recharts and accessible responsive UI. WebSocket data updates without a page refresh.</p></Panel><Panel title="Backend"><p>FastAPI, Pydantic validation, REST endpoints, WebSocket streaming, a continuously updated DigitalTwin service, and SQLite persistence.</p></Panel><Panel title="ML pipeline"><p>Reproducible generated data, Isolation Forest anomaly detection, Random Forest fault classification, saved joblib models, and signal-level explanations.</p></Panel></div><div className="model-note"><Network size={17} /><span>All components run locally. No cloud account, GPU, external engine hardware, or operational UAV interface is required.</span></div></> }

const ncAsset = (path: string) => `${(import.meta as any).env.BASE_URL}research/ncmapss/${path}`
function NcmapssPage() {
  const [selected, setSelected] = useState(0)
  const [runtime, setRuntime] = useState<Twin | null>(null)
  const [prediction, setPrediction] = useState<Twin | null>(null)
  const [inferenceError, setInferenceError] = useState('')
  const [inferenceBusy, setInferenceBusy] = useState(false)
  useEffect(() => {
    if (STATIC_DEMO) return
    fetch(api('/api/ncmapss/status')).then(response => response.ok ? response.json() : null).then(setRuntime).catch(() => setRuntime(null))
  }, [])
  const runNcmaps = async (file?: File) => {
    if (!file) return
    setInferenceBusy(true); setInferenceError(''); setPrediction(null)
    try {
      const response = await fetch(api('/api/ncmapss/predict'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, csv_text: await file.text() }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail || `Inference failed (${response.status})`)
      setPrediction(payload)
    } catch (error) { setInferenceError(error instanceof Error ? error.message : 'N-CMAPSS model inference failed.') }
    finally { setInferenceBusy(false) }
  }
  const stages = [
    { title: 'N-CMAPSS data', tag: 'NASA DS03-012', text: 'The source workflow targets the N-CMAPSS DS03-012 turbofan degradation dataset. The dataset itself is not bundled; obtain it from NASA and follow its terms before training.', icon: Database },
    { title: 'Explore & prepare', tag: 'EDA notebook', text: 'Inspect units, flights and failure modes, then prepare development/test sequences for the selected engine population.', icon: BarChart3 },
    { title: 'Select signals', tag: 'ANOVA + mutual information', text: 'The original work scores candidate signals separately for state diagnostics and RUL prognostics. Its four saved selection artifacts are available below.', icon: Layers3 },
    { title: 'Train BiLSTM models', tag: 'Sequence length 10', text: 'Separate bidirectional LSTM networks estimate engine state and remaining useful life. The original scaler and both trained model files are included.', icon: Activity },
    { title: 'Collect & evaluate', tag: 'MQTT agents', text: 'A collection agent serves flight data on request; an evaluation agent preprocesses the stream and publishes state and RUL outputs on MQTT topics.', icon: Send },
    { title: 'Visualize', tag: 'Node-RED flow', text: 'The included Node-RED flow wires request, unit, state, RUL and prognostics topics into a monitoring dashboard. It expects a local Mosquitto broker.', icon: Network },
  ]
  const links = [
    ['Exploratory_data_analysis.ipynb', 'EDA notebook'], ['Feature_selection.ipynb', 'Feature selection notebook'], ['Deep_learning_model.ipynb', 'BiLSTM training notebook'], ['Agent_collection.ipynb', 'MQTT data collection agent'], ['Agent_evaluation.ipynb', 'MQTT evaluation agent'], ['Agent_dashboard.json', 'Node-RED dashboard flow'], ['models/state_DS03-012_model_10.h5', 'State BiLSTM model'], ['models/rul_DS03-012_model_10.h5', 'RUL BiLSTM model'], ['models/DS03-012_scaler.gz', 'Fitted scaler'], ['feature-selection/state_anova_model.pkl', 'State ANOVA selector'], ['feature-selection/state_mutual_info_model.pkl', 'State mutual-information selector'], ['feature-selection/rul_anova_model.pkl', 'RUL ANOVA selector'], ['feature-selection/rul_mutual_info_model.pkl', 'RUL mutual-information selector'], ['requirements.txt', 'Original Python requirements'], ['package.json', 'Node-RED dashboard dependencies'], ['LICENSE', 'GPL-3.0 license'], ['SOURCE-README.md', 'Original project README'],
  ]
  const Icon = stages[selected].icon
  return <>
    <div className="page-intro"><div><span className="eyebrow">INTEGRATED RESEARCH TRACK · TURBOFAN</span><h2>N-CMAPSS predictive maintenance</h2><p>Explore and download the original project’s notebooks, trained artifacts, MQTT agents and Node-RED flow alongside AeroTwin.</p></div></div>
    <div className="ncmapss-notice"><AlertTriangle size={18}/><span><b>Separate turbofan research model.</b> Results here do not replace AeroTwin’s synthetic piston-engine twin, and are not certified maintenance decisions. Upload at least 10 chronological rows with the 18 model features shown below. The full NASA dataset is not bundled.</span></div>
    <Panel title="Run the original BiLSTM models" action={<span className="panel-note">LOCAL BACKEND INFERENCE</span>}>
      {STATIC_DEMO ? <div className="nc-inference-missing"><p>This hosted browser demo has no Python backend. To enable model inference locally, install the optional reader and launch:</p><code>start-ncmapss.bat</code></div> : runtime?.ready ? <div className="nc-inference-ready"><span className="live-pill"><i/>MODEL READY</span><p>Upload a chronological feature CSV. The original scaler and both included BiLSTM models will process the last 10 rows.</p><label className="button primary compact"><Upload size={15}/>{inferenceBusy ? 'Running models…' : 'Choose N-CMAPSS feature CSV'}<input type="file" accept=".csv,text/csv" onChange={event => { void runNcmaps(event.target.files?.[0]); event.target.value = '' }} disabled={inferenceBusy}/></label><small className="nc-feature-list">Required columns, in model order: {runtime.features.join(', ')}</small></div> : <div className="nc-inference-missing"><span className="live-pill offline"><i/>{runtime ? 'MODEL RUNTIME NOT READY' : 'LOCAL BACKEND REQUIRED'}</span><p>{runtime?.message || 'Start the local FastAPI backend to check N-CMAPSS runtime availability.'}</p><code>pip install -r backend/requirements.txt -r backend/requirements-ncmapss.txt</code></div>}
      {inferenceError && <div className="error-banner" role="alert">{inferenceError}</div>}
      {prediction && <div className="nc-predictions"><div><span>ENGINE STATE · CLASS {prediction.state.class}</span><b>{Math.round(prediction.state.confidence * 100)}%</b><small>model confidence</small></div><div><span>RUL PROGNOSTIC BAND</span><b>{prediction.rul.band}</b><small>{Math.round(prediction.rul.confidence * 100)}% model confidence</small></div><p>{prediction.scope_note}</p></div>}
    </Panel>
    <Panel title="End-to-end workflow" action={<span className="panel-note">SELECT A STAGE TO EXPLORE</span>}>
      <div className="ncmapss-stages">{stages.map((stage, i) => { const StageIcon = stage.icon; return <button key={stage.title} className={`nc-stage ${i === selected ? 'selected' : ''}`} onClick={() => setSelected(i)} aria-pressed={i === selected}><StageIcon size={17}/><span><b>0{i + 1} · {stage.title}</b><small>{stage.tag}</small></span></button> })}</div>
      <div className="nc-stage-detail"><div className="nc-stage-icon"><Icon size={23}/></div><div><span className="eyebrow">STAGE 0{selected + 1}</span><h3>{stages[selected].title}</h3><p>{stages[selected].text}</p></div></div>
    </Panel>
    <div className="architecture-grid nc-metrics"><Panel title="Dataset"><strong>NASA N-CMAPSS</strong><p>DS03-012 · turbofan degradation simulation</p></Panel><Panel title="Learning"><strong>2 BiLSTM models</strong><p>Engine-state diagnostics + RUL prognostics</p></Panel><Panel title="Data exchange"><strong>MQTT + Node-RED</strong><p>Request → unit → state / RUL results</p></Panel></div>
    <Panel title="Project files & trained artifacts" action={<span className="panel-note">SOURCE REPOSITORY CONTENT</span>}><div className="nc-download-grid">{links.map(([file, label]) => <a key={file} href={ncAsset(file)} download><span><FileUp size={15}/><b>{label}</b></span><small>{file.slice(file.lastIndexOf('/') + 1)} <ArrowRight size={13}/></small></a>)}</div></Panel>
    <div className="model-note"><ShieldAlert size={17}/><span>Original materials are redistributed under the included GPL-3.0 license. Model outputs are research results, not certified diagnostics or maintenance instructions. See the <a href="https://github.com/Ocramnaig94/digital-twin-for-aircraft-engine-maintenance" target="_blank" rel="noreferrer">source repository</a> and NASA dataset source listed there.</span></div>
  </>
}

function AboutPage() { return <><div className="page-intro"><div><span className="eyebrow">SIH 2026 · PROBLEM STATEMENT 26054</span><h2>About AeroTwin</h2><p>AI-enabled real-time digital twin for health monitoring, fault prediction and mission reliability enhancement.</p></div></div><div className="about-grid"><Panel title="The problem"><p>Engine condition issues can reduce mission availability and introduce avoidable uncertainty. A demonstration platform needs to connect raw telemetry with understandable early warnings and reliability impact.</p></Panel><Panel title="The solution"><p>AeroTwin continuously evolves a virtual generic aero piston engine from correlated synthetic telemetry, giving engineers one view of health, anomaly, fault likelihood, estimated RUL and simulated mission impact.</p></Panel><Panel title="Digital Twin"><p>The twin is not a static record: every telemetry update modifies engine state, component health, health index, RUL, prediction evidence, alerts and maintenance guidance.</p></Panel><Panel title="AI & data"><p>Models are trained locally from reproducible synthetic data. This makes the complete demonstration laptop-ready while clearly separating synthetic evaluation from certified aerospace analysis.</p></Panel><Panel title="Scope & limitations"><p>This is software research and monitoring demonstrator for a generic engine. It has no connection to real vehicles, autonomous weapons, targeting, engagement, flight control, or maintenance authorization.</p></Panel><Panel title="Future work"><p>Future research could integrate validated test-cell datasets, physics-informed models, sensor confidence fusion, digital thread traceability, and accredited reliability studies.</p></Panel></div><Panel title="3D engine model · attribution"><p><b>Engine:</b> Wright brothers’ 1903 Flyer four-cylinder aero piston engine (12 hp), manufactured for the Wright Flyer by the Wright brothers with Charles Taylor as mechanic/engine builder. <b>Model source:</b> Smithsonian 3D scan, “1903 Wright Flyer” engine mesh. <b>License:</b> CC0 / public domain; reuse and redistribution, including commercial and educational use, are permitted. Credit to the Smithsonian Institution / National Air and Space Museum is provided as requested. See <code>docs/3d-engine-model.md</code> for the source URL, exact asset, and historical-model limitation.</p></Panel><Panel title="Key capabilities"><div className="capability-row"><span><Activity /> Real-time telemetry</span><span><Bot /> ML fault prediction</span><span><Radar /> Anomaly detection</span><span><Clock3 /> Simulated RUL</span><span><Route /> Mission reliability</span><span><Wrench /> Predictive maintenance</span></div></Panel></> }

function Empty({ text }: { text: string }) { return <div className="empty"><Moon size={18} /><span>{text}</span></div> }

function Loading({ error }: { error: string }) { return <div className="loading-screen"><div className="brand-mark"><Satellite size={26} /></div><h1>AERO<span>TWIN</span></h1><p>{error || 'Initializing local digital twin and synthetic ML models…'}</p>{error && <button className="button primary" onClick={() => location.reload()}>Reconnect</button>}</div> }

export default function App() {
  const path = usePath()
  const state = useTwin()
  const [soundEnabled, setSoundEnabled] = useState(false)
  const audioContext = useRef<AudioContext | null>(null)
  const previousAlerts = useRef<Set<string> | null>(null)
  const playTone = useCallback((kind: 'toggle' | 'warning' | 'critical') => {
    if (!window.AudioContext) return
    const context = audioContext.current || (audioContext.current = new window.AudioContext())
    if (context.state === 'suspended') void context.resume()
    const frequencies = kind === 'critical' ? [740, 520, 740] : kind === 'warning' ? [640, 820] : [660, 880]
    frequencies.forEach((frequency, index) => {
      const start = context.currentTime + index * (kind === 'critical' ? .16 : .12)
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(.0001, start)
      gain.gain.exponentialRampToValueAtTime(kind === 'critical' ? .045 : .025, start + .012)
      gain.gain.exponentialRampToValueAtTime(.0001, start + .11)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + .12)
    })
  }, [])
  useEffect(() => {
    const alerts = state.twin?.alerts || []
    const signatures = new Set<string>(alerts.map((alert: any) => `${alert.id}:${alert.severity}:${alert.message}`))
    if (previousAlerts.current && soundEnabled) {
      const added = alerts.filter((alert: any) => !previousAlerts.current?.has(`${alert.id}:${alert.severity}:${alert.message}`))
      const critical = added.some((alert: any) => ['HIGH', 'CRITICAL', 'SEVERE'].includes(String(alert.severity).toUpperCase()))
      const warning = added.some((alert: any) => ['WARNING', 'MODERATE', 'MEDIUM'].includes(String(alert.severity).toUpperCase()))
      if (critical) playTone('critical')
      else if (warning) playTone('warning')
    }
    previousAlerts.current = signatures
  }, [state.twin?.alerts, soundEnabled, playTone])
  useEffect(() => () => { if (audioContext.current?.state !== 'closed') void audioContext.current?.close() }, [])
  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    if (next) playTone('toggle')
  }
  if (path === '/') return <Landing twin={state.twin} />
  if (!state.twin) return <Loading error={state.error} />
  const props = { twin: state.twin, data: state.history, command: state.command }
  let content: any
  switch (path) {
    case '/dashboard': content = <Dashboard {...props} />; break
    case '/fleet': content = <FleetPage {...props} fleet={state.fleet} controlVehicle={state.controlVehicle} />; break
    case '/uav': content = <VirtualUAVPage {...props} />; break
    case '/digital-twin': content = <DigitalTwinPage {...props} />; break
    case '/telemetry': content = <TelemetryPage {...props} />; break
    case '/health': content = <HealthPage {...props} />; break
    case '/prediction': content = <PredictionPage {...props} />; break
    case '/mission': content = <MissionPage {...props} />; break
    case '/maintenance': content = <MaintenancePage {...props} />; break
    case '/history': content = <HistoryPage {...props} />; break
    case '/simulation': content = <SimulationPage {...props} />; break
    case '/data-lab': content = <DataLabPage />; break
    case '/ncmapss': content = <NcmapssPage />; break
    case '/assistant': content = <AssistantPage {...props} />; break
    case '/video': content = <VideoPage />; break
    case '/architecture': content = <ArchitecturePage />; break
    case '/about': content = <AboutPage />; break
    default: content = <Dashboard {...props} />
  }
  return <Shell path={path} twin={state.twin} connected={state.connected} soundEnabled={soundEnabled} onToggleSound={toggleSound}>{content}</Shell>
}
