-- =====================================================================
-- 0008 · Solo usuarios AUTORIZADOS acceden a los datos
-- Problema: las políticas existentes ("solo_logueados" de 0001 y "*_auth_all" de 0006) dejan pasar a CUALQUIER usuario con
-- sesión, y el registro de usuarios de Supabase Auth está abierto (cualquiera con la clave pública puede registrarse).
-- Solución (defensa en profundidad): lista de emails autorizados + una única política por tabla que la consulta.
-- ANTES DE EJECUTAR: (1) revisá el email del dueño más abajo (debe ser exactamente uno de los de `select email from auth.users;`), (2) correr en el SQL Editor de Supabase.
-- DESPUÉS: desactivar el registro en Authentication > Sign In / Providers > "Allow new users to sign up" = OFF.
-- Si algo sale mal, la transacción se revierte sola (todo o nada).
-- =====================================================================
begin;

create table if not exists public.allowed_users (
  email text primary key check (email = lower(email))
);
alter table public.allowed_users enable row level security;

-- Cada usuario solo ve su propia fila (sirve para verificar si está autorizado). Nadie escribe por la API.
drop policy if exists "ver_propia_fila" on public.allowed_users;
create policy "ver_propia_fila" on public.allowed_users
  for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

-- SECURITY INVOKER (por defecto): respeta RLS y no eleva privilegios.
create or replace function public.is_allowed() returns boolean
language sql stable set search_path = ''
as $$
  select exists (select 1 from public.allowed_users where email = lower(auth.jwt() ->> 'email'))
$$;
revoke execute on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

-- Autorizar al dueño ANTES de cambiar las políticas (si no, te quedás sin acceso desde la app)
insert into public.allowed_users (email) values ('sergioarielvargassoto@gmail.com') on conflict do nothing;

-- Quitar TODAS las políticas actuales de las tablas de la app y dejar una sola por tabla
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename <> 'allowed_users'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;

  for r in select tablename from pg_tables where schemaname = 'public' and tablename <> 'allowed_users' loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format(
      'create policy "solo_autorizados" on public.%I for all to authenticated using ((select public.is_allowed())) with check ((select public.is_allowed()))',
      r.tablename
    );
  end loop;
end $$;

-- Storage (adjuntos): mismo criterio + tipos de archivo permitidos (igual que la lista del cliente)
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname ilike 'adjuntos%' loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;
create policy "adjuntos_solo_autorizados" on storage.objects
  for all to authenticated
  using (bucket_id = 'adjuntos' and (select public.is_allowed()))
  with check (bucket_id = 'adjuntos' and (select public.is_allowed()));

update storage.buckets
set allowed_mime_types = array[
  'application/pdf','image/jpeg','image/png','image/webp','image/gif',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
where id = 'adjuntos';

-- Red de seguridad: si NINGÚN usuario real de la app quedó autorizado (por ejemplo un email mal escrito), se revierte todo y no te quedás sin acceso
do $$
begin
  if not exists (select 1 from public.allowed_users a join auth.users u on lower(u.email) = a.email) then
    raise exception 'Ningún usuario existente de auth.users quedó autorizado: se revierte la migración. Revisá el email en allowed_users (select email from auth.users;)';
  end if;
end $$;

commit;

-- Para autorizar a otra persona: insert into public.allowed_users (email) values ('persona@empresa.com');
-- Verificación (estando logueado con el email autorizado debe devolver true): select public.is_allowed();
-- Comprobación rápida de que quedó una sola política por tabla:
--   select tablename, count(*) from pg_policies where schemaname = 'public' group by 1 order by 1;
