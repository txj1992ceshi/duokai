/**
 * proxy-fault-test.js
 * 
 * Verifies proxy recycling and failure reporting.
 */

const fetch = globalThis.fetch || require('node-fetch');
const RUNTIME = process.env.RUNTIME || 'http://127.0.0.1:3001';

async function addProxies(list){
  await fetch(RUNTIME + '/proxy/add', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({proxies:list})
  });
}

async function status(){ 
  const r = await fetch(RUNTIME + '/proxy/status'); return await r.json();
}

async function tryStartOnce(){
  const id = 'fault-test-' + Date.now();
  const r = await fetch(RUNTIME + '/session/start', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ profile: { id, seed: id } })
  });
  return r.ok ? await r.json() : { ok: false, status: r.status, text: await r.text() };
}

(async ()=>{
  console.log('Importing one bad proxy and one good proxy (示例)');
  // NOTE: Adjust to your real environment or test with local mocks
  await addProxies(['http://invalid:1@127.0.0.1:9999', 'socks5://5.6.7.8:1080']); 
  
  console.log('Pool status:', await status());
  console.log('Trying to start...');
  const res = await tryStartOnce();
  console.log('Start result:', res);
  console.log('Status after attempt:', await status());
})();
