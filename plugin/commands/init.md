---
description: Cài workflow multi-agent vào dự án đang mở (chép bộ khởi đầu, không ghi đè file có sẵn)
argument-hint: "[--dry-run]"
---
Cài workflow multi-agent vào dự án đang mở.

1. Ở thư mục dự án, chạy: `node "{{PLUGIN_DIR}}/scripts/kit.mjs" init {{ARGS}}`
2. Báo chủ dự án ngắn gọn: file nào đã tạo, file nào đã có sẵn và được giữ nguyên.
3. File đã có sẵn mà khác bộ khởi đầu (thường gặp: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.gitattributes`, `.claude/settings.json`): **không ghi đè**. Đọc `{{PLUGIN_DIR}}/docs/SETUP.md`, mục "Dự án đã có", đề xuất cách gộp cho từng file (so với bản trong thư mục bộ khởi đầu mà script in ra), và chỉ ghi khi chủ dự án đồng ý.
4. Hướng dẫn các bước còn lại theo `{{PLUGIN_DIR}}/docs/SETUP.md`: điền `workflow/project.conf` (`BASE_BRANCH`, `DELIVERY`, `WORKFLOW_IN_GIT`; dự án của team thì làm theo mục "Dự án của team"), điền `workflow/agents.txt`, cài hook chặn push (`sh workflow/hooks/install.sh`), chạy `sh workflow/watch.sh`.
5. Không commit, không push. Chủ dự án tự quyết.
