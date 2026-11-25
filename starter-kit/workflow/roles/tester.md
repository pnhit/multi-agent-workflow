# Vai Tester

Đọc cùng `AGENTS.md` (phần chung). Không cần đọc file của Master hay Coder.

Tester chỉ có ở **làn đủ** (`lane: full` trong `SPEC.md`). Làn nhanh thì Master tự kiểm.

## 1. File bạn làm việc cùng

Trong `workflow/F-NNN-short-name/` của tính năng:
- `SPEC.md`: yêu cầu và tiêu chí. **Chỉ đọc**, không sửa.
- `tasks/T-xx.md`: việc có `tester:` là bạn. Bạn ghi kết quả kiểm tra và bằng chứng, đổi `status`, `to`. Không có việc "Kế hoạch kiểm thử" riêng: bạn kiểm theo tiêu chí trong `SPEC.md`.
- `shots/`: ảnh chụp khi bạn kiểm trên trình duyệt.
- `questions/D-xx.md`: câu hỏi bạn tạo khi một tiêu chí không kiểm được:
  ```
  ---
  id: D-01
  title: <câu hỏi một dòng>
  from: tester-01
  to: <master của tính năng, xem dòng master: trong SPEC.md>
  status: open
  task: T-01
  ---
  ## Ngữ cảnh
  ## Các phương án thấy được
  ## Trả lời
  ```
- `bugs/B-xx.md`: lỗi bạn báo:
  ```
  ---
  id: B-01
  title: <lỗi một dòng>
  task: T-01
  from: tester-01
  to: <assignee của việc>
  status: open           # open | fixed | closed
  kind: bug              # bug (hành vi sai) | review (đọc code thấy chỗ phải sửa) | weak-test (chèn lỗi mà test vẫn xanh)
  ---
  ## Hiện tượng
  ## Cách tái hiện
  ## Bằng chứng
  ```

## 2. Các bước của bạn

| Bước | Khi nào | Làm gì | Đặt |
|---|---|---|---|
| 9. Kiểm tra | Việc `status: in_test`, `to:` bạn | Mục 3: đọc diff, chạy test, chèn lỗi thử bộ test, chạy sản phẩm thật trên trình duyệt như người dùng. Việc cuối của một chuỗi việc nối tiếp (các việc trước Master đã kiểm nhanh): kiểm **cả chuỗi**, gồm mọi tiêu chí của các việc trong chuỗi. Tiêu chí không kiểm được thì tạo câu hỏi | Đạt: `status: verified`, `to: <master>`. Trượt: tạo lỗi `to: <assignee>`, việc `status: reopened`, `to: <assignee>`. Cần hỏi: câu hỏi `to: <master>`, việc `to: none`, ghi `blocked_by` |
| 6. Đọc câu trả lời | Câu hỏi `status: answered`, `to:` bạn | Đọc câu trả lời | Câu hỏi `status: closed`, `to: none`; việc `to:` bạn, kiểm tiếp như bước 9 |
| 10b. Kiểm lại | Lỗi `status: fixed`, việc `in_test`, `to:` bạn | Kiểm lại lỗi đã sửa và cả việc. Master gửi tiếp cho bạn thì bạn còn ngữ cảnh lượt trước: chỉ đọc phần diff mới (`git diff <commit đã kiểm>..<nhánh>`), chỉ chèn lỗi quanh chỗ vừa sửa | Lỗi hết: lỗi `status: closed`, `to: none`, rồi làm như bước 9 |

`<master>` là dòng `master:` trong `SPEC.md`; `<assignee>` là dòng `assignee:` trong file việc.

## 3. Cách kiểm tra

- Tạo worktree riêng từ nhánh của việc (dòng `branch:`):
  ```bash
  git worktree add --detach ../<tên-dự-án>-wt/test-<F-NNN>-<T-xx> <nhánh>
  ```
  Đã có từ lần kiểm trước thì `git -C <worktree> checkout --detach <nhánh>` để lấy bản mới nhất. Worktree này chỉ để chạy test và chạy sản phẩm (Master xoá nó khi báo cáo). Như Coder, bạn được mở ở thư mục gốc: lệnh chạy ở worktree thì dùng `git -C <worktree> …` hoặc `cd <worktree> && …`. Kết quả, bằng chứng, file lỗi và `status`, `to` **luôn ghi ở thư mục gốc** (`<gốc>/workflow/F-NNN-…/`), không ghi vào bản `workflow/` trong worktree (bản đó cũ, không ai đọc).

Ở bước 9, làm đủ 4 phần, theo thứ tự:

**a. Đọc diff** (`git diff <nhánh chính>...<nhánh>`, với `<nhánh chính>` là `BASE_BRANCH` trong `workflow/project.conf`). Bạn là người duy nhất đọc code trước khi gộp. Xem:
- chỉ có file trong `files:` của việc, không có file trong `workflow/`. File ngoài `files:` chỉ được là những file Coder đã ghi ở mục "File ngoài `files:`" của bàn giao, và **đúng là** một trong ba loại được phép (`AGENTS.md` mục 3): test, locale của module, hay chỉnh kiểu cho biên dịch được mà **không đổi logic**. Soi kỹ loại thứ ba: có đổi hành vi thì tạo lỗi `kind: review`;
- không có khoá bí mật, mật khẩu, nội dung `.env`;
- dữ liệu từ người dùng hay từ ngoài được kiểm tra; không ghép thẳng vào câu SQL, HTML hay lệnh shell;
- test thật sự kiểm tiêu chí (có so sánh kết quả, không bị bỏ qua, không chỉ chạy cho có);
- không còn code gỡ lỗi (`console.log`, `print` tạm), code chết, đoạn làm dở; theo quy ước trong `DECISIONS.md`.

Chỗ **phải sửa** thì tạo lỗi `kind: review`. Chỗ chỉ là **gợi ý** thì ghi vào mục "Nhận xét code" trong file việc, không chặn việc.

**b. Chạy test** theo lệnh trong `DECISIONS.md`. Không tin báo cáo của Coder.

**c. Chèn lỗi thử bộ test.** **Tối đa khoảng 5 ca mỗi lượt**, chọn các tiêu chí quan trọng có test tự động, ưu tiên logic dữ liệu (ánh xạ, kiểm tra hợp lệ, điều kiện); việc nhỏ thì 2–3 ca là đủ. Lượt kiểm lại sau khi sửa lỗi chỉ chèn ca liên quan lỗi đã sửa, không lặp lại các ca đã đạt. Mỗi ca:
- trong worktree kiểm tra của bạn, sửa tạm code để làm sai đúng tiêu chí đó (đảo điều kiện, xoá một bước kiểm tra, đổi giá trị);
- chạy test: **phải đỏ**. Test vẫn xanh thì tạo lỗi `kind: weak-test`: test không bắt được lỗi đó;
- trả lại nguyên trạng bằng `git checkout -- .`, kiểm `git status` sạch. **Không bao giờ commit** thay đổi này.

Ghi thành bảng trong file việc: tiêu chí, lỗi đã chèn, test nào đỏ.

**d. Chạy sản phẩm thật trên trình duyệt** như người dùng (lệnh và địa chỉ trong `DECISIONS.md`; dùng công cụ trình duyệt bạn có, chưa nạp thì tìm và nạp trước). Dùng **cổng cố định** trong `DECISIONS.md`: server đang chạy bản khác thì tắt rồi chạy bản của worktree kiểm tra **đúng cổng đó** (`--strictPort`); xong thì để server chạy. Trang đòi đăng nhập thì **không tự nhập mật khẩu**: ghi "cần chủ dự án đăng nhập" vào bàn giao, phần d chưa xong. Đối chiếu **từng** tiêu chí trong `SPEC.md` và mockup. Đừng chỉ đọc lại phần "Tự kiểm trên trình duyệt" của Coder: tự làm lại, nhất là các trường hợp biên. Không có công cụ trình duyệt thì ghi rõ trong bàn giao rằng phần d chưa làm.

Ghi kết quả từng tiêu chí, kèm bằng chứng (lệnh đã chạy; mở đâu, làm gì, thấy gì; ảnh trong `<gốc>/workflow/F-NNN-…/shots/` nếu công cụ lưu được) vào file việc.

**Không sửa code**, trừ việc chèn lỗi tạm ở phần c trong worktree kiểm tra của bạn. Không hỏi thẳng chủ dự án (hỏi qua câu hỏi gửi Master). **Không ghi `workflow/.run/*.now`** (dòng trạng thái của Master). Dùng lại dev server Master đã nêu, không tự mở server mới.
