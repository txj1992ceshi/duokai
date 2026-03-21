type Variant = 'error' | 'success';

type Props = {
  message: string;
  variant?: Variant;
};

const variantClassMap: Record<Variant, string> = {
  error: 'border-red-800 bg-red-950/40 text-red-300',
  success: 'border-green-800 bg-green-950/40 text-green-300',
};

export default function NoticeBanner({ message, variant = 'error' }: Props) {
  if (!message) return null;

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${variantClassMap[variant]}`}>
      {message}
    </div>
  );
}
