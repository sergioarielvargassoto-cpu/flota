'use client';
import { useMemo, useState } from 'react';
import { detectColumns, type ColSpec } from '@/lib/excel';

export function ImportDialog({ title, rows, spec, onConfirm, onClose }: {
  title: string; rows: unknown[][]; spec: ColSpec[];
  onConfirm: (data: unknown[][], map: Record<string, number>) => Promise<void> | void;
  onClose: () => void;
}) {
  const det = useMemo(() => detectColumns(rows, spec), [rows, spec]);
  const [map, setMap] = useState<Record<string, number>>(det.guess);
  const [busy, setBusy] = useState(false);
  return (
    <div className="ov">
      <div className="md">
        <h3>{title} · confirmá las columnas</h3>
        <p className="muted">Detecté {rows.length - det.headerRow - 1} filas. Revisá que cada campo apunte a la columna correcta.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try { await onConfirm(rows.slice(det.headerRow + 1), map); onClose(); } finally { setBusy(false); }
          }}
        >
          {spec.map((s) => (
            <div className="fg" key={s.k}>
              <label>{s.l}</label>
              <select value={map[s.k]} onChange={(e) => setMap({ ...map, [s.k]: +e.target.value })}>
                <option value={-1}>— no usar —</option>
                {det.headers.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
              </select>
            </div>
          ))}
          <div className="btns">
            <button type="button" className="b2" onClick={onClose}>Cancelar</button>
            <button className="b1" disabled={busy}>{busy ? 'Importando…' : 'Importar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
