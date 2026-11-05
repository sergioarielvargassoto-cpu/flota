'use client';
import { useState } from 'react';
import { useData } from '@/lib/data';
import type { Doc, Driver, Fuel, Infraction, Maint, Repair, Vehicle, Workshop } from '@/lib/types';
import {
  DOC_DRIVER_ALL,
  DOC_DRIVER_DEFAULT,
  DOC_VEHICLE_ALL,
  DOC_VEHICLE_DEFAULT,
  MAINT_TYPES,
  nrm,
  todayStr,
} from '@/lib/util';
import { FormModal, type Field } from './FormModal';
import { uploadFiles } from './Attachments';
import { recordKmChange, recordRepairChange, recordMaintenanceChange } from '@/lib/history';
import { readingsOf } from '@/lib/kmAnchor';
import { gpsReliability } from '@/lib/kmAudit';
import { confusablePairs, twinsOf } from '@/lib/confusable';
import { trajectoryOutliers } from '@/lib/kmTrajectory';
import { OKODO_BASE_KM, OKODO_KM_PER_DAY, TALLER_ROUND_KM } from '@/lib/params';

/**
 * Un service registrado actualiza el "km del último service" del vehículo. El km actual del vehículo ya NO se pisa desde acá:
 * se deriva de sus lecturas y se recalcula solo al crear/editar/borrar el registro (ver kmRecompute.ts).
 */
function useBump() {
  const { vehicles, update } = useData();
  return async (vehicleId: string, km: number | null, _date: string, service = false) => {
    const v = vehicles.find((x) => x.id === vehicleId);
    if (!v || km === null) return;
    if (service && (v.last_service_km === null || km > v.last_service_km)) await update('vehicles', vehicleId, { last_service_km: km });
  };
}

/**
 * Control ANTES de guardar un registro con km: si no es coherente con las lecturas vecinas del vehículo (retrocede más del
 * redondeo habitual de taller, o sube más de lo físicamente posible), pide confirmación. Evita tipeos como 213.000 en vez de 143.000.
 */
function useKmGuard() {
  const { vehicles, fuel_loads, km_history, maintenance, repairs, trips } = useData();
  return (
    vehicleId: string,
    km: unknown,
    date: string,
    exclude?: { table: 'maintenance' | 'repairs'; id?: string }
  ): boolean => {
    const n = km === null || km === undefined || km === '' ? NaN : Number(km);
    if (!Number.isFinite(n) || !date) return true;
    const rd = readingsOf(vehicleId, {
      fuel_loads,
      km_history,
      maintenance: exclude?.table === 'maintenance' ? maintenance.filter((m) => m.id !== exclude.id) : maintenance,
      repairs: exclude?.table === 'repairs' ? repairs.filter((r) => r.id !== exclude.id) : repairs,
    });
    const plateOfV = vehicles.find((v) => v.id === vehicleId)?.plate ?? '';
    const twinsT = twinsOf(plateOfV, confusablePairs(vehicles));
    const twinTxt = twinsT.length ? `

⚠ Ojo: ${plateOfV} se puede confundir con ${twinsT.join(', ')}. Verificá que el dato sea de este vehículo.` : '';
    const before = [...rd].reverse().find((r) => r.date <= date);
    const after = rd.find((r) => r.date >= date);
    const days = (a: string, b: string) => Math.round((+new Date(b + 'T00:00:00') - +new Date(a + 'T00:00:00')) / 864e5);
    const low = !!before && n < before.km - TALLER_ROUND_KM;
    const high = !!before && n > before.km + Math.max(1, days(before.date, date)) * OKODO_KM_PER_DAY + OKODO_BASE_KM;
    const afterLow = !!after && n > after.km + TALLER_ROUND_KM;
    // Contraste con la TRAYECTORIA: el km nuevo se compara con hasta 3 lecturas anteriores y 3 posteriores (cualquier fuente) y con el GPS
    const cand = { key: 'NUEVA', date, km: n, src: exclude?.table === 'repairs' ? ('reparación' as const) : ('mantenimiento' as const) };
    const traj = trajectoryOutliers(
      [...rd.map((r) => ({ key: `${r.date}|${r.km}|${r.src}`, date: r.date, km: r.km, src: r.src })), cand],
      trips,
      vehicleId,
      gpsReliability(vehicleId, fuel_loads, trips).reliable
    ).find((f) => f.key === 'NUEVA');
    if (traj) {
      const plateT = vehicles.find((v) => v.id === vehicleId)?.plate ?? '';
      return confirm(`El km ${n.toLocaleString('es-AR')} de ${plateT} parece un error.

${traj.reason}

¿Es correcto? Si no, cancelá y revisalo.${twinTxt}`);
    }
    if (!low && !high && !afterLow) return true;
    const ref = low || high ? before! : after!;
    const plate = vehicles.find((v) => v.id === vehicleId)?.plate ?? '';
    const f = (x: string) => x.split('-').reverse().join('/');
    return confirm(
      `El km ${n.toLocaleString('es-AR')} de ${plate} no es coherente con la lectura del ${f(ref.date)} (${ref.km.toLocaleString('es-AR')} km, ${ref.src}).

` +
        `${low ? 'Es MENOR: el odómetro no retrocede.' : high ? 'Es MUCHO MAYOR de lo posible en ese tiempo.' : 'Supera una lectura posterior ya registrada.'}

¿Es correcto? Si no, cancelá y revisalo.${twinTxt}`
    );
  };
}

const vOpts = (vs: Vehicle[]): [string, string][] =>
  vs.map((v) => [v.id, `${v.plate} · ${v.brand ?? ''} ${v.model ?? ''}`.trim()]);
const wOpts = (ws: Workshop[]): [string, string][] => [
  ['', '— sin taller —'],
  ...ws.map((w): [string, string] => [w.id, w.name]),
];

export function VehicleForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { vehicles, drivers, insert, insertMany, update } = useData();
  const v = id ? vehicles.find((x) => x.id === id) : undefined;
  const fields: Field[] = [
    { k: 'plate', l: 'Patente', req: true, half: true },
    {
      k: 'type',
      l: 'Tipo',
      t: 'combo',
      options: ['Camión', 'Utilitario', 'Camioneta', 'Furgón', 'Acoplado', 'Auto', 'Moto'],
      half: true,
    },
    { k: 'brand', l: 'Marca', half: true },
    { k: 'model', l: 'Modelo', half: true },
    { k: 'year', l: 'Año', t: 'number', half: true },
    { k: 'km', l: 'Kilometraje actual', t: 'number', half: true },
    {
      k: 'driver_id',
      l: 'Chofer asignado',
      t: 'select',
      options: [['', '— sin asignar —'], ...drivers.map((d): [string, string] => [d.id, d.name])],
      half: true,
    },
    { k: 'status', l: 'Estado', t: 'select', options: ['Activo', 'En taller', 'Baja'], half: true },
    {
      k: 'provincia',
      l: 'Provincia',
      t: 'select',
      options: [
        ['', '— sin designar —'],
        ['Corrientes', 'Corrientes'],
        ['Formosa', 'Formosa'],
        ['Misiones', 'Misiones'],
        ['Chaco', 'Chaco'],
      ],
      half: true,
    },
    { k: 'last_service_km', l: 'Km del último service (base inicial; los siguientes se cargan en Mantenimientos)', t: 'number', half: true },
    { k: 'fuel_card', l: 'Tarjeta YPF en Ruta (últimos dígitos)', half: true },
    { k: 'chassis', l: 'N° de chasis / motor' },
    { k: 'notes', l: 'Notas', t: 'textarea' },
  ];
  return (
    <FormModal
      title={id ? 'Editar vehículo' : 'Nuevo vehículo'}
      fields={fields}
      onClose={onClose}
      initial={v ?? { status: 'Activo' }}
      onSave={async (vals) => {
        vals.plate = nrm(vals.plate);
        if (v) {
          if (vals.km !== v.km && vals.km !== null) {
            vals.km_date = todayStr();
            await recordKmChange(v.id, vals.km as number, v.km);
          }
          await update('vehicles', v.id, vals);
        } else {
          vals.km_date = vals.km !== null ? todayStr() : null;
          const nv = await insert<Vehicle>('vehicles', vals);
          if (vals.km !== null) await recordKmChange(nv.id, vals.km as number, null);
          await insertMany(
            'documents',
            DOC_VEHICLE_DEFAULT.map((t) => ({ vehicle_id: nv.id, doc_type: t }))
          );
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
      title={id ? 'Editar chofer' : 'Nuevo chofer'}
      onClose={onClose}
      initial={d ?? {}}
      fields={[
        { k: 'name', l: 'Nombre y apellido', req: true },
        { k: 'dni', l: 'DNI', half: true },
        { k: 'phone', l: 'Teléfono', half: true },
        { k: 'notes', l: 'Notas', t: 'textarea' },
      ]}
      onSave={async (vals) => {
        if (d) await update('drivers', d.id, vals);
        else {
          const nd = await insert<Driver>('drivers', vals);
          await insertMany(
            'documents',
            DOC_DRIVER_DEFAULT.map((t) => ({ driver_id: nd.id, doc_type: t }))
          );
        }
      }}
    />
  );
}

export function DocForm({
  owner,
  docId,
  onClose,
}: {
  owner: { type: 'vehicle' | 'driver'; id: string };
  docId?: string;
  onClose: () => void;
}) {
  const { documents, insert, update, reload } = useData();
  const d = docId ? documents.find((x) => x.id === docId) : undefined;
  return (
    <FormModal
      title={docId ? 'Editar vencimiento' : 'Nuevo vencimiento'}
      onClose={onClose}
      initial={d ?? {}}
      files={{ kind: 'document', id: docId }}
      fields={[
        {
          k: 'doc_type',
          l: 'Documento',
          t: 'combo',
          options: owner.type === 'vehicle' ? DOC_VEHICLE_ALL : DOC_DRIVER_ALL,
          req: true,
        },
        { k: 'expires_on', l: 'Fecha de vencimiento (vacío = pendiente)', t: 'date', half: true },
        { k: 'reference', l: 'N° / referencia (póliza, certificado)', half: true },
        { k: 'notes', l: 'Notas', t: 'textarea' },
      ]}
      onSave={async (vals, files) => {
        let id = docId;
        if (id) await update('documents', id, vals);
        else
          id = (
            await insert<Doc>('documents', {
              ...vals,
              [owner.type === 'vehicle' ? 'vehicle_id' : 'driver_id']: owner.id,
            })
          ).id;
        if (files.length) {
          await uploadFiles('document', id, files);
          await reload('attachments');
        }
      }}
    />
  );
}

export function WorkshopForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { workshops, insert, update } = useData();
  const w = id ? workshops.find((x) => x.id === id) : undefined;
  return (
    <FormModal
      title={id ? 'Editar taller' : 'Nuevo taller'}
      onClose={onClose}
      initial={w ?? {}}
      fields={[
        { k: 'name', l: 'Nombre', req: true },
        { k: 'phone', l: 'Teléfono', half: true },
        { k: 'specialty', l: 'Especialidad', half: true },
        { k: 'address', l: 'Dirección' },
        { k: 'notes', l: 'Notas', t: 'textarea' },
      ]}
      onSave={async (vals) => {
        if (w) await update('workshops', w.id, vals);
        else await insert('workshops', vals);
      }}
    />
  );
}

export function RepairForm({ id, vehicleId, onClose }: { id?: string; vehicleId?: string; onClose: () => void }) {
  const { vehicles, workshops, repairs, insert, update, reload } = useData();
  const bump = useBump();
  const kmOk = useKmGuard();
  const r = id ? repairs.find((x) => x.id === id) : undefined;
  return (
    <FormModal
      title={id ? 'Editar reparación' : 'Nueva reparación'}
      onClose={onClose}
      initial={r ?? { vehicle_id: vehicleId || vehicles[0]?.id || '', date: todayStr(), status: 'Finalizada' }}
      files={{ kind: 'repair', id }}
      fields={[
        { k: 'vehicle_id', l: 'Vehículo', t: 'select', options: vOpts(vehicles), req: true },
        { k: 'date', l: 'Fecha', t: 'date', req: true, half: true },
        { k: 'workshop_id', l: 'Taller', t: 'select', options: wOpts(workshops), half: true },
        { k: 'description', l: 'Descripción del arreglo', t: 'textarea', req: true },
        { k: 'km', l: 'Km', t: 'number', half: true },
        { k: 'cost', l: 'Costo ($)', t: 'number', step: '0.01', half: true },
        { k: 'invoice', l: 'N° factura / remito', half: true },
        { k: 'status', l: 'Estado', t: 'select', options: ['Pendiente', 'En curso', 'Finalizada'], half: true },
      ]}
      onSave={async (vals, files) => {
        if (!kmOk(vals.vehicle_id as string, vals.km, vals.date as string, { table: 'repairs', id })) throw new Error('Guardado cancelado: revisá el km indicado.');
        let rid = id;
        if (rid) {
          if (r?.status !== vals.status)
            await recordRepairChange(rid, 'status', r?.status || null, vals.status as string);
          if (r?.date !== vals.date) await recordRepairChange(rid, 'date', r?.date || null, vals.date as string);
          if (r?.cost !== vals.cost)
            await recordRepairChange(rid, 'cost', String(r?.cost || ''), String(vals.cost || ''));
          await update('repairs', rid, vals);
        } else {
          rid = (await insert<Repair>('repairs', vals)).id;
        }
        if (files.length) {
          await uploadFiles('repair', rid, files);
          await reload('attachments');
        }
        await bump(vals.vehicle_id as string, vals.km as number | null, vals.date as string);
      }}
    />
  );
}

export function MaintForm({ id, vehicleId, onClose }: { id?: string; vehicleId?: string; onClose: () => void }) {
  const { vehicles, workshops, maintenance, insert, update, reload } = useData();
  const bump = useBump();
  const kmOk = useKmGuard();
  const m = id ? maintenance.find((x) => x.id === id) : undefined;
  return (
    <FormModal
      title={id ? 'Editar mantenimiento' : 'Nuevo mantenimiento'}
      onClose={onClose}
      initial={m ?? { vehicle_id: vehicleId || vehicles[0]?.id || '', date: todayStr() }}
      files={{ kind: 'maintenance', id }}
      fields={[
        { k: 'vehicle_id', l: 'Vehículo', t: 'select', options: vOpts(vehicles), req: true },
        { k: 'type', l: 'Tipo de mantenimiento', t: 'combo', options: MAINT_TYPES, req: true },
        { k: 'date', l: 'Fecha realizado', t: 'date', req: true, half: true },
        { k: 'km', l: 'Km al realizarlo', t: 'number', half: true },
        { k: 'workshop_id', l: 'Taller', t: 'select', options: wOpts(workshops), half: true },
        { k: 'cost', l: 'Costo ($)', t: 'number', step: '0.01', half: true },
        { k: 'next_date', l: 'Próxima fecha (opcional)', t: 'date', half: true },
        { k: 'next_km', l: 'Próximo a los (km, opcional)', t: 'number', half: true },
        { k: 'notes', l: 'Notas', t: 'textarea' },
      ]}
      onSave={async (vals, files) => {
        if (!kmOk(vals.vehicle_id as string, vals.km, vals.date as string, { table: 'maintenance', id })) throw new Error('Guardado cancelado: revisá el km indicado.');
        let mid = id;
        if (mid) {
          if (m?.type !== vals.type) await recordMaintenanceChange(mid, 'type', m?.type || null, vals.type as string);
          if (m?.date !== vals.date) await recordMaintenanceChange(mid, 'date', m?.date || null, vals.date as string);
          if (m?.cost !== vals.cost)
            await recordMaintenanceChange(mid, 'cost', String(m?.cost || ''), String(vals.cost || ''));
          await update('maintenance', mid, vals);
        } else {
          mid = (await insert<Maint>('maintenance', vals)).id;
        }
        if (files.length) {
          await uploadFiles('maintenance', mid, files);
          await reload('attachments');
        }
        await bump(
          vals.vehicle_id as string,
          vals.km as number | null,
          vals.date as string,
          /service/i.test(String(vals.type))
        );
      }}
    />
  );
}

export function FuelForm({ id, onClose }: { id?: string; onClose: () => void }) {
  const { vehicles, fuel_loads, insert, update } = useData();
  const f = id ? fuel_loads.find((x) => x.id === id) : undefined;
  return (
    <FormModal
      title={id ? 'Editar carga' : 'Nueva carga de combustible'}
      onClose={onClose}
      initial={f ?? { vehicle_id: vehicles[0]?.id, date: todayStr(), product: 'Infinia Diesel' }}
      fields={[
        { k: 'vehicle_id', l: 'Vehículo', t: 'select', options: vOpts(vehicles), req: true },
        { k: 'date', l: 'Fecha', t: 'date', req: true, half: true },
        { k: 'liters', l: 'Litros', t: 'number', step: '0.01', req: true, half: true },
        { k: 'amount', l: 'Importe sin IVA ($)', t: 'number', step: '0.01', half: true },
        { k: 'km', l: 'Km (odómetro válido)', t: 'number', half: true },
        {
          k: 'product',
          l: 'Producto',
          t: 'combo',
          options: ['Infinia', 'Infinia Diesel', 'Super', 'Ultra Diesel'],
          half: true,
        },
        { k: 'driver_name', l: 'Conductor', half: true },
        { k: 'station', l: 'Establecimiento' },
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
  const INFRACTION_TYPES = [
    'Exceso de velocidad',
    'Estacionamiento',
    'Documentación',
    'Seguridad',
    'Mantenimiento',
    'Otra',
  ];
  const STATUSES = ['Registrada', 'Pagada', 'Anulada'];
  return (
    <FormModal
      title={id ? 'Editar infracción' : 'Nueva infracción'}
      onClose={onClose}
      initial={inf ?? { date: todayStr(), status: 'Registrada' }}
      files={{ kind: 'infraction', id }}
      fields={[
        {
          k: 'driver_id',
          l: 'Conductor',
          t: 'select',
          options: [['', '— seleccionar —'], ...drivers.map((d): [string, string] => [d.id, d.name])],
          req: true,
          half: true,
        },
        { k: 'vehicle_id', l: 'Vehículo', t: 'select', options: vOpts(vehicles), req: true, half: true },
        { k: 'date', l: 'Fecha', t: 'date', req: true, half: true },
        { k: 'type', l: 'Tipo', t: 'combo', options: INFRACTION_TYPES, req: true, half: true },
        { k: 'infraction_number', l: 'N° de infracción', half: true },
        { k: 'location', l: 'Lugar', half: true },
        { k: 'description', l: 'Descripción', t: 'textarea' },
        { k: 'fine_amount', l: 'Monto de multa ($)', t: 'number', step: '0.01', half: true },
        { k: 'status', l: 'Estado', t: 'select', options: STATUSES, half: true },
        { k: 'notes', l: 'Notas', t: 'textarea' },
      ]}
      onSave={async (vals, files) => {
        let infId = id;
        if (infId) await update('infractions', infId, vals);
        else infId = (await insert<Infraction>('infractions', vals)).id;
        if (files.length) {
          await uploadFiles('infraction', infId, files);
          await reload('attachments');
        }
      }}
    />
  );
}

export function KmUpdateForm({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const { update, reload, trips, vehicles: allVeh } = useData();
  const twinPlates = twinsOf(vehicle.plate, confusablePairs(allVeh));
  const [newKm, setNewKm] = useState(vehicle.km?.toString() ?? '');
  // Fecha en que se LEYÓ el km en el tablero (puede ser anterior a hoy): evita mezclar lecturas de distintos días
  const [readDate, setReadDate] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const kmChange = vehicle.km !== null ? parseInt(newKm || '0') - vehicle.km : null;

  return (
    <div className="ov">
      <div className="md" style={{ maxWidth: '500px' }}>
        <h3>📊 Actualizar Kilometraje - {vehicle.plate}</h3>
        <div
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#f5f5f5',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        >
          <p style={{ margin: '0 0 8px 0' }}>
            <b>Kilometraje actual:</b> {vehicle.km ? vehicle.km.toLocaleString() : '0'} km
          </p>
          <p style={{ margin: '0' }}>
            <b>Última actualización:</b>{' '}
            {vehicle.km_date ? new Date(vehicle.km_date + 'T00:00:00').toLocaleDateString('es-AR') : 'Nunca'}
          </p>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (newKm === '' || isNaN(Number(newKm))) return alert('Ingresa un número válido');
            const num = Number(newKm);
            if (!readDate || readDate > todayStr()) return alert('La fecha de la lectura no puede estar vacía ni ser futura');
            if (vehicle.km_date && readDate < vehicle.km_date) {
              if (!confirm(`Esta lectura (${readDate.split('-').reverse().join('/')}) es ANTERIOR a la última registrada (${vehicle.km_date.split('-').reverse().join('/')}). Va a quedar como punto de partida desde esa fecha y se sumará el GPS posterior. ¿Continuar?`)) return;
            } else if (vehicle.km !== null && num < vehicle.km) {
              // Permitido (p. ej. un km inflado por GPS), pero con confirmación explícita
              if (!confirm(`El nuevo km (${num.toLocaleString('es-AR')}) es MENOR al actual (${vehicle.km.toLocaleString('es-AR')}). ¿Confirmás que el tablero marca ese valor?`)) return;
            } else if (vehicle.km !== null && num - vehicle.km > 5000) {
              if (!confirm(`El nuevo km sube ${(num - vehicle.km).toLocaleString('es-AR')} km de una vez. ¿Confirmás que el tablero marca ${num.toLocaleString('es-AR')}?`)) return;
            }
            setBusy(true);
            try {
              // km actual = lectura + km de GPS posteriores a la fecha de la lectura; km_date = hasta dónde llega ese dato
              const after = trips.filter((t) => t.vehicle_id === vehicle.id && t.date > readDate);
              const gpsAfter = after.reduce((s, t) => s + (Number(t.km_calc) || 0), 0);
              const kmNow = Math.round(num + gpsAfter);
              const kmDate = after.reduce((m, t) => (t.date > m ? t.date : m), readDate);
              await update('vehicles', vehicle.id, { km: kmNow, km_date: kmDate });
              await recordKmChange(vehicle.id, num, vehicle.km, 'manual', readDate);
              if (gpsAfter > 0) alert(`Lectura del ${readDate.split('-').reverse().join('/')}: ${num.toLocaleString('es-AR')} km.
Se sumaron ${Math.round(gpsAfter).toLocaleString('es-AR')} km de GPS posteriores: el km actual queda en ${kmNow.toLocaleString('es-AR')} (al ${kmDate.split('-').reverse().join('/')}).`);
              await reload('km_history');
              onClose();
            } catch (e) {
              alert('Error: ' + (e instanceof Error ? e.message : String(e)));
            } finally {
              setBusy(false);
            }
          }}
        >
          {twinPlates.length > 0 && (
            <div role="note" style={{ background: '#fff8e1', border: '1px solid #f1d98a', borderRadius: 8, padding: 8, marginBottom: 12, fontSize: 13 }}>
              <b>⚠ No mezclar datos:</b> {vehicle.plate} se puede confundir con <b>{twinPlates.join(', ')}</b>. Verificá que el km que vas a cargar sea realmente de {vehicle.plate}.
            </div>
          )}
          <div className="fg">
            <label htmlFor="km_date_input">Fecha en que se leyó el km del tablero *</label>
            <input id="km_date_input" type="date" value={readDate} max={todayStr()} onChange={(e) => setReadDate(e.target.value)} />
            <small className="muted">Si lo leíste hace unos días, poné ese día: el GPS posterior se suma desde esa fecha.</small>
          </div>
          <div className="fg">
            <label htmlFor="km_input">Nuevo kilometraje *</label>
            <input
              id="km_input"
              type="number"
              value={newKm}
              onChange={(e) => setNewKm(e.target.value)}
              placeholder="Ej: 125000"
              autoFocus
            />
          </div>

          {kmChange !== null && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px',
                backgroundColor: kmChange > 0 ? '#e8f5e9' : '#ffebee',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            >
              <p style={{ margin: '0' }}>
                <b>Cambio:</b>{' '}
                <span style={{ color: kmChange > 0 ? '#2e7d32' : '#c62828' }}>
                  {kmChange > 0 ? '+' : ''}
                  {kmChange.toLocaleString()} km
                </span>
              </p>
            </div>
          )}

          <div className="btns">
            <button type="button" className="b2" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="b1" disabled={busy}>
              {busy ? 'Guardando…' : 'Actualizar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export type { Repair, Maint, Infraction };
