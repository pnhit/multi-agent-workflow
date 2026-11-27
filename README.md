# Plugin workflow multi-agent

Một nguồn, dựng ra plugin cho nhiều công cụ AI: Claude Code (bản đầy đủ nhất), Gemini CLI, Antigravity.

**Lúc chạy, file trong dự án là chuẩn**: `AGENTS.md`, `workflow/roles/`, `watch.sh`, hook git. AI nào đọc được file và chạy được lệnh đều làm việc được, có plugin hay không. Plugin chỉ thêm phần tiện: cài, cập nhật bộ khởi đầu, nhắc khi lệch bản, chặn lệnh git nguy hiểm, lệnh gõ tắt.

| Lệnh (Claude, Gemini) | Antigravity | Việc |
|---|---|---|
| `/workflow:init` | `/workflow-init` | Chép bộ khởi đầu vào dự án. File đã có thì giữ nguyên, chỉ báo để gộp tay |
| `/workflow:upgrade` | `/workflow-upgrade` | Cập nhật vai, script, hook, subagent lên bản của plugin (bản cũ lưu ở `workflow/.upgrade-backup/`). `agents.txt`, `project.conf` không đụng tới; `AGENTS.md`, `CLAUDE.md`… chỉ báo cần gộp |
| `/workflow:status` | `/workflow-status` | Bản đã cài, file lệch, `watch.sh --lint`, `STATUS.md` |
| `/workflow:master <ID>` | `/workflow-master <ID>` | Nhận vai Master (công cụ không tự nạp vai, hay phiên Master song song) |
| `/workflow:pending` | `/workflow-pending` | Xử lý việc đang chờ |

Không có plugin vẫn chạy tay được: `node <plugin>/scripts/kit.mjs init|upgrade|status`.

## Từng công cụ

| | Claude Code | Gemini CLI | Antigravity |
|---|---|---|---|
| Bản dựng | `plugin/dist/claude` | `plugin/dist/gemini` | `plugin/dist/antigravity` |
| Lệnh gõ tắt | `commands/*.md` | `commands/workflow/*.toml` | Skill `skills/workflow-*/SKILL.md` (Antigravity bỏ qua `commands/`) |
| Đường dẫn plugin trong lệnh | `${CLAUDE_PLUGIN_ROOT}` | Ngữ cảnh đầu phiên (`WORKFLOW_PLUGIN_DIR=`) | Ngữ cảnh đầu phiên (`WORKFLOW_PLUGIN_DIR=`) |
| Chặn lệnh git nguy hiểm | Hook trong `.claude/settings.json` của dự án (bộ khởi đầu cài) | Hook của extension (`BeforeTool`, `run_shell_command`) | Hook của plugin (`PreToolUse`, `run_command`) |
| Nhắc lệch bản đầu phiên | Có | Có | Có |
| Mọi công cụ | Hook `pre-push` của git, luật trong `AGENTS.md` | | |

Hook chặn (`starter-kit/workflow/hooks/guard-root.cjs`) là một file cho mọi công cụ: tự nhận đầu vào của Claude, Gemini hay Antigravity. Nó không làm gì ở dự án chưa có `workflow/project.conf`.

**Antigravity, phần chưa kiểm trên công cụ thật** (dựng theo tài liệu, chưa chạy thử): hook chạy với thư mục làm việc là thư mục plugin nên lệnh hook dùng đường dẫn tương đối (`node ./kit/…`); skill không có tham số chính thức, nên phần gõ sau tên lệnh (ví dụ `/workflow-master master-02`) được skill đọc như tham số.

## Cài

Thay `<chủ>/<repo>` bằng repo trên GitHub, `0.5.0` bằng bản muốn dùng.

**Claude Code** (trong phiên, hay `claude plugin …` ở dòng lệnh):
```
/plugin marketplace add <chủ>/<repo>#v0.5.0
/plugin install workflow@multi-agent-workflow
```
- Có `#v<bản>`: ghim bản đó. Lên bản mới thì gỡ marketplace rồi thêm lại với tag mới.
- Không có `#…`: theo nhánh chính, nhưng chỉ cập nhật khi `plugin/VERSION` đổi (plugin có ghi `version`), nên commit dở dang không tới tay người dùng.

**Gemini CLI**: extension phải nằm ở gốc của commit được cài, nên mỗi bản có một commit riêng trên nhánh `gemini-extension` (do `release.mjs` dựng):
```
gemini extensions install https://github.com/<chủ>/<repo> --ref gemini-v0.5.0
gemini extensions install https://github.com/<chủ>/<repo> --ref gemini-extension --auto-update
```
Dòng đầu ghim bản; dòng sau luôn lấy bản mới nhất. Thử bản chưa phát hành: `gemini extensions link <bản clone>/plugin/dist/gemini`.

**Antigravity**: tài liệu chưa có cách chọn tag hay thư mục con khi cài từ GitHub, nên cài từ một bản clone:
```
git clone --depth 1 --branch v0.5.0 https://github.com/<chủ>/<repo> workflow-plugin-src
agy plugin install workflow-plugin-src/plugin/dist/antigravity
```
Ứng dụng Antigravity (không dùng `agy`): chép thư mục `plugin/dist/antigravity` thành `~/.gemini/config/plugins/workflow` (mọi dự án) hoặc `<dự án>/.agents/plugins/workflow` (một dự án). Kiểm lại đường dẫn theo tài liệu của bản Antigravity đang dùng.

## Phát hành

1. Tăng `plugin/VERSION` (cùng số với tag phát hành của repo: `v0.3.0`, `v0.4.0`…), chạy `node plugin/build.mjs`, commit lên `main`.
2. `node plugin/release.mjs -m "<ghi chú ngắn>"` (thêm `--dry-run` để xem trước). Script kiểm cây làm việc sạch, đang ở `main`, `dist/` khớp nguồn, test xanh; rồi tạo **ở máy** tag `v<bản>`, commit mới trên nhánh `gemini-extension` và tag nhẹ `gemini-v<bản>`.
3. Script **không push**. Chủ dự án tự chạy lệnh nó in ra, dạng `git push origin main v0.5.0 gemini-extension gemini-v0.5.0`.

Nhánh `gemini-extension` chỉ do script ghi: đừng sửa tay, đừng gộp vào `main`. Antigravity cài từ tag `v<bản>` (bản clone), không cần nhánh riêng.

## Sửa plugin

Sửa nguồn, đừng sửa `plugin/dist/`:
- `starter-kit/`: bộ khởi đầu (vai, script, hook);
- `plugin/commands/*.md`: lệnh, dùng `{{PLUGIN_DIR}}` (đường dẫn plugin) và `{{ARGS}}` (tham số); `build.mjs` đổi thành lệnh Claude, lệnh Gemini và skill Antigravity;
- `plugin/scripts/kit.mjs`: cài, cập nhật, hook đầu phiên;
- `plugin/VERSION`: tăng bản khi bộ khởi đầu đổi, để dự án được nhắc cập nhật.

Rồi chạy `node plugin/build.mjs`. Test (`node --test`) báo lỗi khi `plugin/dist/` lệch nguồn.
