import type { ReactNode } from 'react';

type Props = {
  title?: string;
  description?: string;
  children: ReactNode;
};

export default function FormSection({ title, description, children }: Props) {
  return (
    <div className="space-y-3">
      {title ? (
        <div>
          <div className="text-sm text-neutral-400">{title}</div>
          {description ? <div className="mt-1 text-xs text-neutral-500">{description}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
