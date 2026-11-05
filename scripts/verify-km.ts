/** Regresión rápida de las reglas de km (sin base de datos). Uso: npx tsx scripts/verify-km.ts */
import { validateReading } from '../src/lib/kmValidate';
import { trajectoryOutliers, type TReading } from '../src/lib/kmTrajectory';

let fail = 0;
const t = (name: string, cond: boolean) => { if (!cond) fail++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}`); };
const V = 'v1';
const trips = Array.from({ length: 10 }, (_, i) => ({ vehicle_id: V, date: `2026-09-${String(i + 1).padStart(2, '0')}`, km_calc: 100, km_reported: 100 })) as any[];
const base = { trips, vehicleId: V, litros: 40, tankL: 60, gpsOk: true };

const a = { date: '2026-09-01', km: 10000, src: 'estación' as const };
t('avance coherente con GPS', validateReading({ ...base, anchor: a, fecha: '2026-09-05', odo: 10400, litros: 40 }).ok);
t('salto de +5000 km se descarta', !validateReading({ ...base, anchor: a, fecha: '2026-09-05', odo: 15000 }).ok);
t('retroceso grande se descarta', !validateReading({ ...base, anchor: a, fecha: '2026-09-05', odo: 9000 }).ok);
t('primera lectura se acepta', validateReading({ ...base, anchor: null, fecha: '2026-09-05', odo: 123 }).ok);
t('mismo día, retroceso chico (redondeo) ok', validateReading({ ...base, anchor: { ...a, src: 'manual' }, fecha: '2026-09-01', odo: 9900 }).ok);

const R = (date: string, km: number): TReading => ({ key: `${date}|${km}`, date, km, src: 'estación' });
const rs = [R('2026-09-01', 10000), R('2026-09-03', 10200), R('2026-09-05', 213000), R('2026-09-07', 10600), R('2026-09-09', 10800)];
const f = trajectoryOutliers(rs, trips, V, true);
t('tipeo 213000 detectado como atípica', f.length === 1 && f[0].key === '2026-09-05|213000' && f[0].level === 'atípica');
t('lecturas buenas no se marcan', trajectoryOutliers(rs.filter((r) => r.km < 20000), trips, V, true).length === 0);

console.log(fail ? `\n${fail} fallo(s)` : '\nTodo OK');
process.exit(fail ? 1 : 0);
