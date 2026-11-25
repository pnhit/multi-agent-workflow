// Hook chặn lệnh git (starter-kit/workflow/hooks/guard-root.cjs): đầu vào Claude và Gemini, luật thư mục gốc,
// luật mọi nơi, không làm gì ở dự án chưa cài workflow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GUARD = path.join(REPO, 'starter-kit', 'workflow', 'hooks', 'guard-root.cjs');
const { parseInput, decide, denyOutput } = createRequire(import.meta.url)(GUARD);

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

// Dự án tạm: repo git có một commit, workflow/project.conf (BASE_BRANCH=main), một worktree ../p-wt/a.
function makeProject({ workflow = true } = {}) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  const root = path.join(top, 'p');
  fs.mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  if (workflow) {
    fs.mkdirSync(path.join(root, 'workflow'));
    fs.writeFileSync(path.join(root, 'workflow', 'project.conf'), 'BASE_BRANCH=main\nDELIVERY=merge\n');
  } else fs.writeFileSync(path.join(root, 'a.txt'), 'a');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  const wt = path.join(top, 'p-wt', 'a');
  git(root, 'worktree', 'add', '-q', wt, '-b', 'feat/a');
  return { top, root, wt };
}

test('parseInput: nhận đầu vào Claude (Bash, PowerShell) và Gemini (run_shell_command, dir_path)', () => {
  assert.deepEqual(parseInput({ tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: '/x' }), { tool: 'claude', command: 'git status', cwd: '/x' });
  assert.equal(parseInput({ tool_name: 'PowerShell', tool_input: { command: 'git status' }, cwd: '/x' }).tool, 'claude');
  const g = parseInput({ hook_event_name: 'BeforeTool', tool_name: 'run_shell_command', tool_input: { command: 'git status', dir_path: 'sub' }, cwd: path.resolve('/x') });
  assert.equal(g.tool, 'gemini');
  assert.equal(g.cwd, path.resolve('/x', 'sub'));
  assert.equal(parseInput({ tool_name: 'Read', tool_input: { file_path: 'a' } }), null);
  assert.equal(parseInput({ tool_name: 'write_file', tool_input: { content: 'x' }, hook_event_name: 'BeforeTool' }), null);
  assert.equal(parseInput(null), null);
  // Antigravity: toolCall.args.CommandLine, Cwd; thiếu Cwd thì lấy workspacePaths[0]
  const a = parseInput({ toolCall: { name: 'run_command', args: { CommandLine: 'git status', Cwd: path.resolve('/w/p') } }, workspacePaths: [path.resolve('/w')] });
  assert.deepEqual(a, { tool: 'antigravity', command: 'git status', cwd: path.resolve('/w/p') });
  assert.equal(parseInput({ toolCall: { name: 'run_command', args: { CommandLine: 'ls' } }, workspacePaths: [path.resolve('/w')] }).cwd, path.resolve('/w'));
  assert.equal(parseInput({ toolCall: { name: 'edit_file', args: { path: 'a' } } }), null);
  assert.equal(parseInput({ toolCall: { name: 'run_command', args: {} } }), null);
});

test('denyOutput: đúng giao thức từng công cụ', () => {
  assert.deepEqual(denyOutput('gemini', 'r'), { decision: 'deny', reason: 'r' });
  assert.deepEqual(denyOutput('antigravity', 'r'), { decision: 'deny', reason: 'r' });
  const c = denyOutput('claude', 'r').hookSpecificOutput;
  assert.equal(c.hookEventName, 'PreToolUse');
  assert.equal(c.permissionDecision, 'deny');
  assert.equal(c.permissionDecisionReason, 'r');
});

test('thư mục gốc: chặn đổi nhánh, cho qua ngoại lệ và lệnh trong worktree', () => {
  const { top, root, wt } = makeProject();
  try {
    const d = command => decide({ command, cwd: root });
    assert.match(d('git switch feat/a'), /thư mục gốc/);
    assert.match(d('git stash'), /git stash/);
    assert.match(d(`cd "${root}" && git rebase main`), /git rebase/);
    assert.match(decide({ command: `git -C "${root}" reset --hard`, cwd: wt }), /git reset/);
    assert.equal(d('git switch main'), null);
    assert.equal(d('git merge --abort'), null);
    assert.equal(d('git stash list'), null);
    assert.equal(d('git status && git log -1'), null);
    assert.equal(d('WORKFLOW_ROOT_OK=1 git merge --no-ff feat/a'), null);
    assert.equal(d(`git -C "${wt}" switch -c feat/b`), null);
    assert.equal(decide({ command: 'git rebase main', cwd: wt }), null);
    assert.equal(d('ls -la'), null);
  } finally { fs.rmSync(top, { recursive: true, force: true }); }
});

test('mọi nơi: chặn --no-verify, commit -n, push đè; WORKFLOW_ROOT_OK không mở được', () => {
  const { top, root, wt } = makeProject();
  try {
    for (const cwd of [root, wt]) {
      const d = command => decide({ command, cwd });
      assert.match(d('git commit --no-verify -m x'), /no-verify/);
      assert.match(d('git commit -nm x'), /no-verify/);
      assert.match(d('git push --no-verify origin feat/a'), /no-verify/);
      assert.match(d('git push -f origin feat/a'), /push đè/);
      assert.match(d('git push --force-with-lease origin feat/a'), /push đè/);
      assert.match(d('git push origin +feat/a'), /push đè/);
      assert.match(d('WORKFLOW_ROOT_OK=1 git push --force'), /push đè/);
      assert.equal(d('git push -u origin feat/a'), null);
      assert.equal(d('git commit -am "fix -n flag"'), null);
    }
  } finally { fs.rmSync(top, { recursive: true, force: true }); }
});

test('dự án chưa cài workflow: không chặn gì (hook của plugin chạy ở mọi dự án)', () => {
  const { top, root } = makeProject({ workflow: false });
  try {
    assert.equal(decide({ command: 'git switch feat/a', cwd: root }), null);
    assert.equal(decide({ command: 'git push --force', cwd: root }), null);
  } finally { fs.rmSync(top, { recursive: true, force: true }); }
  assert.equal(decide({ command: 'git switch x', cwd: os.tmpdir() }), null);
});

test('chạy như hook: Gemini nhận {decision: deny}, Claude nhận hookSpecificOutput, lệnh hợp lệ không in gì', () => {
  const { top, root } = makeProject();
  try {
    const run = input => execFileSync(process.execPath, [GUARD], { input: JSON.stringify(input), encoding: 'utf8' });
    const g = JSON.parse(run({ hook_event_name: 'BeforeTool', tool_name: 'run_shell_command', tool_input: { command: 'git checkout feat/a' }, cwd: root }));
    assert.equal(g.decision, 'deny');
    const c = JSON.parse(run({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git checkout feat/a' }, cwd: root }));
    assert.equal(c.hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: root }), '');
    assert.equal(execFileSync(process.execPath, [GUARD], { input: 'không phải json', encoding: 'utf8' }), '');
    // Antigravity: hook chạy ở thư mục plugin (cwd khác dự án), luôn in JSON
    const runAg = input => execFileSync(process.execPath, [GUARD], { input: JSON.stringify(input), encoding: 'utf8', cwd: os.tmpdir() });
    const ag = JSON.parse(runAg({ toolCall: { name: 'run_command', args: { CommandLine: 'git checkout feat/a', Cwd: root } }, workspacePaths: [root] }));
    assert.equal(ag.decision, 'deny');
    assert.match(ag.reason, /thư mục gốc/);
    assert.deepEqual(JSON.parse(runAg({ toolCall: { name: 'run_command', args: { CommandLine: 'git status' } }, workspacePaths: [root] })), {});
  } finally { fs.rmSync(top, { recursive: true, force: true }); }
});
