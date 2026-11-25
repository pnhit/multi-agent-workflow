#!/usr/bin/env node
// Dựng plugin cho từng công cụ AI từ MỘT nguồn:
//   starter-kit/             bộ khởi đầu (file chép vào dự án): nguồn duy nhất của vai, script, hook
//   plugin/commands/*.md     lệnh /workflow:*, viết một lần, dùng {{PLUGIN_DIR}} và {{ARGS}}
//   plugin/scripts/kit.mjs   cài, cập nhật, kiểm bản; hook đầu phiên
//   plugin/VERSION           bản của plugin, ghi vào dự án khi cài (WORKFLOW_VERSION)
// Ra:
//   plugin/dist/claude/      plugin Claude Code (marketplace ở .claude-plugin/marketplace.json của repo)
//   plugin/dist/gemini/      extension Gemini CLI
//   plugin/dist/antigravity/ plugin Antigravity (lệnh thành skill /workflow-<tên>, hook PreToolUse run_command)
//
//   node plugin/build.mjs           dựng lại plugin/dist/
//   node plugin/build.mjs --check   chỉ kiểm plugin/dist/ có khớp nguồn không (mã 1 nếu lệch)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(PLUGIN);
const NAME = 'workflow';
const DESCRIPTION = 'Workflow multi-agent: Master, Coder, Tester phối hợp qua file trong workflow/. Cài, cập nhật bộ khởi đầu, chặn lệnh git nguy hiểm, lệnh /workflow:*.';
const DOCS = ['SETUP.md', 'HOW-IT-WORKS.md', 'EXAMPLE.md'];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const json = o => JSON.stringify(o, null, 2) + '\n';

// Lệnh nguồn: frontmatter đơn giản (khoá: giá trị) + thân.
export function readCommands() {
  const dir = path.join(PLUGIN, 'commands');
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => {
    const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
    const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) throw new Error(`commands/${f}: thiếu frontmatter`);
    const meta = {};
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([\w-]+):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
    }
    if (!meta.description) throw new Error(`commands/${f}: thiếu description`);
    return { name: f.replace(/\.md$/, ''), meta, body: m[2].trim() + '\n' };
  });
}

// Phần chung cho mọi công cụ: VERSION, scripts/, kit/, docs/.
function common(out) {
  write(path.join(out, 'VERSION'), fs.readFileSync(path.join(PLUGIN, 'VERSION'), 'utf8'));
  copyDir(path.join(PLUGIN, 'scripts'), path.join(out, 'scripts'));
  copyDir(path.join(REPO, 'starter-kit'), path.join(out, 'kit'));
  fs.mkdirSync(path.join(out, 'docs'), { recursive: true });
  for (const d of DOCS) fs.copyFileSync(path.join(REPO, d), path.join(out, 'docs', d));
  write(path.join(out, 'README.md'), fs.readFileSync(path.join(PLUGIN, 'README.md'), 'utf8'));
}

function buildClaude(out, version) {
  common(out);
  write(path.join(out, '.claude-plugin', 'plugin.json'), json({ name: NAME, version, description: DESCRIPTION }));
  for (const c of readCommands()) {
    const fm = ['---', `description: ${c.meta.description}`];
    if (c.meta['argument-hint']) fm.push(`argument-hint: "${c.meta['argument-hint']}"`);
    fm.push('---', '');
    const body = c.body.replaceAll('{{PLUGIN_DIR}}', '${CLAUDE_PLUGIN_ROOT}').replaceAll('{{ARGS}}', '$ARGUMENTS');
    write(path.join(out, 'commands', `${c.name}.md`), fm.join('\n') + body);
  }
  // Hook chặn lệnh git của Claude đăng ký ở .claude/settings.json của dự án (bộ khởi đầu cài), để dự án vẫn được
  // bảo vệ khi người trong team không cài plugin. Plugin chỉ thêm hook đầu phiên (nhắc cập nhật khi lệch bản).
  write(path.join(out, 'hooks', 'hooks.json'), json({
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/kit.mjs" session-start --tool claude', timeout: 10 }] }],
    },
  }));
}

const tomlString = s => '"""\n' + s.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"') + '"""';

function buildGemini(out, version) {
  common(out);
  write(path.join(out, 'gemini-extension.json'), json({ name: NAME, version, description: DESCRIPTION, contextFileName: 'WORKFLOW.md' }));
  write(path.join(out, 'WORKFLOW.md'), [
    '# Extension workflow multi-agent',
    '',
    'Extension này cài và cập nhật workflow multi-agent cho dự án (`/workflow:init`, `/workflow:upgrade`), xem trạng thái (`/workflow:status`), nhận vai Master (`/workflow:master <ID>`) và xử lý việc đang chờ (`/workflow:pending`).',
    'Luật làm việc nằm trong `AGENTS.md` và `workflow/roles/` của dự án, không nằm ở đây. Dự án chưa có `workflow/project.conf` thì extension không làm gì.',
    '',
  ].join('\n'));
  for (const c of readCommands()) {
    let body = c.body.replaceAll('{{PLUGIN_DIR}}', '<WORKFLOW_PLUGIN_DIR>').replaceAll('{{ARGS}}', '{{args}}');
    if (c.body.includes('{{PLUGIN_DIR}}')) body = '`<WORKFLOW_PLUGIN_DIR>` là đường dẫn ở dòng `WORKFLOW_PLUGIN_DIR=` trong ngữ cảnh đầu phiên.\n\n' + body;
    write(path.join(out, 'commands', NAME, `${c.name}.toml`), `description = ${JSON.stringify(c.meta.description)}\nprompt = ${tomlString(body)}\n`);
  }
  write(path.join(out, 'hooks', 'hooks.json'), json({
    hooks: {
      BeforeTool: [{ matcher: 'run_shell_command', hooks: [{ name: 'workflow-guard', type: 'command', command: 'node "${extensionPath}/kit/workflow/hooks/guard-root.cjs"', timeout: 10000, description: 'Chặn lệnh git nguy hiểm trong dự án có workflow' }] }],
      SessionStart: [{ hooks: [{ name: 'workflow-session', type: 'command', command: 'node "${extensionPath}/scripts/kit.mjs" session-start --tool gemini', timeout: 10000 }] }],
    },
  }));
}

// Antigravity: plugin.json ở gốc; lệnh slash là skill (skills/<tên>/SKILL.md, gọi bằng /<tên>), thư mục commands/
// bị bỏ qua; hook trong hooks.json ở gốc, chạy với cwd là thư mục plugin, nên đường dẫn trong lệnh hook là tương đối.
// Skill không có biến đường dẫn plugin và (theo tài liệu) không nhận tham số: đường dẫn lấy từ ngữ cảnh đầu phiên,
// tham số là phần chủ dự án gõ kèm lệnh.
function buildAntigravity(out, version) {
  common(out);
  write(path.join(out, 'plugin.json'), json({ name: NAME, displayName: 'Workflow multi-agent', description: DESCRIPTION, version }));
  for (const c of readCommands()) {
    const skill = `${NAME}-${c.name}`;
    let body = c.body.replaceAll('{{PLUGIN_DIR}}', '<WORKFLOW_PLUGIN_DIR>')
      .replaceAll('{{ARGS}}', c.meta['argument-hint'] ? `<phần chủ dự án gõ sau /${skill}, nếu có: ${c.meta['argument-hint']}>` : '');
    if (c.body.includes('{{PLUGIN_DIR}}')) body = '`<WORKFLOW_PLUGIN_DIR>` là đường dẫn ở dòng `WORKFLOW_PLUGIN_DIR=` trong ngữ cảnh đầu phiên.\n\n' + body;
    write(path.join(out, 'skills', skill, 'SKILL.md'),
      ['---', `name: ${skill}`, `description: ${JSON.stringify(c.meta.description)}`, 'disable-model-invocation: true', '---', '', body].join('\n'));
  }
  write(path.join(out, 'hooks.json'), json({
    [NAME]: {
      PreToolUse: [{ matcher: 'run_command', hooks: [{ type: 'command', command: 'node ./kit/workflow/hooks/guard-root.cjs', timeout: 10 }] }],
      SessionStart: [{ type: 'command', command: 'node ./scripts/kit.mjs session-start --tool antigravity', timeout: 10 }],
    },
  }));
}

export const TARGETS = ['claude', 'gemini', 'antigravity'];

export function build(outRoot) {
  const version = fs.readFileSync(path.join(PLUGIN, 'VERSION'), 'utf8').trim();
  fs.rmSync(outRoot, { recursive: true, force: true });
  buildClaude(path.join(outRoot, 'claude'), version);
  buildGemini(path.join(outRoot, 'gemini'), version);
  buildAntigravity(path.join(outRoot, 'antigravity'), version);
  return version;
}

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? listFiles(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join('/')]).sort();
}

// Các file lệch giữa hai thư mục (bỏ qua khác biệt CRLF/LF).
export function diffDirs(a, b) {
  const fa = listFiles(a), fb = listFiles(b), all = [...new Set([...fa, ...fb])].sort();
  const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  return all.filter(f => !fa.includes(f) || !fb.includes(f) || read(path.join(a, f)) !== read(path.join(b, f)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = path.join(PLUGIN, 'dist');
  if (process.argv.includes('--check')) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-plugin-'));
    build(tmp);
    const bad = diffDirs(tmp, dist);
    fs.rmSync(tmp, { recursive: true, force: true });
    if (bad.length) {
      console.error(`plugin/dist/ lệch nguồn (${bad.length} file), chạy: node plugin/build.mjs`);
      for (const f of bad.slice(0, 20)) console.error(`  ${f}`);
      process.exit(1);
    }
    console.log('plugin/dist/ khớp nguồn.');
  } else {
    const v = build(dist);
    console.log(`Đã dựng plugin ${NAME} ${v}: ${TARGETS.map(t => `plugin/dist/${t}`).join(', ')}`);
  }
}
