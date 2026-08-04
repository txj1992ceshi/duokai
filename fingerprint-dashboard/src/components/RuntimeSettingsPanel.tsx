'use client';

import GlassCard from '@/components/GlassCard';
import NoticeBanner from '@/components/NoticeBanner';
import PageHeader from '@/components/PageHeader';

export default function RuntimeSettingsPanel() {
  return (
    <div className="max-w-2xl animate-in fade-in duration-300">
      <PageHeader
        title="运行架构"
        description="浏览器环境统一由控制面下发任务，并由已注册的 Duokai 桌面代理执行。"
      />
      <GlassCard>
        <NoticeBanner
          variant="info"
          message="旧的 Runtime URL、API Key 和直连模式已退役。浏览器启动与停止只使用控制面任务；当桌面代理离线时系统会明确失败，不会回退到普通 Playwright Chromium。"
        />
      </GlassCard>
    </div>
  );
}
