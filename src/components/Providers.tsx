'use client';
import { AuthGate } from './AuthGate';
import { DataProvider } from '@/lib/data';
import { Shell } from './Shell';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <DataProvider>
        <Shell>{children}</Shell>
      </DataProvider>
    </AuthGate>
  );
}
