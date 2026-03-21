'use client';

import { CheckCircle } from 'lucide-react';
import AppButton from '@/components/AppButton';
import AppInput from '@/components/AppInput';
import GlassCard from '@/components/GlassCard';
import NoticeBanner from '@/components/NoticeBanner';
import PageHeader from '@/components/PageHeader';
import type { Settings } from '@/lib/dashboard-types';

type Props = {
  settings: Settings;
  noticeMessage: string;
  noticeVariant: 'error' | 'success' | 'info';
  onChange: (next: Settings) => void;
  onSubmit: (e: React.FormEvent) => void;
};

export default function RuntimeSettingsPanel({
  settings,
  noticeMessage,
  noticeVariant,
  onChange,
  onSubmit,
}: Props) {
  return (
    <div className="max-w-2xl animate-in fade-in duration-300">
      <PageHeader
        title="Runtime 执行引擎设置"
        description="配置远程或者本地的 Playwright 执行节点信息。"
      />
      <GlassCard>
        <form onSubmit={onSubmit} className="space-y-5">
          <NoticeBanner message={noticeMessage} variant={noticeVariant} />
          <AppInput
            label="Runtime API URL"
            className="h-11 rounded-xl border-slate-700 bg-slate-900 font-mono"
            type="text"
            value={settings.runtimeUrl}
            onChange={(e) => onChange({ ...settings, runtimeUrl: e.target.value })}
            placeholder="http://127.0.0.1:3101"
          />
          <AppInput
            label="Runtime API Key"
            className="h-11 rounded-xl border-slate-700 bg-slate-900 font-mono"
            type="password"
            value={settings.runtimeApiKey}
            onChange={(e) => onChange({ ...settings, runtimeApiKey: e.target.value })}
            placeholder="输入您的安全密钥"
          />
          <div className="pt-2">
            <AppButton type="submit" variant="primary">
              <CheckCircle size={15} />
              <span>保存配置</span>
            </AppButton>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
