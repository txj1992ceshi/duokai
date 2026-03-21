'use client';

import { ReactNode } from 'react';
import { X } from 'lucide-react';

type Props = {
  title: string;
  icon?: ReactNode;
  widthClass?: string;
  onClose: () => void;
  children: ReactNode;
};

export default function ModalShell({
  title,
  icon,
  widthClass = 'w-[420px]',
  onClose,
  children,
}: Props) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className={`overflow-hidden rounded-2xl border border-slate-700/50 bg-[#141720] shadow-2xl animate-in zoom-in duration-200 ${widthClass}`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center space-x-2">
            {icon}
            <h2 className="text-sm font-bold">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <X size={15} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
