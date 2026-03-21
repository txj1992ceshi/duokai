'use client';

import { Wifi, WifiOff } from 'lucide-react';
import type { Profile } from '@/lib/dashboard-types';
import {
  getCheckStatusLabel,
  getEntryTransportLabel,
  getStartupNavigationLabel,
  getStartupNavigationTone,
  getVerificationTone,
} from '@/lib/dashboard-formatters';

type Props = {
  profile: Profile;
};

export default function ProxyNodeCell({ profile }: Props) {
  return (
    <div className="space-y-1">
      <div className="flex items-center space-x-1.5">
        {profile.proxy ? (
          <>
            <Wifi size={11} className="text-blue-400" />
            <span className="break-all font-mono text-xs text-blue-400">{profile.proxy}</span>
          </>
        ) : (
          <>
            <WifiOff size={11} className="text-slate-500" />
            <span className="text-xs text-slate-500">本机直连</span>
          </>
        )}
      </div>
      {profile.proxyVerification ? (
        <div className={`text-[10px] ${getVerificationTone(profile.proxyVerification)}`}>
          环境层: {getCheckStatusLabel(profile.proxyVerification.status)}
          {profile.proxyVerification.ip ? ` · ${profile.proxyVerification.ip}` : ''}
          {profile.proxyVerification.country
            ? ` · ${profile.proxyVerification.country}${
                profile.proxyVerification.city ? ` ${profile.proxyVerification.city}` : ''
              }`
            : ''}
          {profile.proxyVerification.effectiveProxyTransport
            ? ` · ${getEntryTransportLabel(profile.proxyVerification.effectiveProxyTransport)}`
            : ''}
        </div>
      ) : null}
      {profile.runtimeSessionId ? (
        <div className={`text-[10px] ${getStartupNavigationTone(profile)}`}>
          {getStartupNavigationLabel(profile)}
        </div>
      ) : null}
    </div>
  );
}
