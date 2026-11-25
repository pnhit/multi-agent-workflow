// release.mjs: tag v<bản>, nhánh gemini-extension có gốc là plugin/dist/gemini, tag gemini-v<bản>, nối tiếp
// giữa các bản, từ chối bản đã phát hành. Chạy trên repo tạm, không đụng repo thật.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { plan, release, GEMINI_BRANCH } from '../release.mjs';

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function commitVersion(repo, version) {
  const ext = path.join(repo, 'plugin', 'dist', 'gemini');
  fs.mkdirSync(path.join(ext, 'commands', 'workflow'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'plugin', 'VERSION'), `${version}\n`);
  fs.writeFileSync(path.join(ext, 'gemini-extension.json'), JSON.stringify({ name: 'workflow', version }) + '\n');
  fs.writeFileSync(path.join(ext, 'commands', 'workflow', 'init.toml'), 'description = "x"\nprompt = "y"\n');
  fs.writeFileSync(path.join(repo, 'README.md'), `bản ${version}\n`);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', `bản ${version}`);
}

test('release: tag nhánh chính, nhánh Gemini có gốc là extension, các bản nối tiếp nhau', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'release-'));
  const env = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  try {
    git(repo, 'init', '-q', '-b', 'main');
    commitVersion(repo, '0.3.0');
    const r1 = release(repo, '0.3.0', { message: 'thử' });
    assert.equal(git(repo, 'rev-parse', 'v0.3.0^{commit}'), git(repo, 'rev-parse', 'HEAD'));
    assert.equal(git(repo, 'cat-file', '-t', 'v0.3.0'), 'tag');
    assert.match(git(repo, 'tag', '-n1', 'v0.3.0'), /v0\.3\.0: thử/);
    // Gốc của nhánh Gemini chính là extension
    assert.deepEqual(git(repo, 'ls-tree', '--name-only', GEMINI_BRANCH).split('\n').sort(), ['commands', 'gemini-extension.json']);
    assert.equal(git(repo, 'rev-parse', 'gemini-v0.3.0^{commit}'), r1.geminiCommit);
    assert.equal(git(repo, 'cat-file', '-t', 'gemini-v0.3.0'), 'commit'); // tag nhẹ (xem release.mjs)
    assert.equal(git(repo, 'rev-parse', `${GEMINI_BRANCH}`), r1.geminiCommit);
    assert.equal(git(repo, 'rev-list', '--count', GEMINI_BRANCH), '1');

    assert.match(plan(repo, '0.3.0').problems.join('\n'), /v0\.3\.0 đã có/);
    assert.throws(() => release(repo, '0.3.0'), /đã có/);

    commitVersion(repo, '0.4.0');
    const r2 = release(repo, '0.4.0');
    assert.equal(git(repo, 'rev-parse', `${GEMINI_BRANCH}^`), r1.geminiCommit);
    assert.match(git(repo, 'show', `${GEMINI_BRANCH}:gemini-extension.json`), /"0\.4\.0"/);
    assert.equal(git(repo, 'rev-parse', 'gemini-v0.4.0^{commit}'), r2.geminiCommit);
    // Nhánh chính không bị đổi
    assert.equal(git(repo, 'symbolic-ref', '--short', 'HEAD'), 'main');
    assert.equal(git(repo, 'status', '--porcelain'), '');
  } finally {
    for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('plan: báo thiếu plugin/dist/gemini', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'release-'));
  try {
    git(repo, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'a');
    assert.match(plan(repo, '1.0.0').problems.join('\n'), /plugin\/dist\/gemini/);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});
