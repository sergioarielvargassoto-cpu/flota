'use client';
import { useEffect, useRef, useState } from 'react';
import { AttachmentList, type ParentKind } from './Attachments';

export type Field = {
  k: string;
  l: string;
  t?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'combo';
  req?: boolean;
  half?: boolean;
  step?: string;
  options?: (string | [string, string])[];
};
export type Values = Record<string, string | number | null>;

export function FormModal({
  title,
  fields,
  initial,
  onSave,
  onClose,
  files,
}: {
  title: string;
  fields: Field[];
  initial: Record<string, unknown>;
  onSave: (values: Values, files: File[]) => Promise<void>;
  onClose: () => void;
  /** Si se indica, el formulario permite adjuntar archivos (y muestra los ya adjuntos si el registro existe). */
  files?: { kind: ParentKind; id?: string };
}) {
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((f) => [f.k, initial[f.k] === null || initial[f.k] === undefined ? '' : String(initial[f.k])])
    )
  );
  const [staged, setStaged] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  // Evita el doble envío aunque el estado `busy` todavía no se haya pintado.
  const enCurso = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  const set = (k: string, v: string) => {
    setVals((p) => ({ ...p, [k]: v }));
    if (errorField === k) setFieldError(null);
  };

  // agrupa los campos "half" de a pares
  const rows: Field[][] = [];
  let buf: Field[] = [];
  for (const f of fields) {
    if (f.half) {
      buf.push(f);
      if (buf.length === 2) {
        rows.push(buf);
        buf = [];
      }
    } else {
      if (buf.length) {
        rows.push(buf);
        buf = [];
      }
      rows.push([f]);
    }
  }
  if (buf.length) rows.push(buf);

  const input = (f: Field) => {
    const v = vals[f.k];
    const id = 'f_' + f.k;
    const hasError = errorField === f.k;
    // aria-invalid pinta el borde de error (globals.css) y lo anuncia; el mensaje queda asociado con aria-describedby.
    const a11y = {
      'aria-invalid': hasError || undefined,
      'aria-describedby': hasError ? id + '_err' : undefined,
      'aria-required': f.req || undefined,
    } as const;

    if (f.t === 'select')
      return (
        <select id={id} {...a11y} value={v} onChange={(e) => set(f.k, e.target.value)}>
          {f.options!.map((o) => {
            const [val, lab] = Array.isArray(o) ? o : [o, o];
            return (
              <option key={val} value={val}>
                {lab}
              </option>
            );
          })}
        </select>
      );
    if (f.t === 'textarea')
      return <textarea id={id} {...a11y} rows={3} value={v} onChange={(e) => set(f.k, e.target.value)} />;
    if (f.t === 'combo')
      return (
        <>
          <input
            id={id}
            {...a11y}
            list={'dl_' + f.k}
            value={v}
            autoComplete="off"
            onChange={(e) => set(f.k, e.target.value)}
           
          />
          <datalist id={'dl_' + f.k}>
            {(f.options ?? []).map((o) => (
              <option key={String(o)} value={String(o)} />
            ))}
          </datalist>
        </>
      );
    return (
      <input
        id={id}
        {...a11y}
        type={f.t ?? 'text'}
        inputMode={f.t === 'number' ? 'decimal' : undefined}
        step={f.step}
        value={v}
        onChange={(e) => set(f.k, e.target.value)}
       
      />
    );
  };

  return (
    <div className="ov">
      <div className="md" role="dialog" aria-modal="true" aria-labelledby="fm-title">
        <h3 id="fm-title">{title}</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (enCurso.current) return;
            for (const f of fields) {
              if (f.req && !String(vals[f.k]).trim()) {
                setFieldError(`Completá «${f.l}»: es obligatorio.`);
                setErrorField(f.k);
                // mover el foco al primer campo con error
                requestAnimationFrame(() => document.getElementById('f_' + f.k)?.focus());
                return;
              }
            }
            setFieldError(null);
            const out: Values = {};
            for (const f of fields) {
              const raw = String(vals[f.k]).trim();
              out[f.k] = raw === '' ? null : f.t === 'number' ? Number(raw) : raw;
            }
            enCurso.current = true;
            setBusy(true);
            try {
              await onSave(out, staged);
              onClose();
            } catch (err) {
              setFieldError(
                'No se pudo guardar: ' +
                  (err instanceof Error ? err.message : ((err as { message?: string })?.message ?? String(err)))
              );
              setErrorField('_form');
            } finally {
              enCurso.current = false;
              setBusy(false);
            }
          }}
        >
          {rows.map((r, i) => {
            const cells = r.map((f) => (
              <div className="fg" key={f.k}>
                <label htmlFor={'f_' + f.k}>
                  {f.l}
                  {f.req ? ' *' : ''}
                </label>
                {input(f)}
                {fieldError && errorField === f.k && (
                  <div className="fg-err" id={'f_' + f.k + '_err'} role="alert">
                    {fieldError}
                  </div>
                )}
              </div>
            ));
            return r.length === 2 ? (
              <div className="row2" key={i}>
                {cells}
              </div>
            ) : (
              cells
            );
          })}
          {fieldError && errorField === '_form' && (
            <div className="err" role="alert">
              {fieldError}
            </div>
          )}
          {files && (
            <div className="fg">
              <label htmlFor="fm-files">Adjuntar copia (foto / PDF, máx. 10 MB)</label>
              <input
                id="fm-files"
                type="file"
                multiple
                onChange={(e) => {
                  setStaged([...staged, ...Array.from(e.target.files ?? [])]);
                  e.target.value = '';
                }}
              />
              <div className="files">
                {files.id && <AttachmentList kind={files.kind} id={files.id} editable />}
                {staged.map((f, i) => (
                  <span key={i}>
                    📎 {f.name}{' '}
                    <button
                      type="button"
                      className="b3 sm"
                      aria-label={`Quitar ${f.name}`}
                      onClick={() => setStaged(staged.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="btns">
            <button type="button" className="b2" onClick={onClose}>
              Cancelar
            </button>
            <button className="b1" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
