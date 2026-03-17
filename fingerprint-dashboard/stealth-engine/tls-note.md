# TLS Fingerprinting Note

TLS (Transport Layer Security) ClientHello fingerprinting is a technique used by advanced anti-bot systems (like Akamai, Cloudflare, DataDome) to identify the underlying client (browser/library) before a single HTTP request is processed.

## The Risk
Even if you spoof the User-Agent (UA) to look like Chrome, your library (e.g., Playwright's default chromium build) might send a TLS ClientHello that is inconsistent with a real Chrome's signature. This is often called "JA3 Fingerprinting".

## Mitigation Strategies

### 1. Match UA with Browser Engine
Always ensure the `User-Agent` string matches the exact major version of the Chromium engine being used by Playwright. Discordant UA/Engine versions are a major red flag.

### 2. Residential Proxies
High-quality residential proxies often use real consumer devices or specialized infrastructure that doesn't mess with the TLS layer. Data center proxies are more likely to be flagged.

### 3. Cycle IP Geographies
Avoid reuse of the same IP across disparate profiles. Browsers like Anti-Gravity should use the `ProxyPoolManager` to ensure "Sticky" IP sessions for the duration of a profile's life.

### 4. Advanced: Custom TLS Libraries (Complex)
Libraries like `cycle-tls` or `tls-client` (in Go/Python) exist to mimic specific browser TLS stacks. For Playwright, this usually requires a patched browser binary or a specialized proxy layer that re-negotiates TLS.

### 5. QUIC (HTTP/3)
QUIC uses UDP and has its own handshake fingerprint. Disabling QUIC (`--disable-quic`) is often safer for stealth as it forces the browser to use more predictable TCP/TLS stacks.
