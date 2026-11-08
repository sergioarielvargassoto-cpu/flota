'use client';
import { useState } from 'react';
import { useData } from '@/lib/data';
import { useSession } from '@/components/AuthGate';
import { sb } from '@/lib/supabase';
import { download, guard, todayStr } from '@/lib/util';
import { auditKmConsistency } from '@/lib/audit';
import { systemAudit } from '@/lib/system-audit';

/** Severidad de la auditoría → insignia de la paleta (siempre con texto). */
const SEV: Record<string, { cls: string; label: string }> = {
  critical: { cls: 'vencido', label: 'Crítico' },
  warning: { cls: 'urgente', label: 'Advertencia' },
  info: { cls: 'nd', label: 'Info' },
};
const sevOf = (k: string) => SEV[k] ?? SEV.info;

export default function Ajustes() {
  const d = useData();
  const session = useSession();
  const { settings: s, saveSettings } = d;
  const [perm, setPerm] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'no disponible'
  );
  const [lastBackup, setLastBackup] = useState(() => {
    try {
      return Number(localStorage.getItem('lastBackup') || 0);
    } catch {
      return 0;
    }
  });
  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [systemAuditResult, setSystemAuditResult] = useState<any>(null);
  const [systemAuditLoading, setSystemAuditLoading] = useState(false);

  const numField = (k: 'd1' | 'd2' | 'd3' | 'km_alert' | 'service_km', label: string, min = 1) => (
    <div className="fg" key={k}>
      <label htmlFor={'set_' + k}>{label}</label>
      <input
        id={'set_' + k}
        type="number"
        inputMode="numeric"
        min={min}
        defaultValue={s[k]}
        onBlur={(e) => {
          const n = Math.max(min, Number(e.target.value) || min);
          if (n !== s[k]) guard(() => saveSettings({ [k]: n }));
        }}
      />
    </div>
  );

  const exportBackup = () => {
    const out = {
      exportado: new Date().toISOString(),
      settings: s,
      vehicles: d.vehicles,
      drivers: d.drivers,
      documents: d.documents,
      workshops: d.workshops,
      repairs: d.repairs,
      maintenance: d.maintenance,
      fuel_loads: d.fuel_loads,
      trips: d.trips,
      attachments: d.attachments.map(({ id, document_id, repair_id, maintenance_id, name }) => ({
        id,
        document_id,
        repair_id,
        maintenance_id,
        name,
      })),
    };
    download(`respaldo_flota_${todayStr()}.json`, JSON.stringify(out), 'application/json');
    try {
      const t = Date.now();
      localStorage.setItem('lastBackup', String(t));
      setLastBackup(t);
    } catch {
      /* sin storage */
    }
  };

  return (
    <>
      <h2>Ajustes y respaldo</h2>
      <div className="set">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Empresa</h3>
          <div className="fg">
            <label htmlFor="set_company">Nombre (se muestra arriba)</label>
            <input
              id="set_company"
              defaultValue={s.company}
              onBlur={(e) => {
                if (e.target.value !== s.company) guard(() => saveSettings({ company: e.target.value }));
              }}
            />
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Avisos de vencimiento (días antes)</h3>
          <div className="row2">
            {numField('d1', 'Aviso próximo')}
            {numField('d2', 'Aviso urgente')}
            {numField('d3', 'Aviso crítico')}
            {numField('km_alert', 'Aviso por km (faltando)', 0)}
            {numField('service_km', 'Service cada (km)')}
          </div>
          <button
            className="b2"
            onClick={async () => {
              if (typeof Notification === 'undefined') return alert('Tu navegador no soporta notificaciones.');
              setPerm(await Notification.requestPermission());
            }}
          >
            <span aria-hidden="true">🔔</span> Activar notificaciones de escritorio
          </button>{' '}
          <span className="muted" role="status">
            Estado: {perm}
          </span>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Respaldo de datos</h3>
          <p className="muted">
            Tus datos viven en Supabase. El plan gratuito <b>no incluye backups automáticos</b>, así que descargá una
            copia seguido (incluye todo salvo el contenido de los archivos adjuntos). Último respaldo:{' '}
            <b>{lastBackup ? new Date(lastBackup).toLocaleString('es-AR') : 'nunca'}</b>
          </p>
          <button className="b1" onClick={exportBackup}>
            <span aria-hidden="true">⬇</span> Descargar respaldo
          </button>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Auditoría completa del sistema</h3>
          <p className="muted">
            Analiza integridad referencial, duplicados, flujo de datos y consistencia en todo el sistema.
          </p>
          <button
            className="b1"
            onClick={() =>
              guard(async () => {
                setSystemAuditLoading(true);
                try {
                  setSystemAuditResult(await systemAudit());
                } finally {
                  setSystemAuditLoading(false);
                }
              })
            }
            disabled={systemAuditLoading}
            style={{ marginBottom: '12px' }}
          >
            {systemAuditLoading ? (
              'Analizando sistema…'
            ) : (
              <>
                <span aria-hidden="true">▶</span> Ejecutar auditoría completa
              </>
            )}
          </button>
          {systemAuditResult && (
            <div role="status" style={{ fontSize: 13 }}>
              <p style={{ margin: '0 0 8px 0', fontWeight: 700 }}>
                Resultado: {systemAuditResult.totalIssues} problemas encontrados
              </p>
              <div
                className="cards"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}
              >
                <div className="card" style={{ padding: '12px 14px', marginBottom: 0 }}>
                  <div className="n" style={{ fontSize: 24 }}>
                    {systemAuditResult.summary.bySeverity.critical}
                  </div>
                  <div className="l">Críticos</div>
                  {systemAuditResult.summary.bySeverity.critical > 0 ? (
                    <span className="kpi-mk vencido">
                      <i aria-hidden="true">!</i>Revisar
                    </span>
                  ) : (
                    <span className="kpi-mk ok">
                      <i aria-hidden="true">✓</i>Sin problemas
                    </span>
                  )}
                </div>
                <div className="card" style={{ padding: '12px 14px', marginBottom: 0 }}>
                  <div className="n" style={{ fontSize: 24 }}>
                    {systemAuditResult.summary.bySeverity.warning}
                  </div>
                  <div className="l">Advertencias</div>
                  {systemAuditResult.summary.bySeverity.warning > 0 ? (
                    <span className="kpi-mk urgente">
                      <i aria-hidden="true">!</i>Revisar
                    </span>
                  ) : (
                    <span className="kpi-mk ok">
                      <i aria-hidden="true">✓</i>Sin advertencias
                    </span>
                  )}
                </div>
                <div className="card" style={{ padding: '12px 14px', marginBottom: 0 }}>
                  <div className="n" style={{ fontSize: 24 }}>
                    {systemAuditResult.summary.bySeverity.info}
                  </div>
                  <div className="l">Información</div>
                </div>
              </div>
              {systemAuditResult.issues.length > 0 && (
                <ul
                  aria-label="Problemas encontrados"
                  className="card"
                  style={{ maxHeight: 400, overflow: 'auto', listStyle: 'none', margin: 0, padding: '8px 12px' }}
                >
                  {systemAuditResult.issues.map((issue: any, i: number) => (
                    <li
                      key={i}
                      style={{
                        padding: '8px 0',
                        borderBottom: i < systemAuditResult.issues.length - 1 ? '1px solid var(--an-grid)' : 'none',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 12 }}>
                        <span className={'bd ' + sevOf(issue.severity).cls}>{sevOf(issue.severity).label}</span>{' '}
                        [{issue.table}] {issue.type}
                      </div>
                      <div className="an-ink-2" style={{ fontSize: 12, marginTop: 2 }}>
                        {issue.message}
                      </div>
                      {issue.count > 1 && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          Cantidad: <span className="num">{issue.count}</span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Auditoría de kilometraje</h3>
          <p className="muted">Verifica la consistencia entre cambios manuales, datos importados y valores actuales.</p>
          <button
            className="b2"
            onClick={() =>
              guard(async () => {
                setAuditLoading(true);
                try {
                  setAuditResult(await auditKmConsistency());
                } finally {
                  setAuditLoading(false);
                }
              })
            }
            disabled={auditLoading}
          >
            {auditLoading ? 'Analizando…' : 'Ejecutar auditoría'}
          </button>
          {auditResult && (
            <div role="status" style={{ marginTop: 16, fontSize: 13 }}>
              <p>
                <b>Resultado:</b> {auditResult.totalVehicles} vehículos analizados
              </p>
              <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="bd vencido">{auditResult.summary.critical} críticos</span>
                <span className="bd urgente">{auditResult.summary.warnings} advertencias</span>
                <span className="bd nd">{auditResult.summary.info} info</span>
              </p>
              {auditResult.issues.length > 0 && (
                <ul style={{ marginTop: 12, maxHeight: 300, overflow: 'auto', listStyle: 'none', padding: 0 }}>
                  {auditResult.issues.slice(0, 10).map((issue: any, i: number) => (
                    <li
                      key={i}
                      style={{
                        marginBottom: 8,
                        padding: 8,
                        border: '1px solid var(--an-border)',
                        borderRadius: 8,
                      }}
                    >
                      <span className={'bd ' + sevOf(issue.severity).cls}>{sevOf(issue.severity).label}</span>{' '}
                      <span style={{ fontWeight: 700, fontSize: 12 }}>{issue.type}:</span> {issue.message}
                    </li>
                  ))}
                  {auditResult.issues.length > 10 && (
                    <li className="muted">… y {auditResult.issues.length - 10} más</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Sesión</h3>
          <p className="muted">
            Ingresaste como <b>{session?.user.email}</b>
          </p>
          <button className="b2" onClick={() => sb().auth.signOut()}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </>
  );
}
