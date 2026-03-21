import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  actions?: ReactNode;
};

export default function FilterBar({ children, actions }: Props) {
  return (
    <div className="flex gap-3 border-b border-neutral-800 px-4 py-3">
      <div className="flex flex-1 flex-wrap items-center gap-3">{children}</div>
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
