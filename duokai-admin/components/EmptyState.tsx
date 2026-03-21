type Props = {
  title: string;
  description?: string;
};

export default function EmptyState({ title, description }: Props) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/60 px-6 py-10 text-center">
      <div className="text-lg font-semibold text-white">{title}</div>
      {description ? <div className="mt-2 text-sm text-neutral-400">{description}</div> : null}
    </div>
  );
}
