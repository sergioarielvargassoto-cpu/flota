/**
 * Orden de antigüedad de patentes argentinas (dominios), de la más nueva a la más vieja.
 *
 * - Mercosur "AA123BB" (desde abril 2016): avanzan las dos primeras letras (AA → AB → … → AH → AI),
 *   dentro de cada par avanza el número (AG000AA en 2023, AG650AA en 2024) y las dos últimas letras
 *   giran más rápido. Clave: par inicial, número, par final.
 * - "ABC123" (1995–2016): orden alfabético de las letras (AAA en 1995 … PM en 2016), luego el número.
 * - "A1234567" (antes de 1995): la letra es la provincia, no el año; sólo se ordena por número y van al final.
 * - Cualquier otro texto: después de todas, desempatado por el año del modelo si se conoce.
 * El orden es aproximado (es el orden de asignación del dominio, no el año de fabricación).
 */

export type FormatoPatente = 'mercosur' | 'abc123' | 'antigua' | 'desconocido';

export function normalizarPatente(p: string | null | undefined): string {
  return (p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatoPatente(p: string | null | undefined): FormatoPatente {
  const s = normalizarPatente(p);
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(s)) return 'mercosur';
  if (/^[A-Z]{3}\d{3}$/.test(s)) return 'abc123';
  if (/^[A-Z]\d{6,7}$/.test(s)) return 'antigua';
  return 'desconocido';
}

const RANGO: Record<FormatoPatente, number> = { mercosur: 3, abc123: 2, antigua: 1, desconocido: 0 };

/** Clave comparable: mayor = más nueva. */
export function clavePatente(p: string | null | undefined): [number, string] {
  const s = normalizarPatente(p);
  const f = formatoPatente(s);
  if (f === 'mercosur') return [RANGO[f], s.slice(0, 2) + s.slice(2, 5) + s.slice(5, 7)];
  if (f === 'antigua') return [RANGO[f], s.slice(1).padStart(7, '0')];
  return [RANGO[f], s];
}

/** Comparador para `sort`: de la más nueva a la más vieja. */
export function compararPatenteNuevaPrimero(
  a: { plate: string | null; year?: number | null },
  b: { plate: string | null; year?: number | null }
): number {
  const [ra, ka] = clavePatente(a.plate);
  const [rb, kb] = clavePatente(b.plate);
  if (ra !== rb) return rb - ra;
  if (ra === 0) {
    const ya = a.year ?? -Infinity;
    const yb = b.year ?? -Infinity;
    if (ya !== yb) return yb > ya ? 1 : -1;
  }
  return ka < kb ? 1 : ka > kb ? -1 : 0;
}

export function ordenarNuevaPrimero<T extends { plate: string | null; year?: number | null }>(lista: T[]): T[] {
  return [...lista].sort(compararPatenteNuevaPrimero);
}
