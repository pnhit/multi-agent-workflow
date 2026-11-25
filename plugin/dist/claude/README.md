# Plugin workflow multi-agent

Một nguồn, dựng ra plugin cho nhiều công cụ AI. Claude Code là bản đầy đủ nhất.

**Lúc chạy, file trong dự án là chuẩn**: `AGENTS.md`, `workflow/roles/`, `watch.sh`, hook git. AI nào đọc được file và chạy được lệnh đều làm việc được, có plugin hay không. Plugin chỉ thêm phần tiện: cài, cập nhật bộ khởi đầu, nhắc khi lệch bản, chặn lệnh git nguy hiểm, lệnh `/workflow:*`.

| Lệnh | Việc |
|---|---|
| `/workflow:init` | Chép bộ khởi đầu vào dự án. File đã có thì giữ nguyên, chỉ báo để gộp tay |
| `/workflow:upgrade` | Cập nhật vai, script, hook, subagent lên bản của plugin (bản cũ lưu ở `workflow/.upgrade-backup/`). `agents.txt`, `project.conf` không đụng tới; `AGENTS.md`, `CLAUDE.md`… chỉ báo cần gộp |
| `/workflow:status` | Bản đã cài, file lệch, `watch.sh --lint`, `STATUS.md` |
| `/workflow:master <ID>` | Nhận vai Master (công cụ không tự nạp vai, hay phiên Master song song) |
| `/workflow:pending` | Xử lý việc đang chờ |

Không có plugin vẫn chạy tay được: `node <plugin>/scripts/kit.mjs init|upgrade|status`.

## Từng công cụ

| | Claude Code | Gemini CLI | Antigravity |
|---|---|---|---|
| Cài | `/plugin marketplace add <repo>` rồi `/plugin install workflow@multi-agent-workflow` | `gemini extensions install <thư mục plugin/dist/gemini>` | Nhập extension Gemini (hay plugin Claude) theo tài liệu Antigravity |
| Lệnh `/workflow:*` | Có | Có (đường dẫn plugin lấy từ ngữ cảnh đầu phiên) | Theo khả năng nhập |
| Chặn lệnh git nguy hiểm | Hook trong `.claude/settings.json` của dự án (bộ khởi đầu cài) | Hook của extension (`BeforeTool`) | Theo khả năng nhập |
| Nhắc lệch bản đầu phiên | Có | Có | Theo khả năng nhập |
| Mọi công cụ | Hook `pre-push` của git, luật trong `AGENTS.md` | | |

Hook chặn (`starter-kit/workflow/hooks/guard-root.cjs`) là một file cho mọi công cụ: tự nhận đầu vào của Claude hay Gemini. Nó không làm gì ở dự án chưa có `workflow/project.conf`.

## Sửa plugin

Sửa nguồn, đừng sửa `plugin/dist/`:
- `starter-kit/`: bộ khởi đầu (vai, script, hook);
- `plugin/commands/*.md`: lệnh, dùng `{{PLUGIN_DIR}}` (đường dẫn plugin) và `{{ARGS}}` (tham số);
- `plugin/scripts/kit.mjs`: cài, cập nhật;
- `plugin/VERSION`: tăng bản khi bộ khởi đầu đổi, để dự án được nhắc cập nhật.

Rồi chạy `node plugin/build.mjs`. Test (`node --test`) báo lỗi khi `plugin/dist/` lệch nguồn.
