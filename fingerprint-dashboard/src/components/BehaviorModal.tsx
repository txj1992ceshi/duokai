'use client';

import { Plus, Workflow } from 'lucide-react';
import AppButton from '@/components/AppButton';
import AppInput from '@/components/AppInput';
import AppTextarea from '@/components/AppTextarea';
import ModalShell from '@/components/ModalShell';

type Props = {
  open: boolean;
  name: string;
  description: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
};

export default function BehaviorModal({
  open,
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onClose,
  onCreate,
}: Props) {
  if (!open) return null;

  return (
    <ModalShell
      title="创建自动化流程"
      icon={<Workflow size={15} className="text-blue-400" />}
      widthClass="w-[420px]"
      onClose={onClose}
    >
      <div className="space-y-4">
        <AppInput
          label="流程名称"
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="例如: 自动登录 Facebook"
        />

        <AppTextarea
          label="流程描述 (可选)"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="这个流程是用来做什么的..."
          className="h-24 border-slate-700 bg-slate-900 text-slate-300"
        />

        <div className="flex justify-end space-x-2 pt-2">
          <AppButton onClick={onClose} variant="secondary">
            取消
          </AppButton>
          <AppButton onClick={onCreate} variant="primary">
            <Plus size={14} />
            <span>立即创建</span>
          </AppButton>
        </div>
      </div>
    </ModalShell>
  );
}
