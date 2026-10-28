import type { Status } from '@/lib/types';
export function Badge({ status, children }: { status: Status | 'nd'; children: React.ReactNode }) {
  return <span className={'bd ' + status}>{children}</span>;
}
