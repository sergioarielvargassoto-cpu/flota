import type { Driver, Fuel, Infraction, Maint, Repair, Trip, Vehicle } from './types';

// ============================================================================
// TIPOS PARA ANÁLISIS
// ============================================================================

export interface AnalisisConductor {
  driver_id: string;
  name: string;
  totalInfracciones: number;
  infraccionesPendientes: number;
  multasAcumuladas: number;
  diasConExceso: number;
  diasTotales: number;
  kmTotal: number;
  litrosTotal: number;
  eficiencia: number; // km/litro
  ratingSeguridad: number; // 0-100
}

export interface AnalisisCosto {
  vehicle_id: string;
  plate: string;
  brand: string | null;
  model: string | null;
  branch: string;
  combustible: number;
  reparaciones: number;
  mantenimiento: number;
  multas: number;
  totalCostos: number;
  kmRecorridos: number;
  costoPorKm: number;
  variacionMesAnterior: number | null; // porcentaje
  variacionAnoAnterior: number | null; // porcentaje
}

export interface ComparativaSucursal {
  branch: string;
  totalKm: number;
  totalCombustible: number;
  costPromedioKm: number;
  totalInfracciones: number;
  cantidadConductores: number;
  cantidadVehiculos: number;
  ratingSeguridadPromedio: number;
  eficienciaPromedio: number;
}

// ============================================================================
// ANÁLISIS DE CONDUCTORES
// ============================================================================

export function calcularAnalisisConductores(
  drivers: Driver[],
  infractions: Infraction[],
  trips: Trip[],
  vehicles: Vehicle[],
  fuel_loads: Fuel[],
  mes?: number,
  ano?: number,
  branch?: string
): AnalisisConductor[] {
  const driverMap = new Map(drivers.map((d) => [d.id, d]));
  const vehiclesByDriver = new Map<string, Vehicle[]>();

  // Agrupar vehículos por conductor
  for (const v of vehicles) {
    if (!v.driver_id) continue;
    if (!vehiclesByDriver.has(v.driver_id)) vehiclesByDriver.set(v.driver_id, []);
    vehiclesByDriver.get(v.driver_id)!.push(v);
  }

  const result: AnalisisConductor[] = [];

  for (const driver of drivers) {
    const vehículos = vehiclesByDriver.get(driver.id) || [];
    const vehicleIds = new Set(vehículos.map((v) => v.id));

    // Infracciones
    const infraccionesDelConductor = infractions.filter((i) => i.driver_id === driver.id);
    const infraccionesFiltradas =
      mes && ano
        ? infraccionesDelConductor.filter((i) => {
            const [y, m] = i.date.split('-').map(Number);
            return y === ano && m === mes;
          })
        : infraccionesDelConductor;

    const totalInfracciones = infraccionesFiltradas.length;
    const infraccionesPendientes = infraccionesFiltradas.filter((i) => i.status !== 'Pagada').length;
    const multasAcumuladas = infraccionesFiltradas.reduce((s, i) => s + (i.fine_amount ?? 0), 0);

    // Viajes y excesos
    const viajesDelConductor = trips.filter((t) => vehicleIds.has(t.vehicle_id));
    const viajesFiltrados =
      mes && ano
        ? viajesDelConductor.filter((t) => {
            const [y, m] = t.date.split('-').map(Number);
            return y === ano && m === mes;
          })
        : viajesDelConductor;

    const diasConExceso = viajesFiltrados.filter((t) => (t.max_speed ?? 0) > 120).length;
    const diasTotales = new Set(viajesFiltrados.map((t) => t.date)).size;

    // Combustible y km
    const combustibleDelConductor = fuel_loads.filter((f) => vehicleIds.has(f.vehicle_id));
    const combustibleFiltrado =
      mes && ano
        ? combustibleDelConductor.filter((f) => {
            const [y, m] = f.date.split('-').map(Number);
            return y === ano && m === mes;
          })
        : combustibleDelConductor;

    const litrosTotal = combustibleFiltrado.reduce((s, f) => s + f.liters, 0);
    const kmTotal = viajesFiltrados.reduce((s, t) => s + t.km_calc, 0);
    const eficiencia = litrosTotal > 0 ? Math.round((kmTotal / litrosTotal) * 100) / 100 : 0;

    // Rating de Seguridad (0-100)
    let ratingSeguridad = 100;
    ratingSeguridad -= Math.min(totalInfracciones * 15, 85); // Máx -85
    ratingSeguridad -= Math.min(diasConExceso * 5, 15); // Máx -15
    ratingSeguridad = Math.max(0, ratingSeguridad);

    result.push({
      driver_id: driver.id,
      name: driver.name,
      totalInfracciones,
      infraccionesPendientes,
      multasAcumuladas,
      diasConExceso,
      diasTotales,
      kmTotal: Math.round(kmTotal),
      litrosTotal: Math.round(litrosTotal * 100) / 100,
      eficiencia,
      ratingSeguridad: Math.round(ratingSeguridad),
    });
  }

  return result.sort((a, b) => b.ratingSeguridad - a.ratingSeguridad);
}

// ============================================================================
// ANÁLISIS DE COSTOS
// ============================================================================

export function calcularAnalisisCostos(
  vehicles: Vehicle[],
  fuel_loads: Fuel[],
  repairs: Repair[],
  maintenance: Maint[],
  infractions: Infraction[],
  kmReports: any[], // KmReport[]
  mes?: number,
  ano?: number,
  branch?: string
): AnalisisCosto[] {
  const result: AnalisisCosto[] = [];

  for (const vehicle of vehicles) {
    if (branch && vehicle.branch !== branch) continue;

    // Combustible
    const combustibleVehicle = fuel_loads.filter((f) => f.vehicle_id === vehicle.id);
    const combustibleFiltrado =
      mes && ano
        ? combustibleVehicle.filter((f) => {
            const [y, m] = f.date.split('-').map(Number);
            return y === ano && m === mes;
          })
        : combustibleVehicle;
    const costoCombustible = combustibleFiltrado.reduce((s, f) => s + (f.amount ?? 0), 0);

    // Reparaciones
    const reparacionesVehicle = repairs.filter((r) => r.vehicle_id === vehicle.id);
    const reparacionesFiltradas =
      mes && ano
        ? reparacionesVehicle.filter((r) => {
            const [y, m] = r.date.split('-').map(Number);
            return y === ano && m === mes;
          })
        : reparacionesVehicle;
    const costoReparaciones = reparacionesFiltradas.reduce((s, r) => s + (r.cost ?? 0), 0);

    // Mantenimiento
    const mantenimientoVehicle = maintenance.filter((m) => m.vehicle_id === vehicle.id);
    const mantenimientoFiltrado =
      mes && ano
        ? mantenimientoVehicle.filter((m) => {
            const [y, md] = m.date.split('-').map(Number);
            return y === ano && md === mes;
          })
        : mantenimientoVehicle;
    const costoMantenimiento = mantenimientoFiltrado.reduce((s, m) => s + (m.cost ?? 0), 0);

    // Multas
    const conductoresVehicle = new Set<string>();
    const relaciones = kmReports.filter((kr: any) => kr.vehicle_id === vehicle.id);

    const multasVehicle = infractions.filter((inf) => inf.vehicle_id === vehicle.id);
    const multasFiltradas =
      mes && ano
        ? multasVehicle.filter((inf) => {
            const [y, m] = inf.date.split('-').map(Number);
            return y === ano && m === mes;
          })
        : multasVehicle;
    const costoMultas = multasFiltradas.reduce((s, inf) => s + (inf.fine_amount ?? 0), 0);

    // KM
    const kmVehicle = kmReports.filter((kr: any) => kr.vehicle_id === vehicle.id);
    const kmFiltrado = mes && ano ? kmVehicle.filter((km: any) => km.year === ano && km.month === mes) : kmVehicle;
    const kmRecorridos = kmFiltrado.reduce((s, km: any) => s + km.km_total, 0);

    const totalCostos = costoCombustible + costoReparaciones + costoMantenimiento + costoMultas;
    const costoPorKm = kmRecorridos > 0 ? Math.round((totalCostos / kmRecorridos) * 100) / 100 : 0;

    // Variaciones
    let variacionMesAnterior: number | null = null;
    let variacionAnoAnterior: number | null = null;

    if (mes && ano) {
      const mesPasado = mes === 1 ? 12 : mes - 1;
      const anoPasado = mes === 1 ? ano - 1 : ano;
      const costoMesPasado = calcularCostoMes(
        vehicle.id,
        mesPasado,
        anoPasado,
        fuel_loads,
        repairs,
        maintenance,
        infractions,
        kmReports
      );
      if (costoMesPasado > 0 && costoPorKm > 0) {
        variacionMesAnterior = Math.round(((costoPorKm - costoMesPasado) / costoMesPasado) * 100);
      }
    }

    if (ano) {
      const anoAnterior = ano - 1;
      const costoAnoAnterior = calcularCostoAno(
        vehicle.id,
        anoAnterior,
        fuel_loads,
        repairs,
        maintenance,
        infractions,
        kmReports
      );
      if (costoAnoAnterior > 0 && costoPorKm > 0) {
        variacionAnoAnterior = Math.round(((costoPorKm - costoAnoAnterior) / costoAnoAnterior) * 100);
      }
    }

    result.push({
      vehicle_id: vehicle.id,
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      branch: vehicle.branch,
      combustible: Math.round(costoCombustible * 100) / 100,
      reparaciones: Math.round(costoReparaciones * 100) / 100,
      mantenimiento: Math.round(costoMantenimiento * 100) / 100,
      multas: Math.round(costoMultas * 100) / 100,
      totalCostos: Math.round(totalCostos * 100) / 100,
      kmRecorridos: Math.round(kmRecorridos),
      costoPorKm,
      variacionMesAnterior,
      variacionAnoAnterior,
    });
  }

  return result.sort((a, b) => b.costoPorKm - a.costoPorKm);
}

function calcularCostoMes(
  vehicleId: string,
  mes: number,
  ano: number,
  fuel_loads: Fuel[],
  repairs: Repair[],
  maintenance: Maint[],
  infractions: Infraction[],
  kmReports: any[]
): number {
  const f = fuel_loads
    .filter(
      (f) =>
        f.vehicle_id === vehicleId &&
        f.date.split('-').map(Number)[0] === ano &&
        f.date.split('-').map(Number)[1] === mes
    )
    .reduce((s, f) => s + (f.amount ?? 0), 0);
  const r = repairs
    .filter(
      (r) =>
        r.vehicle_id === vehicleId &&
        r.date.split('-').map(Number)[0] === ano &&
        r.date.split('-').map(Number)[1] === mes
    )
    .reduce((s, r) => s + (r.cost ?? 0), 0);
  const m = maintenance
    .filter(
      (m) =>
        m.vehicle_id === vehicleId &&
        m.date.split('-').map(Number)[0] === ano &&
        m.date.split('-').map(Number)[1] === mes
    )
    .reduce((s, m) => s + (m.cost ?? 0), 0);
  const inf = infractions
    .filter(
      (i) =>
        i.vehicle_id === vehicleId &&
        i.date.split('-').map(Number)[0] === ano &&
        i.date.split('-').map(Number)[1] === mes
    )
    .reduce((s, i) => s + (i.fine_amount ?? 0), 0);
  const km = kmReports
    .filter((kr: any) => kr.vehicle_id === vehicleId && kr.year === ano && kr.month === mes)
    .reduce((s, km: any) => s + km.km_total, 0);
  const totalCostos = f + r + m + inf;
  return km > 0 ? Math.round((totalCostos / km) * 100) / 100 : 0;
}

function calcularCostoAno(
  vehicleId: string,
  ano: number,
  fuel_loads: Fuel[],
  repairs: Repair[],
  maintenance: Maint[],
  infractions: Infraction[],
  kmReports: any[]
): number {
  const f = fuel_loads
    .filter((f) => f.vehicle_id === vehicleId && f.date.split('-').map(Number)[0] === ano)
    .reduce((s, f) => s + (f.amount ?? 0), 0);
  const r = repairs
    .filter((r) => r.vehicle_id === vehicleId && r.date.split('-').map(Number)[0] === ano)
    .reduce((s, r) => s + (r.cost ?? 0), 0);
  const m = maintenance
    .filter((m) => m.vehicle_id === vehicleId && m.date.split('-').map(Number)[0] === ano)
    .reduce((s, m) => s + (m.cost ?? 0), 0);
  const inf = infractions
    .filter((i) => i.vehicle_id === vehicleId && i.date.split('-').map(Number)[0] === ano)
    .reduce((s, i) => s + (i.fine_amount ?? 0), 0);
  const km = kmReports
    .filter((kr: any) => kr.vehicle_id === vehicleId && kr.year === ano)
    .reduce((s, km: any) => s + km.km_total, 0);
  const totalCostos = f + r + m + inf;
  return km > 0 ? Math.round((totalCostos / km) * 100) / 100 : 0;
}

// ============================================================================
// COMPARATIVAS POR SUCURSAL
// ============================================================================

export function calcularComparativasSucursales(
  conductores: AnalisisConductor[],
  costos: AnalisisCosto[],
  drivers: Driver[],
  vehicles: Vehicle[]
): ComparativaSucursal[] {
  const branches = [...new Set(vehicles.map((v) => v.branch))];
  const result: ComparativaSucursal[] = [];

  for (const branch of branches) {
    const vehiculosBranch = vehicles.filter((v) => v.branch === branch);
    const costosBranch = costos.filter((c) => c.branch === branch);
    const conductoresBranch = conductores.filter((c) => {
      const driver = drivers.find((d) => d.id === c.driver_id);
      return driver && vehiculosBranch.some((v) => v.driver_id === driver.id);
    });

    const totalKm = costosBranch.reduce((s, c) => s + c.kmRecorridos, 0);
    const totalCombustible = costosBranch.reduce((s, c) => s + c.combustible, 0);
    const costPromedioKm =
      costosBranch.length > 0
        ? Math.round((costosBranch.reduce((s, c) => s + c.costoPorKm, 0) / costosBranch.length) * 100) / 100
        : 0;
    const totalInfracciones = conductoresBranch.reduce((s, c) => s + c.totalInfracciones, 0);
    const cantidadConductores = new Set(conductoresBranch.map((c) => c.driver_id)).size;
    const cantidadVehiculos = vehiculosBranch.length;
    const ratingSeguridadPromedio =
      conductoresBranch.length > 0
        ? Math.round(conductoresBranch.reduce((s, c) => s + c.ratingSeguridad, 0) / conductoresBranch.length)
        : 0;
    const eficienciaPromedio =
      conductoresBranch.length > 0
        ? Math.round((conductoresBranch.reduce((s, c) => s + c.eficiencia, 0) / conductoresBranch.length) * 100) / 100
        : 0;

    result.push({
      branch,
      totalKm,
      totalCombustible: Math.round(totalCombustible * 100) / 100,
      costPromedioKm,
      totalInfracciones,
      cantidadConductores,
      cantidadVehiculos,
      ratingSeguridadPromedio,
      eficienciaPromedio,
    });
  }

  return result.sort((a, b) => b.totalKm - a.totalKm);
}
