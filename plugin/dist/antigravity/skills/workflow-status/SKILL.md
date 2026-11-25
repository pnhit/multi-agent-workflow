---
name: workflow-status
description: "Xem trạng thái workflow của dự án (việc đang chờ, bất thường, bản đã cài)"
disable-model-invocation: true
---

`<WORKFLOW_PLUGIN_DIR>` là đường dẫn ở dòng `WORKFLOW_PLUGIN_DIR=` trong ngữ cảnh đầu phiên.

Báo trạng thái workflow multi-agent của dự án đang mở. Chỉ đọc, không sửa gì.

1. Chạy `node "<WORKFLOW_PLUGIN_DIR>/scripts/kit.mjs" status` (bản đã cài, file lệch bản của plugin).
2. Chạy `sh workflow/watch.sh --lint` (bất thường) và đọc `workflow/STATUS.md` nếu có.
3. Tóm tắt cho chủ dự án, dưới 15 dòng: việc nào đang chờ ai (nhất là chờ chủ dự án), bất thường cần xử lý, file nào lệch bản. Không tự xử lý.
