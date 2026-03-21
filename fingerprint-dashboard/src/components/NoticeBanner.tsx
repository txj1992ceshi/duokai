'use client';

type Variant = 'error' | 'success' | 'info';

type Props = {
  message: string;
  variant?: Variant;
};

const variantClassMap: Record<Variant, string> = {
  error: 'border-red-400/20 bg-red-500/10 text-red-300',
  success: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
  info: 'border-blue-400/20 bg-blue-500/10 text-blue-200',
};

export default function NoticeBanner({
  message,
  variant = 'info',
}: Props) {
  if (!message) return null;

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${variantClassMap[variant]}`}
    >
      {message}
    </div>
  );
}
