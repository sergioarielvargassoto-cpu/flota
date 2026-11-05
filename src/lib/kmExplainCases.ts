/**
 * Explicaciones automáticas para los demás tipos de caso de la auditoría de km. Todas devuelven la misma estructura
 * (qué vio el sistema / qué pudo haber pasado / qué hacer / qué efecto tiene), así cualquier anomalía nueva se explica igual.
 * Las causas son HIPÓTESIS según lo que muestran los datos; se confirman con el comprobante original.
 */
import type { TripLite } from './kmAudit';
import { pairOk, type TReading } from './kmTrajectory';
import type { Explanation, Neighbor } from './kmExplain';

const f = (n: number) => Math.round(n).toLocaleString('es-AR');
const fd = (d: string) => d.split('-').reverse().join('/');
const days = (a: string, b: string) => Math.round((+new Date(b + 'T00:00:00') - +new Date(a + 'T00:00:00')) / 864e5);

export type FleetReading = { plate: string; date: string; km: number };

/** Lectura de estación descartada al importar (tipeo, dato inventado, etc.). */
export function explainInvalidReading(p: {
  plate: string;
  date: string;
  declared: number;
  expected: number | null;
  station: string;
  driver: string;
  liters: number;
  neighbors: Neighbor[]; // lecturas válidas del mismo vehículo (cualquier fuente)
  fleet: FleetReading[]; // lecturas válidas de OTROS vehículos
}): Explanation {
  const seen: string[] = [];
  const causes: string[] = [];
  seen.push(`En la estación ${p.station.replace(/\s+/g, ' ')} (${fd(p.date)}) se declararon ${f(p.declared)} km para ${p.plate}, a nombre de ${p.driver}, con ${p.liters.toLocaleString('es-AR')} L.`);
  const prev = [...p.neighbors].reverse().find((x) => x.date <= p.date);
  const next = p.neighbors.find((x) => x.date >= p.date);
  if (prev) seen.push(`La lectura válida anterior es ${f(prev.km)} km (${fd(prev.date)}, ${prev.src}).`);
  if (next) seen.push(`La lectura válida siguiente es ${f(next.km)} km (${fd(next.date)}, ${next.src}).`);
  if (p.expected !== null) seen.push(`Por esas lecturas, ese día el vehículo debía rondar los ${f(p.expected)} km. Lo declarado difiere en ${f(Math.abs(p.declared - p.expected))} km.`);
  else if (!prev && !next) seen.push('Este vehículo no tiene otras lecturas válidas para comparar.');

  const a = String(p.declared);
  const e = p.expected !== null ? String(Math.round(p.expected)) : null;
  if (e && a.length < e.length) causes.push(`Tiene ${e.length - a.length} dígito(s) menos que el valor esperable (${f(p.expected as number)}): parece incompleto o cortado al tipear (por ejemplo “123”).`);
  if (e && a.length > e.length) causes.push(`Tiene ${a.length - e.length} dígito(s) de más que el valor esperable (${f(p.expected as number)}): dígito repetido o de más al tipear.`);
  if (e && a.length === e.length) {
    const diff = [...a].filter((ch, i) => ch !== e[i]).length;
    if (diff === 1) causes.push(`Difiere del valor esperable (${f(p.expected as number)}) en un solo dígito: error de tipeo.`);
  }
  if (/^(\d)\1+$/.test(a) || a === '12345' || a === '1234' || a === '123456' || p.declared % 10000 === 0)
    causes.push(`${f(p.declared)} es un número “de relleno” (secuencia o redondo): típico de cuando no se mira el tablero y se dice cualquier valor para poder cargar.`);
  if (prev && Math.abs(p.declared - prev.km) <= 3 && p.date !== prev.date) causes.push(`Repite el km de la carga anterior (${f(prev.km)}): no se actualizó el dato y se volvió a decir el mismo.`);
  if (prev && p.declared < prev.km) causes.push(`Es ${f(prev.km - p.declared)} km MENOR que la lectura anterior (${f(prev.km)} el ${fd(prev.date)}): el odómetro no baja, así que hubo un error al tipearlo o se leyó otro dato.`);
  if (prev && p.declared > prev.km) {
    const dd = Math.max(1, days(prev.date, p.date));
    if (p.declared - prev.km > dd * 700 + 1000) causes.push(`Desde la lectura anterior (${f(prev.km)} el ${fd(prev.date)}) habría recorrido ${f(p.declared - prev.km)} km en ${dd} día(s), más de lo físicamente posible (≈ 700 km por día).`);
  }
  if (next) {
    const dd = Math.max(1, days(p.date, next.date));
    if (next.km < p.declared) causes.push(`La lectura válida siguiente (${f(next.km)} el ${fd(next.date)}) es MENOR: el odómetro no puede bajar, así que este valor no es posible.`);
    else if (next.km - p.declared > dd * 700 + 1000) causes.push(`Para llegar de ${f(p.declared)} a ${f(next.km)} (${fd(next.date)}) tendría que haber recorrido ${f(next.km - p.declared)} km en ${dd} día(s) (≈ ${f((next.km - p.declared) / dd)} km por día): imposible.`);
  }
  const other = p.fleet.find((x) => x.plate !== p.plate && Math.abs(x.km - p.declared) <= 300 && Math.abs(days(x.date, p.date)) <= 7);
  if (other) causes.push(`Coincide (±300 km) con el odómetro de ${other.plate} (${f(other.km)} km el ${fd(other.date)}): puede que la carga sea de ese otro vehículo y se haya cargado con esta patente.`);
  if (!causes.length) causes.push('No hay un patrón evidente. Puede ser un error de tipeo del playero o un dato que no se informó bien.');
  causes.push('Verificar también que la carga sea realmente de ESTE vehículo: con YPF en Ruta cada tarjeta está asociada a un vehículo, así que es poco probable, pero puede haberse usado la tarjeta de otro vehículo o tipeado mal la patente. Que el km encaje con el GPS de este vehículo NO prueba que la carga sea suya.');
  return {
    seen,
    causes,
    todo: [
      'No hace falta corregir nada para que el sistema funcione: la carga se guarda (los litros y el importe cuentan) pero el km no se usa. Aunque el km encaje con el GPS, NO se lo da por válido hasta confirmar con el comprobante que la carga es de este vehículo.',
      'Si se conoce el km real (foto del tablero o remito), corregirlo en Combustible → Editar para que pase a ser una lectura válida.',
      'Si se repite con la misma estación o el mismo vehículo, hablar con el playero o el chofer: el Informe muestra cuántas lecturas inválidas tiene cada uno.',
    ],
    impact: ['El km no se usa para controlar consumo ni mantenimiento. Los litros sí cuentan en el gasto y en el consumo del período.'],
  };
}

/** Tramo entre dos cargas cuyo avance de odómetro no cabe en el rango de GPS. */
export function explainPair(p: {
  plate: string;
  prev: { date: string; km: number };
  cur: { date: string; km: number };
  dKm: number;
  gpsMin: number | null;
  gpsMax: number | null;
  gpsDiff: number | null;
  sameDay: boolean;
  others: Neighbor[]; // las demás lecturas válidas del vehículo
  trips: TripLite[];
  vehicleId: string;
  gpsReliable: boolean;
  trustNote?: string;
}): Explanation {
  const seen: string[] = [];
  const causes: string[] = [];
  const todo: string[] = [];
  seen.push(`Entre el ${fd(p.prev.date)} (${f(p.prev.km)} km) y el ${fd(p.cur.date)} (${f(p.cur.km)} km) el odómetro avanzó ${f(p.dKm)} km.`);
  if (p.sameDay) {
    seen.push('Las dos cargas son del mismo día y no traen hora, así que el orden real es incierto.');
    causes.push('Con dos cargas el mismo día se ordenan por odómetro; si el playero tipeó mal una, el tramo no se puede interpretar.');
    todo.push('Ver la hora de cada carga en el remito o en la app de YPF para confirmar cuál fue primera.');
  }
  if (p.gpsMin !== null && p.gpsMax !== null && p.gpsDiff) {
    seen.push(`El GPS permite entre ${f(p.gpsMin)} y ${f(p.gpsMax)} km en esos días (mínimo = días completos; máximo = incluye los dos días de las cargas).`);
    const need = Math.abs(p.gpsDiff);
    seen.push(`El odómetro queda ${f(need)} km ${p.gpsDiff < 0 ? 'por debajo del mínimo' : 'por encima del máximo'}.`);
    const first = p.trips.length ? p.trips.reduce((m, t) => (t.date < m ? t.date : m), p.trips[0].date) : null;
    const last = p.trips.length ? p.trips.reduce((m, t) => (t.date > m ? t.date : m), p.trips[0].date) : null;
    const gps = { ok: p.gpsReliable, first, last };
    const agree = (r: TReading) =>
      p.others.filter((o) => {
        const x: TReading = { key: 'o', date: o.date, km: o.km, src: 'estación' };
        return o.date <= r.date ? pairOk(x, r, p.trips, p.vehicleId, gps) : pairOk(r, x, p.trips, p.vehicleId, gps);
      }).length;
    const A = agree({ key: 'a', date: p.prev.date, km: p.prev.km, src: 'estación' });
    const B = agree({ key: 'b', date: p.cur.date, km: p.cur.km, src: 'estación' });
    const total = p.others.length;
    if (total >= 2) {
      if (A < B) causes.push(`Indicio estadístico: la lectura del ${fd(p.prev.date)} (${f(p.prev.km)}) concuerda con ${A} de las otras ${total} lecturas y la del ${fd(p.cur.date)} con ${B}, así que los datos apuntan más a que la primera sea la mal cargada. No es una prueba: si el responsable conoce otro dato, manda ese.`);
      else if (B < A) causes.push(`Indicio estadístico: la lectura del ${fd(p.cur.date)} (${f(p.cur.km)}) concuerda con ${B} de las otras ${total} lecturas y la del ${fd(p.prev.date)} con ${A}, así que los datos apuntan más a que la segunda sea la mal cargada. No es una prueba: si el responsable conoce otro dato, manda ese.`);
      else causes.push(`Las dos lecturas concuerdan por igual con las demás (${A} de ${total}): con estos datos no se puede saber cuál de las dos está mal.`);
    }
    causes.push(
      p.gpsDiff < 0
        ? `Para que el tramo cierre con el GPS, la lectura del ${fd(p.prev.date)} tendría que ser al menos ${f(need)} km más baja, o la del ${fd(p.cur.date)} al menos ${f(need)} km más alta.`
        : `Para que cierre, la lectura del ${fd(p.cur.date)} tendría que ser al menos ${f(need)} km más baja, o la del ${fd(p.prev.date)} al menos ${f(need)} km más alta. También puede ser que el GPS no haya registrado parte del recorrido (sin señal, equipo desconectado).`
    );
    if (p.trustNote) causes.push(p.trustNote);
    todo.push('Revisar los remitos de las dos cargas (km y hora) y, si hay dudas, la foto del tablero.');
    todo.push('Si el GPS tuvo un corte esos días, no es un error del odómetro: verificar en Gestya el historial del equipo.');
  }
  if (!causes.length) causes.push('Sin patrón evidente: revisar los comprobantes.');
  if (!todo.length) todo.push('Revisar los comprobantes de las dos cargas.');
  return { seen, causes, todo, impact: ['Mientras no se aclare, este tramo no sirve para medir el consumo (L/100 km) con confianza.'] };
}

/** Consumo del mes de un vehículo fuera de su referencia. */
export function explainConsumption(p: {
  plate: string;
  l100: number;
  ref: number;
  devPct: number;
  band: number | null;
  odoKm: number | null;
  gpsMin: number | null;
  gpsMax: number | null;
  winLiters: number | null;
  rejected: number;
  fills: number;
  tankCap: number;
  drivers: string[];
}): Explanation {
  const high = p.devPct > 0;
  const one = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
  const seen = [
    `${p.plate} consumió ${one(p.l100)} L/100 km contra ${one(p.ref)} de referencia (${p.devPct > 0 ? '+' : ''}${Math.round(p.devPct)} %).`,
    p.odoKm !== null && p.winLiters !== null ? `Se calculó con ${f(p.winLiters)} L cargados en ${f(p.odoKm)} km de odómetro entre la primera y la última carga válida (${p.fills} cargas en el mes).` : '',
    p.band !== null ? `Por no saber con cuánto combustible salió el vehículo, la medida tiene un margen de ±${one(p.band)} L/100 km (capacidad estimada ${f(p.tankCap)} L ÷ km).` : '',
  ].filter(Boolean);
  const causes: string[] = [];
  if (p.gpsMin !== null && p.gpsMax !== null && p.odoKm !== null) {
    if (p.odoKm > p.gpsMax) causes.push(`El odómetro (${f(p.odoKm)} km) supera el máximo del GPS (${f(p.gpsMax)}): con km inflados el consumo parece BAJO; si el GPS no registró parte del recorrido, también.`);
    else if (p.odoKm < p.gpsMin) causes.push(`El odómetro (${f(p.odoKm)} km) es menor que el mínimo del GPS (${f(p.gpsMin)}): con km de menos, el consumo parece ALTO sin serlo.`);
    else causes.push(`Odómetro y GPS coinciden (${f(p.odoKm)} km dentro de ${f(p.gpsMin)}–${f(p.gpsMax)}), así que los km no explican el desvío.`);
  }
  if (p.rejected > 0) causes.push(`Hay ${p.rejected} carga(s) con km inválido en el período: sus litros cuentan pero el tramo de odómetro puede quedar mal medido.`);
  causes.push(
    high
      ? 'Consumo alto real: carga o rutas distintas al mes anterior, tránsito urbano, problema mecánico (inyectores, neumáticos, frenos) o combustible que no se usó en el vehículo (bidones, otro vehículo).'
      : 'Consumo bajo: lo más común es un odómetro de más (o un GPS que no cubrió todo) y no un ahorro real. Menos frecuente: litros no registrados.'
  );
  if (p.drivers.length > 1) causes.push(`Cargaron ${p.drivers.length} conductores (${p.drivers.slice(0, 4).join(', ')}): distintos estilos de manejo o cargas a medias entre turnos mueven el consumo.`);
  return {
    seen,
    causes,
    todo: ['Comparar con el mes anterior del mismo vehículo y con vehículos del mismo tipo (Informe → Por vehículo).', 'Revisar las lecturas inválidas del vehículo y los tramos entre cargas en esta misma pantalla.', 'Si el desvío persiste dos meses seguidos, pedir una revisión mecánica o controlar el uso del combustible.'],
    impact: ['Es un indicio, no una prueba: el consumo de un mes con pocas cargas tiene mucho margen de error. Se vuelve más confiable con más meses.'],
  };
}

/** GPS poco confiable de un vehículo. */
export function explainGps(p: { plate: string; ratio: number | null; n: number; zeroDays: number; totalDays: number }): Explanation {
  return {
    seen: [
      `Comparando el odómetro (estaciones) con el GPS en ${p.n} tramos de ${p.plate}, el cociente odómetro ÷ GPS da ${p.ratio === null ? 'un valor muy alto (el GPS casi no registró)' : p.ratio.toLocaleString('es-AR', { maximumFractionDigits: 2 })}. Lo normal en la flota es 0,93 a 1,09.`,
      `El GPS marca ${p.zeroDays} días de ${p.totalDays} con menos de 5 km.`,
    ],
    causes: [
      'Equipo Gestya sin alimentación (batería desconectada o cortada), sin señal o dado de baja en la plataforma.',
      'El equipo funciona a tramos: registra algunos días y otros no.',
      'El vehículo usa otro equipo o fue reasignado y el reporte de Gestya trae la patente equivocada.',
    ],
    todo: ['Revisar en Gestya si el equipo informa posición y última conexión.', 'Mientras tanto el sistema NO descarta lecturas de este vehículo por su GPS: se miden solo por plausibilidad.', 'Los datos de los días caídos no se recuperan: el odómetro de las estaciones es la referencia.'],
    impact: ['El km de este vehículo se arma con lecturas del tablero; el GPS no puede auditarlo hasta que se repare el equipo.'],
  };
}
