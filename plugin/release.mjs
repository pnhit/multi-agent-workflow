#!/usr/bin/env node
// Phát hành một bản plugin, CHỈ Ở MÁY. Không push: in lệnh để chủ dự án tự chạy.
//
//   node plugin/release.mjs [-m "<ghi chú>"] [--dry-run] [--allow-branch]
//
// Bản lấy từ plugin/VERSION (tăng trước khi phát hành). Script:
//   1. kiểm: cây làm việc sạch, đang ở nhánh main (--allow-branch để bỏ qua), plugin/dist/ khớp nguồn,
//      `node --test` xanh, chưa có tag v<bản> và gemini-v<bản>;
//   2. tạo tag có chú thích v<bản> trên HEAD: Claude Code cài theo tag này
//        /plugin marketplace add <chủ>/<repo>#v<bản>
//   3. dựng một commit chỉ chứa plugin/dist/gemini (git commit-tree, không đổi cấu trúc repo), nối vào nhánh
//      gemini-extension, gắn tag NHẸ gemini-v<bản> (tag có chú thích trỏ vào commit này bị GitHub trả lỗi 500 khi
//      push, lần phát hành 0.3.0). Gemini CLI lấy GỐC của commit làm extension, nên cần commit này:
//        gemini extensions install <url repo> --ref gemini-v<bản>                       (ghim bản)
//        gemini extensions install <url repo> --ref gemini-extension --auto-update      (luôn lấy bản mới)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(PLUGIN);
export const GEMINI_BRANCH = 'gemini-extension';
const GEMINI_DIST = 'plugin/dist/gemini';

const git = (repo, ...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gitOk = (repo, ...args) => { try { return git(repo, ...args); } catch { return null; } };

// Các ref sẽ tạo cho một bản.
export function plan(repo, version) {
  const tag = `v${version}`, geminiTag = `gemini-v${version}`;
  const problems = [];
  if (gitOk(repo, 'rev-parse', '-q', '--verify', `refs/tags/${tag}`)) problems.push(`Tag ${tag} đã có. Tăng plugin/VERSION trước khi phát hành.`);
  if (gitOk(repo, 'rev-parse', '-q', '--verify', `refs/tags/${geminiTag}`)) problems.push(`Tag ${geminiTag} đã có.`);
  const tree = gitOk(repo, 'rev-parse', `HEAD:${GEMINI_DIST}`);
  if (!tree) problems.push(`HEAD không có ${GEMINI_DIST}. Chạy node plugin/build.mjs rồi commit.`);
  // Nối tiếp nhánh gemini-extension ở máy; chưa có thì nối tiếp bản trên origin (máy mới clone).
  const local = gitOk(repo, 'rev-parse', '-q', '--verify', `refs/heads/${GEMINI_BRANCH}`);
  const parent = local || gitOk(repo, 'rev-parse', '-q', '--verify', `refs/remotes/origin/${GEMINI_BRANCH}`);
  const head = git(repo, 'rev-parse', 'HEAD');
  return { tag, geminiTag, tree, parent, local, head, problems };
}

// Tạo tag v<bản>, commit + nhánh + tag cho Gemini. Trả về các commit đã tạo.
export function release(repo, version, { message = '' } = {}) {
  const p = plan(repo, version);
  if (p.problems.length) throw new Error(p.problems.join('\n'));
  const note = message || `Plugin workflow ${version}`;
  git(repo, 'tag', '-a', p.tag, '-m', `${p.tag}: ${note}`, p.head);
  const msg = `Extension Gemini workflow ${version}\n\nDựng từ ${GEMINI_DIST} của commit ${p.head.slice(0, 12)} (tag ${p.tag}).\nĐừng sửa nhánh này bằng tay: chạy node plugin/release.mjs ở nhánh chính.`;
  const args = ['commit-tree', p.tree, '-m', msg];
  if (p.parent) args.splice(2, 0, '-p', p.parent);
  const geminiCommit = git(repo, ...args);
  git(repo, 'update-ref', `refs/heads/${GEMINI_BRANCH}`, geminiCommit, p.local || '');
  // Tag nhẹ: tag có chú thích trỏ vào commit gốc này bị GitHub trả lỗi 500 khi push (lần phát hành 0.3.0).
  git(repo, 'tag', p.geminiTag, geminiCommit);
  return { ...p, geminiCommit };
}

function fail(msg) { console.error(msg); process.exit(1); }

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const mi = argv.indexOf('-m');
  const message = mi >= 0 ? argv[mi + 1] || '' : '';
  const version = fs.readFileSync(path.join(PLUGIN, 'VERSION'), 'utf8').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`plugin/VERSION không đúng dạng x.y.z: "${version}"`);

  const branch = gitOk(REPO, 'symbolic-ref', '--short', 'HEAD') || '(HEAD rời)';
  if (branch !== 'main' && !argv.includes('--allow-branch')) fail(`Đang ở nhánh ${branch}. Phát hành từ main (hoặc thêm --allow-branch nếu chắc chắn).`);
  const dirty = git(REPO, 'status', '--porcelain');
  if (dirty) fail(`Còn thay đổi chưa commit:\n${dirty}\nCommit hoặc cất đi trước khi phát hành.`);

  console.log('Kiểm plugin/dist/ khớp nguồn…');
  const check = spawnSync(process.execPath, [path.join(PLUGIN, 'build.mjs'), '--check'], { cwd: REPO, encoding: 'utf8' });
  if (check.status !== 0) fail(check.stdout + check.stderr);
  console.log('Chạy node --test…');
  const t = spawnSync(process.execPath, ['--test'], { cwd: REPO, encoding: 'utf8' });
  if (t.status !== 0) fail(`Test đỏ, không phát hành.\n${(t.stdout + t.stderr).split('\n').filter(l => /^not ok|^# (pass|fail)/.test(l)).join('\n')}`);

  const p = plan(REPO, version);
  if (p.problems.length) fail(p.problems.join('\n'));
  if (dryRun) {
    console.log(`[thử, không ghi] Sẽ tạo:\n  tag ${p.tag} → ${p.head.slice(0, 12)} (${branch})\n  commit mới cho nhánh ${GEMINI_BRANCH} (cây ${GEMINI_DIST}${p.parent ? `, nối sau ${p.parent.slice(0, 12)}` : ', commit đầu tiên'})\n  tag ${p.geminiTag} → commit đó`);
    return;
  }
  const r = release(REPO, version, { message });
  console.log(`Đã tạo ở máy: tag ${r.tag} (${r.head.slice(0, 12)}), nhánh ${GEMINI_BRANCH} và tag ${r.geminiTag} (${r.geminiCommit.slice(0, 12)}).`);
  console.log('\nChưa push. Chủ dự án tự chạy:');
  console.log(`  git push origin ${branch} ${r.tag} ${GEMINI_BRANCH} ${r.geminiTag}`);
  console.log('\nCài sau khi push:');
  console.log(`  Claude Code: /plugin marketplace add <chủ>/<repo>#${r.tag}   rồi   /plugin install workflow@multi-agent-workflow`);
  console.log(`  Gemini CLI:  gemini extensions install https://github.com/<chủ>/<repo> --ref ${r.geminiTag}`);
  console.log('\nGỡ nếu tạo nhầm (chưa push):');
  console.log(`  git tag -d ${r.tag} ${r.geminiTag} && git update-ref ${r.local ? `refs/heads/${GEMINI_BRANCH} ${r.local}` : `-d refs/heads/${GEMINI_BRANCH}`}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { fail(e.message); }
}
