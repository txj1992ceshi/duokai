import type { ReactNode } from 'react';

type Props = {
  title?: string;
  description?: string;
  children: ReactNode;
};

export default function SectionBlock({ title, description, children }: Props) {
  return (
    <section className="space-y-4">
      {title ? (
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {description ? <p className="mt-1 text-sm text-neutral-400">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
