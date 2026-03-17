// tests/redis-failover-clients.js
const fetch = globalThis.fetch || require('node-fetch');
const args = process.argv.slice(2);
const targets = (args[0] || 'http://127.0.0.1:3001').split(',');
const TOTAL = Number(args[1] || 200);
const CONCURRENCY = Number(args[2] || 20);

function randTarget() { return targets[Math.floor(Math.random()*targets.length)]; }
async function startOne(i) {
  const id = `chaos-${Date.now()}-${i}`;
  const body = { profile: { id, seed: id, isMobile: false } };
  try {
    const r = await fetch(randTarget() + '/session/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await r.json().catch(()=>({}));
    return { ok: r.ok, status: r.status, body: j };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
}

async function worker(startIdx) {
  for (let i = startIdx; i < TOTAL; i += CONCURRENCY) {
    const res = await startOne(i);
    console.log(`[${i}]`, res.ok ? `OK ${res.body.sessionId||''}` : `ERR ${res.err||JSON.stringify(res.body)}`);
    await new Promise(r => setTimeout(r, 200)); // small delay
  }
}

(async () => {
  console.log('Targets:', targets);
  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) workers.push(worker(w));
  await Promise.all(workers);
  console.log('All done.');
})();
