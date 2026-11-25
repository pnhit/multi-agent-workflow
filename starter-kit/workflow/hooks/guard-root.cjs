// Hook PreToolUse (Bash | PowerShell) của Claude Code, do workflow multi-agent cài.
// Chặn agent đổi trạng thái git ở THƯ MỤC GỐC dự án (dòng đầu của `git worktree list`): thư mục gốc là của chủ
// dự án, và nhiều phiên Master dùng chung nó. Đổi nhánh ở đó là đổi code dưới chân mọi người (file đang sửa dở,
// dev server của chủ dự án, hook đọc nhánh của thư mục gốc). Mọi việc code làm trong worktree (`../<dự án>-wt/…`).
//
// Bị chặn khi nhắm vào thư mục gốc: switch, checkout, restore, reset, rebase, merge, pull, stash (trừ list, show),
// cherry-pick, revert, am, clean.
// Cho qua:
//   - `git switch <nhánh chính>` / `git checkout <nhánh chính>`: đưa thư mục gốc về lại nhánh chính;
//   - `git rebase --abort`, `git merge --abort`, `git cherry-pick --abort`: thoát khỏi việc đang dở;
//   - lệnh có WORKFLOW_ROOT_OK=1: chỉ dùng cho việc master.md cho phép làm ở thư mục gốc (gộp ở máy khi
//     DELIVERY=merge, không có Master khác đang mở), hay khi chủ dự án bảo rõ trong phiên chat.
// Thư mục mà lệnh git chạy trong đó: `git -C <thư mục> …`, `cd <thư mục> && … git …`, còn lại là cwd của phiên.
// Không chặn được gì (không phải repo git, lỗi đọc) thì cho qua: hook này là hàng rào, không phải bộ phân xử.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let input;
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
const command = input && input.tool_input && input.tool_input.command;
if (!['Bash', 'PowerShell'].includes(input.tool_name) || !command || !/\bgit\b/.test(command)) process.exit(0);
if (/\bWORKFLOW_ROOT_OK\s*=\s*['"]?1/.test(command)) process.exit(0);

const sessionCwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const isWin = process.platform === 'win32';
// /f/Project/x (Git Bash) → f:/Project/x
const toNative = p => (isWin && /^\/[a-zA-Z](\/|$)/.test(p) ? p[1] + ':' + (p.slice(2) || '/') : p);
const unquote = s => s.replace(/^(['"])(.*)\1$/, '$2');
const norm = p => { let r = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, ''); return isWin ? r.toLowerCase() : r; };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

let root;
try {
  const first = git(sessionCwd, 'worktree', 'list', '--porcelain').split(/\r?\n/)[0] || '';
  root = first.replace(/^worktree /, '');
} catch { process.exit(0); }
if (!root) process.exit(0);
const rootN = norm(toNative(root));

let base = '';
try {
  const conf = fs.readFileSync(path.join(toNative(root), 'workflow', 'project.conf'), 'utf8');
  const m = conf.match(/^BASE_BRANCH=([^\r\n]*)/m);
  if (m) base = m[1].replace(/["' ]/g, '');
} catch {}

// Tách lệnh thành từng đoạn theo && || ; | xuống dòng; theo dõi `cd` để biết thư mục của các đoạn sau
const segments = command.split(/&&|\|\||;|\||\n/);
let cwd = sessionCwd;
const BAD = new Set(['switch', 'checkout', 'restore', 'reset', 'rebase', 'merge', 'pull', 'stash', 'cherry-pick', 'revert', 'am', 'clean']);

function tokens(s) { return (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map(unquote); }

for (const raw of segments) {
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
  const sub = t[i];
  if (!BAD.has(sub)) continue;
  const args = t.slice(i + 1);
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

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `Không chạy "git ${sub}" ở thư mục gốc dự án (${root}): thư mục gốc là của chủ dự án và nhiều phiên Master dùng chung. ` +
        'Làm trong worktree riêng: git worktree add ../<dự-án>-wt/<tên> -b <nhánh> origin/<nhánh chính>, rồi git -C <worktree> … ' +
        (base ? `Đưa thư mục gốc về lại nhánh chính thì được: git switch ${base}. ` : '') +
        'Việc workflow/roles/master.md cho phép làm ở thư mục gốc (gộp ở máy khi DELIVERY=merge), hay chủ dự án bảo rõ trong phiên chat: thêm WORKFLOW_ROOT_OK=1 vào đầu lệnh.',
    },
  }));
  process.exit(0);
}
process.exit(0);
