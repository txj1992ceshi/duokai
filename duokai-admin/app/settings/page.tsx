'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/api-client';
import { readAdminAuth } from '@/lib/require-admin-client';
import AppButton from '@/components/AppButton';
import AppInput from '@/components/AppInput';
import AppSelect from '@/components/AppSelect';
import AppSwitch from '@/components/AppSwitch';
import ErrorBanner from '@/components/ErrorBanner';
import SuccessBanner from '@/components/SuccessBanner';
import PageSkeleton from '@/components/PageSkeleton';
import PageHeader from '@/components/PageHeader';
import DetailCard from '@/components/DetailCard';
import FormSection from '@/components/FormSection';
import SectionBlock from '@/components/SectionBlock';

type SettingsForm = {
  autoFingerprint: boolean;
  autoProxyVerification: boolean;
  defaultStartupPlatform: string;
  defaultStartupUrl: string;
  theme: string;
};

const DEFAULT_SETTINGS: SettingsForm = {
  autoFingerprint: true,
  autoProxyVerification: true,
  defaultStartupPlatform: '',
  defaultStartupUrl: '',
  theme: 'system',
};

export default function SettingsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [settings, setSettings] = useState<SettingsForm>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const auth = readAdminAuth();
    if (!auth.ok) {
      router.replace('/login');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;

    async function loadSettings() {
      setLoading(true);
      setError('');
      try {
        const res = await adminFetch('/api/settings');
        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error || '加载系统设置失败');
          return;
        }

        const s = data.settings || DEFAULT_SETTINGS;
        setSettings({
          autoFingerprint: Boolean(s.autoFingerprint),
          autoProxyVerification: Boolean(s.autoProxyVerification),
          defaultStartupPlatform: String(s.defaultStartupPlatform || ''),
          defaultStartupUrl: String(s.defaultStartupUrl || ''),
          theme: String(s.theme || 'system'),
        });
      } catch {
        setError('加载系统设置失败');
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [authChecked]);

  async function handleSave() {
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const res = await adminFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '保存系统设置失败');
        return;
      }

      setNotice('系统设置已保存');
    } catch {
      setError('保存系统设置失败');
    } finally {
      setSaving(false);
    }
  }

  if (!authChecked) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="系统设置" description="全局默认配置管理" />

      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <SectionBlock title="默认配置" description="控制环境创建和运行时的全局默认行为。">
        <DetailCard title="系统设置">
        {loading ? (
          <PageSkeleton title="加载系统设置中..." rows={3} />
        ) : (
          <>
            <FormSection title="自动化开关" description="控制环境默认的自动处理能力。">
              <AppSwitch
                checked={settings.autoFingerprint}
                onChange={(checked) =>
                  setSettings((prev) => ({
                    ...prev,
                    autoFingerprint: checked,
                  }))
                }
                label="自动指纹"
                description="创建或更新环境时，默认启用指纹自动化处理。"
              />

              <AppSwitch
                checked={settings.autoProxyVerification}
                onChange={(checked) =>
                  setSettings((prev) => ({
                    ...prev,
                    autoProxyVerification: checked,
                  }))
                }
                label="自动代理检测"
                description="保存或使用代理时，默认执行连通性与出口信息检测。"
              />
            </FormSection>

            <FormSection title="默认启动参数" description="配置环境创建后的默认起始页面。">
              <AppInput
                value={settings.defaultStartupPlatform}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultStartupPlatform: e.target.value,
                  }))
                }
                placeholder="如 linkedin.com"
              />
              <AppInput
                value={settings.defaultStartupUrl}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    defaultStartupUrl: e.target.value,
                  }))
                }
                placeholder="https://..."
              />
            </FormSection>

            <FormSection title="界面主题" description="设置后台默认的显示主题。">
              <AppSelect
                value={settings.theme}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    theme: e.target.value,
                  }))
                }
              >
                <option value="system">system</option>
                <option value="dark">dark</option>
                <option value="light">light</option>
              </AppSelect>
            </FormSection>

            <AppButton
              onClick={handleSave}
              disabled={saving}
              variant="primary"
            >
              {saving ? '保存中...' : '保存设置'}
            </AppButton>
          </>
        )}
        </DetailCard>
      </SectionBlock>
    </div>
  );
}
