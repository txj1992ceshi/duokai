'use client';

import { AlertCircle, CheckCircle, Upload } from 'lucide-react';
import AppButton from '@/components/AppButton';
import AppTextarea from '@/components/AppTextarea';
import ModalShell from '@/components/ModalShell';

type Props = {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onImport: () => void;
};

export default function BatchImportModal({
  open,
  value,
  onChange,
  onClose,
  onImport,
}: Props) {
  if (!open) return null;

  return (
    <ModalShell
      title="批量导入代理 IP"
      icon={<Upload size={15} className="text-blue-400" />}
      widthClass="w-[520px]"
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex items-start space-x-2 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-blue-400" />
          <div className="text-xs leading-relaxed text-blue-400">
            系统会自动解析智能区分 IP、端口和账号密码。支持以下格式拼接 (每行一条):<br />
            <span className="font-mono text-slate-300">127.0.0.1:1080</span><br />
            <span className="font-mono text-slate-300">socks5://45.12.33.1:1080</span><br />
            <span className="font-mono text-slate-300">103.4.1.22:9092:user123:mypass</span>
          </div>
        </div>

        <AppTextarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="在此处狂暴粘贴您的代理列表..."
          className="h-40 border-slate-700 bg-slate-900 font-mono text-slate-300"
        />

        <div className="flex justify-end space-x-2 pt-2">
          <AppButton onClick={onClose} variant="secondary">
            取消
          </AppButton>
          <AppButton onClick={onImport} variant="primary">
            <CheckCircle size={14} />
            <span>自动解析并导入</span>
          </AppButton>
        </div>
      </div>
    </ModalShell>
  );
}
