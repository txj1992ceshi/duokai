'use client';

import { ReactNode } from 'react';

type Props = {
  title?: string;
  description?: string;
  children: ReactNode;
};

export default function SectionBlock({
  title,
  description,
  children,
}: Props) {
  return (
    <section className="space-y-4">
      {title || description ? (
        <div>
          {title ? <h3 className="text-sm font-semibold text-slate-100">{title}</h3> : null}
          {description ? (
            <p className="mt-1 text-xs leading-6 text-slate-500">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
