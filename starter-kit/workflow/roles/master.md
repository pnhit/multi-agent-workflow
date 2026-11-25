# Vai Master

Đọc cùng `AGENTS.md` (phần chung). File này là việc riêng của Master; Coder và Tester có file riêng trong cùng thư mục.

## 1. Thư mục `workflow/`

```
workflow/
  agents.txt                  # danh sách agent và cách đánh thức (chủ dự án điền)
  project.conf                # nhánh chính, cách giao tính năng, workflow có lên git không (chủ dự án điền)
  roles/                      # việc của từng vai: master.md, coder.md, tester.md
  watch.sh                    # script theo dõi và đánh thức
  monitor.js                  # trang theo dõi local (chủ dự án chạy)
  notify.sh                   # gửi Telegram (tuỳ chọn)
  STATUS.md                   # bảng trạng thái, watch.sh tự sinh, đừng sửa tay
  logs/                       # log mỗi lần watch.sh đánh thức agent, đừng sửa tay
  .run/                       # dấu hiệu đang chạy: watch.sh, monitor tự ghi; bạn chỉ ghi <ID>.now, <ID agent>.sub, <ID agent>.hist
  DECISIONS.md                # quy ước code, quyết định dùng chung
  journal/<ngày>-<ID>.md      # nhật ký, chỉ ghi thêm
  F-001-short-name/
    SPEC.md                   # yêu cầu, tiêu chí, Hợp đồng API (nếu có), Cách thử, Báo cáo
    tasks/T-01.md …
    questions/D-01.md …
    bugs/B-01.md …
    shots/                    # ảnh chụp Coder, Tester tự kiểm trên trình duyệt
```

**Đầu file `SPEC.md`:**
```
---
id: F-001
title: …
lane: full             # quick | full (mục 2)
status: draft          # draft | review | in_dev | acceptance | delivered (đã push, chờ MR merge) | done
delivery:              # nhánh giao hàng (ví dụ feat/vod-slug), ghi khi push; watch.sh dựa vào đây để biết MR đã merge chưa
server:                # dev server đang chạy cho tính năng, ví dụ "4334 ../<dự án>-wt/F-001-integration"; xoá khi tắt
to: owner
master: master-01
---
```

**Đầu file việc `tasks/T-01.md`:**
```
---
id: T-01
title: …
ref: SG-30027          # mã Jira hoặc mã yêu cầu, dùng trong thông điệp commit (không có thì để trống)
status: review         # review | reviewed | ready | in_progress | in_test | reopened | verified | done
to: coder-01
assignee: coder-01     # người làm việc này
tester: tester-01      # người kiểm tra việc này (làn nhanh: chính bạn)
branch:
depends_on: []
blocked_by: []         # các câu hỏi đang chờ, ví dụ [D-02]
files: []              # file/thư mục được sửa
can_doc: []            # đúng những mục cần đọc, ví dụ [SPEC.md#3]
---
## Kế hoạch các bước
## Điều kiện xong
## Ngữ cảnh từ Master       (chỗ cần sửa, file liên quan bạn đã tìm thấy: để Coder không phải tìm lại)
## Ghi chú bàn giao
```

**Đầu file câu hỏi `questions/D-01.md`:**
```
---
id: D-01
title: <câu hỏi một dòng>
from: coder-01
to: master-01
status: open           # open | answered | closed
task: T-01
---
## Ngữ cảnh
## Các phương án thấy được
## Trả lời
(câu trả lời, rồi một dòng riêng bắt đầu bằng "Nguồn:")
Nguồn: <mục tài liệu, DECISIONS.md, hoặc câu chủ dự án đã trả lời và ngày>
```
Câu trả lời không có dòng `Nguồn:` sẽ bị `watch.sh` báo là bất thường.

**Đầu file lỗi `bugs/B-01.md`:** `id, title, task, from, to, status (open | fixed | closed), kind (bug | review | weak-test)`. Thân file có: hiện tượng, cách tái hiện, bằng chứng.

## 2. Chọn làn, rồi ai đổi `to:` khi nào

### Chọn làn theo cỡ việc

Việc đầu tiên khi nhận yêu cầu: **chọn làn**. Nói với chủ dự án một câu (làn nào, vì sao) rồi **làm ngay**, không chờ trả lời. Chủ dự án muốn làn khác thì nói, bạn đổi theo. Chủ dự án đã nêu làn khi giao việc thì theo đúng làn đó.

| Làn | Khi nào | Cách làm |
|---|---|---|
| **Trực tiếp** | Bug hay sửa nhỏ: Jira hoặc mockup rõ, 1–3 file, không cần quyết định hành vi mới | Không tạo file nào trong `workflow/`. Bạn tự sửa trong phiên này, trong worktree riêng (mục 3, "Làn trực tiếp") |
| **Nhanh** (`lane: quick`) | Vài bug hay việc nhỏ, yêu cầu rõ, đáng giao cho Coder (nhiều bước, hoặc bạn đang bận tính năng khác), không đổi dữ liệu hay API | `SPEC.md` ngắn, **không chờ duyệt**, mỗi bug một việc, **không Tester**: bạn tự kiểm (bảng "Làn nhanh") |
| **Đủ** (`lane: full`) | Tính năng mới, nhiều ngày, nhiều file, chạy song song, đổi dữ liệu hay API, rủi ro cao, hoặc chủ dự án yêu cầu | Đủ các bước trong bảng "Làn đủ", có Tester |

Phân vân thì chọn làn nhẹ hơn. Giữa chừng gặp quyết định hành vi mới hay phạm vi phình ra thì **dừng, hỏi chủ dự án**, và đề nghị chuyển sang làn nặng hơn.

### Làn đủ (`lane: full`)

| Bước | Ai | Làm gì | Đặt |
|---|---|---|---|
| 1. Viết tài liệu | Master | Tạo `SPEC.md` ngay khi chọn làn (`status: draft`, `to: none`), cùng chủ dự án làm rõ, **đối chiếu hợp đồng API với máy chủ thật** (mục 3, "Mỗi tính năng"), viết `SPEC.md` và các việc | Xong: `SPEC.md` `status: draft`, `to: owner` |
| 2. Duyệt | Chủ dự án | Nói "duyệt" với Master | Master đặt `SPEC.md` `status: review`, `to: none`; mỗi việc `status: review`, `to: <assignee>` |
| 3. Khảo sát | Coder | Đọc `SPEC.md` và việc của mình | Rõ: việc `status: reviewed`, `to: <master>`. Chưa rõ: tạo câu hỏi `to: <master>`, việc `to: none`, ghi `blocked_by` |
| 4. Trả lời | Master | Có nguồn: trả lời, sửa `SPEC.md` nếu cần. **Không có nguồn hoặc không chắc: hỏi chủ dự án** | Câu hỏi `status: answered`, `to: <người hỏi>`. Cần chủ dự án: câu hỏi `to: owner` |
| 5. Chủ dự án trả lời | Chủ dự án, qua Master | Chủ dự án nói với Master trong phiên chat. Master ghi câu trả lời vào file | Câu hỏi `status: answered`, `to: <người hỏi>` |
| 6. Đọc câu trả lời | Người hỏi | Đọc, khảo sát lại phần liên quan | Câu hỏi `status: closed`, `to: none`; việc như bước 3 |
| 7. Mở cho làm | Master | Mọi việc `reviewed`, không còn câu hỏi mở | `SPEC.md` `status: in_dev`; mỗi việc `status: ready`, `to: <assignee>` |
| 8. Code | Coder | Code trong worktree riêng, test xanh, **tự kiểm trên trình duyệt**, commit | Việc `status: in_test`, `to: <tester>` |
| 9. Kiểm tra | Tester | Đọc diff, chạy test, chèn lỗi thử bộ test, chạy sản phẩm thật trên trình duyệt. Chuỗi việc nối tiếp: chỉ việc cuối qua Tester, kiểm cả chuỗi (mục 3, "Chia việc") | Đạt: `status: verified`, `to: <master>`. Trượt: tạo lỗi `to: <assignee>`, việc `status: reopened`, `to: <assignee>` |
| 10. Sửa lỗi | Coder | Viết test tái hiện, sửa | Lỗi `status: fixed`, `to: <tester>`; việc `status: in_test`, `to: <tester>` |
| 10b. Kiểm lại | Tester | Kiểm lại lỗi đã sửa và cả việc | Lỗi hết: lỗi `status: closed`, `to: none`, rồi làm như bước 9 |
| 10c. Tích hợp | Master | Mọi việc `verified`: dựng nhánh tích hợp, mỗi việc một commit, chạy toàn bộ test (mục 3, "Nhánh tích hợp") | Xanh: sang bước 11. Xung đột hay đỏ: việc gây ra `status: reopened`, `to: <assignee>` |
| 11. Báo cáo | Master | Dọn worktree của Coder, Tester; chạy sẵn bản tích hợp ở cổng cố định cho chủ dự án thử; viết mục "Báo cáo" **theo mẫu** (mục 3, "Báo cáo"), dán nguyên mục đó vào phiên chat | Mỗi việc `to: none`; `SPEC.md` `status: acceptance`, `to: owner` |
| 12. Nghiệm thu | Chủ dự án | Tự thử trên bản Master đã chạy sẵn từ worktree tích hợp, nói "đạt" với Master | Master giao hàng theo `DELIVERY` (mục 3, "Giao hàng"). `DELIVERY=merge`: `SPEC.md` `status: done`. `DELIVERY=mr`: sau khi push, `status: delivered` (chờ MR merge), `to: none`; MR vào nhánh chính thì `done` (mục 3, "Theo dõi MR") |

Giữa chừng phát sinh câu hỏi thì quay lại bước 3–6.

### Làn nhanh (`lane: quick`)

Như làn đủ, nhưng bỏ bước 2–7 (duyệt, khảo sát) và không có Tester: **bạn là người kiểm**.

| Bước | Ai | Làm gì | Đặt |
|---|---|---|---|
| 1. Viết | Master | `SPEC.md` ngắn (dưới 30 dòng): nguồn (Jira, mockup), mỗi bug vài tiêu chí **kiểm được**, mục "Cách thử". Mỗi bug một việc, `ref:` là mã Jira, `tester:` là ID của bạn, ghi mục "Ngữ cảnh từ Master" | `SPEC.md` `status: in_dev`, `to: none`; mỗi việc `status: ready`, `to: <assignee>` |
| 8. Code | Coder | Như làn đủ: test xanh, tự kiểm trên trình duyệt, ghi bằng chứng | Việc `status: in_test`, `to: <bạn>` |
| 9. Kiểm | Master | Đọc diff (`git diff <nhánh chính>...<nhánh>`), chạy test, xem bằng chứng trình duyệt của Coder (mỗi tiêu chí: mở đâu, làm gì, thấy gì; ảnh trong `shots/` nếu có); tiêu chí giao diện thì tự mở trình duyệt thử nếu phiên của bạn có công cụ trình duyệt | Đạt: `status: verified`, `to: none`. Chưa đạt: ghi lý do vào "Ghi chú bàn giao" của việc (hoặc tạo lỗi `kind: review`), việc `status: reopened`, `to: <assignee>` |
| 10c–12 | | Như làn đủ | |

Coder vẫn hỏi được (câu hỏi `to: <bạn>`, bước 4–6). Câu hỏi cần chủ dự án thì hỏi ngay trong phiên chat.

## 3. Việc của Master

**Đọc `workflow/project.conf` trước tiên.** Trong file này, `<nhánh chính>` là giá trị `BASE_BRANCH` (ví dụ `main`, `develop`); `DELIVERY`, `MR_PREFIX`, `WORKFLOW_IN_GIT` quyết định cách giao hàng và có commit `workflow/` không.

- **Thư mục gốc là của chủ dự án.** Có thể đang có nhiều phiên Master cùng chạy trên một thư mục gốc. Đổi nhánh ở đó là đổi code dưới chân mọi người: file đang sửa dở của Master khác, dev server của chủ dự án, hook đọc nhánh của thư mục gốc. Vì vậy:
  - mọi việc code, rebase, dựng nhánh giao hàng, sửa sau giao hàng đều làm trong **worktree riêng** (`../<tên-dự-án>-wt/…`);
  - **không** `git switch`, `checkout`, `rebase`, `merge`, `reset`, `stash` ở thư mục gốc. Ngoại lệ duy nhất là gộp ở máy khi `DELIVERY=merge` (mục "Giao hàng"), và chỉ khi không có Master nào khác đang mở;
  - thư mục gốc vẫn là nơi đọc, ghi các file trong `workflow/` (`AGENTS.md` mục 4);
  - hook `workflow/hooks/guard-root.cjs` (Claude Code; Gemini CLI khi cài extension workflow) chặn các lệnh đó khi chúng nhắm vào thư mục gốc. Đưa thư mục gốc về `<nhánh chính>` (`git switch <nhánh chính>`) vẫn được. Gặp hook chặn thì làm trong worktree, đừng tìm cách khác.
- **Đầu mỗi yêu cầu, kiểm `watch.sh` còn sống:** dòng đầu của `workflow/.run/watch.beat` là giờ (giây epoch) lần quét cuối. Không có file, hoặc cũ hơn 3 chu kỳ quét (mặc định 90 giây), thì ghi `.now` *"Chờ bạn: watch.sh đã dừng"* và báo chủ dự án chạy lại: `sh workflow/watch.sh --restart`. Khi `watch.sh` chết thì không còn gì khác báo cho chủ dự án biết.

- **Cho monitor biết bạn đang làm gì**, ở mọi làn, kể cả khi chưa có file nào trong `workflow/`. Ghi đè file `workflow/.run/<ID của bạn>.now` một dòng, mỗi khi đổi giai đoạn:
  - đang làm: *"Đang làm rõ: thêm cấu hình app (F-003)"*, *"Làn trực tiếp SG-30027, nhánh fix/…"*, *"Đang tích hợp F-003"*. Làn trực tiếp và review MR **luôn nêu tên nhánh đầy đủ** (ví dụ `fix/slug-min-length-sg30160`): `watch.sh` đọc tên nhánh trong dòng này để biết nhánh đã merge chưa;
  - chờ chủ dự án thì **bắt đầu bằng "Chờ bạn:"**: *"Chờ bạn: xác nhận làn"*, *"Chờ bạn: trả lời 2 câu hỏi về F-003"*. Monitor hiện đỏ những dòng này;
  - xong việc, không còn gì làm: ghi file thành rỗng.

  Đã có thư mục tính năng thì **luôn nêu mã `F-NNN`** trong dòng (ví dụ *"Chờ bạn: nghiệm thu F-005"*). Bạn cầm nhiều tính năng chưa xong thì monitor chỉ hiện dòng này ở dãy bàn của tính năng có mã đó; không có mã thì hiện ở mọi dãy bàn của bạn.

  Ghi bằng công cụ ghi file, không cần lệnh shell. File này không thay cho `to:` trong các file việc.
- **Không mở phiên phụ.** Không dùng tính năng tạo phiên mới hay chuyển việc sang phiên khác của công cụ (ví dụ "start session", "hand off" trong ứng dụng Claude) cho việc của dự án: phiên đó không có ID, không có file, không có `to:`, nên monitor và `watch.sh` không thấy và không ai truy lại được. Khảo sát code thì tự đọc, tìm (công cụ đọc và tìm kiếm trong chính phiên của bạn), hoặc gọi subagent có trong `agents.txt`. Việc lớn thì chia thành việc trong `tasks/`. Chủ dự án muốn chạy song song thì họ tự mở thêm phiên Master (`master-02`).
- **Làm rõ trước khi viết.** Hỏi tới khi đủ: đầu vào, đầu ra, trường hợp lỗi, cái gì **không** làm. Không điền chỗ trống bằng giả định.
- **ID của bạn** là ID chủ dự án nêu khi mở phiên (mọi làn đều cần, kể cả làn trực tiếp). **Không được nêu thì đừng tự nhận ngay:**
  - xem dòng `master:` trong các `SPEC.md` chưa `done`, và các file `workflow/.run/master-NN.now` không rỗng (Master khác đang mở phiên);
  - không có ai: bạn là `master-01`;
  - có (ví dụ `master-01` đang làm F-003): có thể một phiên Master khác đang chạy. Hỏi chủ dự án: *"Đang có `master-01` làm F-003. Phiên này làm tiếp `master-01`, hay là phiên song song `master-02`?"*, đề xuất ID nhỏ nhất khai trong `agents.txt` mà chưa có tính năng dở. Chưa có câu trả lời thì không đổi file nào.

  Hai phiên cùng một ID sẽ cùng xử lý những file `to:` ID đó và giẫm lên nhau. Phiên của bạn làm xong tính năng này rồi sang tính năng khác vẫn **giữ nguyên ID**. `agents.txt` khai sẵn `master-01` tới `master-03`; cần nhiều hơn thì chủ dự án thêm dòng.
- **Lần đầu trong dự án:**
  - hỏi chủ dự án trước khi `git init -b <nhánh chính>` (nếu chưa là repo git);
  - tạo `DECISIONS.md` và `journal/`;
  - `<nhánh chính>` chưa có commit nào thì xin chủ dự án cho tạo commit đầu tiên (bộ khởi đầu, và `workflow/` nếu `WORKFLOW_IN_GIT=yes`), vì Coder cần ít nhất một commit mới tạo được worktree;
  - dự án đã có code thì khảo sát (cấu trúc, build, test, quy ước, **quy ước thông điệp commit**), ghi vào `DECISIONS.md`;
  - kiểm hook chặn push thẳng lên nhánh chính: `sh workflow/hooks/install.sh --check`. Chưa cài thì nhờ chủ dự án chạy `sh workflow/hooks/install.sh` (sau `git init` nếu vừa tạo repo);
  - ghi vào `DECISIONS.md` mục **"Lệnh"**: lệnh build, lệnh chạy test, **lệnh chạy sản phẩm với một cổng cố định** (ví dụ `pnpm dev --port 5173 --strictPort`, mở `http://localhost:5173`), cách chạy bản của một worktree trên đúng cổng đó (ví dụ `pnpm --dir <worktree> exec vite --port 5173 --strictPort`), và cách đăng nhập (ai đăng nhập, tài khoản thử lấy ở đâu). Cổng cố định vì phiên đăng nhập gắn với `localhost:<cổng>`: đổi cổng là mất đăng nhập. Dự án mới thì chốt cùng chủ dự án ở tính năng đầu tiên. Đối chiếu với danh sách `allow` trong `.claude/settings.json`: lệnh nào chưa có thì đưa chủ dự án đúng dòng cần thêm (ví dụ `"Bash(./gradlew test:*)"`), chủ dự án đồng ý thì mới thêm. Thiếu quyền thì Coder, Tester chạy ngầm (`auto`) không chạy được test, còn chạy dạng `subagent` thì chủ dự án bị hỏi quyền liên tục.
- **Làn trực tiếp** (mục 2). Bạn làm như một phiên code thường, nhưng trong **worktree riêng**, không ở thư mục gốc:
  - tạo nhánh từ nhánh chính mới nhất (`git fetch origin` trước nếu có remote):
    ```bash
    git worktree add ../<tên-dự-án>-wt/direct-<tên-ngắn> -b <MR_PREFIX><mã-Jira-hoặc-tên-ngắn> origin/<nhánh chính>
    ```
    Không có remote thì dùng `<nhánh chính>` thay cho `origin/<nhánh chính>`. Như Coder, mọi lệnh chỉ rõ worktree (`git -C <worktree>`, `cd <worktree> && …`). **Không bao giờ commit lên `<nhánh chính>`**;
  - sửa code, chạy test (lệnh trong `DECISIONS.md`), chạy sản phẩm **từ worktree đó ở cổng cố định** và **kiểm từng tiêu chí trên trình duyệt**;
  - mỗi bug một commit, thông điệp theo quy ước trong `DECISIONS.md` (không có thì `<mã Jira>: <tiêu đề>`); sửa lại thì `git commit --amend` (nhánh chưa push) hoặc `--fixup`;
  - gặp quyết định hành vi mới: dừng, hỏi chủ dự án ngay trong phiên;
  - xong: báo cáo theo mẫu "Báo cáo" bên dưới, ngay trong phiên chat. Chủ dự án nói "đạt" thì giao hàng như mục "Giao hàng" (thay `<F-NNN>/integration` bằng nhánh này). Push theo mục "Push".
- **Mỗi tính năng** (làn nhanh và làn đủ):
  - **ngay khi chọn làn**, trước khi hỏi chủ dự án câu nào: tạo thư mục `F-NNN-short-name/` với số kế tiếp, và `SPEC.md` có `lane:`, `master: <ID của bạn>`, `status: draft`, `to: none` (đang làm rõ), cùng vài dòng yêu cầu ban đầu. Làm rõ xong thì viết tiếp và đặt `to: owner` (làn đủ) hoặc mở cho làm (làn nhanh). Tính năng hiện lên monitor ngay từ đầu, và số `F-NNN` được giữ chỗ, không trùng với Master khác;
  - `SPEC.md` có tiêu chí **kiểm được** (tiêu chí giao diện thì nêu thấy gì ở đâu, kèm mockup) và mục **"Cách thử"**;
  - **Hợp đồng API:** tính năng đọc hay ghi dữ liệu qua API thì đối chiếu với **máy chủ thật** trước khi trình `SPEC.md`, đừng chỉ tin tài liệu backend. Tự gọi các API **đọc** (ví dụ lấy meta, lấy một bản ghi) và so khoá, kiểu dữ liệu với tài liệu. API **ghi** thì không tự gọi: nhờ chủ dự án ghi thử một lần trên dữ liệu nháp, hoặc đưa một mẫu dữ liệu thật đã lưu được. Lệch với tài liệu thì hỏi chủ dự án trước khi viết tiêu chí. Ghi vào `SPEC.md` mục **"Hợp đồng API"**: ngày, API, cách đối chiếu (đọc thử / chủ dự án ghi thử / tài liệu), kết quả. Phát hiện lệch hợp đồng sau khi đã code là mất cả một vòng làm lại;
  - **Chia việc:** ghi `assignee`, `tester`, `files`, `can_doc`, `ref`. Chọn assignee theo `agents.txt` (ví dụ việc khó cho agent dùng model mạnh). **Chỉ dùng ID có trong `agents.txt`**; cần thêm người thì nhờ chủ dự án thêm dòng trước.
    - **Mỗi ID chỉ làm cho một Master một lúc.** Hai Master cùng giao cho `coder-01` thì hai subagent khác nhau mang chung một ID: chung file `.run/coder-01.sub`, chung `to:`, monitor và nhật ký lẫn lộn. Trước khi giao, chọn ID đang rảnh: không có `workflow/.run/<ID>.sub` khác rỗng, không có việc `ready`, `in_progress`, `reopened` của tính năng do Master khác cầm. Quy ước nên dùng: `master-0N` ưu tiên `coder-0N`, `tester-0N`. Hết ID rảnh thì nhờ chủ dự án thêm dòng vào `agents.txt`. `watch.sh --lint` báo khi một ID đang có việc dở ở hai Master;
    - **Chỉ tách nhiều việc khi chạy song song được** (`files` không chồng nhau, mỗi việc một Coder). Phần nối tiếp nhau của cùng một Coder thì để **một việc nhiều bước** (ghi trong "Kế hoạch các bước", mỗi bước một commit): một lượt Tester cho cả việc, khỏi đọc lại từ đầu nhiều lần.
    - Vẫn cần tách việc nối tiếp (để có điểm dừng, hay khác Coder): việc sau tạo nhánh từ nhánh việc trước (`depends_on`). Các việc trước đặt `tester:` là **bạn**: bạn kiểm nhanh như làn nhanh bước 9 (đọc diff, chạy test) rồi đặt `verified`. Chỉ **việc cuối** có `tester:` là Tester, và Tester kiểm **cả chuỗi** (diff từ `<nhánh chính>`, mọi tiêu chí của các việc trong chuỗi).
    - Không có bước kiểm tích hợp riêng của Tester: bản tích hợp do bạn chạy toàn bộ test (bước 10c), chủ dự án nghiệm thu;
  - **Sửa giao diện gom một lần:** tính năng có giao diện, sau lượt code đầu tiên thì nhờ chủ dự án **soi cả màn hình một lượt** và nói hết các chỗ chưa ưng, bạn gom thành một danh sách trong file việc rồi giao Coder một lần. Đừng giao từng chỗ nhỏ (cỡ chữ, màu, khoảng cách) thành nhiều lượt 2–3 phút: mỗi lượt là một lần gọi, đọc lại, kiểm lại;
  - **Trình duyệt dùng chung** (tính năng có giao diện): ngay khi mở cho làm (bước 7), chạy sản phẩm ở **cổng cố định** ghi trong `DECISIONS.md` (ghi vào dòng `server:` của `SPEC.md`) và nhờ chủ dự án **đăng nhập một lần**. Để server chạy tới khi nghiệm thu, đừng tắt giữa các lượt. Ai cần chạy code của worktree khác thì tắt server đang chạy rồi chạy lại **đúng cổng đó** (`--strictPort`): phiên đăng nhập vẫn còn. Mỗi lúc chỉ một bản chạy, nên các bước kiểm trên trình duyệt làm lần lượt. Agent không bao giờ tự nhập mật khẩu (`AGENTS.md` mục 6): trang đòi đăng nhập thì dừng phần trình duyệt và báo bạn, bạn nhờ chủ dự án. Dùng công cụ xem trước của ứng dụng Claude thì đặt `"autoPort": false` trong `.claude/launch.json` để nó không tự đổi cổng;
  - ghi mục **"Ngữ cảnh từ Master"** trong mỗi việc: những gì bạn đã biết (file, hàm, chỗ cần sửa, test liên quan), để Coder không phải đọc lại từ đầu;
  - làn đủ: **chọn Tester khác model với Coder** của việc đó (xem cột cuối `agents.txt` và model trong `.claude/agents/`), tốt hơn nữa là khác công cụ (Codex, Gemini, Antigravity). Hai model giống nhau dễ mù cùng một chỗ. Không có lựa chọn khác thì vẫn giao, và ghi điều đó vào "Báo cáo".
- **Trả lời câu hỏi:** chỉ khi **dẫn được nguồn**. Đổi phạm vi (thêm, bớt yêu cầu) thì luôn hỏi chủ dự án. Gom các câu cần chủ dự án lại, hỏi một lần, kèm phương án và đề xuất của bạn.
- **Nhánh tích hợp** (bước 10c). Chủ dự án nghiệm thu đúng bản sẽ vào `<nhánh chính>`, không phải từng nhánh lẻ, và **mỗi việc thành đúng một commit**:
  - kiểm từng nhánh việc: `git diff --name-only <nhánh chính>...<nhánh>` chỉ được có file trong `files:` của việc, cộng các file Coder đã ghi trong mục "File ngoài `files:`" của bàn giao thuộc ba loại được phép (`AGENTS.md` mục 3: test của module, locale, chỉnh kiểu cho biên dịch được): thêm các file đó vào `files:`. Có file trong `workflow/` hoặc file ngoài `files:` khác thì **không gộp**: đặt việc `status: reopened`, `to: <assignee>`, ghi rõ file nào sai (trạng thái phải ghi ở thư mục gốc, xem `AGENTS.md` mục 4);
  - tạo nhánh `<F-NNN>/integration` từ `<nhánh chính>` **mới nhất**, trong worktree riêng. Dự án có remote thì `git fetch origin` trước và dựng từ `origin/<nhánh chính>` (nhánh chính ở máy hay bị cũ):
    ```bash
    git worktree add ../<tên-dự-án>-wt/<F-NNN>-integration -b <F-NNN>/integration <nhánh chính>
    ```
    Nhánh đã có (dựng lại sau khi sửa lỗi) thì bỏ `-b`, rồi trong worktree đó `git reset --hard <nhánh chính>` để gom lại từ đầu. Chỉ làm thế với nhánh tích hợp của bạn, và chỉ khi chủ dự án chưa push nhánh giao hàng;
  - trong worktree đó, lần lượt từng việc theo thứ tự `depends_on`:
    ```bash
    git merge --squash <nhánh việc>
    git commit -m "<thông điệp theo quy ước commit trong DECISIONS.md, mặc định: <ref>: <title>>" -m "Task: <F-NNN>/<T-xx>"
    ```
    Hai lần `-m` cho ra dòng trống rồi dòng `Task:` (dạng trailer); viết `Task:` dính ngay dòng tiêu đề thì `git log --oneline` sẽ coi là một phần tiêu đề. Rồi chạy toàn bộ test (lệnh trong `DECISIONS.md`). Coder commit bao nhiêu lần trên nhánh việc cũng được: lịch sử `<nhánh chính>` chỉ thấy một commit mỗi việc;
  - **việc nối tiếp** (nhánh việc sau tạo từ nhánh việc trước): `git merge --squash` việc sau sẽ áp lại cả phần của việc trước và dễ xung đột. Thay bằng chỉ áp phần riêng của việc sau:
    ```bash
    git diff <nhánh việc trước>..<nhánh việc sau> | git apply --3way
    git commit -m "…" -m "Task: <F-NNN>/<T-xx>"
    ```
  - **xung đột hoặc test đỏ:** `git reset --hard HEAD` (chỉ trong worktree tích hợp, bỏ phần gộp dở), không tự sửa code. Đặt việc gây ra `status: reopened`, `to: <assignee>`, ghi file xung đột hoặc test đỏ. Coder gộp `<nhánh chính>` vào nhánh của mình để giải, rồi giao kiểm tra lại;
  - tính năng có giao diện: mở sản phẩm từ worktree tích hợp, kiểm nhanh các tiêu chí mà nhiều việc cùng chạm tới (nếu phiên của bạn có công cụ trình duyệt);
  - xong thì sang bước 11.
- **Báo cáo** (bước 11, và cuối làn trực tiếp). Trước khi viết: xoá worktree của Coder, Tester (giữ các nhánh). **Giữ worktree tích hợp** (làn trực tiếp: worktree `direct-…`) và chạy sản phẩm từ đó ở cổng cố định, để chủ dự án thử mà không phải đổi nhánh ở thư mục gốc. Muốn xem code trong trình soạn thảo thì chủ dự án mở thư mục worktree đó. Xoá worktree khi giao hàng xong.

  Xoá worktree theo mục "Dọn worktree" bên dưới (đừng `rm -rf`: có thể xoá nhầm `node_modules` thật qua junction). Mục "Báo cáo" trong `SPEC.md` **bắt buộc có đủ**, rồi dán nguyên mục đó vào phiên chat:
  ```
  ## Báo cáo
  - Nhánh: <F-NNN>/integration, từ <nhánh chính>, <n> commit: <ref> <title>; …
  - File đã đổi (git diff --stat <nhánh chính>...<nhánh>):
    <dán kết quả, ví dụ: src/components/Foo.tsx | 12 +++---->
  - Xem diff:  git diff <nhánh chính>...<nhánh>      (từng việc: git show <commit>)
  - Chạy test: <lệnh test trong DECISIONS.md>
  - Thử tay:   đã chạy sẵn từ worktree <đường dẫn>: mở <địa chỉ>, làm theo "Cách thử".
               Xem code trong trình soạn thảo: mở thư mục <đường dẫn worktree>
  - Đã kiểm:   mỗi tiêu chí → test nào, ảnh nào trong shots/
  - Lỗi đã sửa, câu hỏi đã chốt, điều cần biết (ví dụ Tester cùng model với Coder)
  ```
- **Giao hàng** (khi chủ dự án nói "đạt"), theo `DELIVERY` trong `project.conf`. Trước tiên, **trong worktree tích hợp** (không ở thư mục gốc): `git fetch origin` nếu có remote; `<nhánh chính>` đã có commit mới kể từ khi dựng nhánh tích hợp thì `git rebase origin/<nhánh chính>` (không remote: `git rebase <nhánh chính>`), chạy lại test. Rebase xung đột hay test đỏ thì `git rebase --abort` và báo chủ dự án, không tự sửa.
  - **`DELIVERY=merge`** (gộp ở máy). Đây là việc duy nhất được làm ở thư mục gốc, nên chỉ làm khi an toàn:
    - thư mục gốc đang ở `<nhánh chính>`, và không có `workflow/.run/master-NN.now` nào khác rỗng ngoài của bạn. Không thoả thì không làm, đưa chủ dự án lệnh để tự chạy;
    - tạo khoá `workflow/.merging`; đã có khoá thì chờ, vì Master khác đang gộp;
    - `WORKFLOW_ROOT_OK=1 git -C <thư mục gốc> merge --ff-only <F-NNN>/integration`: lịch sử thẳng, mỗi việc một commit (`WORKFLOW_ROOT_OK=1` cho hook chặn thư mục gốc biết đây là việc được phép);
    - xoá khoá. Push `<nhánh chính>` theo mục "Push". Đặt `SPEC.md` `status: done`.
  - **`DELIVERY=mr`** (team không cho commit thẳng lên nhánh chính): **không gộp gì vào `<nhánh chính>`**. `git branch <MR_PREFIX><tên-ngắn> <F-NNN>/integration`, rồi push nhánh đó theo mục "Push", để chủ dự án mở MR/PR vào `<nhánh chính>`. Push xong: `SPEC.md` `status: delivered`, `to: none`, ghi tên nhánh giao hàng vào mục "Báo cáo". Chưa `done`, vì MR chưa vào nhánh chính (mục "Theo dõi MR").
  - Cả hai cách: xoá các nhánh việc và nhánh tích hợp (`git branch -D`: nhánh việc đã được gom thành commit khác nên `-d` không nhận). Còn worktree nào của tính năng thì dọn theo mục "Dọn worktree". `DELIVERY=mr` thì giữ nhánh giao hàng ở máy tới khi `done`: GitLab, GitHub thường xoá nhánh xa sau khi merge, nhánh ở máy là thứ còn lại để biết MR đã vào.
- **Dọn worktree** (khi xong việc, hay khi `done`), **đúng thứ tự**:
  1. tắt dev server chạy từ worktree đó (cổng ghi ở dòng `server:` trong `SPEC.md`), rồi xoá dòng `server:`. Server còn chạy thì thư mục bị giữ, xoá báo "Device or resource busy";
  2. `node_modules` (hay thư mục khác) là **junction / symlink** trỏ về thư mục thật thì gỡ riêng nó trước, bằng lệnh chỉ gỡ liên kết: Windows `cmd //c rmdir "<worktree>\node_modules"`, máy khác `rm <worktree>/node_modules` (không `-r`). **Không bao giờ `rm -rf` một thư mục có junction bên trong**: có thể đi xuyên junction và xoá luôn thư mục đích;
  3. `git worktree remove <worktree>` (còn file chưa commit mà chắc chắn bỏ được thì thêm `--force`);
  4. Windows vẫn báo `Invalid argument` / thư mục còn sót: kiểm lại bước 1–2, xoá phần còn lại khi không còn junction nào bên trong, rồi `git worktree prune`;
  5. `git branch -D` các nhánh của tính năng (nhánh việc, nhánh tích hợp; nhánh giao hàng chỉ khi đã `done`).
  - `WORKFLOW_IN_GIT=yes`: commit các file trong `workflow/` của tính năng lên `<nhánh chính>` (với `DELIVERY=mr` thì commit lên nhánh `<MR_PREFIX><tên-ngắn>`). `WORKFLOW_IN_GIT=no`: không commit file nào trong `workflow/`, vì chúng chỉ có trên máy chủ dự án.
- **Theo dõi MR** (`DELIVERY=mr`):
  - push xong thì ghi `delivery: <nhánh giao hàng>` trong `SPEC.md` (làn trực tiếp: tên nhánh nằm trong dòng `.now`);
  - `watch.sh` tự `git fetch` mỗi 10 phút và đối chiếu các nhánh đó. Nhánh nào đã vào nhánh chính thì monitor ghi "đã merge, chờ <Master> dọn" (không tính là việc chờ chủ dự án) và `watch.sh --lint` báo. **Đừng tự `git fetch` theo lịch**: nhiều phiên cùng fetch trên Windows dễ va nhau (`unable to unlink …`); chỉ fetch khi sắp dựng nhánh mới;
  - một nhánh **đã merge** khi một trong các điều sau đúng (đây cũng là cách `watch.sh` dò):
    - nhánh **ở máy** (hay nhánh xa, nếu còn) đã nằm trong `origin/<nhánh chính>`: `git merge-base --is-ancestor <nhánh> origin/<nhánh chính>`. Đừng chỉ dựa vào `git branch -r --merged`: GitLab, GitHub thường xoá nhánh xa sau khi merge;
    - MR gộp kiểu **squash**: gộp thử ảo `git merge-tree --write-tree origin/<nhánh chính> <nhánh>` cho ra đúng cây của nhánh chính (`git rev-parse origin/<nhánh chính>^{tree}`), tức mọi thay đổi của nhánh đã có trong đó. Đừng dùng `git cherry`: nó so từng commit, nên không nhận ra squash từ nhiều commit;
  - đầu mỗi phiên, và khi chủ dự án bảo "xử lý việc đang chờ": tính năng nào `delivered` mà nhánh đã merge thì đặt `status: done`, dọn theo mục "Dọn worktree", ghi `.now` rỗng nếu không còn gì làm;
  - **Việc treo:** có việc phải chờ một MR khác vào nhánh chính rồi mới làm (ví dụ sửa tài liệu khi tính năng kia vào) thì ghi vào `SPEC.md` mục `## Việc treo`, mỗi dòng `- chờ <nhánh>: <việc cần làm>`. `watch.sh --lint` báo khi `<nhánh>` đã merge (theo cách trên): làm việc đó rồi xoá dòng.
- **Review MR** (chủ dự án nhờ xem một MR): ghi vào `workflow/reviews/MR-<số>.md`, để lần review sau không phải tìm lại trong chat:
  ```
  # MR !<số>: <tiêu đề>
  Nhánh: <nhánh>   Lượt 1: commit <sha> (<ngày>)   Lượt 2: commit <sha> (<ngày>)
  | # | Mức (phải sửa / nên sửa / gợi ý) | File:dòng | Tóm tắt | Trạng thái (mở / đã sửa / bỏ qua) |
  ```
  Review lại thì chỉ xem `git diff <commit đã ghi>..<nhánh>` và cập nhật cột trạng thái. `.now` ghi *"Review MR !<số>, nhánh <nhánh>"*.
- **Sửa sau giao hàng:** nhánh giao hàng đã push, MR chưa gộp, chủ dự án thấy lỗi nhỏ (giao diện, chữ, một điều kiện): làm như **làn trực tiếp ngay trên nhánh giao hàng**, trong worktree (worktree tích hợp chuyển sang nhánh giao hàng, hay tạo mới `git worktree add ../<tên-dự-án>-wt/fix-<tên> <nhánh giao hàng>`), không ở thư mục gốc: sửa, chạy test, kiểm trên trình duyệt, thêm **một commit mới** (không `--amend` hay rebase, vì nhánh đã push), ghi thêm một dòng vào mục "Báo cáo" của `SPEC.md`, rồi xin push. Lỗi lớn, hay cần quyết định hành vi mới thì mở tính năng mới.
- **Push** (sau giao hàng, hoặc khi chủ dự án yêu cầu): chỉ khi **chủ dự án cho phép đúng lần push đó trong phiên chat** (`AGENTS.md` mục 6).
  - Hỏi một câu nêu rõ nhánh và remote, kèm số commit sẽ lên: *"Push `feat/x` (2 commit) lên `origin`?"*. Chủ dự án chưa trả lời, hay trả lời không rõ, thì không push; báo lệnh để chủ dự án tự chạy: `git push -u origin <nhánh>`.
  - Được đồng ý: `git push -u origin <nhánh>`. Báo kết quả.
  - Không `--force`, không `--no-verify`. `DELIVERY=mr` thì không bao giờ push `<nhánh chính>` (hook `pre-push` cũng chặn). Push bị từ chối (nhánh xa đã đổi, hay bị hook chặn) thì dừng và báo, không tự gộp, ép hay tìm cách khác.
- **Kiểm bất thường:** trước khi báo cáo, và khi chủ dự án bảo "xử lý việc đang chờ", chạy `sh workflow/watch.sh --lint`. Nó liệt kê việc không ai cầm, `status` và `to` lệch nhau, ID không có trong `agents.txt`, một ID có việc dở ở hai Master, câu trả lời thiếu `Nguồn:`, việc treo đã tới lúc làm, file chờ quá lâu, subagent hỏng phần đầu file. Sửa những gì thuộc tính năng của bạn.
- **Chỉ sửa** trong thư mục tính năng của mình, cộng `DECISIONS.md` khi chủ dự án đồng ý. Ngoại lệ duy nhất: code sản phẩm ở làn trực tiếp.
- **Gọi agent chế độ `subagent`** (xem `workflow/agents.txt`): sau mỗi bước làm cho một file chuyển `to:` sang agent đó, bạn tự gọi subagent ghi ở cột cuối (`coder`, `coder-pro`, `tester` trong `.claude/agents/`).
  - Lời gọi gồm: **ID của agent** (ví dụ `coder-01`), danh sách file đang chờ nó, **đường dẫn tuyệt đối của thư mục gốc**, và câu *"Làm theo AGENTS.md và workflow/roles/<vai>.md"*. Kèm luôn ngữ cảnh bạn đã có mà file việc chưa ghi, để nó không phải tìm lại. **Trỏ đúng chỗ cần đọc** (`SPEC.md` mục nào, câu hỏi nào, file code nào), đừng bảo đọc lại cả tài liệu: mỗi lượt đọc lại từ đầu tốn hàng trăm nghìn token.
  - **Vòng sửa lỗi, kiểm lại: gửi tiếp cho chính subagent vừa làm** (công cụ gửi tin cho agent đã chạy, ví dụ `SendMessage` trong Claude Code), để nó còn nguyên ngữ cảnh. Chỉ gọi mới khi ngữ cảnh của nó đã quá lớn, hay đổi người làm.
  - Không thấy subagent `tester` (hay `coder`) trong danh sách agent của phiên: thường do phần đầu file trong `.claude/agents/` hỏng (`sh workflow/watch.sh --lint` báo). Báo chủ dự án; tạm thời gọi agent đa dụng với đúng model đó (ví dụ opus cho Tester) và dặn *"Bạn là tester-01, làm theo AGENTS.md và workflow/roles/tester.md"*.
  - **Ngay trước khi gọi**, lấy giờ thật bằng lệnh (`date +%Y-%m-%dT%H:%M`, đừng ghi theo trí nhớ) và ghi file `workflow/.run/<ID>.sub` một dòng `<F-NNN> <T-xx>` (ví dụ `F-001 T-01`). **Gọi xong**, ghi lại file đó thành rỗng, lấy giờ thật lần nữa, và **ghi thêm** một dòng vào cuối `workflow/.run/<ID>.hist`: `<giờ bắt đầu> <giờ xong> <F-NNN> <T-xx> <kết quả ngắn>` (ví dụ `2026-11-21T09:40 2026-11-21T10:02 F-009 T-01 in_test`). Monitor nhờ `.sub` biết agent đang chạy, nhờ `.hist` hiện các lần chạy gần đây; `watch.sh --lint` báo dòng có giờ xong trước giờ bắt đầu.
  - Tính năng có giao diện: lời gọi nêu luôn **server đang chạy** (cổng, worktree, đã đăng nhập chưa) để Coder, Tester dùng lại, không tự mở server mới; cần chạy bản của worktree khác thì theo luật cổng cố định (mục "Trình duyệt dùng chung").
  - Subagent làm xong thì đổi `to:` như agent thường; bạn đọc lại file rồi đi tiếp. Các việc không chồng `files` thì gọi song song được.
- Agent chế độ `auto`, `window`, `manual` do `watch.sh` lo: bạn chỉ cần đổi `to:` đúng.
