export const RUNTIME_MODES = ['local', 'strong-local', 'vm', 'container'] as const;

export type RuntimeMode = (typeof RUNTIME_MODES)[number];

function parseBooleanEnv(value: string | undefined) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function normalizeRuntimeMode(value: unknown): RuntimeMode {
  const normalized = String(value || '').trim() as RuntimeMode;
  return RUNTIME_MODES.includes(normalized) ? normalized : 'local';
}

export function isStrongLocalEnabled() {
  return parseBooleanEnv(process.env.DUOKAI_ENABLE_STRONG_LOCAL);
}

export function getRuntimeModeSupportDecision(runtimeModeInput: unknown) {
  const runtimeMode = normalizeRuntimeMode(runtimeModeInput);

  if (runtimeMode === 'vm' || runtimeMode === 'container') {
    return {
      ok: false as const,
      runtimeMode,
      code: 'RUNTIME_MODE_UNSUPPORTED',
      message: 'The selected runtime mode is declared but not implemented for launch execution.',
      detail: {
        runtimeMode,
        supportedModes: ['local', ...(isStrongLocalEnabled() ? ['strong-local'] : [])],
      },
    };
  }

  if (runtimeMode === 'strong-local' && !isStrongLocalEnabled()) {
    return {
      ok: false as const,
      runtimeMode,
      code: 'STRONG_LOCAL_DISABLED',
      message: 'The selected runtime mode requires the strong-local feature flag before launch approval.',
      detail: {
        runtimeMode,
        featureFlag: 'DUOKAI_ENABLE_STRONG_LOCAL',
      },
    };
  }

  return {
    ok: true as const,
    runtimeMode,
  };
}

export function normalizeSupportedRuntimeModes(input: unknown): RuntimeMode[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return Array.from(new Set(input.map((item) => normalizeRuntimeMode(item))));
}
