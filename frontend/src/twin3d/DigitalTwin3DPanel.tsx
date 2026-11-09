import { Fragment, useCallback, useMemo, useState } from 'react'
import { ComponentRiskManager } from './ComponentRiskManager'
import { ENGINE_COMPONENT_LIST } from './EngineModelMapping'
import { EngineViewer } from './EngineViewer'
import type { ComponentId, EngineTwinState, TwinSnapshot } from './types'
import './digitalTwin3dPanel.css'

const riskClass = (value: string) => value.toLowerCase().replaceAll(' ', '-')

function readNumber(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function readableFault(value: string) {
  return value === 'normal' ? 'No active fault' : value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function Inspector({ state, selected, onSelect, onClear, onFocus }: { state: EngineTwinState; selected: ComponentId | null; onSelect: (id: ComponentId) => void; onClear: () => void; onFocus: () => void }) {
  const component = selected ? state.components[selected] : null
  const explanations = component
    ? state.prediction.explanations.filter(item => component.telemetry.some(signal => item.parameter.toLowerCase().startsWith(signal.label.toLowerCase().split(' ')[0]))).slice(0, 3)
    : []

  return <aside className="component-inspector">
    <div className="inspector-topline"><span>COMPONENT INSPECTION</span>{component && <button onClick={onClear}>ENGINE OVERVIEW</button>}</div>
    {!component ? <>
      <h3>Engine overview</h3>
      <div className="overview-health"><span className={riskClass(state.status)}>{state.status}</span><b>{state.overallHealth.toFixed(1)}<small>% HEALTH</small></b></div>
      <dl className="inspector-list"><dt>Active faults</dt><dd>{state.activeFaults.length || '0'} {state.activeFaults.length ? readableFault(state.activeFault) : '—'}</dd><dt>Current RPM</dt><dd>{Math.round(state.rpm)} rpm</dd><dt>Cylinder temperature</dt><dd>{state.temperature.toFixed(1)} °C</dd><dt>Oil pressure</dt><dd>{state.oilPressure.toFixed(2)} bar</dd><dt>Vibration</dt><dd>{state.vibration.toFixed(2)} mm/s</dd><dt>Engine hours</dt><dd>{readNumber(state.telemetry.engine_hours).toFixed(1)} h</dd><dt>Mission reliability</dt><dd>{state.missionReliability.toFixed(1)}%</dd></dl>
      <p className="inspector-note">Select a labelled 3D subsystem or a pulsing beacon to view live Digital Twin evidence.</p>
    </> : <>
      <div className="component-heading"><div><span className={`risk-token ${riskClass(component.riskLevel)}`} />{component.status}</div><h3>{component.name}</h3></div>
      <div className="component-health-row"><span>HEALTH</span><b style={{ color: component.riskLevel === 'HEALTHY' ? '#54d8b1' : component.riskLevel === 'WARNING' ? '#f2b65e' : '#ff6670' }}>{component.health.toFixed(1)}%</b><span>RISK</span><strong>{component.riskLevel}</strong></div>
      <dl className="inspector-list compact"><dt>Expected operating range</dt><dd>{component.expectedRange}</dd>{component.telemetry.map(metric => <Fragment key={metric.key}><dt>{metric.label}</dt><dd>{readNumber(state.telemetry[metric.key]).toFixed(metric.key === 'rpm' ? 0 : 2)} {metric.unit}</dd></Fragment>)}<dt>Predicted issue</dt><dd>{state.prediction.label}</dd><dt>AI confidence</dt><dd>{state.prediction.confidence.toFixed(1)}%</dd><dt>Live trend</dt><dd>{state.faultProgress.toFixed(1)}% scenario progression</dd><dt>Last event</dt><dd>{state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString() : 'Live stream'}</dd></dl>
      <div className="ai-reason"><b>WHY IS THIS COMPONENT AT RISK?</b>{explanations.length ? explanations.map(item => <span key={item.parameter}>{item.parameter}: <strong>{item.current_value} {item.unit}</strong> · expected {item.expected_range}</span>) : <span>Mapped from the existing predicted fault and this subsystem’s live health state.</span>}</div>
      <div className="recommendation"><span>RECOMMENDED ACTION</span><b>{state.maintenance.title || 'Continue health monitoring'}</b><p>{state.maintenance.recommended_action || state.maintenance.reason || 'No immediate action is required.'}</p></div>
      <button className="focus-region" onClick={onFocus}>FOCUS {component.shortName} REGION</button>
    </>}
    <div className="system-map"><span>SELECTABLE SYSTEM MAP</span><div>{ENGINE_COMPONENT_LIST.map(item => <button key={item.id} className={selected === item.id ? 'active' : ''} onClick={() => onSelect(item.id)}>{item.shortName}<i className={riskClass(state.components[item.id].riskLevel)} /></button>)}</div></div>
  </aside>
}

export function DigitalTwin3DPanel({ twin }: { twin: TwinSnapshot }) {
  const state = useMemo(() => ComponentRiskManager.build(twin), [twin])
  const [selected, setSelected] = useState<ComponentId | null>(null)
  const [inspectionMode, setInspectionMode] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const selectComponent = useCallback((id: ComponentId) => {
    setSelected(id)
    setInspectionMode(true)
    setFocusRequest(version => version + 1)
  }, [])
  const clearSelection = () => { setSelected(null); setInspectionMode(false) }
  const focusSelected = () => { if (selected) setFocusRequest(version => version + 1) }

  return <div className="digital-twin-3d-panel">
    <EngineViewer state={state} selected={selected} inspectionMode={inspectionMode} onSelect={selectComponent} onToggleInspection={() => setInspectionMode(value => !value)} focusRequest={focusRequest} />
    <Inspector state={state} selected={selected} onSelect={selectComponent} onClear={clearSelection} onFocus={focusSelected} />
  </div>
}
