import { withAdminBasePath } from '@/lib/base-path';

function resolveApiBase() {
  const configured = String(process.env.NEXT_PUBLIC_DUOKAI_API_BASE || '').trim().replace(/\/$/, '');
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';

  // HTTPS deployments use the same-origin /api proxy to avoid mixed content.
  // Keep the original local API default when developing over HTTP without an env file.
  if (!configured) {
    return isHttpsPage ? '' : 'http://127.0.0.1:3100';
  }

  if (/^http:\/\/45\.32\.44\.226\/?$/i.test(configured)) {
    return '';
  }

  if (isHttpsPage && /^http:\/\//i.test(configured)) {
    return '';
  }

  return configured;
}

const API_BASE = resolveApiBase();

export function getAdminToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('duokai_admin_token') || '';
}

export async function adminFetch(
  input: string,
  init: RequestInit = {}
) {
  const token = getAdminToken();
  const headers = new Headers(init.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const hasJsonBody =
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type');

  if (hasJsonBody) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${input}`, {
    ...init,
    headers,
  });

  if (res.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('duokai_admin_token');
    localStorage.removeItem('duokai_admin_user');
    const loginPath = withAdminBasePath('/login');
    if (window.location.pathname !== loginPath) {
      window.location.replace(loginPath);
    }
  }

  return res;
}
