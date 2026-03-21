type Props = {
  title?: string;
  rows?: number;
};

export default function PageSkeleton({ title = '加载中...', rows = 5 }: Props) {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-8 w-48 rounded bg-neutral-800" />
        <div className="mt-3 h-4 w-72 rounded bg-neutral-900" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-28 rounded-2xl bg-neutral-900" />
        <div className="h-28 rounded-2xl bg-neutral-900" />
        <div className="h-28 rounded-2xl bg-neutral-900" />
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-3">
        <div className="text-sm text-neutral-500">{title}</div>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-10 rounded bg-neutral-950" />
        ))}
      </div>
    </div>
  );
}
