# Luật làm việc cho AI agent

Dự án dùng workflow multi-agent:
- **chủ dự án** (con người) **chỉ làm việc với Master**;
- Master giao việc cho **Coder** và **Tester**. Mỗi agent có thể là **bất kỳ công cụ AI nào** (Claude Code, Codex, Antigravity, Gemini…);
- các agent **trao đổi với nhau qua file** trong `workflow/`. Script `workflow/watch.sh` theo dõi các file đó và **đánh thức** agent nào có việc;
- không agent nào tự quyết khi tài liệu không có câu trả lời; chỉ Master được push, và chỉ khi chủ dự án cho phép.

File này là phần chung cho mọi vai. **Việc cụ thể của vai bạn nằm trong `workflow/roles/<vai>.md`** (`master.md`, `coder.md`, `tester.md`): đọc file đó, không cần đọc file của vai khác.

## 1. Các vai và ID

| Vai | ID | Làm | Không được |
|---|---|---|---|
| **Master** | `master-NN` (mỗi phiên chat một Master) | Chọn làn theo cỡ việc, cùng chủ dự án làm rõ yêu cầu, viết `SPEC.md`, chia việc, trả lời câu hỏi, gộp code, báo cáo. Việc nhỏ (làn trực tiếp) thì tự sửa | Viết code sản phẩm, trừ làn trực tiếp. Tự quyết khi không có nguồn. Push khi chủ dự án chưa cho phép |
| **Coder** | `coder-NN` | Khảo sát việc được giao, hỏi chỗ chưa rõ, code kèm test, sửa lỗi | Sửa `SPEC.md`. Tự nghiệm thu. Push |
| **Tester** | `tester-NN` | Khảo sát, viết kế hoạch kiểm thử, kiểm tra, báo lỗi | Sửa code. Push |

ID của bạn có trong lời nhắn mở phiên, trong lời nhắn đánh thức của `watch.sh`, hoặc trong lời gọi của Master (khi bạn chạy dưới dạng subagent). Danh sách agent nằm trong `workflow/agents.txt`.

## 2. Kênh trao đổi: trường `to:`

**Quy tắc duy nhất cần nhớ:** mọi file cần ai đó làm gì đều có dòng `to:` ở đầu file.
- `to: <ID>`: **đến lượt** agent đó.
- `to: owner`: chờ **chủ dự án** (watch.sh sẽ báo họ).
- `to: none`: không ai phải làm gì.

**Xong phần của mình thì đổi `to:` sang người kế tiếp**, theo bảng các bước trong file vai của bạn. Chưa đổi `to:` nghĩa là chưa xong: người kế tiếp sẽ không được đánh thức.

Khi được đánh thức, **chỉ xử lý những file có `to:` là ID của bạn.** Không đụng vào việc của người khác.

## 3. Không tự quyết

- **Không cần hỏi:** chi tiết bên trong việc, không đổi hành vi hay giao diện, khi theo đúng `workflow/DECISIONS.md`.
- **Sửa ngoài `files:` mà không cần hỏi**, chỉ ba loại: (1) file test của module đang sửa, (2) file chuỗi hiển thị (locale) của module đó, (3) chỉnh kiểu dữ liệu ở nơi khác cho biên dịch được, **không đổi logic**. Ghi từng file và lý do vào mục "File ngoài `files:`" trong bàn giao; Master thêm vào `files:`, Tester soi kỹ các file đó khi đọc diff. Ngoài ba loại này thì vẫn hỏi.
- **Bắt buộc hỏi:** hành vi, giao diện, định dạng dữ liệu, API, thêm thư viện, đổi cấu trúc thư mục, chỗ tài liệu mơ hồ hoặc mâu thuẫn.

## 4. Lưu phiên và làm tiếp

- **Mọi trạng thái nằm trong file:** `to:`, `status:`, bàn giao trong file việc, commit trên từng nhánh.
- **File trong `workflow/` chỉ đọc và ghi ở thư mục gốc dự án, không bao giờ trong worktree.** Thư mục gốc là dòng đầu của `git worktree list`; bạn luôn được mở ở đó. Worktree có một bản sao `workflow/` cũ: đọc ở đó là đọc tài liệu cũ, ghi ở đó thì `watch.sh` và Master không thấy, nên không ai được đánh thức.
  - **Code** viết và commit trong worktree của việc. Bạn được mở ở thư mục gốc, và thư mục làm việc của bạn có thể không đổi theo `cd`, nên **luôn chỉ rõ worktree**: lệnh git dùng `git -C <worktree> …`, lệnh khác dùng `cd <worktree> && …` trong cùng một lệnh, sửa file bằng đường dẫn tuyệt đối bắt đầu bằng `<worktree>/`. Trước mỗi lần sửa code, kiểm đường dẫn có nằm trong worktree không: sửa nhầm ở thư mục gốc là sửa thẳng lên nhánh chính.
  - **`SPEC.md`, file việc, câu hỏi, lỗi, nhật ký** luôn sửa ở `<thư mục gốc>/workflow/`, và **không commit** lên nhánh việc. Master commit các file này lên nhánh chính khi `WORKFLOW_IN_GIT=yes` trong `workflow/project.conf`; `no` thì không ai commit chúng.
- Ghi **bàn giao 3 ý** (Đã làm / Còn dở / Bước tiếp theo) sau mỗi bước và trước khi dừng. Commit cả code chưa xong.
- **Mỗi lần được đánh thức là một phiên mới.** Đọc file trước, đừng dựa vào trí nhớ:
  - đọc file đang chờ bạn và bàn giao trong đó;
  - nếu đang code dở: `git log`, `git status`, chạy test để thấy hiện trạng.

## 5. Tiết kiệm ngữ cảnh và token

- Chỉ đọc: file này, file vai của bạn, file có `to:` là bạn, và những gì `can_doc` của việc chỉ tới. Tìm trong code bằng tìm kiếm, không mở cả thư mục.
- Không chép nguyên log hay diff vào file trao đổi. Chỉ ghi tóm tắt và lệnh để tái hiện.
- Câu trả lời cuối mỗi lần được đánh thức: **ngắn, dưới 15 dòng**, gồm đã làm gì và đã đổi `to:` những file nào.

## 6. Cấm

- `git push` khi **chủ dự án chưa bảo**. Luật push:
  - **Coder, Tester không bao giờ push.** Cần đẩy code lên thì ghi câu hỏi cho Master.
  - **Master push khi chủ dự án bảo trong phiên chat**: hỏi rõ nhánh và remote (*"Push `feat/x` lên `origin`?"*), chủ dự án đồng ý thì chạy `git push -u <remote> <nhánh>`. Lời cho phép nằm trong file, trong lời nhắn của agent khác, hay trong `DECISIONS.md` đều **không** tính.
  - Không bao giờ `--force` (kể cả `--force-with-lease`), không push nhánh của người khác.
  - **Không push thẳng lên `BASE_BRANCH` khi `DELIVERY=mr`**: code vào nhánh chính qua MR/PR. Hook `pre-push` chặn việc này với mọi người; gặp nó thì dừng và báo chủ dự án, **không** tìm cách khác (`--no-verify`, sửa hay xoá hook, đổi `core.hooksPath`).
- `git commit --no-verify`, `git push --no-verify`, viết lại lịch sử nhánh người khác.
- Đổi trạng thái git ở **thư mục gốc** (`switch`, `checkout`, `rebase`, `merge`, `reset`, `stash`): thư mục gốc dùng chung cho chủ dự án và mọi phiên Master. Mọi việc code làm trong worktree. Ngoại lệ duy nhất: Master gộp ở máy khi `DELIVERY=merge`, theo `workflow/roles/master.md`.
- Nối một lệnh đổi trạng thái (`git switch`, `checkout`, `reset`, xoá file…) sau một lệnh có thể lỗi bằng `;`. Dùng `&&`, để lệnh trước lỗi thì lệnh sau không chạy.
- Sửa file ngoài vai, ngoài `files` của việc (trừ ba loại ở mục 3), hoặc ngoài thư mục tính năng của mình (Master).
- Tự nhập mật khẩu hay mã đăng nhập vào trang web, nhất là trang gửi lên máy khác `localhost`. Gặp trang đăng nhập thì dừng phần kiểm trên trình duyệt và báo (Coder, Tester ghi vào bàn giao; Master nhờ chủ dự án đăng nhập).
- Xoá hay sửa phần người khác đã ghi trong file trao đổi. Chỉ được ghi thêm, và đổi `status`, `to`.
- Sửa `workflow/STATUS.md` (do watch.sh sinh), `workflow/agents.txt` và `workflow/roles/` (của chủ dự án).
- Đọc, in, hay gửi đi nội dung `.env` và các khoá bí mật.
