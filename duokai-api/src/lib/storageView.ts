export function shouldIncludeArtifactContent(input: unknown): boolean {
  const normalized = String(input || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'full';
}

export function compactStorageStatePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const next = { ...(value as Record<string, unknown>) };
  if ('inlineStateJson' in next) {
    next.inlineStateJson = null;
  }
  if ('stateJson' in next) {
    next.stateJson = null;
  }
  return next;
}
