'use client';

import { CheckCircle, Users } from 'lucide-react';
import AppButton from '@/components/AppButton';
import AppInput from '@/components/AppInput';
import ModalShell from '@/components/ModalShell';

type Props = {
  open: boolean;
  isEditing: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function GroupModal({
  open,
  isEditing,
  value,
  onChange,
  onClose,
  onSave,
}: Props) {
  if (!open) return null;

  return (
    <ModalShell
      title={isEditing ? '编辑分组' : '新建自定义分组'}
      icon={<Users size={15} className="text-blue-400" />}
      widthClass="w-[400px]"
      onClose={onClose}
    >
      <div className="space-y-4">
        <AppInput
          label="分组名称"
          type="text"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="例如: 东南亚 TikTok 矩阵区"
        />

        <div className="flex justify-end space-x-2 pt-4">
          <AppButton onClick={onClose} variant="secondary">
            取消
          </AppButton>
          <AppButton onClick={onSave} variant="primary">
            <CheckCircle size={14} />
            <span>保存</span>
          </AppButton>
        </div>
      </div>
    </ModalShell>
  );
}
