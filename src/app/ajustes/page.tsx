'use client';
import { useState } from 'react';
import { useData } from '@/lib/data';
import { useSession } from '@/components/AuthGate';
import { sb } from '@/lib/supabase';
import { download, guard, todayStr } from '@/lib/util';

export default function Ajustes() {
  const d = useData();
  const session = useSession();
  const { settings: s, saveSettings } = d;
  const [perm, setPerm] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'no disponible'));
  const [lastBackup, setLastBackup] = useState(() => { try { return Number(localStorage.getItem('lastBackup') || 0); } catch { return 0; } });

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
        <div className="card"><h3 style={{ marginTop: 0 }}>Sesión</h3>
          <p className="muted">Ingresaste como <b>{session?.user.email}</b></p>
          <button className="b2" onClick={() => sb().auth.signOut()}>Cerrar sesión</button>
        </div>
      </div>
    </>
  );
}
