'use client';

import AppButton from '@/components/AppButton';
import AppTextarea from '@/components/AppTextarea';

type Props = {
  profileId: string;
  open: boolean;
  value: string;
  onToggle: () => void;
  onChange: (value: string) => void;
  onSync: () => void;
  onLoad: () => void;
};

export default function ProfileStorageStateEditor({
  open,
  value,
  onToggle,
  onChange,
  onSync,
  onLoad,
}: Props) {
  return (
    <div className="space-y-2">
      <AppButton
        onClick={onToggle}
        variant="secondary"
        size="md"
      >
        {open ? '收起登录态编辑器' : '展开登录态编辑器'}
      </AppButton>

      {open ? (
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <AppTextarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="请粘贴 storageState JSON"
          />
          <div className="flex gap-2">
            <AppButton
              onClick={onSync}
              variant="primary"
            >
              同步登录态
            </AppButton>
            <AppButton
              onClick={onLoad}
              variant="secondary"
            >
              加载已同步登录态
            </AppButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
