// Hook chặn lệnh nguy hiểm của workflow multi-agent. Một file dùng cho mọi công cụ AI có hook trước khi chạy lệnh:
//   - Claude Code: PreToolUse, công cụ Bash | PowerShell (đăng ký trong .claude/settings.json hoặc plugin);
//   - Gemini CLI: BeforeTool, công cụ run_shell_command (đăng ký trong extension);
//   - Antigravity: PreToolUse, công cụ run_command (đăng ký trong plugin; hook chạy ở thư mục plugin, nên thư
//     mục dự án lấy từ args.Cwd hoặc workspacePaths của đầu vào).
// Công cụ nào không có hook thì vẫn còn hook pre-push của git và luật trong AGENTS.md.
//
// 1. Thư mục gốc: chặn agent đổi trạng thái git ở THƯ MỤC GỐC dự án (dòng đầu của `git worktree list`): thư mục
//    gốc là của chủ dự án, và nhiều phiên Master dùng chung nó. Đổi nhánh ở đó là đổi code dưới chân mọi người
//    (file đang sửa dở, dev server của chủ dự án, hook đọc nhánh của thư mục gốc). Mọi việc code làm trong worktree.
//    Bị chặn khi nhắm vào thư mục gốc: switch, checkout, restore, reset, rebase, merge, pull, stash (trừ list, show),
//    cherry-pick, revert, am, clean.
//    Cho qua:
//      - `git switch <nhánh chính>` / `git checkout <nhánh chính>`: đưa thư mục gốc về lại nhánh chính;
//      - `git rebase --abort`, `git merge --abort`, `git cherry-pick --abort`: thoát khỏi việc đang dở;
//      - lệnh có WORKFLOW_ROOT_OK=1: chỉ dùng cho việc master.md cho phép làm ở thư mục gốc (gộp ở máy khi
//        DELIVERY=merge, không có Master khác đang mở), hay khi chủ dự án bảo rõ trong phiên chat.
// 2. Mọi nơi (WORKFLOW_ROOT_OK không mở được): `--no-verify`, `git commit -n`, và push đè (`--force`, `-f`,
//    `--force-with-lease`, `+<nhánh>`). Trước đây chỉ có danh sách `deny` của Claude chặn; nay công cụ nào có hook
//    cũng bị chặn.
//
// Thư mục mà lệnh git chạy trong đó: `git -C <thư mục> …`, `cd <thư mục> && … git …`, thư mục công cụ ghi kèm
// lệnh (Gemini: dir_path, Antigravity: Cwd), còn lại là cwd của phiên.
// Không phải repo git, dự án chưa có workflow/project.conf (hook nạp qua plugin chạy ở mọi dự án), lỗi đọc: cho qua.
// Hook này là hàng rào, không phải bộ phân xử.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const isWin = process.platform === 'win32';
// /f/Project/x (Git Bash) → f:/Project/x
const toNative = p => (isWin && /^\/[a-zA-Z](\/|$)/.test(p) ? p[1] + ':' + (p.slice(2) || '/') : p);
const unquote = s => s.replace(/^(['"])(.*)\1$/, '$2');
// Đường dẫn chuẩn để so: thật (bỏ symlink, tên ngắn 8.3 kiểu PHAMNG~1 của Windows), dấu /, không / cuối.
const real = p => { try { return fs.realpathSync.native(p); } catch { return p; } };
const norm = p => { const r = real(path.resolve(p)).replace(/\\/g, '/').replace(/\/+$/, ''); return isWin ? r.toLowerCase() : r; };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const tokens = s => (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map(unquote);

const ROOT_BAD = new Set(['switch', 'checkout', 'restore', 'reset', 'rebase', 'merge', 'pull', 'stash', 'cherry-pick', 'revert', 'am', 'clean']);

// Đầu vào hook của từng công cụ → { tool, command, cwd }, hoặc null nếu không phải lệnh shell.
function parseInput(input) {
  if (!input || typeof input !== 'object') return null;
  // Antigravity: {toolCall: {name: 'run_command', args: {CommandLine, Cwd}}, workspacePaths: [...]}
  if (input.toolCall && typeof input.toolCall === 'object') {
    const tc = input.toolCall, a = tc.args || {};
    if (tc.name !== 'run_command') return null;
    const cmd = [a.CommandLine, a.commandLine, a.command].find(x => typeof x === 'string' && x) || '';
    if (!cmd) return null;
    const ws = Array.isArray(input.workspacePaths) && input.workspacePaths[0];
    const cwd = [a.Cwd, a.cwd].find(x => typeof x === 'string' && x) || ws || process.cwd();
    return { tool: 'antigravity', command: cmd, cwd: path.resolve(toNative(cwd)) };
  }
  const ti = input.tool_input || {};
  const command = typeof ti.command === 'string' ? ti.command : '';
  if (!command) return null;
  const base = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.env.GEMINI_PROJECT_DIR || process.cwd();
  if (input.tool_name === 'run_shell_command') {
    return { tool: 'gemini', command, cwd: ti.dir_path ? path.resolve(base, toNative(ti.dir_path)) : base };
  }
  if (input.tool_name === 'Bash' || input.tool_name === 'PowerShell') return { tool: 'claude', command, cwd: base };
  return null;
}

// Tách lệnh thành từng đoạn theo && || ; | xuống dòng, theo dõi `cd` để biết thư mục của các đoạn sau.
// Trả về các lệnh git: [{ sub, args, dir }].
function gitSegments(command, sessionCwd) {
  const out = [];
  let cwd = sessionCwd;
  for (const raw of command.split(/&&|\|\||;|\||\n/)) {
    const seg = raw.trim();
    if (!seg) continue;
    const t = tokens(seg);
    // cd / Set-Location / Push-Location <thư mục>
    if (/^(cd|set-location|sl|push-location|pushd|chdir)$/i.test(t[0] || '') && t[1]) { cwd = path.resolve(cwd, toNative(t[1])); continue; }
    const gi = t.findIndex(x => x === 'git' || /[\\/]git(\.exe)?$/i.test(x));
    if (gi < 0) continue;
    // Bỏ các tuỳ chọn chung trước subcommand: -C <thư mục>, -c <k=v>, --git-dir=…, --no-pager…
    let dir = cwd, i = gi + 1;
    while (i < t.length && t[i].startsWith('-')) {
      if (t[i] === '-C' && t[i + 1]) { dir = path.resolve(dir, toNative(t[i + 1])); i += 2; continue; }
      if (t[i] === '-c' && t[i + 1]) { i += 2; continue; }
      i++;
    }
    out.push({ sub: t[i], args: t.slice(i + 1), dir });
  }
  return out;
}

const shortFlags = a => /^-[a-zA-Z]+$/.test(a); // -f, -nm… (không tính --tuỳ-chọn-dài)

function checkEverywhere(segs) {
  for (const { sub, args } of segs) {
    if (args.includes('--no-verify') || (sub === 'commit' && args.some(a => shortFlags(a) && a.includes('n')))) {
      return 'Không dùng "--no-verify" (hay "git commit -n"): hook của git là hàng rào của dự án (AGENTS.md). Hook báo lỗi thì sửa nguyên nhân, không được thì dừng và báo chủ dự án.';
    }
    if (sub === 'push' && args.some(a => a === '--force' || a.startsWith('--force-with-lease') || a === '--force-if-includes' || (shortFlags(a) && a.includes('f')) || a.startsWith('+'))) {
      return 'Không push đè (--force, -f, --force-with-lease, +<nhánh>): viết lại lịch sử trên remote là việc của chủ dự án. Dừng và báo chủ dự án.';
    }
  }
  return null;
}

// Thư mục gốc dự án (dòng đầu của `git worktree list`) và nội dung workflow/project.conf ở đó.
// Không phải repo git, hay dự án chưa cài workflow (hook nạp qua plugin chạy ở mọi dự án): null.
function findProject(cwd) {
  let root;
  try {
    const first = git(cwd, 'worktree', 'list', '--porcelain').split(/\r?\n/)[0] || '';
    root = first.replace(/^worktree /, '');
  } catch { return null; }
  if (!root) return null;
  let conf;
  try { conf = fs.readFileSync(path.join(toNative(root), 'workflow', 'project.conf'), 'utf8'); } catch { return null; }
  const m = conf.match(/^BASE_BRANCH=([^\r\n]*)/m);
  return { root, base: m ? m[1].replace(/["' ]/g, '') : '' };
}

function checkRoot(segs, { root, base }) {
  const rootN = norm(toNative(root));
  for (const { sub, args, dir } of segs) {
    if (!ROOT_BAD.has(sub)) continue;
    // Ngoại lệ an toàn
    if ((sub === 'switch' || sub === 'checkout') && base && args.length === 1 && args[0] === base) continue;
    if (['rebase', 'merge', 'cherry-pick', 'revert', 'am'].includes(sub) && args.some(a => a === '--abort' || a === '--quit')) continue;
    if (sub === 'stash' && ['list', 'show'].includes(args[0])) continue;
    // Lệnh này có nhắm vào thư mục gốc không? (thư mục con của gốc cũng tính, nhưng worktree nằm ngoài gốc)
    const d = norm(dir);
    if (d !== rootN && !d.startsWith(rootN + '/')) continue;
    let dirIsOtherWorktree = false;
    try { dirIsOtherWorktree = norm(toNative(git(dir, 'rev-parse', '--show-toplevel'))) !== rootN; } catch {}
    if (dirIsOtherWorktree) continue;
    return `Không chạy "git ${sub}" ở thư mục gốc dự án (${root}): thư mục gốc là của chủ dự án và nhiều phiên Master dùng chung. ` +
      'Làm trong worktree riêng: git worktree add ../<dự-án>-wt/<tên> -b <nhánh> origin/<nhánh chính>, rồi git -C <worktree> … ' +
      (base ? `Đưa thư mục gốc về lại nhánh chính thì được: git switch ${base}. ` : '') +
      'Việc workflow/roles/master.md cho phép làm ở thư mục gốc (gộp ở máy khi DELIVERY=merge), hay chủ dự án bảo rõ trong phiên chat: thêm WORKFLOW_ROOT_OK=1 vào đầu lệnh.';
  }
  return null;
}

// Quyết định cho một lệnh: null (cho qua) hoặc lý do chặn (chuỗi).
function decide({ command, cwd }) {
  if (!/\bgit\b/.test(command)) return null;
  const project = findProject(cwd);
  if (!project) return null;
  const segs = gitSegments(command, cwd);
  const everywhere = checkEverywhere(segs);
  if (everywhere) return everywhere;
  if (/\bWORKFLOW_ROOT_OK\s*=\s*['"]?1/.test(command)) return null;
  return checkRoot(segs, project);
}

// Đầu ra "chặn" theo giao thức của từng công cụ.
function denyOutput(tool, reason) {
  if (tool === 'gemini' || tool === 'antigravity') return { decision: 'deny', reason };
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}

function main() {
  let input;
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
  const req = parseInput(input);
  if (!req) process.exit(0);
  let reason = null;
  try { reason = decide(req); } catch { reason = null; }
  if (reason) process.stdout.write(JSON.stringify(denyOutput(req.tool, reason)));
  // Antigravity đòi hook luôn in JSON; {} là không quyết gì, để luồng duyệt thường của công cụ chạy tiếp.
  else if (req.tool === 'antigravity') process.stdout.write('{}');
  process.exit(0);
}

module.exports = { parseInput, decide, denyOutput };
if (require.main === module) main();
