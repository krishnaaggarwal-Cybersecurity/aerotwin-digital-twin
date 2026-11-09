import type { ComponentDefinition, ComponentId } from './types'

/**
 * The CC0 source scan contains one dense photogrammetry mesh, rather than a
 * semantic CAD assembly. These anchors are normalized against that mesh's
 * measured runtime bounding box in EngineModel. They keep labels, selection
 * zones, and risk beacons in model-space as the camera moves.
 */
export const ENGINE_COMPONENTS: Record<ComponentId, ComponentDefinition> = {
  cooling_system: {
    id: 'cooling_system', name: 'Cooling System', shortName: 'COOLING', anchor: [-0.42, 0.58, 0.28],
    expectedRange: 'Cylinder 118–168 °C',
    telemetry: [{ key: 'cylinder_temperature', label: 'Cylinder temperature', unit: '°C' }, { key: 'oil_temperature', label: 'Oil temperature', unit: '°C' }],
  },
  lubrication_system: {
    id: 'lubrication_system', name: 'Lubrication System', shortName: 'LUBRICATION', anchor: [0.34, -0.5, 0.38],
    expectedRange: 'Oil pressure 3.5–5.0 bar',
    telemetry: [{ key: 'oil_pressure', label: 'Oil pressure', unit: 'bar' }, { key: 'oil_temperature', label: 'Oil temperature', unit: '°C' }],
  },
  fuel_system: {
    id: 'fuel_system', name: 'Fuel / Intake System', shortName: 'FUEL', anchor: [0.7, 0.08, 0.25],
    expectedRange: 'Fuel flow 12–21 L/h',
    telemetry: [{ key: 'fuel_flow', label: 'Fuel flow', unit: 'L/h' }, { key: 'fuel_pressure', label: 'Fuel pressure', unit: 'bar' }],
  },
  combustion_system: {
    id: 'combustion_system', name: 'Cylinder & Combustion', shortName: 'CYLINDERS', anchor: [-0.22, 0.8, 0.1],
    expectedRange: 'Exhaust 390–475 °C',
    telemetry: [{ key: 'cylinder_temperature', label: 'Cylinder temperature', unit: '°C' }, { key: 'exhaust_temperature', label: 'Exhaust temperature', unit: '°C' }],
  },
  mechanical_integrity: {
    id: 'mechanical_integrity', name: 'Crankcase & Mechanical', shortName: 'MECHANICAL', anchor: [0, -0.08, 0.48],
    expectedRange: 'Vibration below 4.5 mm/s',
    telemetry: [{ key: 'vibration', label: 'Vibration', unit: 'mm/s' }, { key: 'rpm', label: 'Engine speed', unit: 'rpm' }],
  },
  sensor_subsystem: {
    id: 'sensor_subsystem', name: 'Sensor & Wiring Region', shortName: 'SENSORS', anchor: [-0.72, -0.15, 0.42],
    expectedRange: 'Correlated telemetry baseline',
    telemetry: [{ key: 'manifold_pressure', label: 'Manifold pressure', unit: 'kPa' }, { key: 'rpm', label: 'Engine speed', unit: 'rpm' }],
  },
}

export const ENGINE_COMPONENT_LIST = Object.values(ENGINE_COMPONENTS)
