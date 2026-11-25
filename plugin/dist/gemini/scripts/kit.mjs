#!/usr/bin/env node
// Cài và cập nhật bộ khởi đầu của workflow multi-agent vào một dự án. Không cần công cụ AI nào: plugin Claude,
// extension Gemini gọi script này, người dùng cũng chạy tay được (node <plugin>/scripts/kit.mjs <lệnh>).
//
//   init [--dry-run]       chép bộ khởi đầu vào dự án; file đã có thì GIỮ NGUYÊN, chỉ báo
//   upgrade [--dry-run]    cập nhật file do workflow quản lý (vai, script, hook, subagent); bản cũ khác bản mới thì
//                          chép sang workflow/.upgrade-backup/<giờ>/ trước khi ghi đè. File của dự án
//                          (agents.txt, project.conf) không đụng tới; file dùng chung (AGENTS.md, CLAUDE.md…) chỉ báo
//                          "cần gộp" để người hay AI gộp tay
//   status                 so dự án với bộ khởi đầu, không ghi gì
//   session-start --tool claude|gemini   in ngữ cảnh đầu phiên cho hook SessionStart (nhắc cập nhật khi lệch bản)
//
// Thư mục dự án: thư mục gốc (dòng đầu của `git worktree list`) của thư mục đang đứng; không phải repo git thì
// chính thư mục đang đứng.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Bộ khởi đầu: <plugin>/kit (bản dựng) hoặc <repo>/starter-kit (chạy thẳng từ mã nguồn).
export function kitDir() {
  for (const d of [path.join(HERE, '..', 'kit'), path.join(HERE, '..', '..', 'starter-kit')]) {
    if (fs.existsSync(path.join(d, 'workflow', 'project.conf'))) return path.resolve(d);
  }
  throw new Error('Không tìm thấy bộ khởi đầu (kit/ hoặc starter-kit/).');
}

export function pluginVersion() {
  return fs.readFileSync(path.join(HERE, '..', 'VERSION'), 'utf8').trim();
}

// File của dự án: workflow chỉ tạo khi chưa có, không bao giờ ghi đè.
export const CONFIG = new Set(['workflow/agents.txt', 'workflow/project.conf']);
// File dự án hay đã có sẵn hoặc tự thêm nội dung: ghi đè sẽ mất phần của dự án, nên chỉ báo cần gộp.
export const MERGE = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.gitattributes', '.claude/settings.json']);
export const category = rel => (CONFIG.has(rel) ? 'config' : MERGE.has(rel) ? 'merge' : 'managed');

export function projectRoot(cwd = process.cwd()) {
  try {
    const first = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/)[0] || '';
    const root = first.replace(/^worktree /, '').trim();
    if (root) return path.resolve(process.platform === 'win32' && /^\/[a-zA-Z]\//.test(root) ? root[1] + ':' + root.slice(2) : root);
  } catch {}
  return path.resolve(cwd);
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

// So nội dung, bỏ qua khác biệt CRLF/LF (git trên Windows hay đổi xuống dòng).
const sameText = (a, b) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');

// Trạng thái từng file của bộ khởi đầu trong dự án: missing | same | differs.
export function compare(root, kit = kitDir()) {
  return listFiles(kit).map(rel => {
    const dst = path.join(root, rel);
    let state = 'missing';
    if (fs.existsSync(dst)) state = sameText(fs.readFileSync(dst, 'utf8'), fs.readFileSync(path.join(kit, rel), 'utf8')) ? 'same' : 'differs';
    return { rel, cat: category(rel), state };
  });
}

export function readProjectVersion(root) {
  try {
    const m = fs.readFileSync(path.join(root, 'workflow', 'project.conf'), 'utf8').match(/^WORKFLOW_VERSION=([^\r\n]*)/m);
    return m ? m[1].trim() : '';
  } catch { return null; } // null: dự án chưa cài workflow
}

function writeProjectVersion(root, version) {
  const f = path.join(root, 'workflow', 'project.conf');
  if (!fs.existsSync(f)) return;
  let s = fs.readFileSync(f, 'utf8');
  const line = `WORKFLOW_VERSION=${version}`;
  if (/^WORKFLOW_VERSION=.*$/m.test(s)) s = s.replace(/^WORKFLOW_VERSION=.*$/m, line);
  else s = s.replace(/\s*$/, '') + `\n\n# Bản workflow đã cài vào dự án này. /workflow:upgrade (hay kit.mjs upgrade) tự ghi; đừng sửa tay.\n${line}\n`;
  fs.writeFileSync(f, s);
}

// -1, 0, 1 theo semver đơn giản (x.y.z).
export function cmpVersion(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0), pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1;
  return 0;
}

function copyIn(kit, root, rel) {
  const dst = path.join(root, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(kit, rel), dst);
  if (/\.sh$|(^|\/)pre-push$/.test(rel)) { try { fs.chmodSync(dst, 0o755); } catch {} }
}

export function init(root, { dryRun = false } = {}) {
  const kit = kitDir();
  const rows = compare(root, kit);
  const created = [], kept = [];
  for (const r of rows) {
    if (r.state === 'missing') { if (!dryRun) copyIn(kit, root, r.rel); created.push(r.rel); }
    else if (r.state === 'differs') kept.push(r.rel);
  }
  const version = pluginVersion();
  if (!dryRun) writeProjectVersion(root, version);
  return { root, version, created, kept };
}

export function upgrade(root, { dryRun = false, now = new Date() } = {}) {
  const kit = kitDir();
  if (readProjectVersion(root) === null) throw new Error(`Dự án chưa cài workflow (không có ${path.join(root, 'workflow', 'project.conf')}). Chạy init trước.`);
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(root, 'workflow', '.upgrade-backup', stamp);
  const created = [], updated = [], toMerge = [];
  for (const r of compare(root, kit)) {
    if (r.cat === 'config') continue;
    if (r.cat === 'merge') {
      if (r.state === 'missing') { if (!dryRun) copyIn(kit, root, r.rel); created.push(r.rel); }
      else if (r.state === 'differs') toMerge.push(r.rel);
      continue;
    }
    if (r.state === 'missing') { if (!dryRun) copyIn(kit, root, r.rel); created.push(r.rel); }
    else if (r.state === 'differs') {
      if (!dryRun) {
        const bak = path.join(backupDir, r.rel);
        fs.mkdirSync(path.dirname(bak), { recursive: true });
        fs.copyFileSync(path.join(root, r.rel), bak);
        copyIn(kit, root, r.rel);
      }
      updated.push(r.rel);
    }
  }
  const from = readProjectVersion(root), version = pluginVersion();
  if (!dryRun) writeProjectVersion(root, version);
  return { root, from, version, created, updated, toMerge, backup: updated.length ? backupDir : null, kit };
}

// Một dòng nhắc về phiên bản, hoặc '' khi không có gì để nhắc.
export function versionNotice(root) {
  const pv = readProjectVersion(root);
  if (pv === null) return '';
  const v = pluginVersion();
  if (!pv || cmpVersion(pv, v) < 0) {
    return `Workflow: dự án đang ở bản ${pv || '(chưa ghi)'}, plugin đã có bản ${v}. Khi phù hợp, nhắc chủ dự án chạy /workflow:upgrade (không tự chạy).`;
  }
  if (cmpVersion(pv, v) > 0) return `Workflow: dự án ở bản ${pv}, mới hơn plugin (${v}). Nhắc chủ dự án cập nhật plugin.`;
  return '';
}

function sessionStart(tool) {
  const root = projectRoot();
  const notice = versionNotice(root);
  if (tool === 'gemini') {
    // Lệnh TOML của Gemini không biết đường dẫn extension, nên đưa đường dẫn vào ngữ cảnh phiên.
    const ctx = [`WORKFLOW_PLUGIN_DIR=${path.resolve(HERE, '..')} (thư mục extension workflow; các lệnh /workflow:* dùng đường dẫn này).`];
    if (notice) ctx.push(notice);
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx.join('\n') } }));
  } else if (notice) {
    process.stdout.write(notice + '\n');
  }
}

function printList(title, list) {
  if (!list.length) return;
  console.log(`${title} (${list.length}):`);
  for (const f of list) console.log(`  ${f}`);
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const dryRun = rest.includes('--dry-run');
  const root = projectRoot();
  switch (cmd) {
    case 'init': {
      const r = init(root, { dryRun });
      console.log(`${dryRun ? '[thử, không ghi] ' : ''}Cài workflow ${r.version} vào ${r.root}`);
      printList('Đã tạo', r.created);
      printList('Đã có sẵn và khác bộ khởi đầu, GIỮ NGUYÊN (gộp tay theo SETUP.md, mục "Dự án đã có")', r.kept);
      console.log(`Bộ khởi đầu để so: ${kitDir()}`);
      break;
    }
    case 'upgrade': {
      const r = upgrade(root, { dryRun });
      console.log(`${dryRun ? '[thử, không ghi] ' : ''}Cập nhật workflow ${r.from || '(chưa ghi)'} → ${r.version} ở ${r.root}`);
      printList('Đã tạo', r.created);
      printList('Đã cập nhật', r.updated);
      if (r.backup && !dryRun) console.log(`Bản cũ của các file đã cập nhật: ${r.backup}`);
      printList('Cần gộp tay (file dùng chung với dự án, không ghi đè)', r.toMerge);
      if (r.toMerge.length) console.log(`Bản mới để so: ${r.kit}`);
      if (!r.created.length && !r.updated.length && !r.toMerge.length) console.log('Không có gì thay đổi.');
      break;
    }
    case 'status': {
      const pv = readProjectVersion(root);
      if (pv === null) { console.log(`Dự án ${root} chưa cài workflow. Chạy init.`); break; }
      console.log(`Dự án ${root}: workflow ${pv || '(chưa ghi)'}, plugin ${pluginVersion()}`);
      const rows = compare(root);
      printList('Thiếu', rows.filter(r => r.state === 'missing').map(r => r.rel));
      printList('Khác bản của plugin (do workflow quản lý, upgrade sẽ cập nhật)', rows.filter(r => r.state === 'differs' && r.cat === 'managed').map(r => r.rel));
      printList('Khác bản của plugin (dùng chung với dự án, gộp tay)', rows.filter(r => r.state === 'differs' && r.cat === 'merge').map(r => r.rel));
      const n = versionNotice(root);
      if (n) console.log(n);
      break;
    }
    case 'session-start': {
      const i = rest.indexOf('--tool');
      try { sessionStart(i >= 0 ? rest[i + 1] : 'claude'); } catch {}
      break;
    }
    default:
      console.log('Dùng: node kit.mjs init|upgrade|status [--dry-run]');
      process.exitCode = cmd ? 1 : 0;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
