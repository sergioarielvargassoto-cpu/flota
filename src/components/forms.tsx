'use client';
import { useData } from '@/lib/data';
import type { Doc, Driver, Fuel, Infraction, Maint, Repair, Vehicle, Workshop } from '@/lib/types';
import {
  DOC_DRIVER_ALL, DOC_DRIVER_DEFAULT, DOC_VEHICLE_ALL, DOC_VEHICLE_DEFAULT, MAINT_TYPES, nrm, todayStr,
} from '@/lib/util';
import { FormModal, type Field } from './FormModal';
import { uploadFiles } from './Attachments';

/** Hook con la lógica común: actualizar el km del vehículo cuando un registro trae un km mayor. */
function useBump() {
  const { vehicles, update } = useData();
  return async (vehicleId: string, km: number | null, date: string, service = false) => {
    const v = vehicles.find((x) => x.id === vehicleId);
    if (!v || km === null) return;
    const patch: Partial<Vehicle> = {};
    if (v.km === null || km > v.km) { patch.km = km; patch.km_date = date; }
    if (service && (v.last_service_km === null || km > v.last_service_km)) patch.last_service_km = km;
    if (Object.keys(patch).length) await update('vehicles', vehicleId, patch);
  };
}

const vOpts = (vs: Vehicle[]): [string, string][] => vs.map((v) => [v.id, `${v.plate} · ${v.brand ?? ''} ${v.model ?? ''}`.trim()]);
const wOpts = (ws: Workshop[]): [string, string][] => [['', '— sin taller —'], ...ws.map((w): [string, string] => [w.id, w.name])];

export function VehicleForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { vehicles, drivers, insert, insertMany, update } = useData();
  const v = id ? vehicles.find((x) => x.id === id) : undefined;
  const fields: Field[] = [
    { k: 'plate', l: 'Patente', req: true, half: true },
    { k: 'type', l: 'Tipo', t: 'combo', options: ['Camión', 'Utilitario', 'Camioneta', 'Furgón', 'Acoplado', 'Auto', 'Moto'], half: true },
    { k: 'brand', l: 'Marca', half: true }, { k: 'model', l: 'Modelo', half: true },
    { k: 'year', l: 'Año', t: 'number', half: true }, { k: 'km', l: 'Kilometraje actual', t: 'number', half: true },
    { k: 'driver_id', l: 'Chofer asignado', t: 'select', options: [['', '— sin asignar —'], ...drivers.map((d): [string, string] => [d.id, d.name])], half: true },
    { k: 'status', l: 'Estado', t: 'select', options: ['Activo', 'En taller', 'Baja'], half: true },
    { k: 'last_service_km', l: 'Km del último service', t: 'number', half: true },
    { k: 'fuel_card', l: 'Tarjeta YPF en Ruta (últimos dígitos)', half: true },
    { k: 'chassis', l: 'N° de chasis / motor' }, { k: 'notes', l: 'Notas', t: 'textarea' },
  ];
  return (
    <FormModal
      title={id ? 'Editar vehículo' : 'Nuevo vehículo'} fields={fields} onClose={onClose}
      initial={v ?? { status: 'Activo' }}
      onSave={async (vals) => {
        vals.plate = nrm(vals.plate);
        if (v) {
          if (vals.km !== v.km) vals.km_date = todayStr();
          await update('vehicles', v.id, vals);
        } else {
          vals.km_date = vals.km !== null ? todayStr() : null;
          const nv = await insert<Vehicle>('vehicles', vals);
          await insertMany('documents', DOC_VEHICLE_DEFAULT.map((t) => ({ vehicle_id: nv.id, doc_type: t })));
        }
      }}
    />
  );
}

export function DriverForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { drivers, insert, insertMany, update } = useData();
  const d = id ? drivers.find((x) => x.id === id) : undefined;
  return (
    <FormModal
      title={id ? 'Editar chofer' : 'Nuevo chofer'} onClose={onClose} initial={d ?? {}}
      fields={[{ k: 'name', l: 'Nombre y apellido', req: true }, { k: 'dni', l: 'DNI', half: true }, { k: 'phone', l: 'Teléfono', half: true }, { k: 'notes', l: 'Notas', t: 'textarea' }]}
      onSave={async (vals) => {
        if (d) await update('drivers', d.id, vals);
        else {
          const nd = await insert<Driver>('drivers', vals);
          await insertMany('documents', DOC_DRIVER_DEFAULT.map((t) => ({ driver_id: nd.id, doc_type: t })));
        }
      }}
    />
  );
}

export function DocForm({ owner, docId, onClose }: { owner: { type: 'vehicle' | 'driver'; id: string }; docId?: string; onClose: () => void }) {
  const { documents, insert, update, reload } = useData();
  const d = docId ? documents.find((x) => x.id === docId) : undefined;
  return (
    <FormModal
      title={docId ? 'Editar vencimiento' : 'Nuevo vencimiento'} onClose={onClose} initial={d ?? {}}
      files={{ kind: 'document', id: docId }}
      fields={[
        { k: 'doc_type', l: 'Documento', t: 'combo', options: owner.type === 'vehicle' ? DOC_VEHICLE_ALL : DOC_DRIVER_ALL, req: true },
        { k: 'expires_on', l: 'Fecha de vencimiento (vacío = pendiente)', t: 'date', half: true },
        { k: 'reference', l: 'N° / referencia (póliza, certificado)', half: true },
        { k: 'notes', l: 'Notas', t: 'textarea' },
      ]}
      onSave={async (vals, files) => {
        let id = docId;
        if (id) await update('documents', id, vals);
        else id = (await insert<Doc>('documents', { ...vals, [owner.type === 'vehicle' ? 'vehicle_id' : 'driver_id']: owner.id })).id;
        if (files.length) { await uploadFiles('document', id, files); await reload('attachments'); }
      }}
    />
  );
}

export function WorkshopForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { workshops, insert, update } = useData();
  const w = id ? workshops.find((x) => x.id === id) : undefined;
  return (
    <FormModal
      title={id ? 'Editar taller' : 'Nuevo taller'} onClose={onClose} initial={w ?? {}}
      fields={[{ k: 'name', l: 'Nombre', req: true }, { k: 'phone', l: 'Teléfono', half: true }, { k: 'specialty', l: 'Especialidad', half: true }, { k: 'address', l: 'Dirección' }, { k: 'notes', l: 'Notas', t: 'textarea' }]}
      onSave={async (vals) => { if (w) await update('workshops', w.id, vals); else await insert('workshops', vals); }}
    />
  );
}

export function RepairForm({ id, vehicleId, onClose }: { id?: string; vehicleId?: string; onClose: () => void }) {
  const { vehicles, workshops, repairs, insert, update, reload } = useData();
  const bump = useBump();
  const r = id ? repairs.find((x) => x.id === id) : undefined;
  return (
    <FormModal
      title={id ? 'Editar reparación' : 'Nueva reparación'} onClose={onClose}
      initial={r ?? { vehicle_id: vehicleId || vehicles[0]?.id || '', date: todayStr(), status: 'Finalizada' }}
      files={{ kind: 'repair', id }}
      fields={[
        { k: 'vehicle_id', l: 'Vehículo', t: 'select', options: vOpts(vehicles), req: true },
        { k: 'date', l: 'Fecha', t: 'date', req: true, half: true },
        { k: 'workshop_id', l: 'Taller', t: 'select', options: wOpts(workshops), half: true },
        { k: 'description', l: 'Descripción del arreglo', t: 'textarea', req: true },
        { k: 'km', l: 'Km', t: 'number', half: true }, { k: 'cost', l: 'Costo ($)', t: 'number', step: '0.01', half: true },
        { k: 'invoice', l: 'N° factura / remito', half: true },
        { k: 'status', l: 'Estado', t: 'select', options: ['Pendiente', 'En curso', 'Finalizada'], half: true },
      ]}
      onSave={async (vals, files) => {
        let rid = id;
        if (rid) await update('repairs', rid, vals); else rid = (await insert<Repair>('repairs', vals)).id;
        if (files.length) { await uploadFiles('repair', rid, files); await reload('attachments'); }
        await bump(vals.vehicle_id as string, vals.km as number | null, vals.date as string);
      }}
    />
  );
}

export function MaintForm({ id, vehicleId, onClose }: { id?: string; vehicleId?: string; onClose: () => void }) {
  const { vehicles, workshops, maintenance, insert, update, reload } = useData();
  const bump = useBump();
  const m = id ? maintenance.find((x) => x.id === id) : undefined;
  return (
    <FormModal
      title={id ? 'Editar mantenimiento' : 'Nuevo mantenimiento'} onClose={onClose}
      initial={m ?? { vehicle_id: vehicleId || vehicles[0]?.id || '', date: todayStr() }}
      files={{ kind: 'maintenance', id }}
      fields={[
        { k: 'vehicle_id', l: 'Vehículo', t: 'select', options: vOpts(vehicles), req: true },
        { k: 'type', l: 'Tipo de mantenimiento', t: 'combo', options: MAINT_TYPES, req: true },
        { k: 'date', l: 'Fecha realizado', t: 'date', req: true, half: true }, { k: 'km', l: 'Km al realizarlo', t: 'number', half: true },
        { k: 'workshop_id', l: 'Taller', t: 'select', options: wOpts(workshops), half: true },
        { k: 'cost', l: 'Costo ($)', t: 'number', step: '0.01', half: true },
        { k: 'next_date', l: 'Próxima fecha (opcional)', t: 'date', half: true }, { k: 'next_km', l: 'Próximo a los (km, opcional)', t: 'number', half: true },
        { k: 'notes', l: 'Notas', t: 'textarea' },
      ]}
      onSave={async (vals, files) => {
        let mid = id;
        if (mid) await update('maintenance', mid, vals); else mid = (await insert<Maint>('maintenance', vals)).id;
        if (files.length) { await uploadFiles('maintenance', mid, files); await reload('attachments'); }
        await bump(vals.vehicle_id as string, vals.km as number | null, vals.date as string, /service/i.test(String(vals.type)));
      }}
    />
  );
}

export function FuelForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { vehicles, fuel_loads, insert, update } = useData();
  const f = id ? fuel_loads.find((x) => x.id === id) : undefined;
  return (
    <FormModal
      title={id ? 'Editar carga' : 'Nueva carga de combustible'} onClose={onClose}
      initial={f ?? { vehicle_id: vehicles[0]?.id, date: todayStr(), product: 'Infinia Diesel' }}
      fields={[
        { k: 'vehicle_id', l: 'Vehículo', t: 'select', options: vOpts(vehicles), req: true },
        { k: 'date', l: 'Fecha', t: 'date', req: true, half: true }, { k: 'liters', l: 'Litros', t: 'number', step: '0.01', req: true, half: true },
        { k: 'amount', l: 'Importe sin IVA ($)', t: 'number', step: '0.01', half: true }, { k: 'km', l: 'Km (odómetro válido)', t: 'number', half: true },
        { k: 'product', l: 'Producto', t: 'combo', options: ['Infinia', 'Infinia Diesel', 'Super', 'Ultra Diesel'], half: true },
        { k: 'driver_name', l: 'Conductor', half: true }, { k: 'station', l: 'Establecimiento' },
      ]}
      onSave={async (vals) => {
        if (f) await update('fuel_loads', f.id, vals);
        else await insert<Fuel>('fuel_loads', { ...vals, km_raw: vals.km });
      }}
    />
  );
}

export function InfractionForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { drivers, vehicles, infractions, insert, update, reload } = useData();
  const inf = id ? infractions.find((x) => x.id === id) : undefined;
  const INFRACTION_TYPES = ['Exceso de velocidad', 'Estacionamiento', 'Documentación', 'Seguridad', 'Mantenimiento', 'Otra'];
  const STATUSES = ['Registrada', 'Pagada', 'Anulada'];
  return (
    <FormModal
      title={id ? 'Editar infracción' : 'Nueva infracción'} onClose={onClose}
      initial={inf ?? { date: todayStr(), status: 'Registrada' }}
      files={{ kind: 'infraction', id }}
      fields={[
        { k: 'driver_id', l: 'Conductor', t: 'select', options: [['', '— seleccionar —'], ...drivers.map((d): [string, string] => [d.id, d.name])], req: true, half: true },
        { k: 'vehicle_id', l: 'Vehículo', t: 'select', options: vOpts(vehicles), req: true, half: true },
        { k: 'date', l: 'Fecha', t: 'date', req: true, half: true }, { k: 'type', l: 'Tipo', t: 'combo', options: INFRACTION_TYPES, req: true, half: true },
        { k: 'infraction_number', l: 'N° de infracción', half: true }, { k: 'location', l: 'Lugar', half: true },
        { k: 'description', l: 'Descripción', t: 'textarea' },
        { k: 'fine_amount', l: 'Monto de multa ($)', t: 'number', step: '0.01', half: true }, { k: 'status', l: 'Estado', t: 'select', options: STATUSES, half: true },
        { k: 'notes', l: 'Notas', t: 'textarea' },
      ]}
      onSave={async (vals, files) => {
        let infId = id;
        if (infId) await update('infractions', infId, vals);
        else infId = (await insert<Infraction>('infractions', vals)).id;
        if (files.length) { await uploadFiles('infraction', infId, files); await reload('attachments'); }
      }}
    />
  );
}

export type { Repair, Maint, Infraction };
