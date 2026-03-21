import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

export default function DataTable({ children }: Props) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      {children}
    </div>
  );
}
