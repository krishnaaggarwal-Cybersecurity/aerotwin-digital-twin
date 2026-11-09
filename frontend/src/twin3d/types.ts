export type TwinSnapshot = Record<string, any>

export type ComponentId =
  | 'cooling_system'
  | 'lubrication_system'
  | 'fuel_system'
  | 'combustion_system'
  | 'mechanical_integrity'
  | 'sensor_subsystem'

export type RiskLevel = 'HEALTHY' | 'WARNING' | 'HIGH' | 'CRITICAL'

export type ViewPreset = 'front' | 'left' | 'right' | 'top' | 'rear' | 'isometric'

export interface ComponentDefinition {
  id: ComponentId
  name: string
  shortName: string
  /** Unit coordinates inside the scan's real runtime bounding box. */
  anchor: [number, number, number]
  expectedRange: string
  telemetry: Array<{ key: string; label: string; unit: string }>
}

export interface EngineTwinComponent extends ComponentDefinition {
  health: number
  riskLevel: RiskLevel
  status: string
  fault: string
  confidence: number
  active: boolean
}

export interface EngineTwinState {
  engineId: string
  overallHealth: number
  status: string
  rpm: number
  temperature: number
  oilPressure: number
  vibration: number
  rul: number
  missionReliability: number
  activeFaults: string[]
  activeFault: string
  faultProgress: number
  prediction: {
    fault: string
    label: string
    risk: string
    confidence: number
    anomalyScore: number
    explanations: Array<{ parameter: string; current_value: number; unit: string; expected_range: string; deviation: string; contribution: number }>
  }
  telemetry: Record<string, number | string>
  maintenance: { title?: string; recommended_action?: string; reason?: string }
  updatedAt?: string
  components: Record<ComponentId, EngineTwinComponent>
}
