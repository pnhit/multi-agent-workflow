---
description: Cập nhật file workflow của dự án lên bản của plugin (vai, script, hook, subagent)
argument-hint: "[--dry-run]"
---
Cập nhật workflow multi-agent của dự án đang mở lên bản của plugin.

1. Ở thư mục dự án, chạy: `node "${CLAUDE_PLUGIN_ROOT}/scripts/kit.mjs" upgrade $ARGUMENTS`
2. Báo chủ dự án: bản cũ → bản mới, file đã tạo, file đã cập nhật (bản cũ đã chép vào `workflow/.upgrade-backup/`).
3. File "cần gộp tay": với từng file, so bản của dự án với bản mới (`git diff --no-index <bản mới> <file của dự án>`), giữ phần riêng của dự án, đưa phần mới của workflow vào. Đưa chủ dự án xem đề xuất, **chỉ ghi khi chủ dự án đồng ý**.
4. Chạy `sh workflow/watch.sh --lint` và báo những gì nó tìm thấy. Nếu `watch.sh` đang chạy, nhắc chủ dự án chạy lại: `sh workflow/watch.sh --restart`.
5. Không commit, không push. Chủ dự án tự quyết.
