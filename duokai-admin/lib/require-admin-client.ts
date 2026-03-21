export function readAdminAuth() {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'no_window' as const };
  }

  const token = localStorage.getItem('duokai_admin_token');
  const userText = localStorage.getItem('duokai_admin_user');

  if (!token) {
    return { ok: false, reason: 'no_token' as const };
  }

  if (!userText) {
    return { ok: false, reason: 'no_user' as const };
  }

  try {
    const user = JSON.parse(userText);

    if (user.role !== 'admin') {
      return { ok: false, reason: 'not_admin' as const };
    }

    return { ok: true, token, user };
  } catch {
    localStorage.removeItem('duokai_admin_user');
    return { ok: false, reason: 'bad_user' as const };
  }
}
