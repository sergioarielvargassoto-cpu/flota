import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Control de Flota · Serprove',
  description: 'Vencimientos, choferes, reparaciones, mantenimientos y combustible de la flota',
};

export const viewport: Viewport = { themeColor: '#6d28d9' };

// Sin fuentes externas: se usa la fuente del sistema (ver globals.css), compatible con una CSP estricta y sin parpadeo.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
