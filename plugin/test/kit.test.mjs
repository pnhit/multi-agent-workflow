// kit.mjs (cài, cập nhật, kiểm bản) và build.mjs (plugin/dist/ khớp nguồn, đúng định dạng từng công cụ).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { init, upgrade, compare, cmpVersion, versionNotice, readProjectVersion, pluginVersion, kitDir, category } from '../scripts/kit.mjs';
import { build, diffDirs, readCommands } from '../build.mjs';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

test('cmpVersion và category', () => {
  assert.equal(cmpVersion('0.1.0', '0.1.0'), 0);
  assert.equal(cmpVersion('0.1.0', '0.2.0'), -1);
  assert.equal(cmpVersion('1.0.0', '0.9.9'), 1);
  assert.equal(cmpVersion('0.10.0', '0.9.0'), 1);
  assert.equal(category('workflow/agents.txt'), 'config');
  assert.equal(category('AGENTS.md'), 'merge');
  assert.equal(category('workflow/roles/master.md'), 'managed');
});

test('init: chép đủ bộ khởi đầu, ghi WORKFLOW_VERSION; chạy lại không ghi đè file đã sửa', () => {
  const root = tmp();
  try {
    assert.equal(readProjectVersion(root), null);
    const r = init(root);
    assert.ok(r.created.includes('workflow/roles/master.md'));
    assert.ok(r.created.includes('.claude/settings.json'));
    assert.equal(readProjectVersion(root), pluginVersion());
    assert.ok(compare(root).every(x => x.state !== 'missing'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Luật riêng của dự án\n');
    const again = init(root);
    assert.deepEqual(again.created, []);
    assert.ok(again.kept.includes('AGENTS.md'));
    assert.equal(read(root, 'AGENTS.md'), '# Luật riêng của dự án\n');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('init --dry-run không ghi gì', () => {
  const root = tmp();
  try {
    const r = init(root, { dryRun: true });
    assert.ok(r.created.length > 0);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('upgrade: cập nhật file workflow quản lý (lưu bản cũ), không đụng config, báo file cần gộp', () => {
  const root = tmp();
  try {
    init(root);
    const conf = path.join(root, 'workflow', 'project.conf');
    fs.writeFileSync(conf, read(conf).replace('BASE_BRANCH=main', 'BASE_BRANCH=develop').replace(/^WORKFLOW_VERSION=.*$/m, 'WORKFLOW_VERSION=0.0.1'));
    fs.writeFileSync(path.join(root, 'workflow', 'agents.txt'), 'master-01 master manual x\n');
    fs.writeFileSync(path.join(root, 'workflow', 'roles', 'coder.md'), 'bản cũ\n');
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'riêng\n');
    fs.rmSync(path.join(root, 'workflow', 'notify.sh'));

    assert.match(versionNotice(root), /0\.0\.1.*\/workflow:upgrade/);
    const r = upgrade(root, { now: new Date('2026-01-02T03:04:05Z') });
    assert.equal(r.from, '0.0.1');
    assert.deepEqual(r.updated, ['workflow/roles/coder.md']);
    assert.deepEqual(r.created, ['workflow/notify.sh']);
    assert.deepEqual(r.toMerge, ['CLAUDE.md']);
    assert.equal(read(root, 'workflow', 'roles', 'coder.md'), read(kitDir(), 'workflow', 'roles', 'coder.md'));
    assert.equal(read(root, 'workflow', '.upgrade-backup', '2026-01-02T03-04-05', 'workflow', 'roles', 'coder.md'), 'bản cũ\n');
    assert.equal(read(root, 'CLAUDE.md'), 'riêng\n');
    assert.equal(read(root, 'workflow', 'agents.txt'), 'master-01 master manual x\n');
    assert.match(read(conf), /^BASE_BRANCH=develop$/m);
    assert.equal(readProjectVersion(root), pluginVersion());
    assert.equal(versionNotice(root), '');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('upgrade từ chối dự án chưa cài', () => {
  const root = tmp();
  try { assert.throws(() => upgrade(root), /chưa cài workflow/); } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('session-start: Claude im lặng khi không có gì; Gemini luôn có WORKFLOW_PLUGIN_DIR', () => {
  const root = tmp();
  const kit = path.join(PLUGIN, 'scripts', 'kit.mjs');
  const run = tool => execFileSync(process.execPath, [kit, 'session-start', '--tool', tool], { cwd: root, encoding: 'utf8' });
  try {
    assert.equal(run('claude'), '');
    const g = JSON.parse(run('gemini'));
    assert.equal(g.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(g.hookSpecificOutput.additionalContext, /^WORKFLOW_PLUGIN_DIR=/);
    init(root);
    fs.writeFileSync(path.join(root, 'workflow', 'project.conf'), read(root, 'workflow', 'project.conf').replace(/^WORKFLOW_VERSION=.*$/m, 'WORKFLOW_VERSION=0.0.1'));
    assert.match(run('claude'), /\/workflow:upgrade/);
    assert.match(JSON.parse(run('gemini')).hookSpecificOutput.additionalContext, /\/workflow:upgrade/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('plugin/dist/ khớp nguồn (sửa nguồn thì chạy node plugin/build.mjs)', () => {
  const out = tmp();
  try {
    build(out);
    assert.deepEqual(diffDirs(out, path.join(PLUGIN, 'dist')), []);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('bản dựng: lệnh, hook, khai báo đúng định dạng từng công cụ', () => {
  const out = tmp();
  try {
    build(out);
    const names = readCommands().map(c => c.name);
    assert.deepEqual(names, ['init', 'master', 'pending', 'status', 'upgrade']);
    const claude = path.join(out, 'claude'), gemini = path.join(out, 'gemini');
    // Claude: không còn chỗ trống mẫu, đường dẫn plugin là ${CLAUDE_PLUGIN_ROOT}
    for (const n of names) {
      const s = read(claude, 'commands', `${n}.md`);
      assert.doesNotMatch(s, /\{\{(PLUGIN_DIR|ARGS)\}\}/);
      assert.match(s, /^---\ndescription: /);
    }
    assert.match(read(claude, 'commands', 'init.md'), /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/kit\.mjs" init \$ARGUMENTS/);
    assert.equal(JSON.parse(read(claude, '.claude-plugin', 'plugin.json')).version, pluginVersion());
    assert.ok(JSON.parse(read(claude, 'hooks', 'hooks.json')).hooks.SessionStart);
    // Gemini: lệnh TOML trong commands/workflow/ (thành /workflow:<tên>), {{args}}
    for (const n of names) {
      const s = read(gemini, 'commands', 'workflow', `${n}.toml`);
      assert.match(s, /^description = ".+"\nprompt = """\n/);
      assert.doesNotMatch(s, /\{\{(PLUGIN_DIR|ARGS)\}\}/);
    }
    assert.match(read(gemini, 'commands', 'workflow', 'pending.toml'), /\{\{args\}\}/);
    const gh = JSON.parse(read(gemini, 'hooks', 'hooks.json')).hooks;
    assert.equal(gh.BeforeTool[0].matcher, 'run_shell_command');
    assert.match(gh.BeforeTool[0].hooks[0].command, /\$\{extensionPath\}\/kit\/workflow\/hooks\/guard-root\.cjs/);
    assert.ok(fs.existsSync(path.join(gemini, 'kit', 'workflow', 'hooks', 'guard-root.cjs')));
    assert.equal(JSON.parse(read(gemini, 'gemini-extension.json')).version, pluginVersion());
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
