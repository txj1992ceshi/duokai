/**
 * concurrency-test.js
 * 
 * Tests the session queue and concurrency handling.
 * Usage: node concurrency-test.js <total_requests> <concurrency>
 */

const fetch = globalThis.fetch || require('node-fetch');

const RUNTIME = process.env.RUNTIME || 'http://127.0.0.1:3001';
const START_URL = RUNTIME + '/session/start';

function startOne(i){
  const id = `load-${Date.now()}-${i}`;
  const body = { profile: { id, seed: id, isMobile: false } };
  return fetch(START_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  .then(async r => {
    const json = await r.json().catch(()=>({}));
    return { ok: r.ok, status: r.status, body: json };
  })
  .catch(e => ({ ok: false, err: String(e) }));
}

async function run(total = 20, concurrency = 5){
  const results = new Array(total);
  let idx = 0;
  async function worker(){
    while (true) {
      const i = idx++;
      if (i >= total) return;
      results[i] = await startOne(i);
      console.log(`[#${i}]`, results[i].ok ? `OK ${results[i].body.sessionId||''}` : `ERR ${results[i].err||JSON.stringify(results[i].body)}`);
    }
  }
  const workers = [];
  for (let i=0;i<concurrency;i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

if (require.main === module){
  const total = Number(process.argv[2] || 20);
  const concurrency = Number(process.argv[3] || 5);
  console.log(`Starting ${total} starts with concurrency ${concurrency}`);
  run(total, concurrency).then(r => {
    const ok = r.filter(x=>x.ok).length;
    console.log(`Done. Success ${ok}/${total}`);
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1); });
}
