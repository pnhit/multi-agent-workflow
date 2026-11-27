#!/usr/bin/env node
// monitor.js: trang theo dõi local dạng văn phòng hoạt hình (mỗi tính năng một dãy bàn). Chỉ đọc.
//
// Chạy:   node workflow/monitor.js              rồi mở http://localhost:4300
//         node workflow/monitor.js --port 5000
//         (thường không cần chạy riêng: sh workflow/watch.sh tự mở kèm monitor)
//         node workflow/monitor.js --demo --port 4321   xem thử giao diện với dữ liệu giả (không đụng dự án)
// Cần:    Node.js 18 trở lên. Không cần cài thư viện nào.
//
// Trang đọc đúng các file mà watch.sh đọc: workflow/agents.txt, workflow/F-*/SPEC.md,
// tasks/, questions/, bugs/, và log trong workflow/logs/. Không bao giờ đọc .env.
// Chỉ lắng nghe trên 127.0.0.1: máy khác trong mạng không truy cập được.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

let port = 4300, DEMO = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--port') port = Number(argv[++i]);
  else if (argv[i] === '--demo') DEMO = true;
  else { console.error('Tham số không hiểu: ' + argv[i]); process.exit(1); }
}

let ROOT;
try { ROOT = cp.execSync('git rev-parse --show-toplevel', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
catch { ROOT = process.cwd(); }
let W = path.join(ROOT, 'workflow');
let RUNDIR = path.join(W, '.run');

// ---------- Đọc dữ liệu ----------
function frontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (!/^---/.test(lines[0] || '')) return {};
  const o = {};
  for (let i = 1; i < lines.length; i++) {
    if (/^---/.test(lines[i])) break;
    const m = lines[i].match(/^([A-Za-z_]+):(.*)$/);
    // "#" chỉ là chú thích khi có khoảng trắng ở cả hai bên ("review  # review | …"), nên "Sửa lỗi #123" giữ nguyên;
    // bỏ một cặp ngoặc bao quanh giá trị. Cùng quy tắc với fm() trong watch.sh.
    if (m) o[m[1]] = m[2].replace(/\s#(\s.*)?$/, '').trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return o;
}
// Lấy các mục có tiêu đề khớp re (ví dụ "Cách thử", "Báo cáo") trong phần thân Markdown
function sections(text, re) {
  const lines = text.split(/\r?\n/), out = [];
  let i = 0;
  if (/^---/.test(lines[0] || '')) { i = 1; while (i < lines.length && !/^---/.test(lines[i])) i++; i++; }
  for (; i < lines.length; i++) {
    const h = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (!h || !re.test(h[2])) continue;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) { const n = lines[j].match(/^(#{1,6})\s/); if (n && n[1].length <= h[1].length) break; body.push(lines[j]); }
    out.push({ title: h[2].trim(), text: body.join('\n').trim().slice(0, 3000) });
    i = j - 1;
  }
  return out;
}
// Phần thân (bỏ frontmatter), dùng cho câu hỏi chờ chủ dự án
const bodyOf = text => text.replace(/^---[\s\S]*?\n---[^\n]*\n?/, '').trim().slice(0, 2000);
const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const isDir = d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } };

// ---------- Xem thử (--demo): dữ liệu giả trong một thư mục tạm, không đọc hay ghi gì của dự án ----------
// Đi qua đủ các trạng thái, mỗi 9 giây một cảnh: agent được gọi đi từ cây nước vào bàn, tính năng xong
// bắn pháo giấy, watch.sh chết thì tắt đèn, rồi quay lại từ đầu. Dữ liệu đi qua đúng các hàm đọc file thật.
function demoSetup() {
  const base = fs.mkdtempSync(path.join(require('os').tmpdir(), 'monitor-demo-'));
  const w = path.join(base, 'workflow');
  const put = (rel, text) => { const p = path.join(w, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  const doc = (o, body) => '---\n' + Object.entries(o).map(([k, v]) => k + ': ' + v).join('\n') + '\n---\n' + (body || '');
  const task = (f, id, title, status, to, assignee, tester) => put(f + '/tasks/' + id + '.md', doc({ id, title, status, to, assignee, tester }));
  const clear = () => { for (const n of fs.existsSync(w) ? fs.readdirSync(w) : []) if (/^F-|^\.run$|^logs$/.test(n)) fs.rmSync(path.join(w, n), { recursive: true, force: true }); };
  const scene = step => {
    clear();
    put('agents.txt', [
      'master-01 master manual phiên chat chính', 'master-02 master manual phiên chat song song',
      'coder-01 coder subagent coder', 'coder-02 coder subagent coder', 'coder-03 coder auto claude -p --model sonnet',
      'coder-04 coder subagent coder-pro', 'coder-05 coder subagent coder',
      'tester-01 tester subagent tester', 'tester-02 tester window agy -i', 'tester-03 tester manual Antigravity'].join('\n') + '\n');
    const t = Math.floor(Date.now() / 1000);
    put('.run/watch.beat', (step === 3 ? t - 900 : t) + ' 30 1\n');
    // F-100: đã xong (chỉ còn trên bảng trắng)
    put('F-100-dang-nhap/SPEC.md', doc({ id: 'F-100', title: 'Trang đăng nhập mới', lane: 'full', status: 'done', to: 'none', master: 'master-01' }));
    put('F-099-slug/SPEC.md', doc({ id: 'F-099', title: 'Slug cho media', lane: 'quick', status: 'delivered', to: 'none', master: 'master-02' }, '## Việc treo\n- chờ feat/media-slug: cập nhật tài liệu API\n'));
    put('.run/coder-04.hist', '2026-11-21T08:10 2026-11-21T08:31 F-099 T-01 in_test\n2026-11-21T09:02 2026-11-21T09:15 F-102 T-01 in_test\n');
    put('.run/tester-03.hist', '2026-11-21T07:40 2026-11-21T08:05 F-100 T-02 verified\n');
    // F-101: đang làm; coder-01 Master gọi, coder-02 có việc chờ, coder-03 (auto) đang chạy, tester-01 có việc kiểm
    const f1 = 'F-101-otp';
    put(f1 + '/SPEC.md', doc({ id: 'F-101', title: 'Đăng nhập bằng mã OTP', lane: 'full', status: 'in_dev', to: 'none', master: 'master-01' }));
    task(f1, 'T-01', 'Gửi mã OTP', 'in_progress', 'coder-01', 'coder-01', 'tester-01');
    task(f1, 'T-02', 'Màn hình nhập mã', 'ready', 'coder-02', 'coder-02', 'tester-01');
    task(f1, 'T-03', 'Giới hạn số lần thử', 'ready', 'coder-03', 'coder-03', 'tester-01');
    task(f1, 'T-04', 'Hết hạn mã', 'in_test', 'tester-01', 'coder-01', 'tester-01');
    put('.run/coder-01.sub', 'F-101 T-01\n');
    put('logs/20261117-090000-coder-03.log', '[đang chạy]\n'); put('.run/coder-03.pid', '1\n'); put('.run/coder-03.job', 'F-101 T-03\n');
    // F-102: làn nhanh, chờ bạn nghiệm thu; cảnh 2: xong (pháo giấy)
    const f2 = 'F-102-vod';
    put(f2 + '/SPEC.md', doc({ id: 'F-102', title: 'Sửa lỗi bảng VOD #42', lane: 'quick', status: step === 2 ? 'done' : 'acceptance', to: step === 2 ? 'none' : 'owner', master: 'master-02' },
      '## Cách thử\n1. Mở trang VOD, lọc theo năm.\n2. Bảng phải hiện đúng 20 dòng mỗi trang.\n'));
    task(f2, 'T-01', 'Sửa phân trang', step === 2 ? 'done' : 'verified', 'none', 'coder-04', 'master-02');
    // F-103: master-01 đang làm rõ (draft, to: none)
    put('F-103-csv/SPEC.md', doc({ id: 'F-103', title: 'Xuất báo cáo CSV', lane: 'full', status: 'draft', to: 'none', master: 'master-01' }));
    put('.run/master-01.now', 'Đang làm rõ: F-103 xuất báo cáo CSV\n');
    // F-104: coder-02 đang hỏi Master, tester-01 đang kiểm (Master gọi), coder-04 có lỗi phải sửa, coder-09 chưa khai báo
    const f4 = 'F-104-push';
    put(f4 + '/SPEC.md', doc({ id: 'F-104', title: 'Thông báo đẩy', lane: 'full', status: 'in_dev', to: 'none', master: 'master-02' }));
    task(f4, 'T-01', 'Đăng ký thiết bị', 'ready', 'coder-09', 'coder-09', 'tester-02');
    task(f4, 'T-02', 'Gửi thông báo', 'in_test', 'tester-01', 'coder-02', 'tester-01');
    task(f4, 'T-03', 'Mẫu nội dung', 'reopened', 'coder-04', 'coder-04', 'tester-02');
    put(f4 + '/questions/D-01.md', doc({ id: 'D-01', title: 'Gửi lại khi thiết bị offline?', from: 'coder-02', to: 'master-02', status: 'open', task: 'T-02' }));
    put(f4 + '/bugs/B-01.md', doc({ id: 'B-01', title: 'Thiếu tiêu đề', task: 'T-03', from: 'tester-02', to: 'coder-04', status: 'open', kind: 'bug' }));
    put('.run/tester-01.sub', 'F-104 T-02\n');
    put('.run/master-02.now', step === 2 ? 'Đang trả lời câu hỏi D-01 (F-104)\n' : 'Chờ bạn: nghiệm thu F-102\n');
    // cảnh 1: coder-05 được giao việc ở F-101, đi từ cây nước vào bàn
    if (step === 1 || step === 2) { task(f1, 'T-05', 'Ghi log đăng nhập', 'in_progress', 'coder-05', 'coder-05', 'tester-01'); put('.run/coder-05.sub', 'F-101 T-05\n'); }
  };
  let step = 0;
  const next = () => { try { scene(step % 5); } catch (e) { console.error(e.message); } step++; };
  next(); setInterval(next, 9000);
  process.on('exit', () => { try { fs.rmSync(base, { recursive: true, force: true }); } catch {} });
  return w;
}
if (DEMO) { W = demoSetup(); RUNDIR = path.join(W, '.run'); }


function readAgents() {
  return read(path.join(W, 'agents.txt')).split(/\r?\n/).map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const p = l.split(/\s+/); return { id: p[0], role: p[1] || '', mode: p[2] || '', note: p.slice(3).join(' ') }; });
}

function lastLog(id) {
  const d = path.join(W, 'logs');
  if (!isDir(d)) return null;
  const names = fs.readdirSync(d).filter(n => n.endsWith('-' + id + '.log')).sort();
  if (!names.length) return null;
  const name = names[names.length - 1];
  const text = read(path.join(d, name));
  const finished = /\[kết thúc/.test(text);
  const lines = text.trimEnd().split(/\r?\n/);
  let mtime = null; try { mtime = fs.statSync(path.join(d, name)).mtime.toISOString(); } catch {}
  return { name, finished, mtime, tail: lines.slice(-15).join('\n') };
}

function readFeatures() {
  if (!isDir(W)) return [];
  return fs.readdirSync(W).filter(n => /^F-\d+/.test(n) && isDir(path.join(W, n))).sort().map(dir => {
    const fd = path.join(W, dir);
    const specText = read(path.join(fd, 'SPEC.md'));
    const s = frontmatter(specText);
    const items = [];
    const add = (rel, m, kind, text) => items.push({
      path: dir + '/' + rel, file: rel, kind, id: m.id || rel, title: m.title || '', status: m.status || '',
      to: m.to || 'none', assignee: m.assignee || '', tester: m.tester || '', from: m.from || '',
      // Chỉ kèm nội dung khi file đang chờ chủ dự án
      sections: m.to !== 'owner' ? [] : kind === 'spec' ? sections(text, /cách thử|báo cáo/i) : [{ title: 'Nội dung', text: bodyOf(text) }],
    });
    if (specText) add('SPEC.md', s, 'spec', specText);
    for (const sub of ['tasks', 'questions', 'bugs']) {
      const sd = path.join(fd, sub);
      if (!isDir(sd)) continue;
      for (const n of fs.readdirSync(sd).filter(n => n.endsWith('.md')).sort()) { const t = read(path.join(sd, n)); add(sub + '/' + n, frontmatter(t), sub, t); }
    }
    return { dir, id: s.id || dir.split('-').slice(0, 2).join('-'), title: s.title || dir, status: s.status || '', to: s.to || 'none', master: s.master || '', lane: s.lane || '', items };
  });
}

// Master ghi .run/<ID>.now một dòng: đang làm gì, hoặc "Chờ bạn: …". Rỗng là phiên rảnh hay đã xong.
function readMasters() {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(RUNDIR).filter(n => n.endsWith('.now')); } catch { return out; }
  for (const n of names) {
    const fp = path.join(RUNDIR, n), text = read(fp).trim().split(/\r?\n/)[0] || '';
    if (!text) continue;
    let at = 0; try { at = fs.statSync(fp).mtimeMs; } catch {}
    out.push({ id: n.slice(0, -4), text: text.slice(0, 300), at, waitOwner: /^chờ bạn/i.test(text) });
  }
  return out;
}

// watch.sh ghi .run/watch.beat "<giây> <chu kỳ> <pid>" mỗi vòng quét; dừng đàng hoàng thì ghi .run/watch.stopped
function readWatch() {
  const b = read(path.join(RUNDIR, 'watch.beat')).trim().split(/\s+/);
  if (b[0]) {
    const at = Number(b[0]) * 1000, iv = Number(b[1]) || 30;
    return { state: Date.now() - at < (iv * 3 + 30) * 1000 ? 'running' : 'dead', at };
  }
  const s = read(path.join(RUNDIR, 'watch.stopped')).trim();
  if (s) { const i = s.indexOf(' '); return { state: 'stopped', at: Number(i > 0 ? s.slice(0, i) : s) * 1000, reason: i > 0 ? s.slice(i + 1) : '' }; }
  return { state: 'never' };
}

function state() {
  const agents = readAgents();
  // Chỉ Master ghi .now. Coder, Tester (subagent cũng nạp CLAUDE.md) lỡ ghi thì bỏ qua, kẻo "Chờ bạn:" của họ
  // (thật ra là chờ Master) hiện thành việc chờ chủ dự án
  const isMaster = new Set(agents.filter(a => a.role === 'master').map(a => a.id));
  const masters = readMasters().filter(m => isMaster.has(m.id));
  // watch.sh ghi .run/merged.txt: "spec <F-NNN> <nhánh> <master>" / "now <master> <nhánh>" cho nhánh đã vào nhánh chính.
  // Dòng "Chờ bạn" của Master nói về nhánh đã merge là dòng cũ: không tính là việc chờ chủ dự án nữa
  const merged = read(path.join(W, '.run', 'merged.txt')).split(/\r?\n/).map(l => l.trim().split(/\s+/)).filter(p => p.length >= 3);
  for (const m of masters) {
    const hit = merged.find(p => p[0] === 'now' && p[1] === m.id);
    if (hit) { m.merged = hit[2]; m.waitOwner = false; }
  }
  const byId = Object.fromEntries(agents.map(a => [a.id, a]));
  for (const a of agents) {
    const lg = lastLog(a.id);
    a.running = !!(lg && !lg.finished && fs.existsSync(path.join(W, '.run', a.id + '.pid')));
    a.lastLog = lg; a.pending = []; a.features = [];
    a.paused = fs.existsSync(path.join(W, '.run', a.id + '.paused'));
    // Subagent do Master gọi không có pid hay log của watch.sh: Master ghi .run/<id>.sub ("F-001 T-01") lúc gọi,
    // ghi rỗng khi xong. File cũ hơn 90 phút coi như Master quên xoá.
    a.sub = '';
    try {
      const sf = path.join(W, '.run', a.id + '.sub');
      if (Date.now() - fs.statSync(sf).mtimeMs < 90 * 60 * 1000) a.sub = read(sf).trim();
    } catch {}
    if (a.sub) a.running = true;
    // Agent auto/window đang chạy: watch.sh ghi .run/<id>.job các việc nó được đánh thức cho ("F-001 T-01, F-001 B-02")
    a.job = a.running && !a.sub ? read(path.join(W, '.run', a.id + '.job')).trim() : '';
    // Các tính năng agent đang chạy cho; rỗng là không biết (hiện "đang chạy" ở mọi dãy bàn như cũ)
    a.runIn = [...new Set(((a.sub || a.job).match(/F-\d+/g) || []))];
    const m = masters.find(x => x.id === a.id);
    a.now = m ? m.text : ''; a.nowWait = !!(m && m.waitOwner);
    // Lịch sử các lần Master gọi subagent: .run/<id>.hist, mỗi dòng "<bắt đầu> <xong> <F-NNN> <T-xx> <kết quả>"
    a.hist = read(path.join(W, '.run', a.id + '.hist')).split(/\r?\n/).filter(l => l.trim()).slice(-6).reverse()
      .map(l => { const p = l.trim().split(/\s+/); return { start: p[0] || '', end: p[1] || '', what: p.slice(2).join(' ') }; });
  }
  const features = readFeatures();
  for (const f of features) { const hit = merged.find(p => p[0] === 'spec' && p[1] === f.id); if (hit) f.merged = hit[2]; }
  const owner = [];
  const unknown = new Set();
  for (const f of features) {
    const members = new Set();
    if (f.master) members.add(f.master);
    for (const it of f.items) {
      for (const x of [it.assignee, it.tester]) if (x) members.add(x);
      if (it.to === 'owner') owner.push({ feature: f.id, featureTitle: f.title, ...it });
      else if (it.to && it.to !== 'none') {
        members.add(it.to);
        if (byId[it.to]) byId[it.to].pending.push(it.path); else unknown.add(it.to);
      }
    }
    f.members = [...members];
    for (const m of f.members) if (byId[m]) byId[m].features.push(f.id); else unknown.add(m);
  }
  return {
    project: DEMO ? 'XEM THỬ (dữ liệu giả)' : path.basename(ROOT), now: new Date().toISOString(),
    hasWorkflow: isDir(W), agents, features, owner, unknown: [...unknown], masters, watch: readWatch(),
    // Do watch.sh ghi mỗi lần quét (việc không ai cầm, status/to lệch, thiếu Nguồn:, chờ quá lâu)
    anomalies: read(path.join(W, '.run', 'lint.txt')).split(/\r?\n/).filter(Boolean).map(s => s.replace(/`/g, '')),
  };
}

// ---------- Máy chủ ----------
// Mã bí mật cho lệnh dừng (sh workflow/watch.sh --stop): ghi vào .run/, chỉ ai đọc được thư mục dự án mới dừng được
const TOKEN = crypto.randomBytes(16).toString('hex');
const runFile = n => path.join(RUNDIR, n);
function writeRun() {
  if (!isDir(W)) return;
  try {
    fs.mkdirSync(RUNDIR, { recursive: true });
    fs.writeFileSync(runFile('monitor.token'), TOKEN, { mode: 0o600 });
    fs.writeFileSync(runFile('monitor.port'), String(port));
    fs.writeFileSync(runFile('monitor.pid'), String(process.pid));
  } catch {}
}
function quit() {
  if (read(runFile('monitor.token')).trim() === TOKEN) for (const n of ['monitor.token', 'monitor.port', 'monitor.pid']) { try { fs.unlinkSync(runFile(n)); } catch {} }
  process.exit(0);
}
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, quit);

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'POST' && url === '/api/stop') {
    if (req.headers['x-token'] !== TOKEN) { res.writeHead(403); return res.end(); }
    res.writeHead(200); res.end('ok');
    return setTimeout(quit, 50);
  }
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  if (url === '/api/state') {
    let body;
    try { body = JSON.stringify(state()); } catch (e) { res.writeHead(500); return res.end(String(e.message)); }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(body);
  }
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(PAGE);
  }
  res.writeHead(404); res.end('Không có');
});
function fail(e) {
  console.error(e && e.code === 'EADDRINUSE'
    ? `Cổng ${port} đang bị chiếm, có thể bởi monitor bản cũ (chưa có lệnh dừng): đóng terminal đang chạy nó. Hoặc dùng cổng khác: --port ${port + 1}`
    : String(e && e.message || e));
  process.exit(1);
}
let retried = false;
server.on('error', e => {
  // Cổng bận vì monitor cũ của chính dự án này: dừng nó bằng mã bí mật nó để lại, rồi chạy bản mới
  const old = read(runFile('monitor.token')).trim(), oldPort = Number(read(runFile('monitor.port')).trim());
  if (e.code !== 'EADDRINUSE' || retried || !old || oldPort !== port) return fail(e);
  retried = true;
  const r = http.request({ host: '127.0.0.1', port, path: '/api/stop', method: 'POST', headers: { 'X-Token': old }, timeout: 3000 }, res => {
    res.resume();
    if (res.statusCode !== 200) return fail(e);
    console.log('Đã dừng monitor cũ trên cổng ' + port + ', chạy bản mới.');
    setTimeout(() => server.listen(port, '127.0.0.1'), 800);
  });
  r.on('error', () => fail(e)); r.on('timeout', () => { r.destroy(); fail(e); }); r.end();
});
server.listen(port, '127.0.0.1', () => {
  writeRun();
  console.log(`Monitor: http://localhost:${port}   (đọc ${W})`);
  console.log('Ctrl+C để dừng, hoặc: sh workflow/watch.sh --stop');
});

// ---------- Trang ----------
const PAGE = String.raw`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Văn phòng agent</title>
<style>
:root{--bg:#e9e1d0;--paper:#fbf4e4;--ink:#3b2a20;--fg:#2d241d;--fg2:#6b5c4e;--line:#cdbfa6;--accent:#2f63c4;
--run:#1f7a4d;--runbg:#dff3e6;--wait:#9a5a00;--waitbg:#fdf0d2;--bad:#b23030;--badbg:#fbe3e0}
@media (prefers-color-scheme:dark){:root{--bg:#1d1a17;--paper:#2a2520;--ink:#0e0c0a;--fg:#f2ebdf;--fg2:#bcae9c;--line:#4a4036;--accent:#8fb4ff;
--run:#6bd79f;--runbg:#1d3a2b;--wait:#f2b44f;--waitbg:#3d2f16;--bad:#ff8f8f;--badbg:#3f2020}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:16px}
main{margin:0 auto} /* rộng hết màn hình; văn phòng tự xếp thêm bàn, thêm phòng chờ theo độ rộng */
.banner p,.ask,#needBox>.muted,.legend span{max-width:130ch} /* dòng chữ quá dài thì khó đọc */
.pix{background:var(--paper);border:3px solid var(--ink);box-shadow:4px 4px 0 var(--ink);padding:12px 14px;margin-bottom:16px}
header.pix{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
h1{font:700 19px ui-monospace,Consolas,monospace;margin:0;letter-spacing:.02em}
h2{font:700 12.5px ui-monospace,Consolas,monospace;text-transform:uppercase;letter-spacing:.06em;color:var(--fg2);margin:0 0 8px}
.sp{flex:1}
.badge{font:700 12px ui-monospace,Consolas,monospace;padding:3px 8px;border:2px solid var(--ink);background:var(--paper);white-space:nowrap}
.badge.warn{background:var(--waitbg);color:var(--wait)}.badge.off{background:var(--badbg);color:var(--bad)}
.banner{font:700 18px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer}
.banner.owner{background:var(--badbg);color:var(--bad);border-color:var(--bad);box-shadow:4px 4px 0 var(--bad);font-size:20px}
.banner.flow{background:var(--runbg);color:var(--run);border-color:var(--run);box-shadow:4px 4px 0 var(--run)}
.banner p{margin:2px 0}.banner .small{font-size:14px;font-weight:600}.banner .alert{color:var(--bad);font-size:15px}
.need.on{background:var(--waitbg);border-color:var(--wait);box-shadow:4px 4px 0 var(--wait)}
.need.on h2{color:var(--wait)}
.ask{border-top:2px dashed var(--line);padding:10px 0 4px}.ask:first-of-type{border-top:0;padding-top:0}
.ask .act{font-weight:700;font-size:16px;margin:0 0 2px}
.ask p{margin:2px 0}.ask .say code{background:var(--paper);border:1px solid var(--line);padding:1px 6px;font-size:14px}
.ask details{margin-top:6px}.ask pre{white-space:pre-wrap;font:13px/1.5 ui-monospace,Consolas,monospace;background:var(--paper);border:1px solid var(--line);padding:8px 10px;margin:4px 0 0;max-height:360px;overflow:auto}
.muted{color:var(--fg2);font-size:13px;margin:0}
.scene{padding:6px;background:#2a211b}
#office{display:block;width:100%;height:auto}
.scene{position:relative}
#walk,#pets{position:absolute;left:6px;top:6px;width:calc(100% - 12px);height:auto;pointer-events:none}
#pets .crit{pointer-events:auto;cursor:pointer}#pets text{font-family:ui-monospace,Consolas,monospace;font-weight:700}
#office text{font-family:ui-monospace,Consolas,monospace;font-weight:700}
#office .ag{cursor:pointer}
#office .ag:focus{outline:none}
#office .ag .sel{display:none}#office .ag.on .sel,#office .ag:focus-visible .sel,#office .ag:hover .sel{display:inline}
#office .sit .armR,#office .sit .armL,#office .conf rect,#office .eyes{transform-box:fill-box}
@media (prefers-reduced-motion:no-preference){
 .sit.type .armL{animation:tp .32s steps(2) infinite}.sit.type .armR{animation:tp .32s steps(2) infinite .16s}@keyframes tp{50%{transform:translateY(-2px)}}
 .sit.wait .armR{animation:tap 1.1s steps(2) infinite}@keyframes tap{50%{transform:translateY(-3px)}}
 .sit.idle{animation:nod 3.2s ease-in-out infinite}@keyframes nod{50%{transform:translateY(1px)}}
 .glow{animation:glow 1.4s ease-in-out infinite}@keyframes glow{50%{opacity:.35}}
 .sit.hand .armR{animation:hand .9s ease-in-out infinite;transform-origin:50% 100%}@keyframes hand{50%{transform:rotate(9deg)}}
 .code rect{animation:cd 1.2s steps(1) infinite}.code rect:nth-child(2){animation-delay:.3s}.code rect:nth-child(3){animation-delay:.6s}.code rect:nth-child(4){animation-delay:.9s}@keyframes cd{50%{opacity:.15}}
 .steam rect{animation:st 1.6s ease-out infinite}.steam rect:nth-child(2){animation-delay:.7s}@keyframes st{0%{transform:translateY(2px);opacity:0}40%{opacity:.9}100%{transform:translateY(-5px);opacity:0}}
 .bug{animation:crawl 2.6s steps(7) infinite alternate}@keyframes crawl{100%{transform:translateX(20px)}}
 .bub.bob{animation:bob 1.2s ease-in-out infinite}@keyframes bob{50%{transform:translateY(-2px)}}
 .zzz{animation:zz 2.8s ease-in-out infinite}
 .bub.zz{animation:zz 2.8s ease-in-out infinite}@keyframes zz{0%,100%{transform:translate(0,0);opacity:.7}50%{transform:translate(2px,-3px);opacity:1}}
 .sip{animation:sip 3.6s steps(1) infinite}@keyframes sip{0%,70%{transform:none}75%,95%{transform:translateY(-8px)}}
 .eyes{animation:blink 4.2s steps(1) infinite;transform-origin:center}@keyframes blink{0%,94%{transform:none}95%,100%{transform:scaleY(.2)}}
 .wave{animation:paper 1s ease-in-out infinite}@keyframes paper{50%{transform:translateY(-3px)}}
 .walker .legL{animation:wl .3s steps(2) infinite}.walker .legR{animation:wl .3s steps(2) infinite .15s}@keyframes wl{50%{transform:translateY(-2px)}}
 .ag.arrive{animation:arrive 1.45s steps(1) both}@keyframes arrive{0%{opacity:0}100%{opacity:1}}
 .mhand{animation:spin 12s linear infinite}.hhand{animation:spin 144s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
 .conf rect{animation:fall 2.8s linear infinite;transform-origin:center}@keyframes fall{0%{transform:translateY(-6px) rotate(0)}100%{transform:translateY(96px) rotate(540deg)}}
 .blink{animation:bl 1s steps(2) infinite}@keyframes bl{50%{opacity:.35}}
 .fish{animation:swim 7s ease-in-out infinite;transform-box:fill-box;transform-origin:center}.fish.f2{animation-duration:9s;animation-delay:-4s}
 @keyframes swim{0%{transform:translateX(0)}45%{transform:translateX(36px)}50%{transform:translateX(36px) scaleX(-1)}95%{transform:translateX(0) scaleX(-1)}100%{transform:translateX(0)}}
 .bubl circle{animation:rise 2.4s linear infinite}.bubl circle:nth-child(2){animation-delay:.8s}.bubl circle:nth-child(3){animation-delay:1.6s}@keyframes rise{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-22px);opacity:0}}}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:#e9dcc6;padding:6px 4px 2px}
details{margin:6px 0}details summary{cursor:pointer;font-weight:600}
table{border-collapse:collapse;width:100%;font-size:13px;margin-top:4px}
td{padding:3px 6px;border-top:1px dashed var(--line);vertical-align:top}
td:last-child{white-space:nowrap}
.sq{display:inline-block;width:10px;height:10px;border:1px solid var(--ink);margin-right:6px;vertical-align:-1px}
#detail{position:fixed;right:16px;bottom:16px;width:min(460px,calc(100% - 32px));max-height:70vh;overflow:auto;display:none;z-index:5}
#detail pre{white-space:pre-wrap;font-size:12px;background:var(--bg);border:1px solid var(--line);padding:8px;max-height:280px;overflow:auto}
#detail button{float:right;font:inherit;font-size:13px;border:2px solid var(--ink);background:var(--paper);color:var(--fg);cursor:pointer;box-shadow:2px 2px 0 var(--ink)}
</style></head>
<body><main>
<header class="pix"><h1 id="proj">VĂN PHÒNG AGENT</h1><span class="sp"></span>
<span class="badge" id="bFeat"></span><span class="badge" id="bRun"></span><span class="badge warn" id="bNeed"></span><span class="badge" id="bWatch"></span><span class="badge" id="bConn">…</span></header>
<section class="pix banner" id="banner" hidden tabindex="0" role="button"></section>
<section class="pix need" id="needBox"><h2>Cần bạn</h2><div id="need"></div></section>
<section class="pix scene" aria-label="Văn phòng: mỗi tính năng một dãy bàn">
<svg id="office" role="img" aria-label="Văn phòng agent"></svg>
<svg id="walk" aria-hidden="true"></svg>
<svg id="pets" aria-hidden="true"></svg>
<div class="legend" id="legend"></div>
</section>
<section class="pix"><h2>File của từng tính năng</h2><div id="files"></div></section>
<p class="muted">Trang chỉ đọc, tự làm mới 3 giây một lần. Bấm vào nhân vật để xem chi tiết. Trả lời và duyệt: nói với Master.</p>
</main>
<section class="pix" id="detail" aria-live="polite"></section>
<script>
const COLORS=['#2f6fe0','#1f9a6e','#e07a1f','#8b4fd0','#d8457f','#0f8f9f','#a0782a'];
const HAIR=['#3b2a20','#7a4a22','#c9a24a','#2d2d3a','#a33a2a','#5a3a2a','#1f1a17','#6b3d1e'];
const $=s=>document.querySelector(s);
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let S=null,openId=null;const OPEN=new Map();
const MODE_NAME={auto:'chạy ngầm tự động',window:'tự mở cửa sổ',manual:'đánh thức tay',subagent:'subagent, Master tự gọi'};
const MODE_WAIT={auto:'Có việc, chờ watch.sh đánh thức',window:'Có việc, chờ watch.sh mở cửa sổ',manual:'Có việc, cần mở phiên tay',subagent:'Có việc, chờ Master gọi'};
const ST={draft:'chờ bạn duyệt',review:'đang khảo sát',reviewed:'đã khảo sát',in_dev:'đang làm',ready:'sẵn sàng làm',in_test:'đang kiểm tra',verified:'kiểm tra đạt',reopened:'phải sửa lại',acceptance:'chờ bạn nghiệm thu',delivered:'đã giao, chờ merge',done:'xong',open:'đang mở',answered:'đã trả lời',closed:'đã đóng',fixed:'đã sửa'};
const stVi=x=>ST[x]||x||'?';
// Vì sao dãy bàn không có Tester: ghi theo làn của tính năng
const LANE_NOTE={quick:'làn nhanh: Master tự kiểm, không có Tester'};
// Nhãn trạng thái của tính năng / file: draft chỉ là "chờ bạn duyệt" khi to: owner; còn lại Master đang làm rõ
const stOf=o=>o.merged&&o.status==='delivered'?'đã merge, chờ Master dọn':o.status==='draft'&&o.to!=='owner'?'đang làm rõ':stVi(o.status);
// Chủ dự án cần làm gì với một file to: owner
function ownerAction(o){
 if(o.kind==='spec'&&o.status==='acceptance')return{act:'Đã làm xong, chờ bạn nghiệm thu',how:'Thử theo hướng dẫn bên dưới. Ổn thì nói với Master câu này; chưa ổn thì nói rõ chỗ chưa đạt.',say:'đạt'};
 if(o.kind==='spec')return{act:'Tài liệu chờ bạn duyệt',how:'Đọc file workflow/'+o.path+'. Ổn thì nói với Master câu này; chưa ổn thì nói chỗ cần sửa.',say:'duyệt'};
 if(o.kind==='questions')return{act:'Câu hỏi chờ bạn trả lời',how:'Master sẽ hỏi bạn trong phiên chat. Nếu Master chưa hỏi, nói với Master câu này.',say:'Xử lý việc đang chờ'};
 return{act:'Cần bạn xem',how:'Mở file workflow/'+o.path+' rồi trao đổi với Master.',say:''};
}
const hashN=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;return h};

/* ---------- vẽ: hình vector bo tròn, có viền và đổ bóng nhẹ ---------- */
const OL='#2b1d16'; // viền
const R=(x,y,w,h,c,ex)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+c+'"'+(ex||'')+'/>';
const RR=(x,y,w,h,r,c,ex)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'" fill="'+c+'"'+(ex||'')+'/>';
const E=(cx,cy,rx,ry,c,ex)=>'<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+rx+'" ry="'+ry+'" fill="'+c+'"'+(ex||'')+'/>';
const C=(cx,cy,r,c,ex)=>'<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+c+'"'+(ex||'')+'/>';
const P=(d,c,ex)=>'<path d="'+d+'" fill="'+c+'"'+(ex||'')+'/>';
const LN=(d,c,w)=>'<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="'+(w||1)+'" stroke-linecap="round" stroke-linejoin="round"/>';
const K=w=>' stroke="'+OL+'" stroke-width="'+(w||1)+'" stroke-linejoin="round"';
const T=(x,y,s,c,t,a)=>'<text x="'+x+'" y="'+y+'" font-size="'+s+'" fill="'+c+'" text-anchor="'+(a||'middle')+'">'+esc(t)+'</text>';
const ROT=(a,x,y)=>' transform="rotate('+a+' '+x+' '+y+')"';
// Làm tối (k<0) hay sáng (k>0) một màu #rrggbb
const tint=(h,k)=>{const n=parseInt(h.slice(1),16),f=v=>Math.round(k<0?v*(1+k):v+(255-v)*k);return '#'+[n>>16,(n>>8)&255,n&255].map(v=>f(v).toString(16).padStart(2,'0')).join('')};
function defs(){return '<defs>'
 +'<linearGradient id="shd" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>'
 +'<linearGradient id="scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#302c5c"/><stop offset="1" stop-color="#15142a"/></linearGradient>'
 +'<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+(NIGHT?'#0d1636':'#68b8ef')+'"/><stop offset="1" stop-color="'+(NIGHT?'#2b3d70':'#d6f1ff')+'"/></linearGradient>'
 +'<linearGradient id="wallg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4ebd9"/><stop offset="1" stop-color="#e7d9bf"/></linearGradient>'
 +'<radialGradient id="glow"><stop offset="0" stop-color="#ffd98a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>'
 +'<pattern id="wp" width="22" height="22" patternUnits="userSpaceOnUse">'+P('M11 6 l2.4 5 l-2.4 5 l-2.4 -5z','#e6d7ba')+C(0,0,1.3,'#e6d7ba')+C(22,0,1.3,'#e6d7ba')+C(0,22,1.3,'#e6d7ba')+C(22,22,1.3,'#e6d7ba')+'</pattern>'
 +'<pattern id="fl" width="80" height="20" patternUnits="userSpaceOnUse">'+R(0,0,80,10,'#dcaa74')+R(0,10,80,10,'#d5a06a')+R(0,0,80,.8,'#b88250')+R(0,10,80,.8,'#b88250')+R(52,0,.8,10,'#b88250')+R(18,10,.8,10,'#b88250')
  +LN('M4 4 q12 -1.6 24 0 t22 0','#e8bb88',.6)+LN('M57 6 q9 1 18 0','#e8bb88',.6)+LN('M24 15 q14 -1.6 28 0','#c8915c',.6)+LN('M60 16 q6 -1 14 0','#c8915c',.6)+'</pattern>'
 // thảm phòng chờ
 +'<pattern id="lf" width="18" height="18" patternUnits="userSpaceOnUse">'+R(0,0,18,18,'#b9c7b2')+C(4.5,4.5,1.1,'#a8b9a0')+C(13.5,13.5,1.1,'#a8b9a0')+'</pattern>'
 +'</defs>'}
/* ---------- tường, sàn ---------- */
function wall(){const x0=VX,w=VW;
 let s=R(x0,0,w,76,'url(#wallg)')+R(x0,0,w,76,'url(#wp)')+R(x0,0,w,8,'#7a4a2c')+R(x0,8,w,2,'#5e3820')
  +R(x0,76,w,36,'#a8bea6')+R(x0,73,w,4,'#8aa58a')+R(x0,73,w,1,'#c6d6c4');
 for(let x=x0+4;x<x0+w;x+=44)s+=RR(x,82,36,24,2,'none',' stroke="#91aa8f" stroke-width="1.2"');
 return s+R(x0,111,w,7,'#8a5a3a')+R(x0,111,w,1.5,'#a87250')+R(x0,117,w,1,'#5e3820');
}
// Tranh phong cảnh treo tường
function picture(x,y){return RR(x,y,32,26,1.5,'#c9a24a',K(.9))+R(x+3,y+3,26,20,'#a9dcf5')+C(x+22,y+9,3,'#ffe27a')
 +P('M'+(x+3)+' '+(y+23)+' l8 -10 l6 6 l5 -5 l7 9z','#5fae55')+P('M'+(x+9)+' '+(y+15)+' l2 -2 l2 2z','#fbfbf7')}
// Màn hình rộng: lấp phần tường thừa bằng cửa sổ, tranh, tủ sách
function fillWall(x0,x1){let s='',i=0;
 const items=[[118,x=>windowPane(x+19,18,80,46)],[44,x=>picture(x+6,30)],[60,x=>bookshelf(x+6,28,48,84)],[44,x=>picture(x+6,26)+sconce(x+22,64)]];
 for(;;){const [w,f]=items[i%items.length];if(x0+w>x1)break;s+=f(x0);x0+=w;i++}return s}
/* ---------- phòng chờ và góc giải trí bên trái (màn hình rộng) ---------- */
// Sofa nhìn thẳng: lưng và đệm vẽ trước người ngồi, tay vịn vẽ sau. y: đỉnh đầu người ngồi
function sofaBack(x,y,w,c){let s=RR(x,y+9,w,19,7,c,K(1))+RR(x+3,y+11,w-6,3,1.5,'rgba(255,255,255,.2)')+RR(x+2,y+24,w-4,8,3,tint(c,.15),K(.9))
  +RR(x+3,y+31,4,5,1,'#5e3820')+RR(x+w-7,y+31,4,5,1,'#5e3820');
 for(let k=1;k<w/32;k++)s+=R(x+k*32,y+12,1,12,tint(c,-.2));return s}
function sofaArms(x,y,w,c){return RR(x-6,y+17,12,17,5,c,K(1))+RR(x+w-6,y+17,12,17,5,c,K(1))+RR(x-4,y+18,8,3,1.5,'rgba(255,255,255,.22)')+RR(x+w-4,y+18,8,3,1.5,'rgba(255,255,255,.22)')}
// Tường phòng chờ: cột ngăn, TV báo số việc, biển tên
function loungeWall(run,need,done){
 let s=RR(-150,22,92,54,3,'#2d2d3a',K(1))+RR(-146,26,84,46,2,'url(#scr)')+R(-110,76,12,4,'#2d2d3a')+RR(-118,79,28,3,1.5,'#2d2d3a')
  +T(-104,39,7,'#7de0a0','ĐANG CHẠY '+run)+T(-104,52,7,need?'#ff9c9c':'#ddd3c5','CHỜ BẠN '+need)+T(-104,65,7,'#ffe066','XONG '+done);
 s+=RR(-142,86,76,14,3,'#3b2a20',K(.6))+T(-104,96,7.5,'#f2c14e','PHÒNG CHỜ')+plantBig(-176,FLOOR_Y)+sconce(-40,30);
 return s+R(-8,0,8,FLOOR_Y,'#8a5a3a')+R(-7,0,2,FLOOR_Y,'#a87250')}
// Vách ngăn phòng chờ với văn phòng, chừa lối đi ở các lối ngang
function partition(gaps,H){let s='',a=FLOOR_Y;
 gaps.slice().sort((p,q)=>p-q).forEach(g=>{if(g-22>a)s+=RR(-7,a,6,g-22-a,2,'#a8794c',K(.8));a=Math.max(a,g+6)});
 return s+(H>a?RR(-7,a,6,H-a,2,'#a8794c',K(.8)):'')}
function fish(x,y,c){return P('M'+(x-4)+' '+y+' l-4 -3 l0 6z',c,K(.5))+E(x,y,4.5,2.6,c,K(.5))+C(x+2,y-.6,.6,OL)}
function aquarium(x,b){return RR(x,b-20,76,20,2,'#8a5634',K(1))+R(x+3,b-13,70,1,'#6e4228')
 +RR(x+2,b-62,72,42,3,'#bfe7f7',K(1))+R(x+4,b-58,68,36,'#6fc3e6')+R(x+4,b-28,68,6,'#e8d29a')
 +LN('M'+(x+12)+' '+(b-23)+' q-3 -6 0 -12 q3 -6 0 -12','#3f8f4a',1.6)+LN('M'+(x+62)+' '+(b-23)+' q3 -5 0 -10 q-3 -5 0 -9','#4fa35a',1.6)
 +RR(x+40,b-28,10,6,2,'#9aa3b5',K(.5))
 +'<g class="fish">'+fish(x+22,b-44,'#f28c28')+'</g><g class="fish f2">'+fish(x+20,b-34,'#f2c14e')+'</g>'
 +'<g class="bubl">'+C(x+58,b-30,1.2,'#ffffff')+C(x+60,b-36,1,'#ffffff')+C(x+57,b-42,.8,'#ffffff')+'</g>'+R(x,b-64,76,4,'#3b3b3b')}
function arcade(x,b){return RR(x,b-62,32,62,3,'#6a3fa0',K(1))+RR(x+3,b-60,26,8,1.5,'#f2c14e')+T(x+16,b-54,5.5,'#6a3fa0','GAME')
 +RR(x+4,b-49,24,18,2,'#15142a',K(.6))+R(x+9,b-45,3,2,'#7de0a0')+R(x+15,b-45,3,2,'#7de0a0')+R(x+21,b-45,3,2,'#7de0a0')+R(x+12,b-42,8,2,'#7de0a0')
 +'<g class="blink">'+R(x+15,b-36,2,3,'#ffe066')+'</g>'+R(x+2,b-30,28,8,'#5a2f8a')+LN('M'+(x+10)+' '+(b-26)+' l0 -4','#2b2b2b',1)+C(x+10,b-30,1.8,'#e05555',K(.4))
 +C(x+20,b-26,1.4,'#3f7ee0')+C(x+25,b-26,1.4,'#f2c14e')+RR(x+8,b-17,16,9,1,'#2d1f45')+R(x+15,b-14,2,4,'#f2c14e')}
function foosball(x,b){let s=RR(x+4,b-14,4,14,1,'#5e3820')+RR(x+64,b-14,4,14,1,'#5e3820')+RR(x,b-32,72,20,3,'#8a5634',K(1))+RR(x+4,b-29,64,14,2,'#4fa35a')
  +LN('M'+(x+36)+' '+(b-29)+' l0 14','#e9f5e3',.8)+C(x+36,b-22,3,'none',' stroke="#e9f5e3" stroke-width=".8"')+C(x+30,b-20,1.4,'#ffffff');
 [14,26,46,58].forEach((dx,i)=>s+=LN('M'+(x+dx)+' '+(b-35)+' l0 26','#c9cdd6',1)+RR(x+dx-2,b-25+(i%2)*3,4,5,1,i<2?'#e05555':'#3f7ee0',K(.4)));
 return s}
function vending(x,b){let s=RR(x,b-52,40,52,3,'#c94040',K(1))+RR(x+5,b-47,22,34,1.5,'#1f2a45');
 for(let r=0;r<3;r++)for(let c=0;c<3;c++)s+=RR(x+8+c*6.5,b-44+r*11,4.5,8,1.5,['#f2c14e','#4fa35a','#3f7ee0'][(r+c)%3]);
 return s+RR(x+30,b-44,6,14,1,'#e9e3d8',K(.4))+RR(x+7,b-10,18,5,1,'#2b1d16')}
function dogBed(x,b){return E(x,b+3,17,6,'#8a5a3a',K(.9))+E(x,b+2,13,3.8,'#ecd8b6')+RR(x+19,b+2,8,2,1,'#fbfbf7',K(.4))+C(x+19,b+2,1.5,'#fbfbf7',K(.4))+C(x+27,b+2,1.5,'#fbfbf7',K(.4))
 +E(x-26,b+2,6,2.4,'#3f7ee0',K(.6))+E(x-26,b+1,4,1.2,'#c98d52')}
// Góc giải trí dưới phòng chờ, từ lối d0 tới lối dưới cùng laneB
function playCorner(d0,laneB){let s=aquarium(-182,d0+66)+arcade(-92,d0+66)+foosball(-182,d0+132)+vending(-96,d0+132)+dogBed(BED_X,laneB-4)+plantBig(-44,laneB-8);
 for(let y=d0+200,i=0;y<=laneB-56;y+=66,i++)s+=i%2?bookshelf(-182,y-56,48,56):plantBig(-160,y);
 return s}
function bunting(x0,x1,y,sag){const c=['#e05555','#f2c14e','#4fa35a','#3f7ee0','#9a5fd6'];
 let s=LN('M'+x0+' '+y+' Q'+(x0+x1)/2+' '+(y+sag*2)+' '+x1+' '+y,'#7a3d20',.8);const n=Math.floor((x1-x0)/13);
 for(let i=1;i<n;i++){const t=i/n,x=x0+(x1-x0)*t,yy=y+4*sag*t*(1-t);s+=P('M'+(x-4)+' '+yy+' l8 0 l-4 8z',c[i%c.length],K(.5))}return s}
function plantSmall(x,b){return E(x-2.6,b-10,2,4.2,'#4f9a48',K(.5)+ROT(-28,x-2.6,b-10))+E(x+2.6,b-10,2,4.2,'#5fae55',K(.5)+ROT(28,x+2.6,b-10))+E(x,b-12,2,4.6,'#478f41',K(.5))
 +RR(x-4,b-7,8,7,1.5,'#d9774a',K(.7))+R(x-3.5,b-6.3,7,1.2,'#ee9a66')}
function plantBig(x,b){let s='';
 [[-8,-30,-32],[8,-30,32],[-5,-40,-12],[5,-40,12],[0,-46,0],[-11,-21,-55],[11,-21,55]].forEach(([dx,dy,a],i)=>s+=E(x+dx,b+dy,4.2,10.5,i%2?'#5fae55':'#478f41',K(.6)+ROT(a,x+dx,b+dy)));
 return s+P('M'+(x-9)+' '+(b-16)+' l18 0 l-3 16 l-12 0z','#c96a3a',K(.9))+RR(x-10.5,b-19,21,4.5,1.5,'#b2582c',K(.8))}
function bookshelf(x,y,w,h){const cols=['#d64545','#3f7ee0','#4fa35a','#f2c14e','#9a5fd6','#e07a1f','#2fa3a3'];
 let s=RR(x,y,w,h,2,'#8a5634',K(1))+R(x+3,y+3,w-6,h-6,'#5a3420');const n=3,sh=(h-6)/n;
 for(let r=0;r<n;r++){const base=y+3+(r+1)*sh-3;let bx=x+5,i=0;
  while(bx<x+w-10){const bw=3+((r*5+i*3)%3),bh=sh-6-((i*7+r*3)%4),c=cols[(i+r*2)%cols.length];
   if((i+r)%5===4){s+=P('M'+bx+' '+base+' l'+bw+' 0 l4 '+(1-bh)+' l'+(-bw)+' 0z',c,K(.4));bx+=bw+5}
   else{s+=RR(bx,base-bh,bw,bh,.6,c,K(.4))+R(bx+.6,base-bh+2,bw-1.2,1,'rgba(255,255,255,.4)');bx+=bw+.8}i++}
  s+=R(x+3,base,w-6,3,'#a06a42')}
 return s+plantSmall(x+w-11,y)+RR(x+6,y-6,12,6,1,'#3f7ee0',K(.5))+RR(x+7,y-10,10,4,1,'#e05555',K(.5))}
function cooler(x){return RR(x+4,38,18,24,7,'#8fd3f4',K(1))+RR(x+7,41,4,16,2,'rgba(255,255,255,.55)')+R(x+9,61,8,3,'#6fb6dc')
 +RR(x,62,26,50,3,'#e4e9f0',K(1))+R(x+2,64,22,3,'rgba(255,255,255,.7)')+RR(x+4,70,18,12,2,'#c9d1dd',K(.6))+C(x+9,76,1.7,'#e05555')+C(x+17,76,1.7,'#3f7ee0')+RR(x+5,86,16,3,1,'#9aa3b5')
 +P('M'+(x+28)+' '+80+' l6 0 l-1 8 l-4 0z','#ffffff',K(.5))+P('M'+(x+28)+' '+86+' l6 0 l-1 8 l-4 0z','#ffffff',K(.5))}
function pantry(x){return RR(x,84,38,28,2,'#c88f5a',K(1))+R(x+19,86,1,24,'#8a5a30')+C(x+16,97,1,'#5e3820')+C(x+22,97,1,'#5e3820')+RR(x-2,80,42,5,1.5,'#8a5a3a',K(.8))
 +RR(x+3,54,20,26,3,'#3a3d4a',K(1))+RR(x+6,57,14,6,1.5,'#7de0a0')+R(x+11,66,4,3,'#222')+RR(x+9,71,8,8,1.2,'#ffffff',K(.6))
 +RR(x+26,72,6,8,1.5,'#e05555',K(.6))+RR(x+32,74,5,6,1.5,'#3f7ee0',K(.6))}
function windowPane(x,y,w,h){let s=RR(x,y,w,h,2,'#f4efe6',K(1))+R(x+3,y+3,w-6,h-6,'url(#sky)');
 if(NIGHT){s+=C(x+w-18,y+13,5,'#f4e9b8')+C(x+w-16,y+12,4.4,'#1b2a52');[[8,9],[22,18],[35,8],[48,22],[15,30],[58,12]].forEach(([a,b])=>s+=C(x+a,y+b,.8,'#fff'))}
 else s+=C(x+w-18,y+12,5,'#ffe27a')+E(x+20,y+14,8,3.5,'#fff')+E(x+26,y+12,6,4,'#fff')+E(x+50,y+24,7,3,'#fff');
 s+=P('M'+(x+3)+' '+(y+h-3)+' q'+(w*.25)+' -14 '+(w*.5)+' -6 q'+(w*.25)+' -10 '+(w*.5-6)+' -2 l0 8z',NIGHT?'#1f3a3a':'#7cc47a');
 s+=R(x+w/2-1.5,y+2,3,h-4,'#f4efe6')+R(x+2,y+h/2-1.5,w-4,3,'#f4efe6');
 const cur=(cx,f)=>P('M'+cx+' '+(y-4)+' l'+(f*14)+' 0 q'+(f*-4)+' '+(h*.5)+' '+(f*-2)+' '+(h+4)+' l'+(f*-12)+' 0z','#e07a6a',K(.8))
  +LN('M'+(cx+f*5)+' '+y+' l'+(-f)+' '+h,'#c25a4a',.8)+LN('M'+(cx+f*9)+' '+y+' l'+(-f*2)+' '+(h-2),'#c25a4a',.8);
 return s+LN('M'+(x-8)+' '+(y-4)+' l'+(w+16)+' 0','#7a4a2c',2.2)+cur(x-6,1)+cur(x+w+6,-1)+RR(x-4,y+h,w+8,4,1.5,'#d9cbb2',K(.8))}
// Đồng hồ treo tường: kim chạy khi watch.sh đang chạy, đứng yên khi nó tắt
function clock(cx,cy,run){let s=C(cx,cy,12,'#7a4a2c',K(1))+C(cx,cy,10,'#ffffff');
 for(let i=0;i<12;i++){const a=i*Math.PI/6;s+=C(cx+Math.sin(a)*8,cy-Math.cos(a)*8,i%3?.6:1,'#5b4a40')}
 const o=' style="transform-origin:'+cx+'px '+cy+'px"';
 return s+'<g class="'+(run?'hhand':'')+'"'+o+'>'+LN('M'+cx+' '+cy+' l5 0','#3b2a20',1.6)+'</g><g class="'+(run?'mhand':'')+'"'+o+'>'+LN('M'+cx+' '+cy+' l0 -8','#c23b3b',1.1)+'</g>'+C(cx,cy,1.3,OL)}
// Cửa: mở khi có việc chờ bạn
function door(x,open){const y=24,w=50,h=88;let s=RR(x-4,y-4,w+8,h+4,2,'#7a4a2c',K(1));
 if(open)s+=R(x,y,w,h,'#2c201a')+P('M'+x+' '+(y+h)+' l0 '+(-h)+' l'+(w*.35)+' -6 l0 '+(h+10)+'z','#c88050',K(.8))+C(x+w*.3,y+h*.55,1.5,'#f0d07a');
 else s+=RR(x,y,w,h,1,'#c88050')+RR(x+6,y+8,w-12,30,2,'#d99a68',K(.6))+RR(x+6,y+46,w-12,34,2,'#d99a68',K(.6))+C(x+w-8,y+h*.55,2,'#f0d07a',K(.5));
 return s}
function whiteboard(){return RR(362,12,148,96,3,'#c9ced8',K(1))+RR(366,16,140,88,1.5,'#fbfbf8')+RR(380,107,112,4,1.5,'#9aa3b5',K(.6))+RR(390,104.5,10,3,1,'#e05555')+RR(402,104.5,10,3,1,'#3f7ee0')+RR(472,104,12,4,1,'#3b3b3b')}
function calendar(x,y){let s=RR(x,y,30,32,2,'#fbfbf7',K(.8))+RR(x,y,30,9,2,'#d64545')+R(x,y+5,30,4,'#d64545')+C(x+7,y,1.5,'#3b2a20')+C(x+23,y,1.5,'#3b2a20');
 for(let r=0;r<4;r++)for(let c=0;c<5;c++)s+=RR(x+3+c*5.2,y+12+r*5,3.6,3,.6,r===2&&c===3?'#d64545':'#d6d0c4');return s}
function poster(x,y){let s=RR(x,y,34,44,1.5,'#2f3d6b',K(1));
 [[5,6],[28,10],[8,30],[27,33],[18,5]].forEach(([a,b])=>s+=C(x+a,y+b,.7,'#fff'));
 return s+P('M'+(x+17)+' '+(y+7)+' q6 6 4 18 l-8 0 q-2 -12 4 -18z','#f4f1ea',K(.6))+C(x+17,y+17,2,'#8fd3f4',K(.4))
  +P('M'+(x+13)+' '+(y+21)+' l-4 6 l4 -1z','#e05555',K(.4))+P('M'+(x+21)+' '+(y+21)+' l4 6 l-4 -1z','#e05555',K(.4))+P('M'+(x+15)+' '+(y+26)+' l2 6 l2 -6z','#f2a03b')
  +T(x+17,y+40,6,'#ffe066','SHIP IT')}
function sconce(x,y){return RR(x-1.5,y,3,8,1,'#7a4a2c')+P('M'+(x-6)+' '+(y+1)+' l12 0 l-3 -9 l-6 0z','#ffe9b0',K(.8))}
// Lối đi thảm đỏ từ bàn của bạn chạy thẳng xuống
function aisle(x,y,w,h){let s=R(x,y,w,h,'#a3373a')+R(x+3,y,2,h,'#e0b65a')+R(x+w-5,y,2,h,'#e0b65a');for(let yy=y+10;yy<y+h-8;yy+=18)s+=P('M'+(x+w/2)+' '+yy+' l4 4 l-4 4 l-4 -4z','#c9585a');return s}
// Thảm dưới mỗi dãy bàn, viền màu của tính năng
function rugBlock(x,y,w,h,c){return RR(x,y,w,h,8,c,' fill-opacity=".13" stroke="'+c+'" stroke-width="2"')+RR(x+5,y+5,w-10,h-10,5,'none',' stroke="'+c+'" stroke-opacity=".45" stroke-width="1" stroke-dasharray="5 4"')}
// Đồ đặt giữa hai bàn: cây, tủ hồ sơ, thùng rác (b: chân đồ vật)
function gapDeco(kind,x,b){
 if(kind===0)return '<g transform="translate('+x+','+b+') scale(.72)">'+plantBig(0,0)+'</g>';
 if(kind===1)return RR(x-7,b-28,14,28,1.5,'#9aa3b5',K(.9))+R(x-6,b-19,12,1,'#7d879b')+R(x-6,b-10,12,1,'#7d879b')+RR(x-2.5,b-25,5,1.8,.9,'#e4e9f0')+RR(x-2.5,b-16,5,1.8,.9,'#e4e9f0')+RR(x-2.5,b-7,5,1.8,.9,'#e4e9f0')+plantSmall(x,b-28);
 if(kind===2)return P('M'+(x-5)+' '+(b-11)+' l10 0 l-1.5 11 l-7 0z','#6c7488',K(.8))+C(x-1,b-12,2,'#fbfbf7',K(.4))+C(x+2,b-11.5,1.6,'#fbfbf7',K(.4));
 return ''}
// Góc nghỉ dưới cùng: thảm, đèn cây, sofa, ổ chó, ghế lười, kệ sách, máy in, máy bán nước. b: chân đồ vật
function lounge(b,bed){let s=E(112,b-2,72,9,'#7b9ac9',' fill-opacity=".55" stroke="#5a78a8" stroke-width="1.5"')+E(112,b-2,60,6,'none',' stroke="#e7eefc" stroke-opacity=".6" stroke-dasharray="4 3"');
 s+=LN('M22 '+b+' l0 -42','#3b3b3b',1.6)+E(22,b,6,1.6,'#3b3b3b')+P('M14 '+(b-40)+' l16 0 l-4 -10 l-8 0z','#ffe9b0',K(.8));
 const x=50;
 s+=RR(x,b-36,96,24,7,'#5b7fbf',K(1))+R(x+48,b-34,1,20,'#4f6fa8')+RR(x+4,b-17,88,12,3,'#6f93d3',K(1))+R(x+48,b-17,1,12,'#4f6fa8')
  +RR(x-5,b-25,13,22,5,'#5b7fbf',K(1))+RR(x+88,b-25,13,22,5,'#5b7fbf',K(1))+RR(x+12,b-31,18,13,4,'#f2c14e',K(.8)+ROT(-8,x+21,b-24))+RR(x+66,b-31,18,13,4,'#e07a6a',K(.8)+ROT(8,x+75,b-24))
  +RR(x+2,b-4,4,4,1,'#5e3820')+RR(x+90,b-4,4,4,1,'#5e3820');
 s+=RR(156,b-14,14,14,1.5,'#b9824e',K(.8))+E(163,b-15,7,1.5,'#d9a46c',K(.6))+RR(160,b-21,6,6,1.5,'#ffffff',K(.5));
 if(bed)s+=dogBed(BED_X,b);
 s+=plantBig(246,b);
 s+=E(290,b-8,14,9,'#e07a1f',K(1))+E(285,b-11,5,3,'rgba(255,255,255,.25)');
 s+=RR(322,b-30,70,30,2,'#8a5634',K(1))+R(325,b-27,64,24,'#5a3420')+R(325,b-16,64,2,'#a06a42');
 for(let i=0;i<12;i++){const c=['#d64545','#3f7ee0','#4fa35a','#f2c14e','#9a5fd6'][i%5];s+=RR(327+i*5,(i<6?b-25:b-13)+(i%3),4,(i<6?9:10)-(i%3),.6,c,K(.3))}
 s+=plantSmall(334,b-30)+RR(372,b-36,12,6,1,'#e05555',K(.5));
 s+=RR(444,b-22,44,22,2,'#9aa3b5',K(1))+R(447,b-14,38,1,'#7d879b')+RR(448,b-36,36,14,2,'#e4e9f0',K(.8))+RR(452,b-40,28,5,1,'#ffffff',K(.5))+C(478,b-30,1.3,'#55d27a')+R(452,b-27,20,2,'#3a3d4a');
 s+=P('M500 '+(b-12)+' l12 0 l-2 12 l-8 0z','#6c7488',K(.8))+C(504,b-13,2.2,'#fbfbf7',K(.4));
 s+=RR(538,b-52,40,52,3,'#c94040',K(1))+RR(543,b-47,22,34,1.5,'#1f2a45');
 for(let r=0;r<3;r++)for(let c=0;c<3;c++)s+=RR(546+c*6.5,b-44+r*11,4.5,8,1.5,['#f2c14e','#4fa35a','#3f7ee0'][(r+c)%3]);
 s+=RR(568,b-44,6,14,1,'#e9e3d8',K(.4))+RR(545,b-10,18,5,1,'#2b1d16');
 s+=plantBig(610,b);
 return s}
/* ---------- nhân vật ---------- */
const SKIN=['#f5cfa6','#e8b585','#c98d5e','#9c6b45'];
const STYLE=['short','long','bun','spiky','curly','short'];
const PANTS=['#3a3f5c','#4a3b2a','#2f4a5a','#3b3b3b'];
// Ngoại hình cố định theo ID: tóc, da, kiểu tóc, quần
function look(id){const h=hashN(id);return{hair:HAIR[h%HAIR.length],skin:SKIN[(h>>>3)%SKIN.length],style:STYLE[(h>>>5)%STYLE.length],pants:PANTS[(h>>>8)%PANTS.length]}}
// Trang phục theo vai: Master sơ mi, cà vạt và tai nghe, Coder áo hoodie, Tester áo blouse trắng
function outfit(role,color){
 if(role==='tester')return{shirt:'#f6f3ec',shade:'#cfc8bb',inner:color,dark:'#ddd6c8'};
 return{shirt:color,shade:'rgba(0,0,0,.22)',inner:'#ffffff',dark:tint(color,-.28)};
}
// Tóc nhô ra ngoài đầu (búi, dựng, xoăn): vẽ trước đầu
function hairExtra(cx,y,L){
 if(L.style==='bun')return C(cx,y-1,3.6,L.hair,K(.9))+C(cx-1,y-2,1,'rgba(255,255,255,.3)');
 if(L.style==='spiky')return P('M'+(cx-7.2)+' '+(y+5)+' l.6 -7 l3 3.5 l1.5 -6 l3 4.5 l2.5 -5 l2 5.5 l2 -3 l0 7.5z',L.hair,K(.9));
 if(L.style==='curly')return [[-6.6,1],[-4,-2.6],[0,-3.8],[4,-2.6],[6.6,1]].map(([dx,dy])=>C(cx+dx,y+dy,3,L.hair,K(.8))).join('');
 return '';
}
function headset(cx,y,front){return LN('M'+(cx-7.6)+' '+(y+7)+' Q'+cx+' '+(y-7)+' '+(cx+7.6)+' '+(y+7),'#2d2d3a',1.8)
 +RR(cx-10,y+4.5,4,7,1.8,'#2d2d3a')+RR(cx+6,y+4.5,4,7,1.8,'#2d2d3a')+(front?LN('M'+(cx+8)+' '+(y+11)+' q-1 4 -6 3.6','#2d2d3a',1)+C(cx+2,y+14.6,1,'#d64545'):'')}
// Người ngồi quay lưng lại, nhìn vào màn hình. y: đỉnh đầu.
// pose: type (gõ phím), wait (gõ ngón tay chờ), idle (gật gù), hand (giơ tay hỏi)
function sitBack(cx,y,L,role,color,pose){
 const o=outfit(role,color);let s='';
 const arm=(x,cls,up)=>'<g class="'+cls+'">'+(up
  ?RR(x,y-12,5,20,2.5,o.shirt,K(.9))+C(x+2.5,y-12.5,2.7,L.skin,K(.8))
  :RR(x,y+2,5,15,2.5,o.shirt,K(.9))+C(x+2.5,y+2.5,2.3,L.skin,K(.8)))+'</g>';
 // tay vươn tới bàn phím vẽ trước thân, thân che phần trong
 s+=arm(cx-13,'armL',false);
 if(pose!=='hand')s+=arm(cx+8,'armR',false);
 if(L.style==='long')s+=RR(cx-8,y+4,16,16,6,L.hair,K(.9));
 s+=RR(cx-10.5,y+12,21,20,7,o.shirt,K(1))+RR(cx-10.5,y+12,21,20,7,'url(#shd)');
 if(role==='coder')s+=E(cx,y+14.5,8.6,3.8,o.dark,K(.8))+E(cx,y+14,5.5,1.8,tint(o.dark,-.3));
 if(role==='tester')s+=LN('M'+cx+' '+(y+16)+' l0 15',o.shade,1)+LN('M'+(cx-9)+' '+(y+25)+' l18 0',o.shade,1);
 if(role==='master')s+=P('M'+(cx-4)+' '+(y+12.5)+' l4 3 l4 -3z','#ffffff',K(.5));
 if(L.style==='long')s+=RR(cx-7,y+10,14,9,4,L.hair);
 s+=hairExtra(cx,y,L)+E(cx-7.2,y+8,1.8,2.4,L.skin,K(.7))+E(cx+7.2,y+8,1.8,2.4,L.skin,K(.7));
 s+=C(cx,y+7,7.3,L.hair,K(1))+E(cx-2.6,y+3.4,3,1.6,'rgba(255,255,255,.22)');
 if(role==='master')s+=headset(cx,y+.5,false);
 if(pose==='hand')s+=arm(cx+8,'armR',true);
 return '<g class="sit '+pose+'">'+s+'</g>';
}
// Phần tóc phía trước (nhìn thẳng): chỏm tóc và mái
function hairCap(cx,y){return 'M'+(cx-7.7)+' '+(y+7.5)+' C'+(cx-8.6)+' '+(y-4.6)+' '+(cx+8.6)+' '+(y-4.6)+' '+(cx+7.7)+' '+(y+7.5)
 +' Q'+(cx+5)+' '+(y+2.4)+' '+(cx+1)+' '+(y+3.3)+' Q'+(cx-4)+' '+(y+2.6)+' '+(cx-7.7)+' '+(y+7.5)+'Z'}
// Người đứng nhìn thẳng. hold: cup (cốc nước), paper (giơ tờ giấy), lens (kính lúp) hoặc rỗng
// seated: ngồi trên sofa ở phòng chờ (đầu gối nhô ra, chân ngắn lại); hold thêm book (sách trên đùi),
// phone (giơ điện thoại), nap (ngủ gật, nhắm mắt)
function standFront(cx,y,L,role,color,hold,seated){
 const o=outfit(role,color);let s='';
 if(L.style==='long')s+=RR(cx-8.6,y+1,17.2,17,6,L.hair,K(.9));
 const leg=seated
  ?(x,cls)=>'<g class="'+cls+'">'+RR(x,y+26,5.5,9,2,L.pants,K(.9))+E(x+2.75,y+26.5,3.3,2.6,L.pants,K(.8))+E(x+2.75,y+35.4,3.5,1.8,'#2b2118')+'</g>'
  :(x,cls)=>'<g class="'+cls+'">'+RR(x,y+24,5.5,12,2,L.pants,K(.9))+E(x+2.75,y+36.4,3.7,1.9,'#2b2118')+'</g>';
 s+=leg(cx-6,'legL')+leg(cx+.5,'legR');
 s+=RR(cx-12.5,y+14,5,12,2.5,o.shirt,K(.9))+C(cx-10,y+26,2.2,L.skin,K(.7));
 s+=RR(cx-9.5,y+12,19,15,6,o.shirt,K(1))+RR(cx-9.5,y+12,19,15,6,'url(#shd)');
 if(role==='tester')s+=P('M'+(cx-3.6)+' '+(y+12.5)+' l3.6 6 l3.6 -6z',o.inner,K(.6))+LN('M'+cx+' '+(y+18.5)+' l0 8',o.shade,.9)
  +RR(cx-7,y+19,4,4,.8,'none',' stroke="'+o.shade+'" stroke-width=".8"')+LN('M'+(cx-6)+' '+(y+19.5)+' l0 -2.5','#3f7ee0',.9);
 else if(role==='master'||role==='boss')s+=P('M'+(cx-3.8)+' '+(y+12.5)+' l3.8 4 l3.8 -4z','#ffffff',K(.6))+P('M'+cx+' '+(y+15.6)+' l-1.7 2 l1.7 7.4 l1.7 -7.4z','#d64545',K(.5));
 else s+=E(cx,y+13.6,6.2,2.3,o.dark,K(.6))+LN('M'+(cx-2.4)+' '+(y+15.2)+' l0 4','#f4efe6',.9)+LN('M'+(cx+2.4)+' '+(y+15.2)+' l0 4','#f4efe6',.9)+RR(cx-5,y+20,10,5,2,'rgba(0,0,0,.14)');
 s+=RR(cx-2.5,y+10,5,4,1.5,L.skin)+hairExtra(cx,y,L)+C(cx,y+6.5,7.4,L.skin,K(1))+P(hairCap(cx,y),L.hair,K(.9))+E(cx-3,y+1.5,2.6,1.2,'rgba(255,255,255,.25)');
 const dy=hold==='book'||hold==='phone'?.7:0; // nhìn xuống sách, điện thoại
 s+=(hold==='nap'?LN('M'+(cx-4)+' '+(y+7.6)+' q1.2 1 2.4 0 M'+(cx+1.6)+' '+(y+7.6)+' q1.2 1 2.4 0','#2b2b2b',.8)
  :'<g class="eyes">'+E(cx-2.8,y+7.6+dy,1.05,1.4,'#2b2b2b')+E(cx+2.8,y+7.6+dy,1.05,1.4,'#2b2b2b')+C(cx-2.5,y+7.1+dy,.4,'#fff')+C(cx+3.1,y+7.1+dy,.4,'#fff')+'</g>')
  +E(cx-4.7,y+9.9,1.5,.8,'#f19a9a',' opacity=".75"')+E(cx+4.7,y+9.9,1.5,.8,'#f19a9a',' opacity=".75"')+LN('M'+(cx-1.4)+' '+(y+10.4)+' q1.4 1.3 2.8 0','#7a3b2a',.8);
 if(role==='master')s+=headset(cx,y,true);
 if(hold==='paper')s+='<g class="wave">'+RR(cx+7.5,y+3,5,13,2.5,o.shirt,K(.9))+RR(cx+6,y-10,14,12,1.2,'#ffffff',K(.8))
  +LN('M'+(cx+8.5)+' '+(y-7)+' l8 0 M'+(cx+8.5)+' '+(y-4.5)+' l8 0 M'+(cx+8.5)+' '+(y-2)+' l5 0','#9aa3b5',.8)+LN('M'+(cx+8.5)+' '+(y+.5)+' l6 0','#d64545',.8)+C(cx+10,y+3,2.3,L.skin,K(.7))+'</g>';
 else if(hold==='phone')s+=RR(cx+6.5,y+13,5,9,2.5,o.shirt,K(.9))+RR(cx+3.5,y+12,5,8,1.2,'#2d2d3a',K(.6))+R(cx+4.3,y+13,3.4,5.6,'#8fd3f4')+C(cx+7.5,y+19.5,2.2,L.skin,K(.7));
 else if(hold==='book')s+=RR(cx+7.5,y+14,5,12,2.5,o.shirt,K(.9))+'<g'+ROT(-8,cx+4,y+25)+'>'+RR(cx-3,y+21,14,9,1.2,'#c94040',K(.7))+R(cx-2,y+21.8,5.8,7,'#fbfbf4')+R(cx+4.2,y+21.8,5.8,7,'#fbfbf4')
  +LN('M'+(cx-.8)+' '+(y+24)+' l4 0 M'+(cx-.8)+' '+(y+26)+' l3.5 0 M'+(cx+5.4)+' '+(y+24)+' l4 0','#b9b0a3',.6)+'</g>'+C(cx+10,y+26,2.2,L.skin,K(.7));
 else s+='<g class="'+(hold==='cup'?'sip':'')+'">'+RR(cx+7.5,y+14,5,12,2.5,o.shirt,K(.9))
  +(hold==='cup'?RR(cx+9,y+20,6.5,7.5,1.3,'#ffffff',K(.7))+R(cx+9.8,y+20.8,4.9,2,'#bfe3f5'):'')
  +(hold==='lens'?LN('M'+(cx+10)+' '+(y+26)+' l4 -5','#7a4a22',1.8)+C(cx+15.5,y+18,4,'#bfe3f5',K(.8))+C(cx+14.4,y+16.9,1,'#fff'):'')
  +C(cx+10,y+26,2.2,L.skin,K(.7))+'</g>';
 return s;
}
/* ---------- bàn ghế, đồ trên bàn ---------- */
function desk(x,y,w,front){let s='';
 if(front)s+=RR(x+3,y+8,w-6,24,2,'#b9824e',K(1))+R(x+7,y+12,w-14,1,'#a06a3c');
 else s+=RR(x+4,y+8,3.4,22,1,'#9a6a3e',K(.6))+RR(x+w-7.4,y+8,3.4,22,1,'#9a6a3e',K(.6));
 return s+RR(x,y,w,10,2.5,'#efd2a0',K(1))+R(x+2,y+1.6,w-4,1.5,'rgba(255,255,255,.55)')+R(x+1.5,y+7,w-3,2,'rgba(160,100,50,.25)')}
// Màn hình trước mặt; đang làm thì có dòng code chạy. notes: giấy nhớ dán ở góc
function screen(x,y,on,run,c,notes){
 let s=R(x+14,y+21,4,5,'#4a4e5c')+RR(x+8,y+25,16,3,1.5,'#4a4e5c',K(.6))+RR(x,y,32,23,3,'#3a3d4a',K(1))+RR(x+2.5,y+2.5,27,17,1.5,on?'url(#scr)':'#15171d');
 if(on&&!run)s+=RR(x+5,y+6,9,2,1,c,' opacity=".55"')+RR(x+5,y+10,14,2,1,'#55d27a',' opacity=".4"');
 if(run)s+='<g class="code">'+RR(x+5,y+5,10,2,1,c)+RR(x+5,y+9,17,2,1,'#55d27a')+RR(x+5,y+13,7,2,1,'#e05a5a')+RR(x+14,y+13,10,2,1,c)+'</g>';
 s+=P('M'+(x+20)+' '+(y+2.5)+' l7 0 l-10 17 l-7 0z','rgba(255,255,255,.07)');
 if(notes)s+=RR(x+25,y-2,6,6,.8,'#ffe066',K(.4)+ROT(8,x+28,y+1))+RR(x+26.5,y+4.5,5,5,.8,'#9fe0ff',K(.4)+ROT(-6,x+29,y+7));
 return s}
function keyboard(cx,y){let s=RR(cx-11,y,22,5.5,1.5,'#d5d9e1',K(.7));for(let i=0;i<6;i++)s+=R(cx-9+i*3.2,y+1.4,2,1,'#9aa3b5')+R(cx-8+i*3,y+3.2,2,1,'#9aa3b5');return s}
function laptopBack(cx,y){return RR(cx-12,y-1.5,24,3,1.2,'#9aa3b5',K(.6))+RR(cx-10.5,y-15,21,14,1.5,'#c9cdd6',K(.8))+C(cx,y-8,1.6,'#ffffff')}
function cup(x,y,hot){return LN('M'+(x+7)+' '+(y+2)+' q3.2 0 3.2 2.6 q0 2.6 -3.2 2.6',OL,1)+RR(x,y,7,8,1.5,'#ffffff',K(.8))+E(x+3.5,y+1.2,2.8,.9,'#7a4a22')
 +(hot?'<g class="steam">'+RR(x+2,y-5,1.1,4,.55,'rgba(255,255,255,.8)')+RR(x+4.5,y-8,1.1,4,.55,'rgba(255,255,255,.65)')+'</g>':'')}
function lensProp(x,y){return LN('M'+(x+5)+' '+(y+4)+' l3.5 2.5','#7a4a22',1.6)+C(x+3,y+2,3,'#bfe3f5',K(.8))+C(x+2,y+1,.8,'#fff')}
function papers(x,y){return RR(x+1,y+1,13,8,1,'#d9d4c8',K(.6)+ROT(-7,x+7,y+5))+RR(x,y,13,8,1,'#ffffff',K(.6))+LN('M'+(x+3)+' '+(y+3)+' l7 0 M'+(x+3)+' '+(y+5.5)+' l5 0','#9aa3b5',.8)}
function bug(x,y){return '<g class="bug">'+LN('M'+(x+2)+' '+(y+1)+' l-2 -2 M'+(x+5)+' '+(y+1)+' l0 -2.5 M'+(x+8)+' '+(y+1)+' l2 -2 M'+(x+2)+' '+(y+7)+' l-2 2 M'+(x+5)+' '+(y+7)+' l0 2.5 M'+(x+8)+' '+(y+7)+' l2 2',OL,.8)
 +E(x+5,y+4,5,3.6,'#d64545',K(.8))+LN('M'+(x+5)+' '+(y+.6)+' l0 6.8',OL,.7)+C(x+3,y+3,.9,OL)+C(x+7,y+5,.9,OL)+C(x+10.5,y+4,2,OL)+'</g>'}
// Đồ riêng trên bàn, cố định theo ID: chậu cây, vịt cao su, đèn bàn, chồng sách, khung ảnh
function deskDeco(id,x,b){switch(hashN(id+'#')%5){
 case 0:return plantSmall(x,b);
 case 1:return E(x,b-3,4.6,3,'#ffd23f',K(.7))+C(x+2.6,b-7,2.7,'#ffd23f',K(.7))+P('M'+(x+5)+' '+(b-7.2)+' l2.6 .6 l-2.6 1z','#f08a24',K(.4))+C(x+3.2,b-7.8,.5,OL);
 case 2:return E(x,b-.8,4,1.2,'#3b3b3b')+LN('M'+x+' '+(b-1)+' l2 -10 l5 -2','#3b3b3b',1.2)+P('M'+(x+4)+' '+(b-15)+' l7 2 l-2 5 l-7 -2z','#e05555',K(.6));
 case 3:return RR(x-6,b-3,12,3,.6,'#3f7ee0',K(.4))+RR(x-5,b-6,11,3,.6,'#e05555',K(.4))+RR(x-6,b-9,10,3,.6,'#4fa35a',K(.4));
 default:return RR(x-4,b-10,8,10,1,'#c9a24a',K(.6))+R(x-2.6,b-8.6,5.2,7.2,'#9fd0f0')+E(x,b-3.6,2,1.4,'#4f9a48')+C(x,b-6,1.2,'#f5cfa6');
}}
// Ghế văn phòng nhìn từ sau lưng; y: đỉnh lưng ghế
function chair(cx,y){return R(cx-1.5,y+18,3,6,'#2f333d')+RR(cx-11,y+23.5,22,2.5,1.2,'#2f333d')+C(cx-10,y+27,1.7,'#1f2229')+C(cx+10,y+27,1.7,'#1f2229')+C(cx,y+27,1.7,'#1f2229')
 +RR(cx-12,y+13,24,5.5,2.7,'#3d4250',K(.8))+RR(cx-10,y,20,16,5,'#4f5669',K(1))+RR(cx-8,y+2,16,3,1.5,'rgba(255,255,255,.18)')}
/* ---------- bong bóng, biển tên ---------- */
function bubble(cx,y,txt,kind){
 const col={run:['#ffffff','#1f7a4d'],wait:['#fff6dc','#9a5a00'],idle:['#efe9df','#8a8278'],bad:['#ffe6e3','#b23030']}[kind];
 const w=Math.max(15,txt.length*5.4+9),x=cx-w/2;
 const cls=kind==='wait'||kind==='bad'?'bob':txt==='z'?'zz':'';
 return '<g class="bub '+cls+'">'
  +'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="13" rx="3.5" fill="'+col[0]+'" stroke="'+OL+'" stroke-width="1.3"/>'
  +'<path d="M'+(cx-2.5)+' '+(y+12.3)+' l2.5 4 l2.5 -4" fill="'+col[0]+'" stroke="'+OL+'" stroke-width="1.3" stroke-linejoin="round"/>'
  +T(cx,y+9.6,8.5,col[1],txt)+'</g>'}
// Biển tên: tên và trạng thái ngắn, cắt chữ cho vừa maxW để không đè lên biển bên cạnh
function label(cx,y,name,short,kind,maxW){
 const c={run:'#8ff0b8',wait:'#ffd27a',idle:'#ddd3c5',bad:'#ff9c9c'}[kind];maxW=maxW||90;
 const n=cut(name,Math.floor((maxW-8)/(7*CW))),sh=cut(short,Math.floor((maxW-8)/(6*CW)));
 const w=Math.min(maxW,Math.max(n.length*7*CW,sh.length*6*CW)+10);
 return '<g class="lbl"><rect x="'+(cx-w/2)+'" y="'+y+'" width="'+w+'" height="18" rx="3.5" fill="rgba(43,33,27,.84)"/>'+T(cx,y+8,7,'#fff6e6',n)+T(cx,y+15.5,6,c,sh)+'</g>'}
function selBox(x,y,w,h){return '<rect class="sel" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="6" fill="rgba(255,224,102,.12)" stroke="#ffe066" stroke-width="2"/>'}
// Trạng thái ngắn ghi dưới bàn
function shortOf(a,st,asking){
 if(st.kind==='bad')return 'chưa khai báo';
 if(asking)return 'đang hỏi Master';
 if(a&&a.now&&st.label===a.now)return cut(a.now,26);
 if(st.txt==='!')return 'chờ bạn';
 if(st.kind==='run')return st.label.indexOf('Master đang gọi')===0?'đang làm (Master gọi)':'đang làm';
 if(st.kind==='wait')return 'có '+st.txt+' việc chờ';
 if(/^Đang chạy ở/.test(st.label))return 'đang ở '+((st.label.match(/F-\d+/)||[''])[0]);
 if(a&&a.hist&&a.hist.length){const h=a.hist[0],m=(h.end||'').match(/T(\d\d:\d\d)/);if(m)return 'rảnh · lần cuối '+m[1]}
 return 'rảnh';
}
function confetti(cx,y,elapsed){let s='<g class="conf">';const c=['#d64545','#f2c14e','#3f8f4a','#2f6fe0','#8b4fd0'];
 for(let i=0;i<26;i++){const x=cx-70+((i*37)%140),d=-((elapsed/1000)+(i%7)*.4);
  s+='<rect x="'+x+'" y="'+y+'" width="3" height="5" rx="1" fill="'+c[i%c.length]+'" style="animation-delay:'+d.toFixed(2)+'s"/>'}
 return s+'</g>'}
/* ---------- trạng thái một agent trong một tính năng ---------- */
function stateOf(a,dir){
 if(!a)return{kind:'bad',txt:'?',label:'Chưa khai báo trong agents.txt',on:false};
 const here=a.pending.filter(p=>p.indexOf(dir+'/')===0).length;
 // dir thuộc một trong các tính năng ids ("F-005")? ids rỗng (không biết) hay dir rỗng (cây nước) thì coi là có
 const inF=ids=>!dir||!ids.length||ids.some(F=>dir.indexOf(F+'-')===0);
 // Agent đang chạy (subagent qua .sub, auto/window qua .job) chỉ hiện "…" ở dãy bàn của tính năng nó đang làm
 const runHere=a.running&&inF(a.runIn||[]),what=a.sub||a.job;
 if(runHere)return{kind:'run',txt:'…',label:a.sub?'Master đang gọi ('+a.sub+')':'Đang chạy'+(a.job?' ('+a.job+')':''),on:true};
 if(a.running&&!here)return{kind:'idle',txt:'z',label:'Đang chạy ở '+what,on:false};
 // Dòng .now của Master: có mã F-NNN thì chỉ hiện ở dãy bàn tính năng đó, không có mã thì hiện ở mọi dãy của Master
 if(a.now&&inF(a.now.match(/F-\d+/g)||[]))return a.nowWait?{kind:'wait',txt:'!',label:a.now,on:true}:{kind:'run',txt:'…',label:a.now,on:true};
 if(here)return{kind:'wait',txt:String(here),label:MODE_WAIT[a.mode]||'Có việc, cần mở phiên tay',on:true};
 return{kind:'idle',txt:'z',label:'Rảnh',on:false};
}

/* ---------- dựng cảnh ---------- */
const CW=0.6; // độ rộng một ký tự monospace so với cỡ chữ
const cut=(t,n)=>t.length>n?t.slice(0,Math.max(1,n-1))+'…':t;
// Toạ độ văn phòng bắt đầu từ x=0, rộng OW. Tường cao tới FLOOR_Y. Các dãy bàn từ LX tới BR, cách nhau GAP (lối đi cho thú cưng).
// Lối đi thảm đỏ từ AX, rộng AW, chính giữa là bàn của bạn. TOP: dãy bàn đầu tiên. Dưới cùng là góc nghỉ.
// Màn hình rộng (WIDE): thêm cột phòng chờ và góc giải trí rộng LW ở bên trái, toạ độ âm (từ -LW tới 0).
// Khung nhìn (viewBox) từ VX, rộng VW; khung càng rộng thì mỗi hàng càng nhiều bàn, nhân vật giữ gần đúng cỡ.
const FLOOR_Y=118, LX=24, AW=48, STEP=98, ROW_H=130, HEAD=30, TOP=192, GAP=24, LW=192, HOLE_X=284;
const PX_PER_UNIT=1.6, MIN_WIDE_PX=1.3; // cỡ hiển thị mong muốn, và cỡ nhỏ nhất vẫn chịu hiện cột trái
let WIDE=false, VX=0, VW=720, OW=720, AX=652, BR=640, OWNER_X=676, PER_ROW=5, BED_X=200;
function layout(){
 const sc=$('.scene'),cw=Math.max(320,(sc&&sc.clientWidth||1212)-12);
 WIDE=cw/(LW+720)>=MIN_WIDE_PX;
 VX=WIDE?-LW:0;
 VW=Math.max(WIDE?LW+720:720,Math.round(cw/PX_PER_UNIT/4)*4);
 OW=VW+VX;AX=OW-68;BR=AX-12;OWNER_X=AX+AW/2;XR=OWNER_X;
 PER_ROW=Math.max(5,Math.floor((BR-LX-126)/STEP)); // một dãy đủ PER_ROW bàn rộng 126+PER_ROW*STEP, vừa khít BR-LX
 BED_X=WIDE?-LW+60:200;
}
const NIGHT=!!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
const MOTION_OK=!window.matchMedia||!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Nhớ chỗ của từng agent ở lần vẽ trước: đổi chỗ (cây nước ↔ bàn) thì cho đi bộ; tính năng vừa xong thì bắn pháo giấy
const PREV_PLACE=new Map(),PREV_STATUS=new Map(),ARRIVE=new Map();let PARTY=[];
const WALK_MS=1400;
// Agent vừa đi bộ tới chỗ mới: ẩn ở chỗ mới cho tới khi người đi bộ tới nơi (kể cả qua các lần làm mới 3 giây)
const arriving=id=>{const t=ARRIVE.get(id);if(!t)return null;const e=Date.now()-t;return e<WALK_MS+50?e:null};
const agG=(id,label,inner)=>{const e=arriving(id);
 return '<g class="ag'+(openId===id?' on':'')+(e!=null?' arrive':'')+'"'+(e!=null?' style="animation-delay:-'+(e/1000).toFixed(2)+'s"':'')
  +' data-id="'+esc(id)+'" tabindex="0" role="button" aria-label="'+esc(id+': '+label)+'"><title>'+esc(id+': '+label)+'</title>'+inner+'</g>'};

// Một chỗ ngồi: màn hình, bàn, đồ trên bàn, người quay lưng, ghế, bong bóng, biển tên
// Y: mép trên mặt bàn; đầu người ngồi ở Y+6, người đứng ở Y-2
function station(f,id,a,x,w,top,isMaster,color){
 const Y=top+50,cx=x+w/2,role=a?a.role:(id.split('-')[0]||'coder');
 let st=stateOf(a,f.dir);
 // Master không còn file chờ nhưng tính năng đang chờ chủ dự án: hiện "!" thay vì "z" (như trước)
 if(isMaster&&st.kind==='idle'&&S.owner.some(o=>o.path.indexOf(f.dir+'/')===0))st={kind:'wait',txt:'!',label:'Chờ bạn (xem mục Cần bạn)',on:true};
 // Câu hỏi của agent này trong tính năng còn mở, chưa tới lượt nó: giơ tay
 const asking=!!a&&!isMaster&&st.kind!=='run'&&st.txt!=='!'&&f.items.some(it=>it.kind==='questions'&&it.from===id&&it.status==='open'&&it.to!==id);
 const bugs=f.items.some(it=>it.kind==='bugs'&&it.to===id&&it.status==='open');
 const L=look(id),run=st.kind==='run',standUp=isMaster&&st.txt==='!',notes=hashN(id)%3===0;
 const pose=run?'type':asking?'hand':st.kind==='wait'?'wait':'idle';
 const bubbleTxt=asking?'?':st.txt,bubbleKind=asking?'wait':st.kind;
 let s=selBox(x-4,top+2,w+8,ROW_H-6);
 if(isMaster)s+=screen(x+12,Y-27,true,run,color,notes)+screen(x+w-44,Y-27,true,run,'#55d27a',false);
 else s+=screen(cx-16,Y-27,!!(a&&st.on),run,color,notes);
 s+=desk(x,Y,w)+keyboard(cx,Y+2.5)+cup(x+w-13,Y-3,run);
 if(isMaster)s+=papers(x+4,Y-2);else s+=deskDeco(id,x+10,Y+6);
 if(role==='tester')s+=lensProp(cx+13,Y);
 if(bugs)s+=bug(x+4,Y+12);
 // Master chờ bạn: đứng dậy quay lại, giơ tờ giấy; còn lại ngồi quay lưng nhìn màn hình
 if(standUp)s+=chair(cx+20,Y+27)+standFront(cx-8,Y-2,L,role,color,'paper');
 else s+=(a?sitBack(cx,Y+6,L,role,color,pose):'<g opacity=".45">'+sitBack(cx,Y+6,L,role,'#8f9bb0','idle')+'</g>')+chair(cx,Y+27);
 s+=bubble(cx,top+4,bubbleTxt,bubbleKind)+label(cx,Y+56,id,shortOf(a,st,asking),asking?'wait':st.kind,w+18);
 return agG(id,st.label+(asking?' · đang chờ Master trả lời câu hỏi':'')+(bugs?' · có lỗi Tester báo':''),s);
}

function build(){
 layout();
 const byId=Object.fromEntries(S.agents.map(a=>[a.id,a]));
 const now=Date.now();
 // tính năng vừa chuyển sang "xong" ở lần làm mới này: pháo giấy 6 giây
 S.features.forEach(f=>{const p=PREV_STATUS.get(f.dir);if(p&&p!=='done'&&f.status==='done')PARTY.push({id:f.id,at:now});PREV_STATUS.set(f.dir,f.status)});
 PARTY=PARTY.filter(p=>now-p.at<6000);
 // tính năng đã xong rời văn phòng (chỉ còn trên bảng trắng); màu giữ theo thứ tự gốc
 const blocks=S.features.map((f,i)=>[f,i]).filter(([f])=>f.status!=='done'&&f.status!=='delivered').map(([f,i])=>{
  const ms=f.members.filter(m=>m===f.master);
  const others=f.members.filter(m=>m!==f.master).sort((a,b)=>{const ra=(byId[a]||{}).role||'',rb=(byId[b]||{}).role||'';return ra===rb?a.localeCompare(b):(ra==='coder'?-1:rb==='coder'?1:ra.localeCompare(rb))});
  const rows=Math.max(1,Math.ceil(others.length/PER_ROW)),cols=Math.max(1,Math.min(PER_ROW,others.length));
  return{f,color:COLORS[i%COLORS.length],master:ms[0]||f.master||'',others,rows,w:126+cols*STEP,h:HEAD+rows*ROW_H+6};
 });
 const busy=new Set(blocks.flatMap(b=>[b.master,...b.others]));
 const free=S.agents.filter(a=>!busy.has(a.id));
 const done=S.features.filter(f=>f.status==='done'),delivered=S.features.filter(f=>f.status==='delivered');
 // agent đổi khu (cây nước ↔ bàn) so với lần vẽ trước: ghi mốc để ẩn ở chỗ mới tới khi người đi bộ tới nơi
 if(MOTION_OK)S.agents.forEach(a=>{const q=PREV_PLACE.get(a.id),z=busy.has(a.id)?'desk':'cooler';if(q&&q.zone!==z)ARRIVE.set(a.id,now)});
 // vị trí các dãy bàn, các lối đi ngang (cho thú cưng) và góc nghỉ dưới cùng
 // dãy bàn rộng vừa đủ số bàn; các dãy nhỏ xếp cạnh nhau trên một tầng nếu đủ chỗ (màn rộng thì nhiều dãy một tầng)
 const lanes=[q4(TOP-12)];let y=TOP,shelf=null;const shelves=[];
 blocks.forEach(b=>{if(!shelf||shelf.x+b.w>BR){shelf={x:LX,h:0,items:[]};shelves.push(shelf)}b.x=shelf.x;shelf.x+=b.w+16;shelf.items.push(b);shelf.h=Math.max(shelf.h,b.h)});
 shelves.forEach(sh=>{sh.items.forEach(b=>{b.y=y;b.hh=sh.h});lanes.push(q4(y+sh.h+GAP/2));y+=sh.h+GAP});
 if(!blocks.length)lanes.push(q4(TOP+80));
 const laneL=lanes[lanes.length-1];
 // phòng chờ (màn rộng): mỗi hàng 4 chỗ (sofa 3 chỗ, ghế bành 1 chỗ), 2–3 hàng; góc giải trí bên dưới, từ lối d0.
 // Khung cao bằng phần cao hơn giữa văn phòng và cột trái; lối laneB dưới cùng chạy suốt bề ngang
 const RROWS=WIDE?Math.min(3,Math.max(2,Math.ceil(free.length/4))):0,CAP=WIDE?RROWS*4:5,d0=WIDE?q4(140+(RROWS-1)*104+86):0;
 const H=WIDE?Math.max(laneL+74,d0+204):laneL+74,laneB=H-14;
 const need=S.owner.length+(S.masters||[]).filter(m=>m.waitOwner).length;
 const watch=(S.watch||{state:'never'}).state;
 // chỗ của từng agent ở lần vẽ này: để so với lần trước và cho đi bộ
 const place=new Map();
 // ---- tường, sàn, đồ trang trí
 let s=defs()+wall()+R(VX,FLOOR_Y,VW,H-FLOOR_Y,'url(#fl)')+(WIDE?R(-LW,FLOOR_Y,LW,H-FLOOR_Y,'url(#lf)'):'')+R(VX,FLOOR_Y,VW,5,'rgba(60,30,10,.12)');
 if(need)s+=P('M298 118 l50 0 l16 28 l-82 0z','rgba(255,214,140,.25)');
 s+=aisle(AX,FLOOR_Y,AW,H-FLOOR_Y)+bunting(64,290,11,4)+bunting(514,AX-6,11,3);
 s+=bookshelf(10,28,48,84)+cooler(66)+pantry(102)+sconce(134,30)+windowPane(152,18,80,46)+clock(266,40,watch==='running')+door(298,need>0)
  +P('M'+(HOLE_X-5)+' 117.5 l0 -4 q5 -7 10 0 l0 4z','#2b1d16')+whiteboard()+calendar(520,20)+poster(560,16)+fillWall(600,AX-60)+sconce(AX-48,30)+plantBig(AX-36,FLOOR_Y);
 s+=lounge(laneB-4,!WIDE);
 if(WIDE)s+=loungeWall(S.agents.filter(a=>a.running).length,need,done.length)+partition(lanes.concat(laneB),H)
  +RR(-186,128,172,RROWS*104-10,10,'#c96f5a',' fill-opacity=".18" stroke="#c96f5a" stroke-opacity=".5" stroke-width="1.5"')+playCorner(d0,laneB);
 if(NIGHT)s+=R(VX,0,VW,H,'rgba(20,30,70,.18)')+E(134,34,26,20,'url(#glow)')+E(AX-48,34,26,20,'url(#glow)')+E(22,laneB-52,30,26,'url(#glow)')+(WIDE?E(-40,34,26,20,'url(#glow)')+E(-104,49,56,36,'url(#glow)'):'');
 if(need)s+=bubble(323,6,'!'+need,'bad');
 // ---- bảng trắng: các tính năng đang làm, rồi các tính năng đã xong
 s+=T(436,26,8.5,'#3b2a20','CÁC TÍNH NĂNG');
 const board=blocks.map(b=>({f:b.f,color:b.color})).concat(delivered.map(f=>({f,color:'#7f9cc2'})),done.slice().reverse().map(f=>({f,color:'#b9b0a3'})));
 board.slice(0,4).forEach((b,i)=>{const y=31+i*16.5;
  s+=RR(371,y+1,6,6,1.5,b.color)+T(381,y+7.5,7.5,'#3b2a20',cut(b.f.id+' '+b.f.title,Math.floor(122/(CW*7.5))),'start')+T(381,y+15,6.6,b.f.to==='owner'?'#b23030':'#6b5c4e',stOf(b.f),'start')});
 if(board.length>4)s+=T(502,99,6.5,'#6b5c4e','+'+(board.length-4)+' nữa','end');
 if(!board.length)s+=T(436,60,7.5,'#6b5c4e','(chưa có)');
 PARTY.forEach(p=>{s+=confetti(436,14,now-p.at)+T(436,124,8.5,'#b23030','🎉 '+p.id+' xong!')});
 // ---- phòng chờ (màn rộng): agent rảnh ngồi sofa, mỗi người một việc (uống nước, đọc sách, xem điện thoại, ngủ gật);
 // có việc chờ thì không ngủ. Biển tên so le hai hàng để không đè nhau
 if(WIDE)for(let r=0;r<RROWS;r++){const y=140+r*104,SX=[-162,-130,-98,-56];
  s+=sofaBack(-178,y,96,'#c8775a')+sofaBack(-72,y,32,'#5b7fbf');
  free.slice(r*4,r*4+4).forEach((a,j)=>{const k=r*4+j,cx=SX[j],st=stateOf(a,'');
   let act=['cup','book','phone','nap'][hashN(a.id)%4];if(act==='nap'&&st.kind!=='idle')act='phone';
   place.set(a.id,{x:cx,y,zone:'cooler'});
   s+=agG(a.id,st.label,selBox(cx-14,y-21,28,80)+standFront(cx,y,look(a.id),a.role,'#8f9bb0',act,true).replace('class="sip"','class="sip" style="animation-delay:-'+(k*0.9)+'s"')
    +bubble(cx,y-18,act==='nap'&&st.txt==='z'?'zz':st.txt,st.kind)+label(cx,y+40+(j%2)*18,a.id,shortOf(a,st,false),st.kind,56))});
  s+=sofaArms(-178,y,96,'#c8775a')+sofaArms(-72,y,32,'#5b7fbf')}
 // ---- cây nước (màn hẹp): agent rảnh đứng uống nước
 if(!WIDE)free.slice(0,5).forEach((a,k)=>{const cx=162+k*28,y=80,st=stateOf(a,'');
  place.set(a.id,{x:cx,y,zone:'cooler'});
  s+=agG(a.id,st.label,selBox(cx-13,y-22,26,66)+standFront(cx,y,look(a.id),a.role,'#8f9bb0','cup').replace('class="sip"','class="sip" style="animation-delay:-'+(k*0.9)+'s"')
   +bubble(cx,y-18,st.txt,st.kind)+label(cx,y+40+(k%2)*20,a.id,shortOf(a,st,false),st.kind,62))});
 // ---- bàn của bạn, lối đi thảm đỏ chạy thẳng xuống
 // Bạn đang đi một vòng văn phòng (lớp #pets): bàn để ghế trống, bong bóng đi theo người
 NEED_N=need;
 {const cx=OWNER_X,away=!!(CRIT.boss&&CRIT.boss.mode!=='desk');
  let o=RR(cx-17,46,34,38,4,'#4a3b6b',K(1))+RR(cx-15,48,30,3,1.5,'#6a5a95');
  o+=(away?chair(cx,62):standFront(cx,58,BOSS_L,'boss','#2f6fe0',''))+desk(cx-36,86,72,true)+laptopBack(cx,89)+cup(cx+20,80,!away)+plantSmall(cx-25,92);
  o+=RR(cx-15,100,30,11,2,'#3b2a20',K(.6))+T(cx,108.5,8,'#f2c14e','BẠN')+(away?'':bubble(cx,28,need?'!'+need:'z',need?'bad':'idle'));
  s+='<g id="owner" tabindex="0" role="button" aria-label="'+esc(need?'Bàn của bạn: '+need+' việc chờ bạn':'Bàn của bạn: không có việc chờ')+'" style="cursor:pointer"><title>'+(need?need+' việc chờ bạn: bấm để xem':'Không có việc chờ bạn')+'</title>'+o+'</g>'}
 // ---- các dãy bàn
 blocks.forEach(b=>{
  const f=b.f,y=b.y,X=b.x,R2=b.x+b.w,C0=X+124;
  s+=rugBlock(X,y,b.w,b.hh,b.color);
  const sv=stOf(f),svw=sv.length*CW*7.5+12,lbl=cut(f.id+' · '+f.title,Math.floor((b.w-22-svw)/(CW*8.5))),lw=lbl.length*CW*8.5;
  s+=RR(X+4,y+6,Math.min(lw+svw+24,b.w-12),18,4,b.color)+T(X+10,y+18.5,8.5,'#ffffff',lbl,'start')
   +'<rect x="'+(X+16+lw)+'" y="'+(y+9)+'" width="'+svw+'" height="12" rx="3" fill="'+(f.to==='owner'?'#ffe066':'rgba(255,255,255,.88)')+'"/>'+T(X+16+lw+svw/2,y+17.8,7.5,f.to==='owner'?'#7a2a00':'#3b2a20',sv)
   +(LANE_NOTE[f.lane]&&X+28+lw+svw+LANE_NOTE[f.lane].length*CW*7<R2-8?T(X+24+lw+svw,y+18,7,'#3b2a20',LANE_NOTE[f.lane],'start'):'');
  const rowTop=r=>y+HEAD+r*ROW_H;
  // đồ giữa các bàn (cây, tủ hồ sơ, thùng rác) và cây ở cuối dãy
  for(let r=0;r<b.rows;r++){const n=Math.min(PER_ROW,b.others.length-r*PER_ROW);
   for(let c=0;c<n;c++){const gx=C0+c*STEP+72+13;if(c===n-1&&gx>R2-14)break;
    s+=gapDeco(c===n-1?0:hashN(f.dir+r+'/'+c)%4,c===n-1?Math.min(gx+12,R2-18):gx,rowTop(r)+80)}}
  const seat=(id,x,w,top,isM)=>{
   if(!place.has(id))place.set(id,{x:x+w/2,y:top+48,zone:'desk'});
   s+=station(f,id,byId[id],x,w,top,isM,b.color);
  };
  if(b.master)seat(b.master,X+8,100,rowTop(0),true);
  b.others.forEach((id,k)=>{const r=Math.floor(k/PER_ROW),c=k%PER_ROW;seat(id,C0+c*STEP,72,rowTop(r),false)});
 });
 if(!blocks.length)s+=T((LX+BR)/2,TOP+44,9,'#3b2a20',done.length?'Không có tính năng nào đang làm':'Chưa có tính năng nào (workflow/F-*)');
 // ---- người đi bộ: agent vừa đổi chỗ (cây nước → bàn, bàn → cây nước). Vẽ ở lớp riêng #walk,
 // lần làm mới 3 giây (thay toàn bộ #office) không cắt ngang người đang đi
 const walkers=[];
 if(MOTION_OK)place.forEach((p,id)=>{const q=PREV_PLACE.get(id);if(!q||q.zone===p.zone)return;
  const a=byId[id];if(!a)return;
  walkers.push({x0:q.x,y0:q.y,x1:p.x,y1:p.y,svg:standFront(0,0,look(id),a.role,'#8f9bb0','')})});
 PREV_PLACE.clear();place.forEach((p,id)=>PREV_PLACE.set(id,p));
 ARRIVE.forEach((t,id)=>{if(now-t>WALK_MS+100)ARRIVE.delete(id)});
 // ---- watch.sh chết: tắt đèn
 if(watch==='dead')s+=R(VX,0,VW,H,'rgba(10,10,30,.38)')+'<g class="bub bob">'+'<rect x="219" y="62" width="94" height="16" rx="4" fill="#ffe6e3" stroke="'+OL+'" stroke-width="1.5"/>'+T(266,74,8.5,'#b23030','watch.sh đã dừng')+'</g>';
 const vb=VX+' 0 '+VW+' '+H,svg=$('#office');svg.setAttribute('viewBox',vb);svg.innerHTML=s;
 const wk=$('#walk');wk.setAttribute('viewBox',vb);
 $('#pets').setAttribute('viewBox',vb);
 walkers.forEach(w=>{const g=document.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('class','walker');g.innerHTML=w.svg;wk.appendChild(g);
  const an=g.animate([{transform:'translate('+w.x0+'px,'+w.y0+'px)'},{transform:'translate('+w.x1+'px,'+w.y1+'px)'}],{duration:WALK_MS,easing:'ease-in-out',fill:'forwards'});
  an.onfinish=()=>g.remove();setTimeout(()=>g.remove(),WALK_MS+800)}); // dự phòng: tab chạy nền thì hoạt hình có thể dừng
 // ---- lối đi cho chó, mèo, chuột: dải sàn sát chân tường, lối giữa các dãy bàn, hai lối dọc hai bên, lối trước góc nghỉ.
 // Màn rộng: các lối ngang đi xuyên vách sang phòng chờ, thêm lối dọc trong phòng chờ và lối quanh góc giải trí
 const segs=[[XL,BASE_Y,XR,BASE_Y],[XL,BASE_Y,XL,laneB],[XR,BASE_Y,XR,laneL]].concat(WIDE
  ?lanes.map(v=>[LV,v,XR,v]).concat([[LV,lanes[0],LV,laneB],[LL,d0,LV,d0],[LL,d0,LL,laneB],[LL,laneB,AX-20,laneB]])
  :lanes.map(v=>[XL,v,XR,v]).concat([[XL,laneB,AX-20,laneB]]));
 const sig=JSON.stringify(segs);if(sig!==GSIG){GSIG=sig;setGraph(makeGraph(segs),BED_X+','+laneB)}
 svg.querySelectorAll('.ag').forEach(g=>{const go=()=>{openId=g.dataset.id;build();showDetail()};g.addEventListener('click',go);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}})});
 const ow=svg.querySelector('#owner'),toNeed=()=>$('#needBox').scrollIntoView({behavior:MOTION_OK?'smooth':'auto',block:'start'});
 ow.addEventListener('click',toNeed);ow.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toNeed()}});
 const lg=$('#legend');lg.replaceChildren();
 lg.append(el('span',null,'Màn hình chạy code, tay gõ phím = đang làm · gõ ngón tay = có việc chờ (số trên bong bóng) · giơ tay "?" = đang chờ Master trả lời · bọ đỏ trên bàn = có lỗi Tester báo · Master đứng dậy quay lại giơ giấy "!" = chờ bạn · gật gù "z" = rảnh · bóng mờ "?" = ID chưa khai trong agents.txt'),
  el('span',null,'Cửa mở = có việc chờ bạn · đồng hồ đứng, đèn tắt = watch.sh không chạy · rê chuột vào ai để xem chi tiết, bấm để mở · bấm bàn "BẠN" để tới mục Cần bạn · thỉnh thoảng bạn rời bàn đi một vòng văn phòng · bấm vào chó, mèo, chuột để nghe chúng kêu'));
 if(free.length>CAP)lg.append(el('span',null,'Rảnh, không hiện hết: '+free.slice(CAP).map(a=>a.id).join(', ')));
}

/* ---------- chó, mèo, chuột chạy khắp văn phòng ---------- */
// Lối đi là lưới điểm cách nhau 4 đơn vị dọc các đoạn thẳng; con vật đi theo đường ngắn nhất (BFS) giữa hai điểm.
// Chó đi dạo, thỉnh thoảng ra ngồi cạnh bàn bạn hay về ổ ngủ. Chuột chui ra từ lỗ chân tường chạy một vòng rồi về,
// mèo rượt theo; chuột về lỗ thì mèo ngồi canh. Chó đi sát mèo thì mèo giật mình nhảy lên rồi bỏ chạy.
// Lớp #pets riêng, không bị thay khi trang làm mới 3 giây.
const XL=16,BASE_Y=124,LV=-20,LL=-LW+16,q4=v=>Math.round(v/4)*4;let XR=676;
let G=null,GSIG='',HOLE='',GUARD='',BED='',SPOT='';const CRIT={};
// Bạn (chủ dự án) thỉnh thoảng rời bàn đi một vòng: dừng ở vài chỗ nói một câu, chó có khi lẽo đẽo theo, rồi về bàn
const BOSS_L={hair:'#2d2d3a',skin:'#f5cfa6',style:'short',pants:'#3a3f5c'};
const BOSS_SAY=['Cố lên!','Tốt lắm!','Đẹp đấy!','Hmm…','Nghỉ tí ☕','Ổn chứ?','Nhanh nào!'];
const bossGap=()=>1200+Math.random()*1200; // 60–120 giây giữa hai vòng (nhịp 50ms)
// Chỗ dừng kế tiếp: một điểm ngẫu nhiên không quá xa chỗ đang đứng, để một vòng chỉ mất chừng nửa phút tới một phút
const nearNode=(a,max)=>{let best=null;for(let i=0;i<24;i++){const k=randNode(),e=dist(G.get(k),a);if(e>40&&e<=max)return k;if(!best||e<dist(G.get(best),a))best=k}return best};
let NEED_N=0;
// Bạn rời bàn hay về bàn: vẽ lại văn phòng ngay để bàn có (hay không có) người
const setAway=()=>{if(S)build()};
function makeGraph(segs){const g=new Map();
 segs.forEach(([x0,y0,x1,y1])=>{const n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0))/4,sx=Math.sign(x1-x0)*4,sy=Math.sign(y1-y0)*4;let prev=null;
  for(let i=0;i<=n;i++){const x=x0+sx*i,y=y0+sy*i,id=x+','+y;if(!g.has(id))g.set(id,{x,y,nb:[]});
   if(prev&&!g.get(id).nb.includes(prev)){g.get(id).nb.push(prev);g.get(prev).nb.push(id)}prev=id}});
 return g}
const nodeAt=(x,y)=>{let b=null,d=1e9;G.forEach((n,id)=>{const e=Math.abs(n.x-x)+Math.abs(n.y-y);if(e<d){d=e;b=id}});return b};
function route(from,to){if(from===to||!G.has(to))return[];const prev=new Map([[from,null]]),q=[from];
 for(let i=0;i<q.length;i++){const c=q[i];if(c===to)break;for(const n of G.get(c).nb)if(!prev.has(n)){prev.set(n,c);q.push(n)}}
 if(!prev.has(to))return[];const out=[];for(let c=to;c!==from;c=prev.get(c))out.push(c);return out.reverse()}
const randNode=()=>{const ks=[...G.keys()];return ks[Math.floor(Math.random()*ks.length)]};
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const goTo=(a,id)=>{a.path=route(nodeAt(a.x,a.y),id)};
// Chỗ xa con vật a nhất trong vài điểm bốc ngẫu nhiên (để mèo chạy trốn)
const farNode=a=>{let b=randNode();for(let i=0;i<6;i++){const k=randNode();if(dist(G.get(k),a)>dist(G.get(b),a))b=k}return b};
function setGraph(g,bed){
 G=g;HOLE=HOLE_X+','+BASE_Y;GUARD=(HOLE_X+16)+','+BASE_Y;BED=bed;SPOT=XR+','+BASE_Y;
 const at=id=>G.get(id);
 if(!CRIT.dog){
  const c=at(randNode());
  CRIT.dog={x:at(BED).x,y:at(BED).y,dir:1,path:[],mode:'sleep',pose:'sleep',wait:120,spd:1.5,odo:0,say:'',sayT:0,jump:0};
  CRIT.cat={x:c.x,y:c.y,dir:-1,path:[],mode:'roam',pose:'sit',wait:40,spd:1.3,odo:0,say:'',sayT:0,jump:0,re:0};
  CRIT.mouse={x:at(HOLE).x,y:at(HOLE).y,dir:-1,path:[],mode:'hide',pose:'walk',wait:90,spd:2.6,odo:0,say:'',sayT:0,jump:0,hidden:true,trips:0};
  CRIT.boss={x:at(SPOT).x,y:at(SPOT).y,dir:1,path:[],mode:'desk',pose:'stand',wait:300,spd:1.8,odo:0,say:'',sayT:0,jump:0,stops:0,pause:0};
  return}
 // bố cục đổi (thêm, bớt dãy bàn): đặt từng con vào điểm gần nhất trên lối đi mới, đang ngủ thì ngủ tiếp
 const b=CRIT.boss;
 Object.values(CRIT).forEach(a=>{const n=at(nodeAt(a.x,a.y));a.x=n.x;a.y=n.y;a.path=[];if(a!==b&&a.mode!=='sleep'&&a.mode!=='nap'&&a.mode!=='hide'&&a.mode!=='follow')a.mode='roam';a.wait=a===b?a.wait:10});
 if(CRIT.dog.mode==='sleep'){const n=at(BED);CRIT.dog.x=n.x;CRIT.dog.y=n.y}
 if(CRIT.mouse.hidden){const n=at(HOLE);CRIT.mouse.x=n.x;CRIT.mouse.y=n.y}
 // bạn đang đi vòng thì đi tiếp tới một chỗ mới (hay về bàn), đang đứng xem thì đứng xem tiếp
 if(b.mode==='desk'){const n=at(SPOT);b.x=n.x;b.y=n.y}else if(!b.pause)goTo(b,b.mode==='back'?SPOT:nearNode(b,300))
}
// Đi theo đường đã tính; k: số nhịp 50ms đã trôi qua. Trả về true khi tới nơi
function move(a,k){let left=a.spd*k*(a.boost?1.6:1);const sx=a.x,sy=a.y;
 while(left>1e-6&&a.path.length){const n=G.get(a.path[0]);if(!n){a.path=[];break}
  const dx=n.x-a.x,dy=n.y-a.y;
  if(dx){a.dir=Math.sign(dx);if(Math.abs(dx)<=left){left-=Math.abs(dx);a.x=n.x}else{a.x+=a.dir*left;left=0}}
  else if(dy){if(Math.abs(dy)<=left){left-=Math.abs(dy);a.y=n.y}else{a.y+=Math.sign(dy)*left;left=0}}
  if(a.x===n.x&&a.y===n.y)a.path.shift()}
 a.odo+=Math.abs(a.x-sx)+Math.abs(a.y-sy);return !a.path.length}
const say=(a,t,n)=>{a.say=t;a.sayT=n||14};
function think(k){
 const d=CRIT.dog,c=CRIT.cat,m=CRIT.mouse,b=CRIT.boss;
 [d,c,m,b].forEach(a=>{if(a.sayT>0)a.sayT-=k;if(a.jump>0)a.jump-=k});
 // bạn: ngồi bàn một lúc, rồi đi qua vài chỗ ngẫu nhiên, mỗi chỗ đứng nhìn và nói một câu, xong về bàn
 if(b.mode==='desk'){if((b.wait-=k)<=0){b.mode='tour';b.stops=2+Math.floor(Math.random()*3);b.pause=0;goTo(b,nearNode(b,360));setAway();
  if(d.mode!=='sleep'&&d.mode!=='bed'&&Math.random()<.6){d.mode='follow';d.re=0}}}
 else if(b.pause>0){if((b.pause-=k)<=0){if(b.stops>0)goTo(b,nearNode(b,300));else{b.mode='back';goTo(b,SPOT)}}}
 else if(move(b,k)){
  if(b.mode==='back'){b.mode='desk';b.wait=bossGap();if(d.mode==='follow'){d.mode='roam';d.wait=20}setAway()}
  else{b.stops--;b.pause=50+Math.random()*50;say(b,BOSS_SAY[Math.floor(Math.random()*BOSS_SAY.length)],40)}}
 b.pose=b.path.length?'walk':'stand';
 // chuột: trốn trong lỗ, chui ra chạy một hai vòng rồi về
 if(m.mode==='hide'){if((m.wait-=k)<=0){m.hidden=false;m.mode='out';m.trips=1+Math.floor(Math.random()*2);goTo(m,randNode())}}
 else if(move(m,k)){
  if(m.mode==='home'){m.mode='hide';m.hidden=true;m.wait=160+Math.random()*260;if(c.mode==='chase'){c.mode='guard';c.wait=90+Math.random()*90;goTo(c,GUARD)}}
  else if(m.trips-->0)goTo(m,randNode());else{m.mode='home';goTo(m,HOLE)}}
 m.boost=!m.hidden&&c.mode==='chase'&&dist(m,c)<16;
 if(m.boost&&m.sayT<=0)say(m,'Chít!',12);
 // mèo: thấy chuột thì rượt (đang ngủ thì thỉnh thoảng mới tỉnh)
 if(!m.hidden&&c.mode!=='chase'&&c.mode!=='flee'&&(c.mode!=='nap'||Math.random()<.008*k)){c.mode='chase';c.re=0;say(c,'Meo!')}
 if(c.mode==='chase'){c.spd=2.1;if((c.re-=k)<=0){c.re=6;goTo(c,nodeAt(m.x,m.y))}move(c,k)}
 else if(c.mode==='guard'){c.spd=1.5;if(move(c,k)){c.dir=HOLE_X<c.x?-1:1;if((c.wait-=k)<=0){c.mode='roam';c.wait=10}}}
 else if(c.mode==='flee'){c.spd=3;if(move(c,k)){c.mode='roam';c.wait=30}}
 else if(c.mode==='nap'){if((c.wait-=k)<=0){c.mode='roam';c.wait=0}}
 else{c.spd=1.3;if(c.path.length)move(c,k);else if((c.wait-=k)<=0){if(Math.random()<.3){c.mode='nap';c.wait=220+Math.random()*260}else{goTo(c,randNode());c.wait=25+Math.random()*90}}}
 c.pose=c.mode==='nap'?'sleep':c.path.length?'walk':'sit';
 // chó: đi dạo, ra ngồi cạnh bàn bạn, hay về ổ ngủ
 if(d.mode!=='follow')d.spd=1.5;
 if(d.mode==='follow'){if(b.mode==='desk'){d.mode='roam';d.wait=20}
  else{d.spd=1.9;if((d.re-=k)<=0){d.re=8;if(dist(d,b)>16)goTo(d,nodeAt(b.x,b.y));else d.path=[]}move(d,k)}}
 else if(d.mode==='sleep'){if((d.wait-=k)<=0){d.mode='roam';d.wait=0}}
 else if(d.mode==='bed'){if(move(d,k)){d.mode='sleep';d.wait=260+Math.random()*320}}
 else if(d.path.length)move(d,k);
 else if((d.wait-=k)<=0){const r=Math.random();
  if(r<.15){d.mode='bed';goTo(d,BED)}else if(r<.3){goTo(d,SPOT);d.wait=60+Math.random()*80}else{goTo(d,randNode());d.wait=20+Math.random()*70}}
 d.pose=d.mode==='sleep'?'sleep':d.path.length?'walk':'sit';
 // chó đi sát mèo: mèo giật mình nhảy lên rồi chạy đi; chó thấy chuột thì sủa
 if(d.pose==='walk'&&c.mode!=='flee'&&c.jump<=0&&dist(d,c)<14){c.jump=12;say(c,'!',12);say(d,'Gâu!');c.mode='flee';goTo(c,farNode(c))}
 if(!m.hidden&&d.pose!=='sleep'&&d.sayT<=0&&dist(d,m)<18)say(d,'Gâu!');
}
/* hình con vật: gốc toạ độ ở giữa chân, mặt quay sang phải */
function dogArt(pose,fr,wag){const c='#c98d52',d='#8a5a30',l='#f3dcb8';
 const head=(x,y)=>C(x,y,5,c,K(.9))+E(x+4,y+1.5,3.2,2.3,l,K(.6))+C(x+6.8,y+.7,1,OL)+C(x+1.2,y-1.4,.9,OL)+P('M'+(x-3)+' '+(y-4)+' q-3.5 2 -2 8 q2.5 -1 3 -6z',d,K(.6));
 if(pose==='sleep')return LN('M-10 -3 q-4 3 1 4',c,2.4)+E(0,-4.6,11,4.8,c,K(.9))+E(-2,-2.6,6,1.6,l)+C(8,-4.6,4.6,c,K(.9))+P('M5.5 -8 q-3 1 -2 6 q2 -1 3 -4z',d,K(.6))
  +E(11.4,-3.3,2.6,1.9,l,K(.6))+C(13.7,-3.7,.9,OL)+LN('M7.6 -5.4 q1 .9 2 0',OL,.7)+T(6,-13,7,'#8a7a6a','z','middle').replace('<text','<text class="zzz"');
 if(pose==='sit')return LN('M-6 -2 q-5 '+(wag?-3:1)+' -8 '+(wag?-6:-3),c,2.4)+E(-2,-3,6,3,c,K(.8))+E(0,-9,6,7,c,K(.9))+E(2,-8,3,4,l)
  +RR(2,-6,3,6,1.4,c,K(.6))+RR(5,-6,3,6,1.4,c,K(.6))+head(4,-17)+RR(1,-12.5,6,2,1,'#d64545')+C(4,-10.2,1,'#f2c14e');
 const o=fr?1.6:-1.6;
 return LN('M-9 -9 q-5 '+(wag?-4:-2)+' -4 -9',c,2.4)+RR(-8-o,-6,3,6,1.4,d,K(.6))+RR(4+o,-6,3,6,1.4,d,K(.6))
  +E(0,-9,10,5,c,K(.9))+E(1,-6.6,7,1.8,l)+RR(-6+o,-6,3,6,1.4,c,K(.6))+RR(6-o,-6,3,6,1.4,c,K(.6))+head(10,-14)+RR(6,-10.6,5,2,1,'#d64545')+C(8.5,-8.4,1,'#f2c14e')}
function catArt(pose,fr,jump){const c='#8d96a8',d='#5d6576',w='#eef1f6';
 const head=(x,y)=>P('M'+(x-3)+' '+(y-2.5)+' l.6 -5 l3.2 3z',c,K(.6))+P('M'+(x+1.6)+' '+(y-3.6)+' l2.4 -3.8 l1 4.6z',c,K(.6))+C(x,y,4.3,c,K(.8))
  +E(x+2.8,y+1.2,1.9,1.3,w)+C(x+1.6,y-.6,jump?1.2:.9,jump?'#ffffff':'#2b2b2b',jump?K(.5):'')+C(x+4.3,y+.6,.6,'#f3a3a3')+LN('M'+(x+3)+' '+(y+1.2)+' l3.2 -.6 M'+(x+3)+' '+(y+1.8)+' l3.2 .7',d,.4);
 if(pose==='sleep')return LN('M-7 -1.5 q2 3 10 2',d,1.8)+E(0,-3.6,7.5,3.6,c,K(.8))+LN('M-3 -6.6 l.8 2 M0 -7 l.4 2 M3 -6.8 l0 2',d,.7)+C(5,-4,3.3,c,K(.7))
  +P('M3 -6 l.6 -3 l2 2z',c,K(.5))+P('M6 -6.6 l1.8 -2.4 l.6 3z',c,K(.5))+LN('M5 -4 q.8 .7 1.6 0',OL,.6)+'<text class="zzz" x="2" y="-11" font-size="6" fill="#8a7a6a" text-anchor="middle">z</text>';
 if(pose==='sit')return LN('M-3 -1 q-7 0 -5 -7',c,2)+E(0,-6,5,6,c,K(.8))+E(2,-5,2.4,4,w)+RR(1,-4,2.2,4,1,c,K(.5))+RR(3.6,-4,2.2,4,1,c,K(.5))+head(2,-13.5);
 const o=fr?1.2:-1.2;
 return LN('M-7 -7 q-6 -1 -6 '+(fr?-9:-8),c,2)+RR(-6-o,-4,2,4,1,d)+RR(4+o,-4,2,4,1,d)+E(0,-6.5,8,3.6,c,K(.8))
  +LN('M-3 -9.6 l1 2.4 M0 -10 l.5 2.4 M3 -9.8 l0 2.3',d,.8)+RR(-5+o,-4,2,4,1,c,K(.5))+RR(5-o,-4,2,4,1,c,K(.5))+head(8,-10)}
function mouseArt(fr){const c='#a5978a';
 return LN('M-4 -2 q-4 -2.4 -7 0',' #d8b4a8',.8)+C(-2+(fr?1:0),-.4,.8,c)+C(2-(fr?1:0),-.4,.8,c)+E(0,-2.6,4.2,2.6,c,K(.6))+C(2.4,-4.6,1.6,'#f3b3b3',K(.4))
  +E(4.2,-2.4,1.9,1.6,c)+C(6.1,-2.6,.55,'#f3a3a3')+C(4.4,-3,.45,OL)}
function critSay(y,t){const w=t.length*4.4+8;return RR(-w/2,y,w,11,3,'#ffffff',K(.9))+P('M-2 '+(y+10.4)+' l2 3 l2 -3z','#ffffff')+T(0,y+8,7,'#3b2a20',t)}
function drawCrit(){
 const svg=$('#pets');if(!svg||!CRIT.dog)return;
 const t=performance.now();
 ['dog','cat','mouse','boss'].forEach(n=>{const a=CRIT[n];let g=svg.querySelector('[data-c="'+n+'"]');
  if(!g){g=document.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('data-c',n);g.setAttribute('class','crit');svg.appendChild(g);g.addEventListener('pointerdown',()=>poke(n))}
  if(n==='boss'){
   // bạn đi một vòng: người đứng thẳng (chân bước khi đi), bong bóng việc chờ bạn đi theo trên đầu
   const out=a.mode!=='desk',talk=a.sayT>0?a.say:'',key=[out,a.pose,talk,NEED_N].join('|');
   g.setAttribute('transform','translate('+a.x.toFixed(1)+','+a.y.toFixed(1)+')');
   if(g._k===key)return;g._k=key;
   if(!out){g.innerHTML='';return}
   g.innerHTML=R(-13,-40,26,41,'transparent')+'<g class="'+(a.pose==='walk'?'walker':'')+'">'+standFront(0,-38,BOSS_L,'boss','#2f6fe0','')+'</g>'
    +(NEED_N?bubble(0,-57,'!'+NEED_N,'bad'):'')+(talk?critSay(NEED_N?-71:-53,talk):'');
   return}
  const hide=n==='mouse'&&a.hidden,fr=Math.floor(a.odo/5)%2,wag=a.pose==='sit'&&n==='dog'?Math.floor(t/180)%2:0;
  const talk=a.sayT>0?a.say:'',key=[a.pose,fr,a.dir,talk,a.jump>0,hide,wag].join('|');
  const lift=a.jump>0?-Math.sin(Math.max(0,Math.min(1,(12-a.jump)/12))*Math.PI)*9:0;
  g.setAttribute('transform','translate('+a.x.toFixed(1)+','+(a.y+lift).toFixed(1)+')');
  if(g._k===key)return;g._k=key;
  if(hide){g.innerHTML='';return}
  const art=n==='dog'?dogArt(a.pose,fr,wag):n==='cat'?catArt(a.pose,fr,a.jump>0):mouseArt(fr);
  const top=n==='dog'?(a.pose==='sit'?-36:a.pose==='sleep'?-24:-32):n==='cat'?(a.pose==='sit'?-32:-27):-20;
  g.innerHTML=R(-12,n==='mouse'?-8:-20,24,n==='mouse'?9:21,'transparent')+'<g transform="scale('+a.dir+',1)">'+art+'</g>'+(talk?critSay(top,talk):'');
 })}
// Bấm vào con vật: nó kêu; đang ngủ thì tỉnh dậy
function poke(n){const a=CRIT[n];if(!a)return;
 if(n==='dog'){say(a,'Gâu!',16);if(a.mode==='sleep'){a.mode='roam';a.wait=12}}
 else if(n==='cat'){say(a,'Meo!',16);if(a.mode==='nap'){a.mode='roam';a.wait=12}}
 else if(n==='boss'){if(NEED_N)$('#needBox').scrollIntoView({behavior:MOTION_OK?'smooth':'auto',block:'start'});else say(a,'Chào!',20)}
 else if(!a.hidden)say(a,'Chít!',16);
 drawCrit()}
let lastT=0;
function critLoop(t){requestAnimationFrame(critLoop);
 if(!G||!CRIT.dog){lastT=t;return}
 const k=lastT?Math.min(3,(t-lastT)/50):1;lastT=t;
 if(MOTION_OK)think(k);else[CRIT.dog,CRIT.cat,CRIT.mouse].forEach(a=>{if(a.sayT>0)a.sayT-=k});
 drawCrit()}
requestAnimationFrame(critLoop);

/* ---------- các khu HTML ---------- */
function render(){
 $('#proj').textContent='VĂN PHÒNG AGENT · '+S.project;
 {const d=S.features.filter(f=>f.status==='done').length,g=S.features.filter(f=>f.status==='delivered').length;$('#bFeat').textContent=(S.features.length-d-g)+' ĐANG LÀM · '+(g?g+' CHỜ MERGE · ':'')+d+' XONG'}
 $('#bRun').textContent=S.agents.filter(a=>a.running).length+'/'+S.agents.length+' ĐANG CHẠY';
 {const mw=(S.masters||[]).filter(m=>m.waitOwner).length;$('#bNeed').textContent=(S.owner.length+mw)+' CHỜ BẠN'}
 {const w=S.watch||{state:'never'},bw=$('#bWatch');
  bw.textContent=w.state==='running'?'WATCH ✓':w.state==='dead'?'WATCH ĐÃ CHẾT':'WATCH TẮT';
  bw.className='badge'+(w.state==='dead'?' off':w.state==='running'?'':' warn');
  bw.title=w.state==='running'?'watch.sh đang chạy, quét lần cuối '+hm(w.at):'Chạy: sh workflow/watch.sh'}
 {const n=S.owner.length+(S.masters||[]).filter(m=>m.waitOwner).length;document.title=(n?'('+n+') Chờ bạn · ':'')+'Văn phòng agent'}
 const anom=S.anomalies||[],paused=S.agents.filter(a=>a.paused);
 $('#needBox').classList.toggle('on',S.owner.length>0||anom.length>0||paused.length>0);
 banner();
 const need=$('#need');need.replaceChildren();
 if(anom.length||paused.length){const box=el('div','ask');
  box.append(el('p','act','Bất thường ('+(anom.length+paused.length)+')'),el('p','muted','watch.sh phát hiện. Nói với Master: "Xử lý việc đang chờ", hoặc tự xem file.'));
  paused.forEach(a=>{const p=el('p',null,a.id+' đang tạm dừng vì bị đánh thức quá nhiều lần. Xem log, rồi chạy: ');p.append(el('code',null,'sh workflow/watch.sh --resume '+a.id));box.append(p)});
  anom.forEach(t=>box.append(el('p',null,'• '+t)));need.append(box)}
 if(!S.hasWorkflow)need.append(el('p','muted','Không thấy thư mục workflow/. Hãy chạy monitor tại thư mục dự án.'));
 else if(!S.owner.length){if(!anom.length&&!paused.length)need.append(el('p','muted','Không có gì chờ bạn.'))}
 else S.owner.forEach(o=>{const a=ownerAction(o),box=el('div','ask');
  box.append(el('p','act',o.feature+' · '+a.act),el('p',null,o.title||o.file),el('p','muted',a.how));
  if(a.say){const p=el('p','say');p.append(document.createTextNode('Nói với Master: '),el('code',null,a.say));box.append(p)}
  (o.sections||[]).forEach((x,i)=>{const k=o.path+'#'+x.title,d=el('details');
   d.open=OPEN.has(k)?OPEN.get(k):/cách thử/i.test(x.title); // mặc định mở mục "Cách thử"; nhớ lựa chọn của bạn
   d.addEventListener('toggle',()=>OPEN.set(k,d.open));
   d.append(el('summary',null,x.title),el('pre',null,x.text||'(trống)'));box.append(d)});
  need.append(box)});
 build();
 const files=$('#files');files.replaceChildren();
 S.features.forEach((f,i)=>{const d=el('details');const k='feat:'+f.dir;
  d.open=OPEN.get(k)===true; // trang làm mới 3 giây một lần: giữ nguyên khung bạn đang mở
  d.addEventListener('toggle',()=>OPEN.set(k,d.open));
  const sm=el('summary');const sq=el('span','sq');sq.style.background=COLORS[i%COLORS.length];sm.append(sq,f.id+' · '+f.title+' · '+stOf(f)+' ('+f.items.length+' file)');d.append(sm);
  const t=el('table');f.items.forEach(it=>{const tr=el('tr');const td=el('td');td.append(el('code',null,it.file));tr.append(td,el('td',null,it.title),el('td',null,stOf(it)),el('td',null,'→ '+(it.to==='owner'?'bạn':it.to==='none'?'không ai':it.to)));t.append(tr)});d.append(t);files.append(d)});
 if(!S.features.length)files.append(el('p','muted','Chưa có.'));
 if(openId)showDetail();
}
// Một dòng to nói rõ ai đang cầm lượt: chủ dự án (đỏ) hay agent nào (xanh), Master nào đang mở, watch.sh còn chạy không
const hm=t=>new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
function watchLine(active){
 const w=S.watch||{state:'never'};
 if(w.state==='dead')return '⚠ watch.sh đã dừng bất thường (nhịp tim cuối '+hm(w.at)+'): không báo Telegram, không đánh thức agent auto/window. Chạy lại: sh workflow/watch.sh --restart';
 if(w.state!=='running'&&active)return '⚠ watch.sh không chạy'+(w.state==='stopped'?' (dừng lúc '+hm(w.at)+(w.reason?', '+w.reason:'')+')':'')+': không báo Telegram, không đánh thức agent auto/window. Chạy: sh workflow/watch.sh';
 return '';
}
function masterLine(m){const old=Date.now()-m.at>2*3600e3;
 if(m.merged)return 'MASTER '+m.id+': '+m.text+' → '+m.merged+' đã merge, chờ '+m.id+' dọn (không còn chờ bạn)';
 return 'MASTER '+m.id+': '+m.text+(old?' (không đổi từ '+hm(m.at)+', phiên có thể đã đóng)':' ('+hm(m.at)+')')}
function banner(){
 const b=$('#banner');b.replaceChildren();b.className='pix banner';
 const ms=S.masters||[],mw=ms.filter(m=>m.waitOwner),act=S.features.filter(f=>f.status!=='done'&&f.status!=='delivered');
 const wl=watchLine(act.length>0||ms.length>0);
 const turns=[];act.forEach(f=>f.items.forEach(it=>{if(it.to&&it.to!=='none'&&it.to!=='owner')turns.push({f,it})}));
 const run=S.agents.filter(a=>a.running);
 const need=S.owner.length+mw.length;
 if(need){
  b.classList.add('owner');b.append(el('p',null,'ĐANG CHỜ BẠN ('+need+')'));
  S.owner.forEach(o=>{const a=ownerAction(o);b.append(el('p','small','▶ '+o.feature+' · '+a.act+(a.say?' → nói với Master: "'+a.say+'"':'')))});
  mw.forEach(m=>b.append(el('p','small','▶ '+m.id+': '+m.text+' (trả lời trong phiên chat của '+m.id+')')));
  ms.filter(m=>!m.waitOwner).forEach(m=>b.append(el('p','small',masterLine(m))));
  if(wl)b.append(el('p','small alert',wl));
  b.hidden=false;b.onclick=()=>$('#needBox').scrollIntoView({behavior:MOTION_OK?'smooth':'auto',block:'start'});return}
 if(!turns.length&&!run.length&&!ms.length&&!wl){b.hidden=true;return}
 b.classList.add('flow');
 b.append(el('p',null,run.length?'ĐANG CHẠY: '+run.map(a=>a.id+(a.sub?' ('+a.sub+', Master gọi)':'')).join(' · '):ms.length?'MASTER ĐANG LÀM':'KHÔNG AI ĐANG CHẠY'));
 ms.forEach(m=>b.append(el('p','small',masterLine(m))));
 const by={};turns.forEach(x=>{(by[x.it.to]=by[x.it.to]||[]).push(x.f.id+' '+x.it.file)});
 Object.keys(by).forEach(id=>{const a=S.agents.find(z=>z.id===id);
  const how=!a?'không có trong agents.txt, không ai đánh thức được':a.running?'đang làm':a.mode==='subagent'?'chờ Master gọi':(MODE_WAIT[a.mode]||'chờ đánh thức').toLowerCase();
  b.append(el('p','small','Lượt của '+id+' ('+how+'): '+by[id].join(', ')))});
 if(wl)b.append(el('p','small alert',wl));
 b.hidden=false;b.onclick=null;
}
function showDetail(){
 const d=$('#detail');const a=S.agents.find(x=>x.id===openId);d.replaceChildren();d.style.display='block';
 const close=el('button',null,'Đóng');close.onclick=()=>{openId=null;d.style.display='none';build()};d.append(close,el('h2',null,openId));
 if(!a){d.append(el('p',null,'Agent này được nhắc trong file nhưng chưa có trong workflow/agents.txt, nên watch.sh không đánh thức được.'));return}
 d.append(el('p',null,a.role+' · '+(MODE_NAME[a.mode]||'đánh thức tay')+(a.note?' · '+a.note:'')),el('p',null,a.paused?'Tạm dừng (đánh thức quá nhiều lần): sh workflow/watch.sh --resume '+a.id:a.running?(a.sub?'Đang chạy: Master gọi subagent ('+a.sub+')':'Đang chạy'):'Không chạy'));
 d.append(el('h2',null,'File đang chờ'));
 if(a.pending.length){const ul=el('ul');a.pending.forEach(p=>{const li=el('li');li.append(el('code',null,p));ul.append(li)});d.append(ul)}else d.append(el('p','muted','Không có.'));
 if(a.hist&&a.hist.length){d.append(el('h2',null,'Các lần chạy gần đây'));const ul=el('ul');
  a.hist.forEach(h=>{const li=el('li');li.append(el('code',null,(h.start||'').replace('T',' ')+' → '+((h.end||'').split('T')[1]||h.end)),document.createTextNode(' '+h.what));ul.append(li)});d.append(ul)}
 d.append(el('h2',null,'Log gần nhất'));
 if(a.lastLog)d.append(el('p','muted',a.lastLog.name+(a.lastLog.mtime?' · '+new Date(a.lastLog.mtime).toLocaleString():'')),el('pre',null,a.lastLog.tail||'(trống)'));
 else d.append(el('p','muted','Chưa có log (agent subagent hoặc đánh thức tay, hoặc chưa được đánh thức lần nào).'));
}
async function poll(){
 try{const r=await fetch('/api/state',{cache:'no-store'});S=await r.json();const c=$('#bConn');c.textContent='CẬP NHẬT '+new Date().toLocaleTimeString();c.className='badge';render()}
 catch(e){const c=$('#bConn');c.textContent='MẤT KẾT NỐI';c.className='badge off'}
}
poll();setInterval(poll,3000);
// Đổi cỡ cửa sổ: xếp lại văn phòng (số bàn mỗi hàng, có hay không cột phòng chờ)
let resizeT=0;window.addEventListener('resize',()=>{clearTimeout(resizeT);resizeT=setTimeout(()=>{if(S)build()},200)});
</script></body></html>`;
