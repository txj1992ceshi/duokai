export function getApiBase() {
  return (process.env.NEXT_PUBLIC_DUOKAI_API_BASE || 'http://localhost:3100').replace(/\/$/, '');
}

export function getAuthToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('token') || '';
}

export async function apiFetch(
  input: string,
  init: RequestInit = {}
) {
  const token = getAuthToken();

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

  const res = await fetch(`${getApiBase()}${input}`, {
    ...init,
    headers,
  });

  return res;
}
