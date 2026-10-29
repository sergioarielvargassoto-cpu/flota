'use client';
import { useState } from 'react';
import { useData } from '@/lib/data';
import { useSession } from '@/components/AuthGate';
import { sb } from '@/lib/supabase';
import { download, guard, todayStr } from '@/lib/util';
import { auditKmConsistency } from '@/lib/audit';

export default function Ajustes() {
  const d = useData();
  const session = useSession();
  const { settings: s, saveSettings } = d;
  const [perm, setPerm] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'no disponible'));
  const [lastBackup, setLastBackup] = useState(() => { try { return Number(localStorage.getItem('lastBackup') || 0); } catch { return 0; } });
  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const numField = (k: 'd1' | 'd2' | 'd3' | 'km_alert' | 'service_km', label: string, min = 1) => (
    <div className="fg" key={k}><label>{label}</label>
      <input type="number" min={min} defaultValue={s[k]} onBlur={(e) => {
        const n = Math.max(min, Number(e.target.value) || min);
        if (n !== s[k]) guard(() => saveSettings({ [k]: n }));
      }} /></div>
  );

  const exportBackup = () => {
    const out = {
      exportado: new Date().toISOString(), settings: s, vehicles: d.vehicles, drivers: d.drivers, documents: d.documents,
      workshops: d.workshops, repairs: d.repairs, maintenance: d.maintenance, fuel_loads: d.fuel_loads, trips: d.trips,
      attachments: d.attachments.map(({ id, document_id, repair_id, maintenance_id, name }) => ({ id, document_id, repair_id, maintenance_id, name })),
    };
    download(`respaldo_flota_${todayStr()}.json`, JSON.stringify(out), 'application/json');
    try { const t = Date.now(); localStorage.setItem('lastBackup', String(t)); setLastBackup(t); } catch { /* sin storage */ }
  };

  return (
    <>
      <h2>Ajustes y respaldo</h2>
      <div className="set">
        <div className="card"><h3 style={{ marginTop: 0 }}>Empresa</h3>
          <div className="fg"><label>Nombre (se muestra arriba)</label>
            <input defaultValue={s.company} onBlur={(e) => { if (e.target.value !== s.company) guard(() => saveSettings({ company: e.target.value })); }} /></div></div>
        <div className="card"><h3 style={{ marginTop: 0 }}>Avisos de vencimiento (días antes)</h3>
          <div className="row2">{numField('d1', 'Aviso próximo')}{numField('d2', 'Aviso urgente')}{numField('d3', 'Aviso crítico')}{numField('km_alert', 'Aviso por km (faltando)', 0)}{numField('service_km', 'Service cada (km)')}</div>
          <button className="b2" onClick={async () => {
            if (typeof Notification === 'undefined') return alert('Tu navegador no soporta notificaciones.');
            setPerm(await Notification.requestPermission());
          }}>🔔 Activar notificaciones de escritorio</button> <span className="muted">Estado: {perm}</span>
        </div>
        <div className="card"><h3 style={{ marginTop: 0 }}>Respaldo de datos</h3>
          <p className="muted">Tus datos viven en Supabase. El plan gratuito <b>no incluye backups automáticos</b>, así que descargá una copia seguido (incluye todo salvo el contenido de los archivos adjuntos). Último respaldo: <b>{lastBackup ? new Date(lastBackup).toLocaleString('es-AR') : 'nunca'}</b></p>
          <button className="b1" onClick={exportBackup}>⬇ Descargar respaldo</button>
        </div>
        <div className="card"><h3 style={{ marginTop: 0 }}>Auditoría de Kilometraje</h3>
          <p className="muted">Verifica la consistencia entre cambios manuales, datos importados y valores actuales.</p>
          <button className="b2" onClick={() => guard(async () => { setAuditLoading(true); try { setAuditResult(await auditKmConsistency()); } finally { setAuditLoading(false); } })} disabled={auditLoading}>
            {auditLoading ? 'Analizando...' : '🔍 Ejecutar auditoría'}
          </button>
          {auditResult && (
            <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '6px', fontSize: '13px' }}>
              <p><b>Resultado:</b> {auditResult.totalVehicles} vehículos analizados</p>
              <p style={{ color: auditResult.summary.critical > 0 ? '#d32f2f' : auditResult.summary.warnings > 0 ? '#f57c00' : '#388e3c' }}>
                🔴 {auditResult.summary.critical} críticos | 🟠 {auditResult.summary.warnings} advertencias | 🟢 {auditResult.summary.info} info
              </p>
              {auditResult.issues.length > 0 && (
                <div style={{ marginTop: '12px', maxHeight: '300px', overflow: 'auto' }}>
                  {auditResult.issues.slice(0, 10).map((issue: any, i: number) => (
                    <div key={i} style={{ marginBottom: '8px', padding: '8px', backgroundColor: '#fff', borderLeft: `3px solid ${issue.severity === 'critical' ? '#d32f2f' : issue.severity === 'warning' ? '#f57c00' : '#2196f3'}`, borderRadius: '2px' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '12px' }}>{issue.type}:</span> {issue.message}
                    </div>
                  ))}
                  {auditResult.issues.length > 10 && <p className="muted">... y {auditResult.issues.length - 10} más</p>}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="card"><h3 style={{ marginTop: 0 }}>Sesión</h3>
          <p className="muted">Ingresaste como <b>{session?.user.email}</b></p>
          <button className="b2" onClick={() => sb().auth.signOut()}>Cerrar sesión</button>
        </div>
      </div>
    </>
  );
}
