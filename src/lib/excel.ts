/** Abre el selector de archivos y devuelve las filas de la hoja con más datos (xlsx, xls o csv). */
export function pickSheet(): Promise<unknown[][] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' });
        let best: unknown[][] = [];
        for (const n of wb.SheetNames) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) as unknown[][];
          if (rows.length > best.length) best = rows;
        }
        if (best.length < 2) {
          alert('El archivo no tiene datos.');
          return resolve(null);
        }
        resolve(best);
      } catch (e) {
        alert('No pude leer el archivo: ' + (e instanceof Error ? e.message : String(e)));
        resolve(null);
      }
    };
    input.click();
  });
}

export type ColSpec = { k: string; l: string; re: RegExp };

/** Detecta la fila de encabezados y propone qué columna es cada campo. */
export function detectColumns(rows: unknown[][], spec: ColSpec[]) {
  const matchesSpec = (val: string) => spec.some((s) => s.re.test(val));
  let hi = 0;
  let best = -1;
  rows.slice(0, 25).forEach((r, i) => {
    const score = r.filter((c) => matchesSpec(String(c))).length * 10 + r.filter((c) => String(c).trim() !== '').length;
    if (score > best) {
      best = score;
      hi = i;
    }
  });
  const headers = rows[hi].map((c) => String(c).trim());
  const used = new Set<number>();
  const guess: Record<string, number> = {};
  for (const s of spec) {
    const j = headers.findIndex((h, i) => !used.has(i) && s.re.test(h.toLowerCase()));
    guess[s.k] = j;
    if (j >= 0) used.add(j);
  }
  return { headerRow: hi, headers, guess };
}
