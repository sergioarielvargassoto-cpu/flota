import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularAnalisisConductores, calcularAnalisisCostos } from '../src/lib/analisisHelpers.ts';

const V = (id: string, branch: string, driver_id: string) => ({ id, plate: id, branch, driver_id }) as any;
const vehicles = [V('v1', 'Corrientes', 'd1'), V('v2', 'Misiones', 'd2'), V('v3', 'Misiones', 'd1')];
const drivers = [
  { id: 'd1', name: 'Uno' },
  { id: 'd2', name: 'Dos' },
] as any[];
const infractions = [
  { id: 'i1', driver_id: 'd1', vehicle_id: 'v1', date: '2026-10-05', status: 'Registrada', fine_amount: 100 },
  { id: 'i2', driver_id: 'd1', vehicle_id: 'v3', date: '2026-10-06', status: 'Registrada', fine_amount: 50 },
] as any[];
const trips = [
  { vehicle_id: 'v1', date: '2026-10-01', km_calc: 100, max_speed: 90 },
  { vehicle_id: 'v3', date: '2026-10-02', km_calc: 300, max_speed: 90 },
] as any[];

test('conductores: sin sucursal se ven todos con todo su mes', () => {
  const r = calcularAnalisisConductores(drivers, infractions, trips, vehicles, [], 10, 2026);
  assert.equal(r.length, 2);
  const d1 = r.find((x) => x.driver_id === 'd1')!;
  assert.equal(d1.totalInfracciones, 2);
  assert.equal(d1.kmTotal, 400);
});

test('conductores: con sucursal sólo cuentan sus vehículos e infracciones', () => {
  const r = calcularAnalisisConductores(drivers, infractions, trips, vehicles, [], 10, 2026, 'Corrientes');
  assert.deepEqual(
    r.map((x) => x.driver_id),
    ['d1']
  );
  assert.equal(r[0].totalInfracciones, 1);
  assert.equal(r[0].kmTotal, 100);
  const m = calcularAnalisisConductores(drivers, infractions, trips, vehicles, [], 10, 2026, 'Misiones');
  assert.equal(m.length, 2);
  assert.equal(m.find((x) => x.driver_id === 'd1')!.kmTotal, 300);
});

test('costos: sin sucursal incluye vehículos de todas las sucursales', () => {
  const todas = calcularAnalisisCostos(vehicles, [], [], [], [], [], 10, 2026);
  const corr = calcularAnalisisCostos(vehicles, [], [], [], [], [], 10, 2026, 'Corrientes');
  assert.ok(todas.length >= corr.length);
  assert.ok(corr.every((c) => c.branch === 'Corrientes'));
});
