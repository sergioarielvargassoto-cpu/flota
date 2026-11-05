/**
 * Archivo histórico de vehículos.
 * Regla: un vehículo con historial NUNCA se elimina; se da de baja (estado "Baja") y conserva todos sus registros
 * y archivos adjuntos, para estadísticas históricas y para respaldo legal (comprobantes, juicios, peritajes).
 */
import type { Attachment, Doc, Driver, Fine, Fuel, Infraction, KmHistory, KmReport, Maint, Repair, Trip, Vehicle, Workshop } from './types';

export type ArchiveData = {
  drivers: Driver[];
  documents: Doc[];
  repairs: Repair[];
  maintenance: Maint[];
  fuel_loads: Fuel[];
  trips: Trip[];
  km_history: KmHistory[];
  km_reports: KmReport[];
  infractions: Infraction[];
  fines: Fine[];
  attachments: Attachment[];
  workshops: Workshop[];
};

/** Cantidad de registros asociados a un vehículo, por tipo. */
export function vehicleHistory(vehicleId: string, d: ArchiveData) {
  const docs = d.documents.filter((x) => x.vehicle_id === vehicleId);
  const reps = d.repairs.filter((x) => x.vehicle_id === vehicleId);
  const mnts = d.maintenance.filter((x) => x.vehicle_id === vehicleId);
  const infr = d.infractions.filter((x) => x.vehicle_id === vehicleId);
  const counts = {
    documentos: docs.length,
    reparaciones: reps.length,
    mantenimientos: mnts.length,
    cargas: d.fuel_loads.filter((x) => x.vehicle_id === vehicleId).length,
    recorridos: d.trips.filter((x) => x.vehicle_id === vehicleId).length,
    historialKm: d.km_history.filter((x) => x.vehicle_id === vehicleId).length,
    reportesKm: d.km_reports.filter((x) => x.vehicle_id === vehicleId).length,
    infracciones: infr.length,
  };
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  return { counts, total, docs, reps, mnts, infr };
}

const BAJA_RE = /^\[BAJA (\d{4}-\d{2}-\d{2})\] (.*)$/m;
/** La baja se registra como una línea en las notas del vehículo: "[BAJA AAAA-MM-DD] motivo". */
export const bajaLine = (date: string, reason: string, detail: string) =>
  `[BAJA ${date}] ${reason}${detail ? ' — ' + detail.replace(/\n/g, ' ') : ''}`;
export function parseBaja(notes: string | null | undefined): { date: string; text: string } | null {
  const m = (notes ?? '').match(BAJA_RE);
  return m ? { date: m[1], text: m[2] } : null;
}

const SEP = '\n';
export function withBaja(notes: string | null, line: string): string {
  const base = (notes ?? '').replace(new RegExp(BAJA_RE.source + '\\n?', 'gm'), '').trim();
  return base ? base + SEP + line : line;
}
export function withoutBaja(notes: string | null, reactivated: string): string {
  const base = (notes ?? '').replace(new RegExp(BAJA_RE.source + '\\n?', 'gm'), '').trim();
  const line = `[REACTIVADO ${reactivated}]`;
  return base ? base + SEP + line : line;
}

/** Legajo completo del vehículo en Excel: datos, historial, cargas, recorridos, costos, multas y lista de adjuntos. */
export async function exportLegajo(v: Vehicle, d: ArchiveData) {
  const XLSX = await import('xlsx');
  const h = vehicleHistory(v.id, d);
  const wsName = new Map(d.workshops.map((w) => [w.id, w.name]));
  const drv = new Map(d.drivers.map((x) => [x.id, x.name]));
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'Sin registros' }]), name);

  const baja = parseBaja(v.notes);
  add('Datos', [
    { Campo: 'Patente', Valor: v.plate },
    { Campo: 'Tipo', Valor: v.type ?? '' },
    { Campo: 'Marca / modelo', Valor: `${v.brand ?? ''} ${v.model ?? ''}`.trim() },
    { Campo: 'Año', Valor: v.year ?? '' },
    { Campo: 'Chasis / motor', Valor: v.chassis ?? '' },
    { Campo: 'Provincia', Valor: v.provincia ?? '' },
    { Campo: 'Chofer asignado', Valor: v.driver_id ? (drv.get(v.driver_id) ?? '') : '' },
    { Campo: 'Estado', Valor: v.status },
    { Campo: 'Baja', Valor: baja ? `${baja.date} · ${baja.text}` : '' },
    { Campo: 'Km actual', Valor: v.km ?? '' },
    { Campo: 'Km al', Valor: v.km_date ?? '' },
    { Campo: 'Km del último service', Valor: v.last_service_km ?? '' },
    { Campo: 'Tarjeta YPF', Valor: v.fuel_card ?? '' },
    { Campo: 'Notas', Valor: v.notes ?? '' },
    { Campo: 'Legajo emitido', Valor: new Date().toLocaleString('es-AR') },
  ]);
  add('Historial km', d.km_history.filter((x) => x.vehicle_id === v.id).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)).map((x) => ({ Fecha: x.recorded_at, 'Km anterior': x.km_previous ?? '', Km: x.km, Origen: x.changed_by })));
  add('Documentos', h.docs.map((x) => ({ Tipo: x.doc_type, Vence: x.expires_on ?? '', Referencia: x.reference ?? '', Notas: x.notes ?? '' })));
  add('Mantenimientos', h.mnts.sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ Fecha: x.date, Tipo: x.type, Km: x.km ?? '', Taller: x.workshop_id ? (wsName.get(x.workshop_id) ?? '') : '', Costo: x.cost ?? '', 'Próxima fecha': x.next_date ?? '', 'Próximo km': x.next_km ?? '', Notas: x.notes ?? '' })));
  add('Reparaciones', h.reps.sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ Fecha: x.date, Descripción: x.description, Km: x.km ?? '', Taller: x.workshop_id ? (wsName.get(x.workshop_id) ?? '') : '', Costo: x.cost ?? '', Factura: x.invoice ?? '', Estado: x.status })));
  add('Combustible', d.fuel_loads.filter((x) => x.vehicle_id === v.id).sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ Fecha: x.date, Producto: x.product ?? '', Litros: x.liters, Importe: x.amount ?? '', 'Km (válido)': x.km ?? '', 'Km declarado': x.km_raw ?? '', Estación: x.station ?? '', Conductor: x.driver_name ?? '', Remito: x.receipt ?? '' })));
  add('Recorridos GPS', d.trips.filter((x) => x.vehicle_id === v.id).sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ Fecha: x.date, 'Km (reportados)': x.km_calc, 'Vel. máx.': x.max_speed ?? '', 'Tiempo en movimiento': x.moving_time ?? '' })));
  add('Reportes mensuales km', d.km_reports.filter((x) => x.vehicle_id === v.id).sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month)).map((x) => ({ Año: x.year, Mes: x.month, 'Km del mes': x.km_total, Sucursal: x.branch ?? '' })));
  const finesBy = new Map(d.fines.map((f) => [f.infraction_id, f]));
  add('Infracciones', h.infr.sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ Fecha: x.date, Tipo: x.type, Chofer: drv.get(x.driver_id) ?? '', Lugar: x.location ?? '', 'N° acta': x.infraction_number ?? '', Monto: x.fine_amount ?? '', Estado: x.status, 'Pagado': finesBy.get(x.id)?.paid_amount ?? '', 'Fecha de pago': finesBy.get(x.id)?.paid_date ?? '' })));

  const docIds = new Map(h.docs.map((x) => [x.id, `Documento ${x.doc_type}`]));
  const repIds = new Map(h.reps.map((x) => [x.id, `Reparación ${x.date} · ${x.description}`]));
  const manIds = new Map(h.mnts.map((x) => [x.id, `Mantenimiento ${x.date} · ${x.type}`]));
  const infIds = new Map(h.infr.map((x) => [x.id, `Infracción ${x.date} · ${x.type}`]));
  add(
    'Adjuntos (archivos)',
    d.attachments
      .map((a) => ({
        Archivo: a.name,
        'Vinculado a': (a.document_id && docIds.get(a.document_id)) || (a.repair_id && repIds.get(a.repair_id)) || (a.maintenance_id && manIds.get(a.maintenance_id)) || (a.infraction_id && infIds.get(a.infraction_id)) || '',
        'Ruta en almacenamiento (bucket adjuntos)': a.path,
      }))
      .filter((r) => r['Vinculado a'])
  );
  XLSX.writeFile(wb, `Legajo_${v.plate}_${new Date().toLocaleDateString('en-CA')}.xlsx`);
}
