'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { envOk, sb } from '@/lib/supabase';

const SessionCtx = createContext<Session | null>(null);
export const useSession = () => useContext(SessionCtx);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const configured = envOk();

  useEffect(() => {
    if (!configured) { setChecking(false); return; }
    sb().auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data: sub } = sb().auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  if (!configured)
    return (
      <div className="center"><div className="login">
        <h1>Falta configurar Supabase</h1>
        <div className="err">Creá el archivo .env.local con NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (ver README) y reiniciá el servidor.</div>
      </div></div>
    );
  if (checking) return <div className="center muted">Cargando…</div>;
  if (!session) return <Login />;
  return <SessionCtx.Provider value={session}>{children}</SessionCtx.Provider>;
}

function Login() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="center">
      <form className="login" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setErr('');
        const { error } = await sb().auth.signInWithPassword({ email, password: pass });
        if (error) setErr(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : error.message);
        setBusy(false);
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Serprove" />
        <h1>Control de Flota</h1>
        <p className="muted" style={{ marginTop: 0 }}>Ingresá con tu usuario.</p>
        <div className="fg"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></div>
        <div className="fg"><label>Contraseña</label><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} required /></div>
        {err && <div className="err">{err}</div>}
        <div className="btns"><button className="b1" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button></div>
      </form>
    </div>
  );
}
