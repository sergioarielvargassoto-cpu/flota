/** Patente / texto normalizado: mayúsculas, sin espacios ni símbolos. */
export const nrm = (s: unknown): string => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const daysTo = (s: string | null | undefined): number | null =>
  s ? Math.round((+new Date(s + 'T00:00:00') - +new Date(todayStr() + 'T00:00:00')) / 864e5) : null;

export const fd = (s: string | null | undefined): string => (s ? s.split('-').reverse().join('/') : '—');

export const money = (n: number | string | null | undefined): string =>
  n === null || n === undefined || n === '' ? '—' : '$ ' + Number(n).toLocaleString('es-AR');

export const num = (n: number | string | null | undefined): string =>
  n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('es-AR');

/** Convierte "12.345,6", "1.234", "$ 1.234,50" o un número a number. NaN si no se puede. */
export function pNum(v: unknown): number {
  if (typeof v === 'number') return v;
  const raw = String(v ?? '').replace(/[^\d.,\-]/g, '');
  if (!raw) return NaN;
  if (raw.includes(',')) return parseFloat(raw.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) return parseFloat(raw.replace(/\./g, ''));
  return parseFloat(raw);
}

/** Convierte fechas de Excel (número de serie), "27/10/2026" o "2026-10-27 10:00" a "AAAA-MM-DD". */
export function pDate(v: unknown): string {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v === 'number' && v > 20000 && v < 80000)
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = '20' + y;
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}

/** Valida un odómetro contra el último km conocido: descarta errores de tipeo (1234, 100000…). */
export function okOdo(km: number | null, kmDate: string | null, fecha: string, odo: number): boolean {
  if (!isFinite(odo) || odo <= 0 || km === null || !kmDate) return false;
  const dd = Math.round((+new Date(fecha + 'T00:00:00') - +new Date(kmDate + 'T00:00:00')) / 864e5);
  const a = Math.max(1, Math.abs(dd)) * 700 + 1000;
  return dd >= 0 ? odo >= km - 300 && odo <= km + a : odo <= km + 300 && odo >= km - a;
}

export const isFuel = (product: string | null | undefined): boolean => !/azul|adblue/i.test(product ?? '');

export function download(name: string, data: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Ejecuta una acción y muestra un cartel si falla (errores de red, permisos, etc.). */
export async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
    alert('No se pudo completar la acción:\n' + msg);
    return undefined;
  }
}

export const DOC_VEHICLE_DEFAULT = [
  'SENASA',
  'Revisión Técnica Obligatoria (RTO)',
  'Habilitación Municipal de Transporte de Carga',
  'Seguro Automotor',
];
export const DOC_VEHICLE_ALL = [...DOC_VEHICLE_DEFAULT, 'Cédula (verde/azul)', 'Impuesto automotor (patente)', 'Habilitación CNRT', 'Matafuego', 'Registro de cámara frigorífica', 'Otro'];
export const DOC_DRIVER_DEFAULT = ['Licencia de conducir', 'LINTI', 'Libreta Sanitaria'];
export const DOC_DRIVER_ALL = [...DOC_DRIVER_DEFAULT, 'Psicofísico', 'Curso de manipulación de alimentos', 'Otro'];
export const MAINT_TYPES = [
  'Service (cada 10.000 km)', 'Cambio de aceite y filtros', 'Neumáticos', 'Frenos', 'Correa de distribución',
  'Batería', 'Alineación y balanceo', 'Tren delantero', 'Refrigeración / cámara', 'Otro',
];
