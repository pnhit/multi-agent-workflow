# Vai Coder

Đọc cùng `AGENTS.md` (phần chung). Không cần đọc file của Master hay Tester.

## 1. File bạn làm việc cùng

Trong `workflow/F-NNN-short-name/` của tính năng:
- `SPEC.md`: yêu cầu và tiêu chí. **Chỉ đọc**, không sửa. Dòng `lane:` cho biết làn: `quick` (làn nhanh, Master kiểm thay Tester) hay `full`.
- `tasks/T-xx.md`: việc của bạn (`assignee` là ID của bạn). Bạn ghi kế hoạch, bàn giao, `branch:`, và đổi `status`, `to`. Chỉ sửa code trong `files:`; chỉ đọc thêm những gì `can_doc:` chỉ tới. Đọc mục **"Ngữ cảnh từ Master"** trước: Master đã tìm sẵn chỗ cần sửa, đừng tìm lại từ đầu.
- `bugs/B-xx.md`: lỗi Tester (hoặc Master) báo cho bạn.
- `shots/`: ảnh chụp khi bạn tự kiểm trên trình duyệt.
- `questions/D-xx.md`: câu hỏi bạn tạo khi tài liệu không trả lời được:
  ```
  ---
  id: D-01
  title: <câu hỏi một dòng>
  from: coder-01
  to: <master của tính năng, xem dòng master: trong SPEC.md>
  status: open
  task: T-01
  ---
  ## Ngữ cảnh
  ## Các phương án thấy được
  ## Trả lời
  ```

## 2. Các bước của bạn

| Bước | Khi nào | Làm gì | Đặt |
|---|---|---|---|
| 3. Khảo sát | Việc `status: review`, `to:` bạn | Đọc `SPEC.md` và việc của mình | Rõ: việc `status: reviewed`, `to: <master>`. Chưa rõ: tạo câu hỏi `to: <master>`, việc `to: none`, ghi `blocked_by` |
| 6. Đọc câu trả lời | Câu hỏi `status: answered`, `to:` bạn | Đọc, khảo sát lại phần liên quan | Câu hỏi `status: closed`, `to: none`; việc như bước 3 (việc đã `ready` thì làm tiếp bước 8) |
| 8. Code | Việc `status: ready`, `to:` bạn | Mục 3: code trong worktree riêng, **tự kiểm trước khi giao** (test cả module, tự chèn lỗi, bỏ code chết), **tự kiểm trên trình duyệt**, commit | Việc `status: in_test`, `to: <tester>` |
| 10. Sửa lỗi | Lỗi `status: open`, việc `reopened`, `to:` bạn | Theo `kind` của lỗi: `bug` thì viết test tái hiện rồi sửa; `review` thì sửa đúng chỗ được chỉ; `weak-test` thì làm test chặt hơn, để lỗi Tester đã chèn làm test đỏ. Chạy lại test cả module; kiểm lại trên trình duyệt nếu lỗi liên quan giao diện | Lỗi `status: fixed`, `to: <tester>`; việc `status: in_test`, `to: <tester>` |
| 10. Sửa theo Master | Việc `reopened`, `to:` bạn, có ghi chú của Master (chưa đạt khi Master kiểm, xung đột khi gộp, test đỏ trên nhánh tích hợp, sửa file ngoài `files:`) | Làm theo ghi chú. Xung đột thì gộp nhánh chính (`BASE_BRANCH` trong `workflow/project.conf`) vào nhánh của bạn và giải; sai phạm vi thì bỏ thay đổi đó. Test xanh, commit | Việc `status: in_test`, `to: <tester>` |

`<master>` là dòng `master:` trong `SPEC.md`; `<tester>` là dòng `tester:` trong file việc (làn nhanh: chính là Master).

## 3. Cách code

**Hai nơi, đừng lẫn** (xem `AGENTS.md` mục 4):

| Nơi | Sửa gì |
|---|---|
| Worktree của việc (`../<tên-dự-án>-wt/<F-NNN>-<T-xx>`) | Code và test trong `files:`. Commit ở đây |
| Thư mục gốc dự án (`<gốc>/workflow/F-NNN-…/`) | File việc (kế hoạch, bàn giao, `branch`, `status`, `to`), câu hỏi, lỗi, ảnh `shots/`. **Không commit** |

Bản `workflow/` trong worktree là bản cũ: không đọc, không sửa. Bạn luôn được mở ở thư mục gốc: mọi lệnh cho code phải chỉ rõ worktree (`git -C <worktree> …`, `cd <worktree> && …`), mọi đường dẫn file code bắt đầu bằng `<worktree>/`. **Không bao giờ sửa code hay commit ở thư mục gốc.**

1. Tạo thư mục làm việc riêng (chạy ở thư mục gốc):
   ```bash
   git worktree add ../<tên-dự-án>-wt/<F-NNN>-<T-xx> -b <F-NNN>/<T-xx>
   ```
   Việc nối tiếp (`depends_on` một việc chưa gộp) thì tạo nhánh từ nhánh việc trước: thêm `<F-NNN>/<T-trước>` vào cuối lệnh. Việc `reopened` mà worktree đã bị xoá thì tạo lại từ nhánh cũ (bỏ `-b`). Ghi tên nhánh vào dòng `branch:` của file việc **ở thư mục gốc**. Dự án cần cài thư viện cho mỗi thư mục (ví dụ `node_modules`) thì làm theo `DECISIONS.md`.
2. Ghi kế hoạch các bước. **Chỉ sửa file trong `files`**, cộng ba loại được phép ở `AGENTS.md` mục 3 (test, locale của module; chỉnh kiểu cho biên dịch được, không đổi logic): ghi từng file đó vào mục "File ngoài `files:`" của bàn giao. Xong mỗi bước thì đánh dấu, ghi bàn giao, commit. Commit bao nhiêu lần cũng được: khi tích hợp, Master gom cả việc thành **một commit** mang mã `ref:`. Thông điệp commit **theo mục Commit của `DECISIONS.md`** (dạng, ngôn ngữ: dự án ghi "mô tả tiếng Anh" thì viết tiếng Anh dù bạn đang làm việc bằng tiếng Việt). Commit trên nhánh việc không được có file nào trong `workflow/`.
3. Gặp điều tài liệu không trả lời được: **dừng**, hỏi (bước 3), đặt việc `to: none`.
4. **Tự kiểm trước khi giao**, để Tester khỏi phải trả lại những lỗi bạn tự thấy được:
   - chạy test **cả module** đang sửa, không chỉ test liên quan file vừa đổi (lệnh trong `DECISIONS.md`, mục "Lệnh"); xanh hết;
   - **tự chèn 2–3 lỗi** vào logic chính (đảo điều kiện, bỏ một bước, đổi giá trị), chạy test: phải đỏ. Test vẫn xanh thì làm test chặt hơn (dữ liệu thử phải khác nhau ở những chỗ cần phân biệt). Trả lại code bằng `git -C <worktree> checkout -- <file>`. Ghi ngắn vào bàn giao: lỗi đã chèn, test nào đỏ;
   - bỏ code chết: export, hằng, hàm không còn ai dùng sau khi sửa;
   - trả các file sinh tự động về như cũ (ví dụ file cấu hình dev server ghi lại khi chạy; xem `DECISIONS.md`): `git -C <worktree> status` chỉ còn những file bạn cố ý sửa.
5. **Tự kiểm trên trình duyệt** (việc có giao diện hoặc người dùng thấy được):
   - dùng **cổng cố định** ghi trong `DECISIONS.md` (phiên đăng nhập gắn với cổng). Server đang chạy bản của worktree khác thì tắt nó rồi chạy bản của worktree bạn **đúng cổng đó** (`--strictPort`), chạy nền để không bị treo. Xong thì **để server chạy**, đừng tắt: người sau còn dùng;
   - mở bằng công cụ trình duyệt bạn có (trình duyệt trong ứng dụng Claude, Claude in Chrome, Playwright…; công cụ chưa nạp thì tìm và nạp trước). Trang đòi đăng nhập thì **không tự nhập mật khẩu**: ghi "cần chủ dự án đăng nhập" vào bàn giao và dừng phần trình duyệt;
   - thử **từng tiêu chí** trong `SPEC.md` thuộc việc này, đối chiếu mockup nếu có;
   - ghi vào file việc, mục "Tự kiểm trên trình duyệt", mỗi tiêu chí một dòng: mở đâu, làm gì, thấy gì, đạt hay không. Công cụ lưu được ảnh thì lưu vào `<gốc>/workflow/F-NNN-…/shots/T-xx-<tiêu-chí>.png` và ghi tên file.

   Không có công cụ trình duyệt, hoặc sản phẩm không chạy được (thiếu cấu hình, cần tài khoản…), thì ghi rõ lý do vào bàn giao, đừng ghi "đạt".
6. Commit hết, đặt việc `status: in_test`, `to: <tester>`. Bàn giao ghi: nhánh, danh sách file đã đổi (`git -C <worktree> diff --stat <nhánh chính>...HEAD`), file ngoài `files:` (nếu có), lệnh chạy test.

Không tự nghiệm thu, không sửa `SPEC.md`, không hỏi thẳng chủ dự án (hỏi qua câu hỏi gửi Master). **Không ghi `workflow/.run/*.now`**: file đó là dòng trạng thái của Master; việc bạn đang chờ ai thì ghi trong file việc và `to:`. Không tự mở dev server mới khi Master đã nêu server đang chạy: dùng lại nó.
