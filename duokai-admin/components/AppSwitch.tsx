'use client';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
};

export default function AppSwitch({ checked, onChange, label, description }: Props) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-950/70 px-4 py-3">
      <div className="space-y-1">
        <div className="text-sm font-medium text-white">{label}</div>
        {description ? <div className="text-xs text-neutral-400">{description}</div> : null}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition ${
          checked ? 'bg-cyan-500' : 'bg-neutral-700'
        }`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </label>
  );
}
