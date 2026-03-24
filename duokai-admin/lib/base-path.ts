const rawAdminBasePath = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH || '';

export const adminBasePath = normalizeBasePath(rawAdminBasePath);

export function withAdminBasePath(path: string) {
  if (!path.startsWith('/')) {
    throw new Error(`Expected absolute path, received: ${path}`);
  }

  if (!adminBasePath) {
    return path;
  }

  return `${adminBasePath}${path}`;
}

function normalizeBasePath(value: string) {
  if (!value) return '';

  const normalized = value.startsWith('/') ? value : `/${value}`;
  return normalized.replace(/\/$/, '');
}
