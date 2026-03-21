import type { ReactNode } from 'react';

type Props = {
  title: string;
  description?: string;
  aside?: ReactNode;
  children?: ReactNode;
};

export default function PageHeader({ title, description, aside, children }: Props) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        {description ? <p className="mt-2 text-sm text-neutral-400">{description}</p> : null}
        {children ? <div className="mt-2">{children}</div> : null}
      </div>
      {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
    </div>
  );
}
