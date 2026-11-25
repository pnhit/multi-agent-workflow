# Ví dụ thật: làm trang giới thiệu công ty bằng workflow

Đây là ghi lại **một lần dùng thật** (16–17/11/2026), từ lúc dự án còn là thư mục trống tới khi có hai tính năng được nghiệm thu. Mọi file, số liệu và lỗi gặp phải đều lấy từ dự án đó; chỉ đổi email cá nhân thành địa chỉ giả `lienhe@pnh.vn`.

**Phiên bản:** bộ khởi đầu bản [`v0.1.0`](https://github.com/pnhit/multi-agent-workflow/tree/v0.1.0). Bản hiện tại khác ở vài lời nhắn (ghi chú tại chỗ), cách làm vẫn như vậy.

**Cấu hình đã dùng:** chỉ có **ứng dụng Claude desktop** (tab Code), không cài Claude Code dòng lệnh. Coder và Tester chạy ở chế độ `subagent`: Master tự gọi họ ngay trong phiên chat. Máy Windows, có Git Bash và Node 20.

**Bạn chỉ chat với Master.** Toàn bộ những câu chủ dự án đã nói nằm ở [mục 9](#9-tóm-tắt-chủ-dự-án-đã-nói-gì).

---

## 1. Chuẩn bị (khoảng 15 phút)

**Chép bộ khởi đầu.** Tạo `D:\Workspace\company-landing`, chép nội dung thư mục `starter-kit/` vào đó. Trong PowerShell, đứng ở `D:\Workspace`:
```bash
Copy-Item -Path .\multi-agent-workflow\starter-kit\* -Destination .\company-landing -Recurse -Force
```
> Gặp lỗi: lúc đầu dùng `cp -r …` của Git Bash ngay trong PowerShell nên báo lỗi. Lệnh nào chạy ở cửa sổ nào thì phải đúng cú pháp của cửa sổ đó.

**Telegram.** Tạo bot với @BotFather, ghi token và chat ID vào `.env`, thử:
```bash
sh workflow/notify.sh "Thử thông báo"
```
> Gặp lỗi: `.env` vẫn còn nguyên chữ mẫu `<token>` nên Telegram trả 404. Sau đó tin tiếng Việt có dấu bị trả 400 trên Windows. Cả hai đã được sửa trong `notify.sh`: nó báo rõ khi `.env` còn chữ mẫu và gửi được tiếng Việt.

**Hai cửa sổ Git Bash** tại thư mục dự án, chạy rồi để đó:
```bash
sh workflow/watch.sh
```
```bash
node workflow/monitor.js
```
Mở http://localhost:4300: văn phòng còn trống, ba agent `master-01`, `coder-01`, `tester-01` đứng ở cây nước.

`workflow/agents.txt` để nguyên mặc định:
```
master-01     master  manual    phiên chat chính
coder-01      coder   subagent  coder
tester-01     tester  subagent  tester
```

## 2. Mở Master và dựng workflow

Trong ứng dụng Claude: tab **Code**, phiên mới, thư mục `D:\Workspace\company-landing`. Dán:
```text
Đọc AGENTS.md và làm theo. Bạn là Master. Đây là dự án mới.
Dựng thư mục workflow/ theo mục 3 của AGENTS.md (hỏi tôi trước khi git init).
```
> Bản hiện tại: luật riêng của Master nằm trong `workflow/roles/master.md`, nên câu thứ hai là *"Dựng thư mục workflow/ theo workflow/roles/master.md (hỏi tôi trước khi git init)."* Xem `SETUP.md`, bước 5.

Master:
- xin chạy `git init -b main`, bạn đồng ý;
- tạo `workflow/DECISIONS.md` và `workflow/journal/`;
- kiểm tra `.env` đã bị git bỏ qua;
- **dừng lại hỏi** vì nhánh `main` chưa có commit nào, trong khi Coder cần ít nhất một commit mới tạo được nhánh làm việc riêng.

Bạn trả lời *"Ok, tạo commit đầu tiên"*, và Master commit `4ab6911 Dựng workflow multi-agent ban đầu`.
> Chỗ này về sau được thêm thẳng vào luật của Master, để lần sau Master tự xin ngay từ đầu.

## 3. Tính năng 1 (F-001): giao yêu cầu và làm rõ

Bạn dán yêu cầu, viết sẵn đủ chi tiết:
```text
Tính năng mới (để thử workflow): trang giới thiệu công ty, một file index.html.
- Công ty: "Công ty ABC". Khẩu hiệu: "Giải pháp phần mềm cho doanh nghiệp".
- 3 phần từ trên xuống: (1) đầu trang có tên và khẩu hiệu; (2) "Dịch vụ" gồm 3 thẻ: Thiết kế web, Ứng dụng di động, Tư vấn; (3) "Liên hệ": email contact@abc.vn, điện thoại 0900 000 000.
- Chỉ HTML và CSS viết trong cùng file, không JavaScript, không thư viện ngoài, không form.
- Màu chính #1e40af. Trên điện thoại (rộng dưới 600px), 3 thẻ dịch vụ xếp dọc.
- Không cần logo, không cần đăng lên mạng.
Hỏi tôi nếu còn điểm chưa rõ. Không tự quyết. Giao việc theo workflow/agents.txt.
```

Dù yêu cầu đã khá chi tiết, Master vẫn **hỏi lại 4 điểm** thay vì tự đoán:
1. Thẻ dịch vụ có mô tả, ảnh không? Bạn chọn **chỉ có tiêu đề**.
2. Email và điện thoại có bấm được không? Bạn chọn **có**, dùng liên kết `mailto:` và `tel:`.
3. Kiểm thử thế nào? Bạn chọn test tự động bằng `node --test`, cộng chụp trang thật bằng Edge hoặc Chrome chạy ngầm.
4. Một loạt mặc định: file ở gốc repo, từ 600px trở lên 3 thẻ một hàng, `lang="vi"`, font hệ thống, không menu, không chân trang, nền trắng. Bạn đồng ý cả.

Master viết `workflow/F-001-company-page/SPEC.md` gồm:
- mục tiêu và nội dung đúng từng chữ;
- **11 tiêu chí kiểm được** (C1–C11);
- mục "Không làm";
- cách kiểm thử và mục "Cách thử" cho bạn.

Trích phần tiêu chí:

| # | Tiêu chí |
|---|---|
| C2 | Không có JavaScript: không `<script>`, không thuộc tính `on…`, không `href="javascript:…"` |
| C4 | Không có `<form>`, `<input>`, `<button>`, `<img>`, `<svg>`, `<nav>`, `<footer>` |
| C9 | Rộng từ 600px trở lên: 3 thẻ dịch vụ nằm trên một hàng ngang |
| C10 | Rộng dưới 600px (kiểm ở 599px và 375px): 3 thẻ xếp dọc, ở 375px không có thanh cuộn ngang |
| C11 | `node --test tests/index.test.mjs` chạy xanh với Node 20, chỉ dùng module có sẵn của Node |

Và chia 2 việc:

| Việc | Nội dung | Người làm | Người kiểm | File được sửa |
|---|---|---|---|---|
| T-01 | Viết `index.html` và test tự động | coder-01 | tester-01 | `index.html`, `tests/index.test.mjs` |
| T-02 | Kế hoạch kiểm thử | tester-01 | tester-01 | chính file T-02 |

`SPEC.md` có `to: owner`: monitor hiện "Cần bạn: tài liệu chờ bạn duyệt". Bạn đọc rồi gõ **"duyệt"**.

## 4. Khảo sát: Coder và Tester đọc tài liệu trước khi làm

Master đặt T-01 `to: coder-01`, T-02 `to: tester-01`, rồi **tự gọi hai subagent** để khảo sát:
- **coder-01** đọc SPEC, ghi kế hoạch 4 bước vào T-01, kết luận *"SPEC rõ, không có câu hỏi"*, đặt `status: reviewed`, `to: master-01`.
- **tester-01** viết **14 ca kiểm thử (K1–K14)** phủ đủ C1–C11, mỗi ca có lệnh kiểm và kết quả mong đợi. Tester tự thêm 3 ca ngoài tiêu chí:
  - K12: bấm thật email và điện thoại;
  - K13: soát phạm vi, diff chỉ được có 2 file;
  - K14: **cố tình chèn lỗi** để chứng minh bộ test bắt được lỗi.

Không có câu hỏi nào, nên Master mở cho làm: `SPEC.md` `in_dev`, T-01 `ready`, `to: coder-01`.

## 5. Code và kiểm tra

**coder-01**:
- tạo nhánh riêng trong thư mục làm việc riêng:
  ```bash
  git worktree add ../company-landing-wt/F-001-T-01 -b F-001/T-01
  ```
- viết `index.html` và `tests/index.test.mjs`;
- chạy test xanh 9/9, commit `5237b97`;
- ghi bàn giao 3 ý (Đã làm / Còn dở / Bước tiếp theo);
- đặt T-01 `in_test`, `to: tester-01`.

**tester-01** kiểm trên một worktree riêng, **không tin báo cáo của Coder**:
- chạy lại test 9/9, soát bằng `grep` từng tiêu chí văn bản;
- `git diff main...HEAD` xác nhận chỉ có 2 file;
- chèn `<script>` vào một bản sao: test đỏ, nghĩa là test bắt được lỗi thật;
- chụp trang bằng Edge chạy ngầm ở 1280px, 600px, 599px, 375px. Ở 375px phải chụp qua một `iframe`, vì Edge chạy ngầm không thu cửa sổ nhỏ hơn khoảng 500px được;
- bấm thật email, điện thoại: **không làm được** khi chạy ngầm, nên ghi rõ *"chủ dự án thử khi nghiệm thu"*.

Kết quả: đạt C1–C11, không có lỗi. T-01 và T-02 `verified`, `to: master-01`.

## 6. Báo cáo và nghiệm thu

Master chạy lại test, xem ảnh chụp, rồi viết mục **"Báo cáo"** trong SPEC:
- đã làm gì, ở nhánh và commit nào;
- đã test gì;
- lỗi đã sửa;
- **những gì chưa kiểm được**;
- cách thử.

Sau đó Master đặt `SPEC.md` `acceptance`, `to: owner`.

Trên monitor:
- mục **"Cần bạn"** sáng vàng: *"F-001 · Đã làm xong, chờ bạn nghiệm thu"*, kèm sẵn mục "Cách thử";
- cửa phòng mở, Master hiện dấu `!`;
- Telegram báo một tin.
> Gặp lỗi: lần đầu mục "Cần bạn" chỉ ghi `SPEC.md (acceptance)`, nên chủ dự án không nhận ra đến lượt mình. Đã sửa monitor để nói rõ việc cần làm, và thêm luật cho Master: báo cáo xong thì đặt các việc về `to: none`.

Bạn mở `index.html` trong worktree, thu nhỏ cửa sổ xem bản điện thoại, bấm email, rồi gõ **"đạt"**. Master:
- gộp nhánh vào `main` bằng `git merge --no-ff`, chạy lại test trên `main` 9/9;
- xoá worktree, đặt SPEC `done`;
- **không push**.

## 7. Tính năng 2 (F-002), ngay trong phiên Master cũ

Bạn gõ tiếp vào phiên đó: *"đổi màu thành xanh, tên công ty PNH, email lienhe@pnh.vn"*.

Master không tự hiểu "xanh" là xanh gì, mà **hỏi lại**:
- xanh lá hay xanh dương? Bạn chọn xanh lá `#15803d`;
- tên "PNH" đổi ở cả `<h1>` lẫn tiêu đề tab? Bạn chọn cả hai;
- các phần còn lại (khẩu hiệu, điện thoại, dịch vụ) **giữ nguyên**. Master ghi vào SPEC để bạn xác nhận lúc duyệt.

SPEC F-002 có bảng "Cũ / Mới" và 6 tiêu chí. Bạn **duyệt**.

**Lúc khảo sát, Coder phát hiện một lỗi cũ** trong test của F-001: viết `\s` bên trong template literal thì biến thành `s`, nên một thẻ cấm có thuộc tính như `<form action="x">` lọt qua test C4. Lỗi này nằm ngoài phạm vi F-002, nên Coder **không tự sửa**, chỉ ghi lại và chờ Master. Master đồng ý cho sửa, kèm **nguồn**: luật "không tự quyết" cho phép sửa chi tiết bên trong việc khi không đổi hành vi. Đây đúng là cách workflow muốn: phát hiện thì báo, quyết định có căn cứ.

Phần còn lại đi như F-001:
- Coder có 2 commit trên nhánh `F-002/T-01`;
- test xanh 11/11;
- Tester chèn lại từng thứ cũ (`Công ty ABC`, `#1e40af`, email cũ, `<form action>`): test đỏ cả 4 lần;
- ảnh chụp 4 độ rộng đúng màu xanh lá và tên PNH;
- Master viết báo cáo, có ghi mục "Lỗi đã sửa".

> Gặp lỗi: khi sang F-002, Master tự đổi ID thành `master-F-002`. ID này không có trong `agents.txt`, nên monitor hiện như một người mới. Đã đổi luật: **mỗi phiên chat là một Master** (`master-01`), làm lần lượt nhiều tính năng vẫn giữ ID. Monitor cũng cho tính năng đã xong rời khỏi văn phòng, chỉ còn tên trên bảng trắng.

## 8. Kết quả trong dự án

```
company-landing/
  index.html                      trang giới thiệu
  tests/index.test.mjs            test tự động (node --test)
  AGENTS.md  CLAUDE.md  .claude/  bộ khởi đầu
  workflow/
    agents.txt  watch.sh  monitor.js  notify.sh
    DECISIONS.md
    journal/                      nhật ký của Master, mỗi ngày một file
    F-001-company-page/           SPEC.md (done), tasks/T-01.md, T-02.md
    F-002-doi-ten-mau/            SPEC.md, tasks/T-01.md, T-02.md
```

Lịch sử git:
```
* 9777988 F-002/T-01: sửa regex C4 (\s), thêm kiểm tra bắt <form action>, …
* d9da289 F-002/T-01: đổi tên PNH, màu #15803d, email mới; sửa regex C4 trong test
* 74dfa23 F-001: tài liệu, việc và báo cáo; nghiệm thu đạt
*   931b998 Gộp F-001/T-01: trang giới thiệu Công ty ABC
|\
| * 5237b97 F-001/T-01: thêm index.html và test tự động
|/
* 4ab6911 Dựng workflow multi-agent ban đầu
```
Mỗi việc một nhánh, gộp bằng `--no-ff` nên vẫn thấy rõ từng việc. Mọi trạng thái nằm trong file: một phiên Master mới đọc `workflow/` là làm tiếp được.

## 9. Tóm tắt: chủ dự án đã nói gì

| Lúc | Câu bạn nói với Master |
|---|---|
| Mở phiên | *"Đọc AGENTS.md và làm theo. Bạn là Master. Đây là dự án mới…"* |
| Master xin commit đầu | *"Ok, tạo commit đầu tiên"* |
| F-001 | Đoạn yêu cầu ở mục 3, rồi trả lời 4 câu hỏi |
| SPEC F-001 xong | *"duyệt"* |
| Báo cáo F-001 xong | *"đạt"* |
| F-002 | *"đổi màu thành xanh, tên công ty PNH, email …"*, rồi trả lời 3 câu hỏi |
| SPEC F-002 xong | *"duyệt"* |
| Báo cáo F-002 xong | *"đạt"* (hoặc nêu chỗ chưa đạt) |
| Sau cùng | **Bạn tự push**: `git push origin main` |

Bạn không chat với Coder hay Tester lần nào. Họ khảo sát, code, kiểm tra và trao đổi với nhau qua file; bạn theo dõi trên monitor và Telegram.

## 10. Rút ra từ lần chạy này

- **Viết yêu cầu càng cụ thể, Master hỏi càng ít.** Dù vậy, những chỗ có thể hiểu hai cách ("xanh") Master vẫn hỏi; đó là điều nên có.
- **Tiêu chí kiểm được là thứ quan trọng nhất trong SPEC.** Tester bám vào C1–C11 để viết 14 ca kiểm thử. Coder bám vào đó để viết test.
- **Tester chèn lỗi để thử bộ test** (K14, K20) là thói quen tốt. Nhờ vậy mới lộ ra test C4 yếu.
- **Những gì máy không kiểm được thì báo cáo nói thẳng**, ví dụ bấm email thật, và để lại cho bạn thử lúc nghiệm thu.
- Các lỗi của chính workflow gặp trong lần chạy (commit đầu, mục "Cần bạn" khó thấy, ID Master đổi theo tính năng, tiếng Việt qua Telegram) đều đã được sửa trong bộ khởi đầu hiện tại.

---

Bắt đầu dự án của bạn: [SETUP.md](SETUP.md). Hiểu cách hoạt động: [HOW-IT-WORKS.md](HOW-IT-WORKS.md).
