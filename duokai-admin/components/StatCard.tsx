import type { ReactNode } from 'react';

type Props = {
  label: string;
  value: ReactNode;
  accentClassName?: string;
};

export default function StatCard({ label, value, accentClassName = '' }: Props) {
  return (
    <div className="h-full min-h-[108px] rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="text-sm text-neutral-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${accentClassName}`.trim()}>{value}</div>
    </div>
  );
}
