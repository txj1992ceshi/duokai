export async function startSession(profile: any, proxy?: any, opts = { headless: false }) {
  const body = { 
    profileId: profile.id, 
    fingerprintConfig: profile.fingerprint, // Will send actual profile structure since fingerprint-config isn't separated entirely here
    profile, 
    proxy, 
    headless: !!opts.headless 
  };
  const r = await fetch('/api/runtime/start', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify(body) 
  });
  if (r.ok) {
    return r.json();
  }
  const err = await r.json().catch(() => ({}));
  return Promise.reject(err);
}

export async function stopSession(sessionId: string) {
  const r = await fetch('/api/runtime/stop', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ sessionId }) 
  });
  if (r.ok) {
    return r.json();
  }
  const err = await r.json().catch(() => ({}));
  return Promise.reject(err);
}

export async function doSessionAction(sessionId: string, action: any) {
  const r = await fetch('/api/runtime/action', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ sessionId, action }) 
  });
  if (r.ok) {
    return r.json();
  }
  const err = await r.json().catch(() => ({}));
  return Promise.reject(err);
}
