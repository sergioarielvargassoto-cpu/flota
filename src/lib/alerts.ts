import type { Doc, Maint, Settings, Status, Vehicle, Driver } from './types';
import { daysTo, num } from './util';

export type AlertItem = {
  kind: 'Vehículo' | 'Chofer' | 'Mantenimiento';
  what: string;
  who: string;
  date: string | null;
  days: number | null;
  kmLeft?: number;
  status: Status;
  sort: number;
  owner: 'vehiculos' | 'choferes';
  ownerId: string;
  ref?: string | null;
};

export const ORDER: Record<Status, number> = { vencido: 0, critico: 1, urgente: 2, proximo: 3, ok: 4, nd: 5 };
export const STATUS_LABEL: Record<Status, string> = {
  vencido: 'Vencido', critico: 'Crítico', urgente: 'Urgente', proximo: 'Próximo', ok: 'Al día', nd: 'Sin fecha',
};

export function statusOf(days: number | null, s: Settings): Status {
  if (days === null) return 'nd';
  if (days < 0) return 'vencido';
  if (days <= s.d3) return 'critico';
  if (days <= s.d2) return 'urgente';
  if (days <= s.d1) return 'proximo';
  return 'ok';
}

export function daysText(d: number | null): string {
  if (d === null) return 'Sin fecha';
  if (d < 0) return `Vencido hace ${-d} d`;
  if (d === 0) return 'Vence hoy';
  return `En ${d} días`;
}

export function kmText(left: number): string {
  return left <= 0 ? `Pasado por ${num(-left)} km` : `Faltan ${num(left)} km`;
}

type Input = { vehicles: Vehicle[]; drivers: Driver[]; documents: Doc[]; maintenance: Maint[]; settings: Settings };

export function computeAlerts(d: Input, all = false): AlertItem[] {
  const { vehicles, drivers, documents, maintenance, settings: s } = d;
  const vMap = new Map(vehicles.map((v) => [v.id, v]));
  const dMap = new Map(drivers.map((x) => [x.id, x]));
  const out: AlertItem[] = [];

  for (const doc of documents) {
    const v = doc.vehicle_id ? vMap.get(doc.vehicle_id) : undefined;
    const dr = doc.driver_id ? dMap.get(doc.driver_id) : undefined;
    if (!v && !dr) continue;
    const days = daysTo(doc.expires_on);
    out.push({
      kind: v ? 'Vehículo' : 'Chofer', what: doc.doc_type, who: v ? v.plate : dr!.name,
      date: doc.expires_on, days, status: statusOf(days, s), sort: days ?? 9999,
      owner: v ? 'vehiculos' : 'choferes', ownerId: (v ? v.id : dr!.id), ref: doc.reference,
    });
  }

  // último mantenimiento de cada tipo por vehículo → próxima fecha / km
  const last = new Map<string, Maint>();
  for (const m of maintenance) {
    const k = m.vehicle_id + '|' + m.type.toLowerCase();
    const cur = last.get(k);
    if (!cur || m.date > cur.date) last.set(k, m);
  }
  for (const m of last.values()) {
    const v = vMap.get(m.vehicle_id);
    if (!v) continue;
    if (m.next_date) {
      const days = daysTo(m.next_date);
      out.push({ kind: 'Mantenimiento', what: m.type, who: v.plate, date: m.next_date, days, status: statusOf(days, s), sort: days ?? 9999, owner: 'vehiculos', ownerId: v.id });
    }
    if (m.next_km !== null && v.km !== null && !/service/i.test(m.type)) {
      const left = m.next_km - v.km;
      if (all || left <= s.km_alert)
        out.push({
          kind: 'Mantenimiento', what: m.type + ' (por km)', who: v.plate, date: null, days: null, kmLeft: left,
          status: left <= 0 ? 'vencido' : left <= s.km_alert ? 'proximo' : 'ok', sort: left <= 0 ? -1 : s.d1, owner: 'vehiculos', ownerId: v.id,
        });
    }
  }

  // service periódico por km (cada service_km desde el último service)
  for (const v of vehicles) {
    if (v.status === 'Baja' || v.last_service_km === null || v.km === null) continue;
    const left = v.last_service_km + s.service_km - v.km;
    if (all || left <= s.km_alert)
      out.push({
        kind: 'Mantenimiento', what: `Service cada ${num(s.service_km)} km`, who: v.plate, date: null, days: null, kmLeft: left,
        status: left <= 0 ? 'vencido' : left <= s.km_alert ? 'proximo' : 'ok', sort: left <= 0 ? -1 : s.d1, owner: 'vehiculos', ownerId: v.id,
      });
  }

  return out.filter((a) => all || a.status !== 'ok').sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.sort - b.sort);
}

/** Peor estado de los vencimientos de un vehículo o chofer (null si no tiene ninguno cargado). */
export function worstStatus(docs: Doc[], s: Settings): Status | null {
  if (!docs.length) return null;
  return docs.map((d) => statusOf(daysTo(d.expires_on), s)).sort((a, b) => ORDER[a] - ORDER[b])[0];
}
