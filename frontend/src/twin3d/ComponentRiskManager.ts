import { ENGINE_COMPONENTS } from './EngineModelMapping'
import type { ComponentId, EngineTwinComponent, EngineTwinState, RiskLevel, TwinSnapshot } from './types'

const FAULT_COMPONENTS: Record<string, ComponentId[]> = {
  overheating: ['cooling_system', 'combustion_system'],
  low_oil_pressure: ['lubrication_system', 'mechanical_integrity'],
  excessive_vibration: ['mechanical_integrity'],
  abnormal_fuel_flow: ['fuel_system'],
  cooling_degradation: ['cooling_system', 'combustion_system'],
  sensor_anomaly: ['sensor_subsystem'],
  progressive_degradation: ['cooling_system', 'lubrication_system', 'fuel_system', 'mechanical_integrity'],
}

const componentFault = (component: ComponentId, fault: string) =>
  FAULT_COMPONENTS[fault]?.includes(component) ? fault : 'normal'

function riskFrom(health: number, active: boolean, progress: number, modelRisk: string): RiskLevel {
  if (health < 50 || (active && (progress >= 78 || modelRisk === 'CRITICAL'))) return 'CRITICAL'
  if (health < 75 || (active && (progress >= 48 || modelRisk === 'HIGH'))) return 'HIGH'
  if (health < 90 || active || modelRisk === 'MODERATE') return 'WARNING'
  return 'HEALTHY'
}

/** Adapts the existing FastAPI/WebSocket snapshot; it never creates a second health or ML state. */
export class ComponentRiskManager {
  static build(snapshot: TwinSnapshot): EngineTwinState {
    const telemetry = snapshot?.telemetry || {}
    const prediction = snapshot?.prediction || {}
    const settings = snapshot?.settings || {}
    const activeFault = settings.active_fault && settings.active_fault !== 'normal'
      ? settings.active_fault
      : prediction.predicted_fault && prediction.predicted_fault !== 'normal' && prediction.risk !== 'LOW'
        ? prediction.predicted_fault
        : 'normal'
    const components = Object.fromEntries(Object.entries(ENGINE_COMPONENTS).map(([id, definition]) => {
      const componentId = id as ComponentId
      const health = Number(snapshot?.component_health?.[componentId] ?? 96)
      const fault = componentFault(componentId, activeFault)
      const active = fault !== 'normal'
      const riskLevel = riskFrom(health, active, Number(settings.fault_progress || 0), String(prediction.risk || 'LOW'))
      const component: EngineTwinComponent = {
        ...definition,
        health,
        riskLevel,
        status: riskLevel === 'HEALTHY' ? 'NOMINAL' : riskLevel === 'WARNING' ? 'WATCH' : riskLevel === 'HIGH' ? 'AT RISK' : 'CRITICAL',
        fault,
        confidence: Number(prediction.confidence || 0),
        active,
      }
      return [componentId, component]
    })) as Record<ComponentId, EngineTwinComponent>

    const activeFaults = activeFault !== 'normal'
      ? [activeFault]
      : Object.values(components).filter(component => component.riskLevel === 'CRITICAL').map(component => component.id)

    return {
      engineId: snapshot?.engine_id || 'AERO-PT-01',
      overallHealth: Number(snapshot?.health?.overall ?? 96),
      status: String(snapshot?.health?.state || 'HEALTHY'),
      rpm: Number(telemetry.rpm || 0),
      temperature: Number(telemetry.cylinder_temperature || 0),
      oilPressure: Number(telemetry.oil_pressure || 0),
      vibration: Number(telemetry.vibration || 0),
      rul: Number(snapshot?.estimated_rul_hours || 0),
      missionReliability: Number(snapshot?.mission?.reliability_score || 0),
      activeFaults,
      activeFault,
      faultProgress: Number(settings.fault_progress || 0),
      prediction: {
        fault: String(prediction.predicted_fault || 'normal'),
        label: String(prediction.predicted_fault_label || 'Normal operation'),
        risk: String(prediction.risk || 'LOW'),
        confidence: Number(prediction.confidence || 0),
        anomalyScore: Number(prediction.anomaly_score || 0),
        explanations: Array.isArray(prediction.explanations) ? prediction.explanations : [],
      },
      telemetry,
      maintenance: snapshot?.maintenance || {},
      updatedAt: snapshot?.updated_at,
      components,
    }
  }

  static affectedComponents(state: EngineTwinState) {
    return Object.values(state.components).filter(component => component.active || component.riskLevel === 'CRITICAL')
  }
}
