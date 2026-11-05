/**
 * Explicación en lenguaje claro de por qué una lectura de km "no encaja" y qué se puede hacer.
 * Se genera sola a partir de los datos (lecturas vecinas, GPS, intervalo de service), así sirve para casos parecidos a futuro.
 * Las causas son HIPÓTESIS ordenadas por lo que muestran los datos; confirmarlas con la factura/remito del taller o de la estación.
 */
import { gpsRange, type TripLite } from './kmAudit';
import { OKODO_BASE_KM, OKODO_KM_PER_DAY } from './params';

export type Neighbor = { date: string; km: number; src: string };
export type CaseInput = {
  plate: string;
  date: string;
  km: number;
  src: 'estación' | 'manual' | 'mantenimiento' | 'reparación';
  label?: string; // tipo de mantenimiento o descripción de la reparación
  level: 'atípica' | 'dudosa';
  agree: number;
  of: number;
  neighbors: Neighbor[]; // todas las demás lecturas del vehículo, en orden cronológico
  expectedLo?: number;
  expectedHi?: number;
  trips: TripLite[];
  vehicleId: string;
  gpsReliable: boolean;
  serviceKm: number; // intervalo de service configurado
  lastServiceKm: number | null; // "km del último service" que figura en la ficha
  currentKm: number | null;
  isService: boolean;
};
export type Explanation = { seen: string[]; causes: string[]; todo: string[]; impact: string[] };

const f = (n: number) => Math.round(n).toLocaleString('es-AR');
const fd = (d: string) => d.split('-').reverse().join('/');
const days = (a: string, b: string) => Math.round((+new Date(b + 'T00:00:00') - +new Date(a + 'T00:00:00')) / 864e5);

/** Fechas en las que ESTE km sí encajaría con las lecturas vecinas (por si la fecha del registro está mal). */
function fittingDates(c: CaseInput): string[] {
  const nb = c.neighbors;
  if (nb.length < 2) return [];
  const first = nb[0].date;
  const last = nb[nb.length - 1].date;
  const out: string[] = [];
  for (let t = new Date(first + 'T00:00:00').getTime(); t <= new Date(last + 'T00:00:00').getTime(); t += 864e5) {
    const d = new Date(t).toLocaleDateString('en-CA');
    const prev = [...nb].reverse().find((x) => x.date < d);
    const next = nb.find((x) => x.date > d);
    if (!prev || !next) continue;
    const okPrev = (() => {
      const delta = c.km - prev.km;
      if (c.gpsReliable) {
        const r = gpsRange(c.trips, c.vehicleId, prev.date, d);
        return delta >= r.min - 120 && delta <= r.max + 120;
      }
      return delta >= -500 && delta <= days(prev.date, d) * OKODO_KM_PER_DAY + OKODO_BASE_KM;
    })();
    const okNext = (() => {
      const delta = next.km - c.km;
      if (c.gpsReliable) {
        const r = gpsRange(c.trips, c.vehicleId, d, next.date);
        return delta >= r.min - 120 && delta <= r.max + 120;
      }
      return delta >= -500 && delta <= days(d, next.date) * OKODO_KM_PER_DAY + OKODO_BASE_KM;
    })();
    if (okPrev && okNext) out.push(d);
  }
  return out;
}

export function explainCase(c: CaseInput): Explanation {
  const mid = c.expectedLo !== undefined && c.expectedHi !== undefined ? (c.expectedLo + c.expectedHi) / 2 : null;
  c = { ...c, label: c.label?.replace(/\s+/g, ' ').trim() };
  const seen: string[] = [];
  const causes: string[] = [];
  const todo: string[] = [];
  const impact: string[] = [];

  // ---- Qué vio el sistema ----
  seen.push(
    `${c.plate} tiene cargado ${f(c.km)} km el ${fd(c.date)} (${c.src}${c.label ? `: ${c.label}` : ''}). Se lo comparó con ${c.of} lecturas vecinas del mismo vehículo y concuerda con ${c.agree}.`
  );
  const before = [...c.neighbors].reverse().filter((x) => x.date <= c.date).slice(0, 2).reverse();
  const after = c.neighbors.filter((x) => x.date >= c.date).slice(0, 2);
  const list = [...before, ...after].map((x) => `${f(x.km)} km el ${fd(x.date)} (${x.src})`);
  if (list.length) seen.push(`Las lecturas más cercanas son: ${list.join(' · ')}.`);
  if (c.expectedLo !== undefined && c.expectedHi !== undefined) {
    const off = c.km < c.expectedLo ? c.km - c.expectedLo : c.km > c.expectedHi ? c.km - c.expectedHi : 0;
    seen.push(
      `Según esas lecturas y el GPS, ese día el vehículo debía tener entre ${f(c.expectedLo)} y ${f(c.expectedHi)} km. ` +
        (off !== 0 ? `Lo cargado queda ${f(Math.abs(off))} km ${off < 0 ? 'POR DEBAJO' : 'POR ENCIMA'} de ese rango.` : 'Lo cargado cae cerca del borde del rango.')
    );
  }

  // ---- Causas probables (hipótesis a confirmar) ----
  const round500 = c.km % 500 === 0;
  const roundMinus1 = (c.km + 1) % 1000 === 0 || (c.km + 1) % 500 === 0; // p. ej. 134.999
  const exactSvc = c.km % 5000 === 0;
  const nearSvc = (c.km + 1) % 5000 === 0 || (c.km + 2) % 5000 === 0; // p. ej. 134.999
  if (c.isService && exactSvc)
    causes.push(
      `Es un service y el km cargado (${f(c.km)}) es un múltiplo de 5.000: coincide con el km al que el service estaba PROGRAMADO. Es muy común cargar ese km en vez del que marcaba el tablero cuando realmente se hizo (sobre todo si se hizo tarde).`
    );
  else if (nearSvc)
    causes.push(
      `${f(c.km)} está a ${5000 - (c.km % 5000)} km de ${f(c.km + (5000 - (c.km % 5000)))}, un km típico de service programado (múltiplo de 5.000): puede que se haya cargado el km al que correspondía un service y no el que marcaba el tablero ese día.`
    );
  else if (round500 || roundMinus1)
    causes.push(
      `${f(c.km)} es un número redondo (múltiplo de 500 o a un paso de serlo): suele ser un km aproximado o "de memoria", no la lectura exacta del tablero.`
    );
  if (mid !== null) {
    const a = String(Math.round(c.km)),
      b = String(Math.round(mid));
    if (a.length === b.length) {
      const diffDigits = [...a].filter((ch, i) => ch !== b[i]).length;
      if (diffDigits === 1) causes.push(`Difiere del valor esperable (≈ ${f(mid)}) en UN solo dígito: error de tipeo probable.`);
      else if (diffDigits === 2 && [...a].sort().join('') === [...b].sort().join('')) causes.push(`Tiene los mismos dígitos que el valor esperable (≈ ${f(mid)}) en otro orden: dígitos cambiados de lugar.`);
    } else if (a.length === b.length + 1 || a.length + 1 === b.length) {
      causes.push(`Tiene un dígito de más o de menos respecto del valor esperable (≈ ${f(mid)}): error de tipeo probable.`);
    }
  }
  const dates = fittingDates(c).filter((d) => Math.abs(days(c.date, d)) <= 21);
  if (dates.length && dates.length < 40) {
    const lo = dates[0],
      hi = dates[dates.length - 1];
    causes.push(
      `Con ese mismo km, la fecha que SÍ encajaría con las demás lecturas es ${lo === hi ? fd(lo) : `entre el ${fd(lo)} y el ${fd(hi)}`}: puede que la fecha del registro esté mal y no el km.`
    );
  }
  // Anotaciones de taller seguidas, redondeadas y en orden que no puede ser (el odómetro no baja)
  if (c.src === 'mantenimiento' || c.src === 'reparación') {
    const near = c.neighbors.filter((x) => (x.src === 'mantenimiento' || x.src === 'reparación') && Math.abs(days(c.date, x.date)) <= 7);
    const all = [...near, { date: c.date, km: c.km, src: c.src }].sort((a, b) => a.date.localeCompare(b.date));
    const rounded = all.every((x) => x.km % 500 === 0);
    const dec = all.some((x, i) => i > 0 && x.km < all[i - 1].km);
    if (all.length >= 3 && rounded && dec)
      causes.push(
        `Las anotaciones de taller de esos días (${all.map((x) => `${f(x.km)} el ${fd(x.date)}`).join(' → ')}) son todas redondeadas a 500 y NO están en orden creciente: el odómetro no puede bajar, así que son valores aproximados y no lecturas exactas del tablero. La diferencia real es chica (hasta ±500 km).`
      );
  }
  if (c.src === 'estación') causes.push('Verificar también que la carga sea realmente de este vehículo: con YPF en Ruta cada tarjeta está asociada a un vehículo, así que es poco probable, pero puede haberse usado la tarjeta de otro o tipeado mal la patente.');
  if (!causes.length) causes.push('No hay un patrón evidente en el número ni en la fecha. Hay que revisar el comprobante original (factura, remito o fotografía del tablero).');

  // ---- Qué hacer ----
  todo.push('Buscar el comprobante original (factura del taller, remito de la estación o foto del tablero) y confirmar el km real y la fecha.');
  todo.push(
    c.src === 'estación'
      ? 'Si fue un error de la estación, dejar la carga como está (queda como lectura inválida y no se usa); si se conoce el km real, se puede corregir en Combustible → Editar.'
      : `Corregir el km en ${c.src === 'mantenimiento' ? 'Mantenimientos' : c.src === 'reparación' ? 'Reparaciones' : 'la ficha del vehículo'} (botón Editar del registro). Al guardarlo, el sistema recalcula solo el km del vehículo.`
  );
  todo.push('Si el responsable sabe qué pasó, dejarlo anotado en el campo Notas del registro: así queda documentado para el futuro.');

  // ---- Impacto ----
  if (c.isService && c.lastServiceKm !== null && mid !== null) {
    const nowDue = c.lastServiceKm + c.serviceKm;
    const realDue = Math.round(mid) + c.serviceKm;
    impact.push(
      `El "km del último service" del vehículo quedó en ${f(c.lastServiceKm)}, así que figura el próximo service a los ${f(nowDue)} km. Si el service se hizo realmente cerca de ${f(mid)} km, el próximo correspondería a ≈ ${f(realDue)} km (${f(realDue - nowDue)} km ${realDue > nowDue ? 'más adelante' : 'antes'}).`
    );
    if (c.currentKm !== null)
      impact.push(`Con el km actual (${f(c.currentKm)}), faltarían ${f(nowDue - c.currentKm)} km según la ficha y ≈ ${f(realDue - c.currentKm)} km con el dato corregido.`);
  } else {
    impact.push('Afecta la calidad de las comparaciones: mientras este dato esté mal, otras lecturas cercanas pueden marcarse como dudosas por contraste con él.');
  }
  return { seen, causes, todo, impact };
}
