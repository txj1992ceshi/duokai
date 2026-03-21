const API_BASE =
  (process.env.NEXT_PUBLIC_DUOKAI_API_BASE || 'http://localhost:3100').replace(/\/$/, '');

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

  return fetch(`${API_BASE}${input}`, {
    ...init,
    headers,
  });
}
