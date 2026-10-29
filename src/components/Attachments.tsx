'use client';
import { sb } from '@/lib/supabase';
import { useData } from '@/lib/data';
import { guard } from '@/lib/util';
import type { Attachment } from '@/lib/types';

export type ParentKind = 'document' | 'repair' | 'maintenance' | 'infraction';
const COL: Record<ParentKind, 'document_id' | 'repair_id' | 'maintenance_id' | 'infraction_id'> = {
  document: 'document_id', repair: 'repair_id', maintenance: 'maintenance_id', infraction: 'infraction_id',
};
const safe = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');

/** Sube archivos al bucket privado "adjuntos" y los asocia a un registro. */
export async function uploadFiles(kind: ParentKind, parentId: string, files: File[]) {
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) { alert(`${f.name} supera 10 MB. Comprimila antes de adjuntar.`); continue; }
    const path = `${crypto.randomUUID()}-${safe(f.name)}`;
    const up = await sb().storage.from('adjuntos').upload(path, f);
    if (up.error) throw up.error;
    const { error } = await sb().from('attachments').insert({ [COL[kind]]: parentId, path, name: f.name });
    if (error) throw error;
  }
}

/** Borra del Storage los archivos de los adjuntos indicados (los registros se borran solos en cascada). */
export async function removeStoredFiles(list: Attachment[]) {
  if (!list.length) return;
  await sb().storage.from('adjuntos').remove(list.map((a) => a.path));
}

export function openAttachment(a: Attachment) {
  guard(async () => {
    const { data, error } = await sb().storage.from('adjuntos').createSignedUrl(a.path, 120);
    if (error) throw error;
    window.open(data.signedUrl, '_blank');
  });
}

export function attachmentsOf(all: Attachment[], kind: ParentKind, id: string) {
  return all.filter((a) => a[COL[kind]] === id);
}

/** Lista de adjuntos de un registro (con botón para abrir y, opcionalmente, para borrar). */
export function AttachmentList({ kind, id, editable }: { kind: ParentKind; id: string; editable?: boolean }) {
  const { attachments, reload } = useData();
  const list = attachmentsOf(attachments, kind, id);
  if (!list.length) return null;
  return (
    <span className="files">
      {list.map((a) => (
        <span key={a.id}>
          <a href="#" onClick={(e) => { e.preventDefault(); openAttachment(a); }}>📎 {a.name}</a>
          {editable && (
            <a href="#" style={{ color: 'var(--r)' }} onClick={(e) => {
              e.preventDefault();
              if (!confirm(`¿Quitar ${a.name}?`)) return;
              guard(async () => {
                await removeStoredFiles([a]);
                const { error } = await sb().from('attachments').delete().eq('id', a.id);
                if (error) throw error;
                await reload('attachments');
              });
            }}>✕ </a>
          )}
        </span>
      ))}
    </span>
  );
}
