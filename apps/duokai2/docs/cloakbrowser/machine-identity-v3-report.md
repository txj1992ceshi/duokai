# Machine Identity v3

## Product policy

Duokai desktop now treats the browser machine identity as a generated, stable environment asset:

- **Machine identity:** generated automatically by default.
- **System family:** must be compatible with the computer running Duokai.
- **Device profile:** generated independently for each environment from a coherent device template.
- **Regional identity:** language, timezone, geolocation, and WebRTC egress follow the verified network/proxy egress policy.
- **Stability:** the generated identity is fixed after environment creation and is not randomized on launch.

Platform presets such as LinkedIn and TikTok may adjust startup URLs, cookie/tab behavior, memory-saving behavior, and regional auto-resolution. They no longer change the operating system, Chromium version, screen, CPU, memory, GPU, hardware seed, or device template.

## Identity generation

A single deterministic seed selects one internally coherent device template and variant. The generated values include the system family, User-Agent family, CPU and memory class, screen size, GPU family, and compatibility metadata. Different environments use different seeds; repeated launches of the same environment retain the same seed and template.

The generated template catalog is pinned to the bundled CloakBrowser major 145 through a shared version constant. At launch, CloakBrowser remains the native owner of browser-visible identity signals. The runtime maps the fixed seed and supported hardware/network fields to the exact installed Cloak Chromium version; legacy JavaScript fingerprint injection remains forbidden on the Cloak single-engine path.

`deviceName`, `hostIp`, and `macAddress` remain compatibility/internal metadata. They are displayed read-only and are not treated as browser-exposed Cloak identity inputs.

## Migration and cross-host behavior

Machine Identity v3 upgrades old generated identities once:

1. A valid old generated identity already compatible with the current host receives a metadata-only v3 upgrade.
2. A valid old generated identity from another system family receives one deterministic host-compatible migration using the same hardware seed.
3. After the v3 identity is established, it is locked. Opening that fixed identity on another system family does not silently regenerate it; launch validation blocks and asks the owner to use the original system or create a new environment.
4. Manually authored identities are never silently rewritten. A host-family mismatch is reported as a warning.

Every startup migration records an audit event with previous/next version, system family, template ID, whether the seed was preserved, whether the identity changed, and the synchronized workspace resolution.

## UI behavior

The environment editor communicates the policy directly:

- 机器身份：自动生成（推荐）
- 系统家族：与当前电脑兼容
- 设备画像：每个环境独立生成
- 地区信息：跟随代理出口
- 身份稳定性：创建后固定

A new unsaved draft can choose another coherent generated profile. Once saved, the redraw action is removed and identity-defining fields become read-only.

## Local macOS test packaging

The local `build:mac` path opts into a deep ad-hoc signature so the generated `.app`, ZIP, and DMG can be structurally verified. This opt-in is isolated behind `DUOKAI_ADHOC_SIGN=1` and is absent from `build:mac:release`.

Formal release behavior is unchanged: Developer ID signing and Apple notarization still require the release credentials and the signed release configuration. An ad-hoc test package is not a notarized production release and is expected to be rejected by Gatekeeper policy assessment.

## Verification

The implementation is covered by regression checks for:

- host-compatible generation;
- independent deterministic environment seeds;
- one-time legacy migration with seed preservation;
- v3 cross-host lock behavior;
- platform presets preserving the machine identity;
- exact UI policy wording and saved-identity lock;
- separation between local ad-hoc packaging and formal release signing;
- the standard CloakBrowser runtime suite, production renderer build, React singleton verification, release policy tests, and macOS archive/signature validation.
