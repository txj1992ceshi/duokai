export function getApiBase() {
  return (process.env.NEXT_PUBLIC_DUOKAI_API_BASE || 'http://127.0.0.1:3100').replace(/\/$/, '');
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

  if (res.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (!window.location.pathname.startsWith('/login')) {
      window.location.replace('/login');
    }
  }

  return res;
}
