// test_runtime.js
// Node 18+ 环境（内置 fetch）。运行： RUNTIME_URL=http://127.0.0.1:3001 RUNTIME_API_KEY=xxx node test_runtime.js

const RUNTIME_URL = process.env.RUNTIME_URL || 'http://127.0.0.1:3001';
const API_KEY = process.env.RUNTIME_API_KEY || '';
const headers = { 'Content-Type': 'application/json' };
if (API_KEY) headers['x-runtime-key'] = API_KEY;

async function post(path, body) {
  const res = await fetch(`${RUNTIME_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let text = await res.text();
  try { return { ok: res.ok, status: res.status, body: JSON.parse(text) }; }
  catch (e) { return { ok: res.ok, status: res.status, body: text }; }
}

function pretty(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

async function run() {
  console.log('RUNTIME_URL =', RUNTIME_URL);
  console.log('API_KEY  =', API_KEY ? 'SET' : 'NOT SET (no auth)');
  console.log('---');

  // 1) Start session
  console.log('[1] 启动测试会话 (start session)...');
  const startPayload = {
    profile: {
      id: 'autotest',
      name: 'Auto Test',
      ua: 'Antigravity/Bot-1.0',
      seed: 'seed123',
    },
    headless: true, // run headless for test
  };
  const sres = await post('/session/start', startPayload);
  if (!sres.ok) {
    console.error('启动 session 返回非 2xx：', sres.status, pretty(sres.body));
    return process.exitCode = 2;
  }
  const data = sres.body;
  // 多种可能的返回结构
  const sessionId = (data && (data.sessionId || data.id || data.session?.sessionId || data.session?.id)) || null;
  console.log('start response:', pretty(data));
  if (!sessionId) {
    console.error('无法从 start 返回中解析 sessionId，请检查 runtime 接口返回格式。');
    return process.exitCode = 3;
  }
  console.log('-> SESSION_ID =', sessionId);
  console.log('---');

  // helper to eval in page context
  async function evalInPage(sid, script) {
    // Navigate to a blank page first so we can run scripts without CORS/context issues
    await post('/session/action', { sessionId: sid, action: { type: 'goto', url: 'about:blank' } });
    const a = await post('/session/action', { sessionId: sid, action: { type: 'eval', script } });
    return a;
  }

  // 2) IP check
  console.log('[2] 检查外网 IP（确认 proxy 强制生效）...');
  try {
    const script = `(async ()=>{ try { const r = await fetch('https://ipinfo.io/json'); return await r.json(); } catch(e) { return { error: String(e) }; } })()`;
    const r = await evalInPage(sessionId, script);
    console.log('ipinfo result:', pretty(r.body));
    if (r.ok) console.log('PASS: ipinfo 可达/返回。');
    else console.log('WARN/FAIL: ipinfo 请求未返回 2xx:', r.status);
  } catch (e) {
    console.error('ip check failed:', e);
  }
  console.log('---');

  // 3) UA + timezone + canvas quick test
  console.log('[3] 验证 UA / timezone / canvas 输出...');
  try {
    const script = `({ ua: navigator.userAgent, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, canvas: (()=>{try{const c=document.createElement('canvas');c.width=60;c.height=20;const ctx=c.getContext('2d');ctx.fillStyle='rgb(10,20,30)';ctx.fillRect(0,0,60,20);return c.toDataURL();}catch(e){return {err:String(e)}} })() })`;
    const r = await evalInPage(sessionId, script);
    console.log('navigator/timezone/canvas:', pretty(r.body));
    if (r.ok) console.log('PASS: UA/timezone/canvas 返回。');
    else console.log('WARN/FAIL: 非 2xx 返回', r.status);
  } catch (e) {
    console.error('UA/timezone/canvas check failed:', e);
  }
  console.log('---');

  // 4) WebRTC SDP check
  console.log('[4] 验证 WebRTC（检查 SDP 中是否有本地候选）...');
  try {
    const script = `(async ()=>{try{const pc=new RTCPeerConnection();pc.createDataChannel('x');const s=await pc.createOffer();await pc.setLocalDescription(s); return { sdp: s.sdp }; }catch(e){ return { error: String(e) } } })()`;
    const r = await evalInPage(sessionId, script);
    console.log('webrtc offer/response:', pretty(r.body));
    if (r.ok) {
      if(r.body && r.body.result && r.body.result.sdp) {
        const sdp = String(r.body.result.sdp).toLowerCase();
        if (/candidate/.test(sdp) && /192\.||10\.||172\./.test(sdp)) {
          console.warn('WARN: SDP 中可能包含私有局域网 IP 候选（检测到 192.x/10.x/172.x），需确认 WebRTC 是否被有效拦截。');
        } else {
          console.log('PASS: SDP 未发现本地私网候选（或已拦截/过滤）。');
        }
      }
    } else {
      console.log('WARN/FAIL: 非 2xx 返回', r.status);
    }
  } catch (e) {
    console.error('webrtc check failed:', e);
  }
  console.log('---');

  // 5) storageState persistence test
  console.log('[5] storageState 跨会话持久化测试（设置 cookie，停止，会话重启后检查）...');
  try {
    // Try visiting a dummy URL to set cookie on domain
    await post('/session/action', { sessionId, action: { type: 'goto', url: 'http://example.com' } });
    
    // set cookie in current session
    let r = await post('/session/action', { sessionId, action: { type: 'eval', script: `(function(){document.cookie='autotest_token=antigravity123;path=/;max-age=3600';return document.cookie;})()` }});
    console.log('set cookie result:', pretty(r.body));

    // stop this session
    const stopRes = await post('/session/stop', { sessionId });
    console.log('stop response:', pretty(stopRes.body));

    // start a new session for same profileId and check cookie
    const s2 = await post('/session/start', startPayload);
    //console.log('re-start response:', pretty(s2.body));
    const sid2 = (s2.body && (s2.body.sessionId || s2.body.id || s2.body.session?.sessionId || s2.body.session?.id)) || null;
    if (!sid2) {
      console.error('无法从重新启动中解析 sessionId:', pretty(s2.body));
    } else {
      console.log('-> NEW SESSION_ID =', sid2);
      
      await post('/session/action', { sessionId: sid2, action: { type: 'goto', url: 'http://example.com' } });
      
      // eval cookie
      const resCookie = await post('/session/action', { sessionId: sid2, action: { type: 'eval', script: 'document.cookie' } });
      console.log('cookie after restart:', pretty(resCookie.body));
      if (resCookie.body && resCookie.body.result && String(resCookie.body.result).includes('autotest_token=antigravity123')) {
        console.log('PASS: storageState（cookie）在重启后被恢复。');
      } else {
        console.warn('WARN: 重启后未检测到 cookie，可能没有正确保存/恢复 storageState。');
      }
      // stop second session
      await post('/session/stop', { sessionId: sid2 });
    }
  } catch (e) {
    console.error('storageState test failed:', e);
  }
  console.log('---');

  // 6) humanize test (create input, type into it)
  console.log('[6] humanize 行为测试（创建 input，执行 humanType，然后读取值）...');
  try {
    // start a fresh session
    startPayload.profile.id = 'autotest-humanize';
    const s3 = await post('/session/start', startPayload);
    const sid3 = (s3.body && (s3.body.sessionId || s3.body.id || s3.body.session?.sessionId || s3.body.session?.id)) || null;
    if (!sid3) {
      console.error('无法为 humanize 创建 session:', pretty(s3.body));
    } else {
      console.log('humanize -> SESSION_ID =', sid3);
      // inject simple input element
      await evalInPage(sid3, "(() => { document.body.innerHTML = '<input id=\"test_inp\" />'; return true; })()");
      // call type
      const ht = await post('/session/action', { sessionId: sid3, action: { type: 'type', selector: '#test_inp', text: 'hello@antigravity.test' } });
      console.log('humanType result:', pretty(ht.body));
      // read back value
      const val = await post('/session/action', { sessionId: sid3, action: { type: 'eval', script: "document.querySelector('#test_inp') ? document.querySelector('#test_inp').value : null" } });
      console.log('input value after humanType:', pretty(val.body));
      if (val.body && val.body.result && String(val.body.result).includes('hello@antigravity.test')) {
        console.log('PASS: humanType 行为成功并填入文本。');
      } else {
        console.warn('WARN: humanType 后读取到的值不正确，检查 runtime 中 humanType 的实现与 selector 是否支持。');
      }
      await post('/session/stop', { sessionId: sid3 });
    }
  } catch (e) {
    console.error('humanize test failed:', e);
  }

  console.log('--- ALL TESTS DONE ---');
}

run().catch(e => { console.error('脚本运行异常:', e); process.exitCode = 9; });
