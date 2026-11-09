const engineIds = ['APT-MALE-SIM-01', 'APT-MALE-SIM-02', 'APT-MALE-SIM-03']
const faults: Record<string, string> = {
  normal: 'Normal',
  overheating: 'Overheating',
  low_oil_pressure: 'Lubrication Fault',
  excessive_vibration: 'Vibration / Mechanical Fault',
  abnormal_fuel_flow: 'Fuel-System Fault',
  cooling_degradation: 'Cooling System Degradation',
  sensor_anomaly: 'Sensor Anomaly',
  progressive_degradation: 'Progressive Engine Degradation',
}
const fleetState = engineIds.map((engine_id, index) => ({
  engine_id,
  active_fault: 'normal',
  running: true,
  index,
  throttle: 62 + index * 8,
  load: 58 + index * 8,
  altitude: 1800 + index * 1000,
  ambient_temperature: 21,
  speed: 1,
  tick: 0,
}))

let selectedEngineId = engineIds[0]
let route = 'coastal-survey'
let routeElapsed = 0
let routeRunning = true

export function staticSnapshot(engineId = selectedEngineId) {
  const state = fleetState.find(vehicle => vehicle.engine_id === engineId) || fleetState[0]
  const severity = state.active_fault === 'normal' ? 0 : .42 + Math.min(.58, state.tick * state.speed / 32)
  const heat = state.active_fault === 'overheating' || state.active_fault === 'cooling_degradation' || state.active_fault === 'progressive_degradation' ? severity * 43 : 0
  const oilDrop = state.active_fault === 'low_oil_pressure' || state.active_fault === 'progressive_degradation' ? severity * 1.65 : 0
  const vibrationRise = state.active_fault === 'excessive_vibration' ? severity * 5 : state.active_fault === 'progressive_degradation' ? severity * 1.8 : 0
  const telemetry = {
    timestamp: new Date().toISOString(),
    engine_id: state.engine_id,
    rpm: Math.round(950 + state.throttle * 20.8 - state.altitude / 1000 * 18 + Math.sin(state.tick / 3) * 25),
    throttle: state.throttle,
    load: state.load,
    oil_pressure: Number(Math.max(.4, 4.1 - oilDrop).toFixed(2)),
    oil_temperature: Number((98 + heat * .25).toFixed(1)),
    cylinder_temperature: Number((147 + heat).toFixed(1)),
    exhaust_temperature: Number((438 + heat * 1.1).toFixed(1)),
    manifold_pressure: Number((31 + state.throttle * .48 - state.altitude / 1000 * .62).toFixed(2)),
    fuel_flow: Number((10 + state.load * .115 + (state.active_fault === 'abnormal_fuel_flow' ? severity * 5 : 0)).toFixed(2)),
    fuel_pressure: Number((4.3 - (state.active_fault === 'abnormal_fuel_flow' ? severity : 0)).toFixed(2)),
    vibration: Number((2.8 + vibrationRise).toFixed(2)),
    ambient_temperature: state.ambient_temperature,
    altitude: state.altitude,
    airspeed: Math.round(82 + state.throttle * .72 - state.altitude / 1000 * .8),
    engine_hours: 312.4 + state.tick / 3600,
    cooling_effectiveness: Math.max(25, Number((97 - heat * .8).toFixed(1))),
    synthetic_fault_scenario: state.active_fault,
    fault_progress: Math.round(severity * 100),
  }
  const overall = Math.max(15, Number((97 - heat * .5 - oilDrop * 8 - vibrationRise * 3).toFixed(1)))
  const predicted = state.active_fault === 'normal' ? 'normal' : state.active_fault
  const confidence = predicted === 'normal' ? 91.2 : Math.min(98, Number((62 + severity * 34).toFixed(1)))
  const anomaly = predicted === 'normal' ? 0 : Math.min(98, Math.round(25 + severity * 65))
  const component_health = {
    cooling_system: Math.max(10, Math.round(100 - heat * 1.7)),
    lubrication_system: Math.max(10, Math.round(100 - oilDrop * 40)),
    fuel_system: state.active_fault === 'abnormal_fuel_flow' ? Math.round(100 - severity * 60) : 97,
    combustion_system: Math.max(10, Math.round(100 - heat)),
    mechanical_integrity: Math.max(10, Math.round(100 - vibrationRise * 9)),
    sensor_subsystem: state.active_fault === 'sensor_anomaly' ? 55 : 98,
  }
  const risk = overall < 50 ? 'CRITICAL' : overall < 75 ? 'HIGH' : anomaly > 35 ? 'WATCH' : 'LOW'
  const reliability = Number(Math.max(30, overall - anomaly * .08).toFixed(1))
  const explanations = [
    { parameter: 'Cylinder Temperature', current_value: telemetry.cylinder_temperature, unit: '°C', expected_range: '118–168 °C', deviation: heat > 20 ? 'HIGH' : 'NORMAL', contribution: Math.min(100, heat * 1.5) },
    { parameter: 'Oil Pressure', current_value: telemetry.oil_pressure, unit: 'bar', expected_range: '3.5–5.0 bar', deviation: oilDrop > .5 ? 'HIGH' : 'NORMAL', contribution: Math.min(100, oilDrop * 25) },
    { parameter: 'Vibration', current_value: telemetry.vibration, unit: 'mm/s', expected_range: '0–4.5 mm/s', deviation: vibrationRise > 2 ? 'HIGH' : 'NORMAL', contribution: Math.min(100, vibrationRise * 14) },
  ]
  return {
    engine_id: state.engine_id,
    operating_state: state.running ? 'RUNNING' : 'PAUSED',
    simulated: true,
    telemetry,
    health: { overall, state: overall > 90 ? 'HEALTHY' : overall > 75 ? 'WATCH' : overall > 50 ? 'DEGRADED' : 'CRITICAL', degradation_rate: Number((100 - overall).toFixed(1)), thresholds: { healthy: 90, watch: 75, degraded: 50, critical: 25 } },
    component_health,
    prediction: { predicted_fault: predicted, predicted_fault_label: faults[predicted], confidence, risk, probabilities: Object.fromEntries(Object.entries(faults).map(([key, label]) => [label, key === predicted ? confidence : Number(((100 - confidence) / 7).toFixed(1))])), anomaly_score: anomaly, anomaly_status: anomaly > 35 ? 'ANOMALOUS' : 'NORMAL', affected_parameters: explanations.filter(item => item.deviation !== 'NORMAL').map(item => item.parameter), explanations },
    estimated_rul_hours: Math.max(24, Math.round(1000 * (overall / 100) ** 1.8 - 156)),
    mission: { reliability_score: reliability, mission_risk: reliability < 55 ? 'HIGH' : reliability < 78 ? 'MODERATE' : 'LOW', engine_failure_risk: Number((100 - reliability).toFixed(1)), mission_completion_probability: reliability, phases: ['Takeoff', 'Climb', 'Cruise', 'Surveillance', 'Loiter', 'Return', 'Landing'].map((phase, index) => ({ phase, engine_load: [84, 78, 62, 55, 48, 64, 52][index], expected_duration_min: [8, 12, 75, 95, 55, 50, 8][index], engine_health: overall, risk: reliability < 55 ? 'HIGH' : reliability < 78 ? 'MODERATE' : 'LOW', reliability_contribution: reliability })), method: 'Illustrative browser-only synthetic simulation.' },
    maintenance: { priority: risk === 'LOW' ? 'ROUTINE' : risk, title: predicted === 'normal' ? 'No immediate action required' : `Review ${faults[predicted]} indicators`, reason: 'Demonstration guidance based on the simulated state.', recommended_action: 'Continue synthetic monitoring; this is not maintenance authorization.', weakest_subsystem: Object.entries(component_health).sort((a, b) => a[1] - b[1])[0][0], scope_note: 'Synthetic browser-only demo.' },
    settings: { speed: state.speed, throttle: state.throttle, load: state.load, altitude: state.altitude, ambient_temperature: state.ambient_temperature, active_fault: state.active_fault, fault_label: faults[state.active_fault], fault_progress: Math.round(severity * 100), running: state.running },
    updated_at: telemetry.timestamp,
    alerts: anomaly > 35 ? [{ id: `${state.engine_id}-alert`, timestamp: telemetry.timestamp, severity: risk === 'CRITICAL' ? 'HIGH' : 'WARNING', message: `${faults[predicted]} scenario active in browser demo.`, details: 'Synthetic simulation only.', acknowledged: false }] : [],
  }
}

export function staticFleet() {
  return fleetState.map(vehicle => {
    const twin = staticSnapshot(vehicle.engine_id)
    return { engine_id: twin.engine_id, selected: twin.engine_id === selectedEngineId, operating_state: twin.operating_state, health: twin.health, prediction: twin.prediction, telemetry: twin.telemetry, settings: twin.settings, updated_at: twin.updated_at }
  })
}

export function staticSelect(engineId: string) {
  selectedEngineId = engineId
  return staticSnapshot()
}

export function staticTick() {
  fleetState.forEach(vehicle => { if (vehicle.running) vehicle.tick += 1 })
  if (routeRunning) routeElapsed += 1
  return staticSnapshot()
}

export function staticCommand(path: string, body?: any) {
  if (path === '/api/fleet/select') return staticSelect(body.engine_id)
  const state = fleetState.find(vehicle => vehicle.engine_id === selectedEngineId)!
  if (path.endsWith('/simulation/pause')) state.running = false
  if (path.endsWith('/simulation/start')) state.running = true
  if (path.endsWith('/simulation/reset')) {
    state.active_fault = 'normal'; state.tick = 0; state.running = true
  }
  if (path.endsWith('/simulation/fault')) {
    state.active_fault = body.fault; state.tick = 0
  }
  if (path.endsWith('/simulation/settings')) Object.assign(state, body)
  return staticSnapshot()
}

export function staticControlVehicle(engineId: string, action: string, fault?: string) {
  const state = fleetState.find(vehicle => vehicle.engine_id === engineId)!
  if (action === 'pause') state.running = false
  if (action === 'start') state.running = true
  if (action === 'reset') { state.active_fault = 'normal'; state.tick = 0; state.running = true }
  if (action === 'fault') { state.active_fault = fault || 'normal'; state.tick = 0 }
  return staticFleet()
}

export function staticUav() {
  const twin = staticSnapshot()
  const duration = route === 'mountain-patrol' ? 720 : route === 'training-circuit' ? 360 : 540
  const progress = routeElapsed % duration / duration * 100
  return { uav_id: `VT-${twin.engine_id}`, engine_id: twin.engine_id, route_id: route, route_name: route === 'mountain-patrol' ? 'Mountain patrol' : route === 'training-circuit' ? 'Training circuit' : 'Coastal survey', progress_pct: Number(progress.toFixed(1)), flight_state: routeRunning ? 'EN ROUTE' : 'PAUSED', altitude_m: twin.telemetry.altitude, airspeed_kt: twin.telemetry.airspeed, heading_deg: Math.round(progress * 3.6), engine_rpm: twin.telemetry.rpm, engine_health: twin.health.overall, simulated: true }
}

export function staticUavControl(action: string) {
  if (action === 'pause') routeRunning = false
  else if (action === 'start') routeRunning = true
  else if (action === 'reset') { routeElapsed = 0; routeRunning = true }
  else { route = action; routeElapsed = 0 }
  return staticUav()
}

export function staticCsvAnalysis(filename: string, csvText: string) {
  const lines = csvText.trim().split(/\r?\n/)
  const headers = lines[0].replace(/^\uFEFF/, '').split(',').map(value => value.trim().toLowerCase().replace(/[\s-]+/g, '_'))
  const supported = ['cylinder_temperature', 'exhaust_temperature', 'oil_pressure', 'oil_temperature', 'vibration', 'fuel_flow', 'fuel_pressure', 'rpm']
  const columns = headers.filter(header => supported.includes(header))
  if (!columns.length || lines.length < 9) throw new Error('CSV needs at least 8 data rows and one supported sensor column.')
  const params: Record<string, { label: string, unit: string, range: [number, number], fault: string }> = {
    cylinder_temperature: { label: 'Cylinder temperature', unit: '°C', range: [118, 168], fault: 'Thermal excursion' },
    exhaust_temperature: { label: 'Exhaust temperature', unit: '°C', range: [390, 475], fault: 'Thermal excursion' },
    oil_pressure: { label: 'Oil pressure', unit: 'bar', range: [3.5, 5], fault: 'Lubrication pressure loss' },
    oil_temperature: { label: 'Oil temperature', unit: '°C', range: [68, 103], fault: 'Lubrication / cooling excursion' },
    vibration: { label: 'Vibration', unit: 'mm/s', range: [0, 4.5], fault: 'Mechanical vibration' },
    fuel_flow: { label: 'Fuel flow', unit: 'L/h', range: [12, 21], fault: 'Fuel-system excursion' },
    fuel_pressure: { label: 'Fuel pressure', unit: 'bar', range: [3.5, 4.8], fault: 'Fuel-system excursion' },
    rpm: { label: 'RPM', unit: 'rpm', range: [1500, 2900], fault: 'Engine-speed excursion' },
  }
  const rows = lines.slice(1).filter(Boolean).map(line => line.split(','))
  const baselineCount = Math.max(5, Math.min(50, Math.floor(rows.length / 4)))
  const first: any[] = []
  for (const key of columns) {
    const column = headers.indexOf(key)
    for (let index = baselineCount; index < rows.length; index += 1) {
      const value = Number(rows[index][column])
      if (!Number.isFinite(value)) continue
      const [low, high] = params[key].range
      if (value < low || value > high) {
        first.push({ fault: params[key].fault, parameter: params[key].label, timestamp: rows[index][headers.indexOf('timestamp')] || `row ${index + 2}`, sample_index: index + 1, value, unit: params[key].unit, severity: 'HIGH', reason: `${params[key].label} ${value} ${params[key].unit} is outside the configured monitoring range (${low}–${high} ${params[key].unit}).` })
        break
      }
    }
  }
  first.sort((a, b) => a.sample_index - b.sample_index)
  return { filename, source: 'uploaded telemetry', sample_count: rows.length, baseline_samples: baselineCount, parameters: columns.map(key => ({ key, label: params[key].label, unit: params[key].unit })), first_detection: first[0] || null, detected_events: first, detection_method: 'Configured monitoring envelopes on uploaded samples (browser-only static demo).', scope_note: 'Prototype thresholds, not validated engine limits; no synthetic classifier applied.' }
}
