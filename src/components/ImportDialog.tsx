'use client';
import { useEffect, useMemo, useState } from 'react';
import { detectColumns, type ColSpec } from '@/lib/excel';

export function ImportDialog({
  title,
  rows,
  spec,
  onConfirm,
  onClose,
}: {
  title: string;
  rows: unknown[][];
  spec: ColSpec[];
  onConfirm: (data: unknown[][], map: Record<string, number>) => Promise<void> | void;
  onClose: () => void;
}) {
  const det = useMemo(() => detectColumns(rows, spec), [rows, spec]);
  const [map, setMap] = useState<Record<string, number>>(det.guess);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  return (
    <div className="ov">
      <div className="md" role="dialog" aria-modal="true" aria-labelledby="imp-title">
        <h3 id="imp-title">{title} · confirmá las columnas</h3>
        <p className="muted">
          Detecté {rows.length - det.headerRow - 1} filas. Revisá que cada campo apunte a la columna correcta.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr('');
            try {
              await onConfirm(rows.slice(det.headerRow + 1), map);
              onClose();
            } catch (ex) {
              setErr(ex instanceof Error ? ex.message : String(ex));
            } finally {
              setBusy(false);
            }
          }}
        >
          {err && (
            <div className="err" role="alert">
              No se pudo importar: {err}
            </div>
          )}
          {spec.map((s) => (
            <div className="fg" key={s.k}>
              <label htmlFor={'imp_' + s.k}>{s.l}</label>
              <select id={'imp_' + s.k} value={map[s.k]} onChange={(e) => setMap({ ...map, [s.k]: +e.target.value })}>
                <option value={-1}>— no usar —</option>
                {det.headers.map((h, i) => (
                  <option key={`${i}-${h}`} value={i}>
                    {h || `Columna ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="btns">
            <button type="button" className="b2" onClick={onClose}>
              Cancelar
            </button>
            <button className="b1" disabled={busy}>
              {busy ? 'Importando…' : 'Importar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
