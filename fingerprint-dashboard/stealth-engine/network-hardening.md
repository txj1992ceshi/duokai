# Network Hardening Guide

To prevent leaks (DNS, QUIC, WebRTC, etc.) and ensure absolute isolation, follow these guidelines.

## 1. Browser Launch Arguments

Add these flags to Playwright context options to disable risky protocols:

```javascript
args: [
  '--disable-quic',                 // Prevents QUIC/UDP leaks that might bypass HTTP proxies
  '--disable-http2',                // (Optional) Forces HTTP/1.1 for better interception
  '--no-pings',                     // Disables <a ping>
  '--disable-background-networking', // Reduces noise
  '--disable-component-update',     // Prevents background updates
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', // Prevents WebRTC leaks
  '--host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"', // (Caution) Block direct DNS
]
```

## 2. DNS Leak Prevention

Even with a proxy, Chrome might attempt to resolve DNS locally.
- **Solution A**: Use a proxy that supports server-side DNS (SOCKS5h or HTTP).
- **Solution B**: Run the runtime engine inside a Network Namespace or Docker container with restricted DNS settings.

## 3. Disabling IPv6

IPv6 is a frequent source of leaks as many proxies only handle IPv4.
- Disable IPv6 on the host machine or within the Docker container.
- Use `--disable-ipv6` (if supported by the chromium build).

## 4. WebRTC Hardening

In addition to arguments, use the `fingerprint-injector.js` to mock `RTCPeerConnection` (already implemented) and `navigator.mediaDevices`.

## 5. TCP/TLS Fingerprint

Avoid using the same host for hundreds of profiles. The TLS ClientHello fingerprint can be used to link sessions.
- Use high-quality residential proxies.
- Rotate the User-Agent to match the appropriate Chrome version's TLS signature.
