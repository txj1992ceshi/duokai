import type { ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  className?: string;
};

export default function DetailCard({ title, children, className = '' }: Props) {
  return (
    <div className={`rounded-2xl border border-neutral-800 bg-neutral-900 p-5 ${className}`.trim()}>
      <div className="text-sm text-neutral-400">{title}</div>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}
