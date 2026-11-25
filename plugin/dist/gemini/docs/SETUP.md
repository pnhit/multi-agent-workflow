# Triển khai

Đưa workflow vào **dự án mới** hoặc **dự án đã có**, từng bước. Muốn hiểu workflow chạy thế nào thì đọc [HOW-IT-WORKS.md](HOW-IT-WORKS.md) trước. Muốn xem một lần dùng thật từ đầu đến cuối thì đọc [EXAMPLE.md](EXAMPLE.md).

## 0. Cần gì

| Cần | Để làm gì |
|---|---|
| **Git**, kèm **Git Bash** nếu dùng Windows | Chạy `watch.sh` và `notify.sh` |
| **Node.js 18 trở lên** (tuỳ chọn) | Chạy trang monitor `monitor.js` |
| **Claude Code**: ứng dụng desktop (tab Code) hoặc bản dòng lệnh | Phiên chat với Master. Master tự gọi Coder, Tester dưới dạng **subagent**, không cần cài thêm gì |
| Công cụ AI **chạy được bằng lệnh** (tuỳ chọn) | Agent tự chạy ngầm (`auto`) hoặc tự mở cửa sổ (`window`), ví dụ Claude Code dòng lệnh (`claude`), Antigravity CLI (`agy`), Codex CLI (`codex`), Gemini CLI (`gemini`) |
| `curl` (tuỳ chọn) | Gửi Telegram. Có sẵn trên Windows 10 trở lên, macOS, Linux |
| Ứng dụng AI chỉ có giao diện, ví dụ ứng dụng Antigravity (tuỳ chọn) | Agent đánh thức tay (`manual`): `watch.sh` chép sẵn lời nhắn vào clipboard, bạn dán |

**Đã có:**
- toàn bộ luồng: Master, khảo sát, hỏi đáp, code, test, báo cáo, nhiều tính năng song song;
- đánh thức tự động;
- `STATUS.md`;
- trang monitor văn phòng pixel (chỉ xem);
- Telegram một chiều.

**Chưa có:** chat với Master và bấm duyệt ngay trên trang web.

## 1. Chép bộ khởi đầu vào dự án

**Cách nhanh: dùng plugin** (lệnh cài đầy đủ ở [plugin/README.md](plugin/README.md), mục "Cài"). Claude Code: `/plugin marketplace add <chủ>/<repo>#v<bản>`, `/plugin install workflow@multi-agent-workflow`, rồi gõ `/workflow:init` trong dự án. Gemini CLI: `gemini extensions install https://github.com/<chủ>/<repo> --ref gemini-v<bản>`, rồi `/workflow:init`. Antigravity: cài từ một bản clone (`agy plugin install <bản clone>/plugin/dist/antigravity`), rồi `/workflow-init`. Lệnh này chép bộ khởi đầu dưới đây vào dự án, file đã có thì giữ nguyên và báo để gộp tay (xem "Dự án đã có" bên dưới). Sau này cập nhật bằng `/workflow:upgrade`. Không dùng plugin thì chạy tay `node plugin/scripts/kit.mjs init` tại thư mục dự án (đường dẫn tới repo này), hoặc chép tay như sau.

Chép **toàn bộ nội dung** thư mục [starter-kit/](starter-kit/) vào **thư mục gốc** dự án:

```
AGENTS.md                  luật chung cho mọi agent, quy tắc to: (Codex tự đọc)
CLAUDE.md                  Claude Code tự đọc: nạp sẵn AGENTS.md (dòng @AGENTS.md), phiên chính là Master
GEMINI.md                  Gemini CLI tự đọc: nạp sẵn AGENTS.md
.gitattributes             giữ script .sh và hook xuống dòng LF
.claude/
  settings.json            quyền cho Claude Code: cho chạy git và lệnh test thường gặp, chặn --force, --no-verify, chặn đọc .env;
                           đăng ký hook chặn đổi nhánh ở thư mục gốc (workflow/hooks/guard-root.cjs)
  agents/                  subagent Coder, Tester mà Master tự gọi
workflow/
  agents.txt               danh sách agent và cách đánh thức (bạn điền ở bước 4)
  project.conf             nhánh chính, cách giao tính năng (gộp ở máy hay MR), workflow có lên git không
  roles/                   việc riêng của từng vai: master.md, coder.md, tester.md
  watch.sh                 theo dõi file, đánh thức agent, sinh STATUS.md
  monitor.js               trang theo dõi local
  notify.sh                gửi Telegram
  hooks/                   hook git chặn push thẳng lên nhánh chính (pre-push) và script cài (install.sh);
                           guard-root.cjs: hook (Claude Code; Gemini CLI, Antigravity qua plugin) chặn agent switch, checkout,
                           rebase, reset, stash, merge ở thư mục gốc (thư mục gốc là của bạn; agent làm trong worktree),
                           và chặn --no-verify, push đè ở mọi nơi
  .gitignore               bỏ qua các file do watch.sh sinh ra và workflow/.env
```

**Điền `workflow/project.conf`** trước khi mở Master:

| Khoá | Mặc định | Đổi khi |
|---|---|---|
| `BASE_BRANCH` | `main` | Nhánh chính của dự án khác, ví dụ `develop` |
| `DELIVERY` | `merge` | Team không cho commit thẳng lên nhánh chính và gộp code qua MR/PR: đặt `mr`. Khi đó nghiệm thu xong, Master tạo nhánh `<MR_PREFIX><tên>` (mặc định `feat/<tên>`) để bạn push và mở MR, thay vì gộp ở máy |
| `WORKFLOW_IN_GIT` | `yes` | Dự án của team, không muốn file workflow lên repo: đặt `no` và làm theo mục "Dự án của team" ngay dưới |

**Cài hook chặn push** (Git Bash trên Windows, tại thư mục dự án):
```bash
sh workflow/hooks/install.sh
```
- Dự án mới, chưa là repo git: chạy lệnh này **sau khi Master `git init`** (Master sẽ nhắc).
- Khi `DELIVERY=mr`: **không ai push thẳng được lên `BASE_BRANCH`** (ví dụ `develop`), dù là bạn hay agent dùng Claude Code, Codex, Gemini hay Antigravity; code vào nhánh chính qua MR/PR. Push nhánh khác (`feat/…`, `fix/…`) dùng `git push` bình thường, không cần cờ gì. Khi `DELIVERY=merge`, hook không chặn gì.
- Hook nằm trong thư mục hook chung nên áp dụng cho mọi worktree. Đã cài bản cũ thì chạy lại lệnh trên để cập nhật.
- **Master** chỉ push khi bạn bảo trong phiên chat: Master hỏi *"Push `feat/x` (2 commit) lên `origin`?"*, bạn đồng ý thì Master chạy `git push -u origin feat/x`. Coder, Tester không bao giờ push. Agent bị cấm dùng `--no-verify`, `--force`.
- Trường hợp khẩn cấp cần push thẳng lên nhánh chính, bạn tự bỏ qua hook bằng `git push --no-verify`. Agent không bao giờ được làm vậy.
- Dự án dùng **husky** (`core.hooksPath` là `.husky/_`): script tự cài vào `.husky/pre-push` và thêm file đó vào `.git/info/exclude`, để hook không bao giờ bị commit rồi chặn push của cả team.
- Dự án đã có hook `pre-push` riêng: script không ghi đè mà in hướng dẫn gộp tay.

**Vì sao không cần gõ "Đọc AGENTS.md":** `CLAUDE.md` và `GEMINI.md` có dòng `@AGENTS.md` (bản Gemini là `@./AGENTS.md`), nên Claude Code và Gemini CLI tự nạp nội dung `AGENTS.md` mỗi khi mở phiên tại thư mục dự án. Codex tự đọc `AGENTS.md`. Công cụ khác không tự đọc thì lời nhắn của `watch.sh` đã có sẵn câu đó.

**Dự án đã có `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.gitattributes` hay `.claude/settings.json` riêng:** đừng ghi đè.
- `AGENTS.md`: đổi tên file của bộ khởi đầu thành `AGENTS-WORKFLOW.md`, rồi thêm vào cuối file cũ dòng `Đọc và làm theo AGENTS-WORKFLOW.md.` Trong `CLAUDE.md` và `GEMINI.md` của bộ khởi đầu, sửa `@AGENTS.md` thành `@AGENTS-WORKFLOW.md`.
- `CLAUDE.md`, `GEMINI.md`, `.gitattributes`: chép nội dung của bộ khởi đầu vào cuối file cũ.
- `.claude/settings.json`: gộp các dòng trong `allow` và `deny` vào file cũ.

### Dự án của team: không đưa file workflow lên repo

Dùng khi repo là của team và bạn chỉ muốn thử workflow trên máy mình (`WORKFLOW_IN_GIT=no`).

1. **Cho git bỏ qua file workflow bằng `.git/info/exclude`**, không sửa `.gitignore`. File này có cú pháp như `.gitignore` nhưng chỉ có tác dụng trên máy bạn, không bao giờ lên repo. Sửa `.gitignore` thì chính thay đổi đó phải commit và push, cả team sẽ thấy.
   ```bash
   printf '
# multi-agent workflow: chỉ trên máy này
/workflow/
/AGENTS.md
/CLAUDE.local.md
/GEMINI.md
/.claude/agents/
' >> .git/info/exclude
   ```
2. **Team đã commit `CLAUDE.md`:** đừng sửa nó. Chép `CLAUDE.md` của bộ khởi đầu thành **`CLAUDE.local.md`**. Claude Code tự nạp `CLAUDE.local.md` ngay sau `CLAUDE.md`, kể cả cho subagent, và dòng `@AGENTS.md` trong đó vẫn có tác dụng.
3. **Team đã commit `.claude/settings.json`:** đừng sửa nó. Gộp `allow`, `deny` và khối `hooks` (hook `guard-root.cjs`) của bộ khởi đầu vào **`.claude/settings.local.json`** (file cá nhân, thường đã bị ignore; nếu chưa thì thêm `/.claude/settings.local.json` vào `.git/info/exclude`). Hook của team và hook của workflow chạy cùng nhau, không đè nhau.
4. Không chép `.gitattributes` của bộ khởi đầu: file workflow không lên git nên không cần.
5. Trong `workflow/project.conf`: `WORKFLOW_IN_GIT=no`, thường kèm `DELIVERY=mr` và `BASE_BRANCH` đúng nhánh của team.
6. Chạy `sh workflow/hooks/install.sh` (tự xử lý husky như trên).
7. Kiểm: `git status --short` **không được** hiện file nào của workflow.

Lưu ý: hook chặn push thẳng lên `BASE_BRANCH` cho **mọi** lần push từ repo này, kể cả việc không liên quan workflow. Muốn tắt thì xoá hook.

**Vì sao trạng thái luôn ghi ở thư mục gốc:** Coder và Tester code, test trong worktree riêng (thư mục `../<tên-dự-án>-wt/…`). Worktree cũng có một bản sao `workflow/`, nhưng đó là bản cũ. Luật trong `AGENTS.md` yêu cầu mọi file trong `workflow/` chỉ được sửa ở thư mục gốc, để `watch.sh` và Master thấy được. Trước khi gộp, Master kiểm tra: nhánh nào lỡ đụng tới `workflow/` thì không gộp.

## 2. Bật Telegram (tuỳ chọn, khoảng 5 phút)

1. Trong Telegram, nhắn **@BotFather** lệnh `/newbot` và đặt tên cho bot. BotFather trả về một **token**. Giữ bí mật token này, không dán vào chat với AI.
2. Mở chat với bot vừa tạo, bấm **Start**, gửi một tin bất kỳ.
3. Trên trình duyệt, mở `https://api.telegram.org/bot<TOKEN>/getUpdates` và tìm `"chat":{"id":…}`. Con số đó là **chat ID**.
4. Tạo file **`workflow/.env`** (`workflow/.gitignore` đã bỏ qua file này). Dự án mà `.env` ở gốc đang được commit lên repo thì **tuyệt đối không** ghi token vào đó:
   ```
   TELEGRAM_BOT_TOKEN=<token>
   TELEGRAM_CHAT_ID=<chat id>
   ```
   Thay cả cụm `<token>` và `<chat id>` bằng giá trị thật, **bỏ luôn dấu `< >`**, không để khoảng trắng. Ví dụ dạng đúng: `TELEGRAM_BOT_TOKEN=123456789:AAH...`, `TELEGRAM_CHAT_ID=987654321`.
5. Thử:
   ```bash
   sh workflow/notify.sh "Thử thông báo"
   ```

## 3. Cài công cụ AI chạy bằng lệnh (tuỳ chọn)

**Bỏ qua bước này** nếu bạn để Coder, Tester ở chế độ `subagent` (mặc định trong `agents.txt`).

Chỉ cần bước này khi muốn agent chạy ở chế độ `auto` (chạy ngầm) hoặc `window` (tự mở cửa sổ): `watch.sh` tự đánh thức nó, kể cả khi bạn không chat với Master, và có thể dùng tài khoản hay công cụ khác. Ứng dụng Claude desktop **không** tạo lệnh này, nên cần cài thêm.

**Claude Code dòng lệnh (lệnh `claude`):**
- Windows, trong PowerShell:
  ```bash
  irm https://claude.ai/install.ps1 | iex
  ```
- macOS, Linux:
  ```bash
  curl -fsSL https://claude.ai/install.sh | bash
  ```
- Kiểm tra bằng `claude --version` và `claude doctor`. Trên Windows, nếu gõ `claude` mà lại mở ứng dụng desktop, xem mục *"Claude Desktop overrides the claude command on Windows"* trong tài liệu khắc phục sự cố cài đặt của Claude Code.

**Dùng tài khoản Claude thứ hai cho agent tự động.** Mỗi thư mục cấu hình (biến `CLAUDE_CONFIG_DIR`) giữ một lần đăng nhập riêng, nên tài khoản thứ hai không đè lên tài khoản bạn đang dùng cho Master. Trong Git Bash:
```bash
CLAUDE_CONFIG_DIR="$HOME/.claude-acc2" claude auth login
```
Đăng nhập tài khoản thứ hai trong trình duyệt, rồi kiểm tra cho chắc đúng tài khoản:
```bash
CLAUDE_CONFIG_DIR="$HOME/.claude-acc2" claude auth status --text
```
Nếu máy có biến môi trường `ANTHROPIC_API_KEY`, Claude Code sẽ dùng khoá đó thay cho tài khoản đã đăng nhập.

**Antigravity CLI (lệnh `agy`)**, dùng tài khoản Antigravity:
- Windows, trong PowerShell:
  ```bash
  irm https://antigravity.google/cli/install.ps1 | iex
  ```
- macOS, Linux:
  ```bash
  curl -fsSL https://antigravity.google/cli/install.sh | bash
  ```
- Kiểm tra bằng `agy --version`. Chạy `agy` một lần ở dạng tương tác để **đăng nhập**: chế độ chạy ngầm dùng lại lần đăng nhập này. Xem danh sách model bằng `agy models`.

**Công cụ khác** (Codex CLI, Gemini CLI…): cài và đăng nhập theo hướng dẫn của công cụ đó.

## 4. Khai báo agent: `workflow/agents.txt`

Mỗi dòng một agent: `<ID> <vai> <chế độ> <lệnh, tên subagent, hoặc ghi chú>`. Có 4 chế độ:

| Chế độ | Ai đánh thức agent | Cần cài thêm | Hợp với |
|---|---|---|---|
| **`subagent`** (mặc định) | **Master tự gọi** ngay trong phiên chat | Không | Bắt đầu nhanh, chỉ có ứng dụng Claude desktop |
| **`auto`** | `watch.sh` tự chạy lệnh, **chạy ngầm**, ghi log | Công cụ AI dòng lệnh (bước 3) | Agent làm cả khi bạn không chat; dùng tài khoản hay công cụ khác |
| **`window`** | `watch.sh` **mở cửa sổ terminal mới**, chạy công cụ ở dạng tương tác với lời nhắn gửi sẵn | Công cụ AI dòng lệnh (bước 3) | Muốn thấy agent làm gì, trả lời được khi nó xin quyền |
| **`manual`** | Bạn mở công cụ và dán lời nhắn `watch.sh` đã chép vào clipboard | Không | Ứng dụng chỉ có giao diện, ví dụ ứng dụng Antigravity |

**Mặc định trong bộ khởi đầu** (chỉ cần ứng dụng Claude desktop):
```
master-01     master  manual    phiên chat chính
master-02     master  manual    phiên chat song song thứ hai
master-03     master  manual    phiên chat song song thứ ba
coder-01      coder   subagent  coder
tester-01     tester  subagent  tester
```
Với chế độ `subagent`, cột cuối là tên file trong `.claude/agents/`: `coder` (model nhanh), `coder-pro` (model mạnh, cho việc khó), `tester` (model mạnh, **khác model** với `coder`).

**Tester nên khác model với Coder.** Hai model giống nhau dễ mù cùng một chỗ, nên subagent `tester` mặc định dùng `opus`, còn `coder` dùng `sonnet`. Tester giờ cũng là người đọc code, nên model mạnh có ích. Đổi lại thì việc kiểm tra tốn hạn mức hơn; muốn tiết kiệm thì sửa `model:` trong `.claude/agents/tester.md`. Việc giao cho `coder-pro` (cũng `opus`) thì tốt nhất có một Tester chạy công cụ khác (Codex, Gemini, Antigravity) ở chế độ `window` hoặc `auto`.

**Ví dụ có thêm công cụ khác:**
```
coder-02      coder   auto      env CLAUDE_CONFIG_DIR=/c/Users/<tên-bạn>/.claude-acc2 claude -p --permission-mode acceptEdits --model sonnet
tester-02     tester  window    agy --model <model> -i
tester-03     tester  manual    Antigravity
```
Lệnh mẫu (kiểm tra lại theo phiên bản bạn cài). Lệnh phải **kết thúc bằng tham số nhận lời nhắn**, vì `watch.sh` thêm lời nhắn vào cuối:

| Công cụ | `auto` (chạy ngầm) | `window` (cửa sổ) |
|---|---|---|
| Claude Code | `claude -p --permission-mode acceptEdits --model sonnet` | `claude --model sonnet` |
| Antigravity CLI | `agy --mode accept-edits --model <model> -p` | `agy --model <model> -i` |
| Codex CLI | `codex exec --sandbox workspace-write` | `codex` |
| Gemini CLI | `gemini --approval-mode auto_edit -p` | `gemini -i` |

- Chọn model rẻ cho việc nhẹ (khảo sát, kiểm tra đơn giản), model mạnh cho việc khó. Antigravity có thêm `--effort low|medium|high`.
- Các chế độ "tự sửa file" ở trên **chưa chắc** cho agent tự chạy lệnh test, git… Ở chế độ `auto` không có ai trả lời khi nó xin quyền, nên nên thử chế độ `window` trước, rồi mới chuyển sang `auto` khi đã cấp đủ quyền cho công cụ đó.
- Cửa sổ của chế độ `window` mở bằng Windows Terminal hoặc mintty (có sẵn trong Git Bash) trên Windows, Terminal trên macOS, `x-terminal-emulator` trên Linux.

**Master** luôn để `manual`, vì bạn đang chat với nó. Khi có việc chờ Master, `watch.sh` báo bạn và bạn nói với Master một câu *"Xử lý việc đang chờ"*.

**Cấp quyền cho agent Claude** (cả `subagent` lẫn `auto`) để nó chạy được lệnh build và test của dự án. `.claude/settings.json` đã cho sẵn các lệnh test thường gặp (`node --test`, `npm test`, `npm run test`, `npm run build`, `pnpm test`, `yarn test`, `pytest`, `go test`, `cargo test`), lệnh chạy sản phẩm để tự kiểm trên trình duyệt (`npm run dev`, `pnpm dev`, `yarn dev`), và `git -C …` (agent được mở ở thư mục gốc nên chạy git trong worktree bằng `git -C <worktree>`). `--no-verify` bị chặn ở mọi dạng, kể cả `git -C <thư mục> push --no-verify`. Dự án dùng lệnh khác thì thêm vào danh sách `allow`, ví dụ `"Bash(./gradlew test:*)"`; lần đầu mở, Master sẽ ghi các lệnh của dự án vào `DECISIONS.md` và đưa bạn đúng dòng cần thêm. Thiếu quyền thì agent `auto` không chạy được test (không có ai bấm cho phép), còn `subagent` thì bạn bị hỏi quyền liên tục. Lệnh nào dự án không dùng thì có thể xoá. `git push` không hỏi lại (Master chỉ push khi bạn bảo); `--force` và `--no-verify` bị chặn. Công cụ khác có cách cấp quyền riêng, xem tài liệu của công cụ đó. Agent `auto` chạy không có người canh, nên chỉ cấp đúng những gì cần.

**Thử một agent `auto` có chạy đúng tài khoản không** (tại thư mục dự án):
```bash
CLAUDE_CONFIG_DIR="$HOME/.claude-acc2" claude -p "Trả lời đúng một chữ: sẵn sàng" --model sonnet
```

## 5. Lần đầu mở Master

Mở Claude Code **tại thư mục dự án** (với ứng dụng desktop: chọn thư mục dự án khi tạo phiên), rồi dán một trong hai lời nhắn sau.

**Dự án mới:**
```text
Bạn là Master. Đây là dự án mới.
Dựng thư mục workflow/ theo workflow/roles/master.md (hỏi tôi trước khi git init).
```

**Dự án đã có code:**
```text
Bạn là Master. Đây là dự án đã có code.
Khảo sát dự án (cấu trúc, cách build, cách chạy test, quy ước đang dùng), chạy test để biết hiện trạng,
ghi những gì tìm được vào workflow/DECISIONS.md. Cho tôi xem trước khi commit.
```

Đọc `workflow/DECISIONS.md`, sửa nếu cần, rồi nói **"duyệt"**. File này là "nguồn" để các agent khỏi phải hỏi những việc nhỏ.

## 6. Chạy `watch.sh` và trang monitor

**Một lệnh cho cả hai:** mở một cửa sổ terminal riêng (Git Bash trên Windows) tại thư mục dự án:
```bash
sh workflow/watch.sh
```
`watch.sh` theo dõi file và **tự mở kèm trang monitor** ở **http://localhost:4300**. Để cửa sổ đó chạy.

| Muốn | Lệnh (ở terminal nào cũng được) |
|---|---|
| Dừng cả watch.sh và monitor | `sh workflow/watch.sh --stop` (hoặc `Ctrl+C` trong cửa sổ của nó) |
| Khởi động lại (dừng bản đang chạy, chạy lại ở terminal này) | `sh workflow/watch.sh --restart` |
| Không mở kèm monitor / đổi cổng | `--no-monitor` / `--port 5000` |

- Chỉ một `watch.sh` chạy được cùng lúc; chạy thêm thì nó báo và dừng.
- **Cập nhật workflow không cần khởi động lại:** `watch.sh` chạy từ một bản sao trong `workflow/.run/`, nên chép đè `watch.sh`, `monitor.js` lúc đang chạy không làm hỏng nó. Thấy file đổi, nó tự nạp bản mới ở lần quét kế tiếp.
- **watch.sh chết ngang** (cửa sổ bị đóng, máy khởi động lại…): nó ghi nhịp tim mỗi lần quét. Monitor chạy **tách khỏi terminal** (trên Windows là một tiến trình riêng), nên vẫn sống khi cửa sổ của `watch.sh` bị đóng, và hiện đỏ *"watch.sh đã dừng bất thường"* cùng huy hiệu **WATCH ĐÃ CHẾT**. Master cũng kiểm nhịp tim mỗi khi nhận yêu cầu và báo bạn. Dừng đàng hoàng (`Ctrl+C`, `--stop`) thì monitor dừng theo.
- **Chạy bền hơn trên Windows** (tự chạy lại khi đăng nhập hay khi máy thức dậy): tạo một tác vụ trong Task Scheduler.
  - Mở Task Scheduler, chọn *Create Task*. Tab *Triggers*: thêm *At log on*, và *On an event* (Log: System, Source: Power-Troubleshooter, Event ID: 1) để chạy khi máy thức dậy.
  - Tab *Actions*: Program là `C:\Program Files\Git\bin\sh.exe` (đường dẫn Git Bash trên máy bạn), Arguments là `-lc "cd /f/Project/<dự-án> && sh workflow/watch.sh --restart"`.
  - `--restart` dừng bản cũ (nếu còn) rồi chạy bản mới, nên chạy lại bao nhiêu lần cũng không bị trùng.
- `--interval 60`: quét mỗi 60 giây (mặc định 30 giây).
- `--once`: quét đúng một lần.
- `--lint`: chỉ liệt kê trạng thái bất thường rồi thoát, không đánh thức ai.
- Mỗi lần đánh thức một agent `auto` hoặc mở cửa sổ cho agent `window` đều có log trong `workflow/logs/`.

**Hàng rào tự động của `watch.sh`:**
- **Giới hạn số lần đánh thức** (`--max-wakes 6`): một agent `auto` hoặc `window` bị đánh thức quá 6 lần trong 1 giờ mà vẫn còn việc thì bị **tạm dừng**, và bạn được báo. Thường là agent bị kẹt: ghi thêm vào file mà không đổi `to:`, nên cứ bị đánh thức lại. Xem log, sửa file nếu cần, rồi cho chạy lại:
  ```bash
  sh workflow/watch.sh --resume coder-03
  ```
- **Giới hạn thời gian chạy** (`--timeout 60`, tính bằng phút): agent `auto` chạy quá lâu thì bị dừng và bạn được báo. Agent kết thúc với lỗi cũng được báo. Trên macOS cần cài `coreutils` để có lệnh `timeout`; không có thì bỏ qua giới hạn này.
- **Kiểm tra bất thường** mỗi lần quét, kết quả ghi vào mục "Bất thường" của `STATUS.md` và trang monitor, báo Telegram khi danh sách thay đổi:
  - việc, câu hỏi, lỗi **không ai cầm** (`to: none` mà chưa xong, không còn câu hỏi nào đang mở);
  - `status` và `to` lệch nhau (ví dụ `in_test` mà `to:` là Coder);
  - `to:` trỏ tới ID không có trong `agents.txt`;
  - câu trả lời thiếu dòng `Nguồn:`;
  - file chờ một agent quá `--stale 24` giờ mà không đổi.

**Trang monitor** (mở kèm `watch.sh`; muốn chạy riêng thì `node workflow/monitor.js`). Gặp cổng 4300 đang bị monitor cũ của dự án chiếm, nó tự dừng bản cũ rồi chạy bản mới.
- **Dòng to ở đầu trang:** đỏ "ĐANG CHỜ BẠN" kèm việc cần làm; xanh khi không chờ bạn, ghi agent nào đang chạy (kể cả subagent Master đang gọi) và đang đến lượt ai.
- **Từng Master đang mở** và đang làm gì, kể cả lúc mới làm rõ yêu cầu, chưa có file nào: Master ghi một dòng vào `workflow/.run/<ID>.now`. Dòng bắt đầu bằng "Chờ bạn:" thì hiện đỏ. Không đổi quá 2 giờ thì ghi "phiên có thể đã đóng".
- **Tình trạng `watch.sh`:** huy hiệu WATCH ✓ / WATCH TẮT / WATCH ĐÃ CHẾT, và cảnh báo trong dòng to khi nó không chạy mà còn việc dở.
- Khu **"Cần bạn"** ngay bên dưới.
- **Văn phòng kiểu hoạt hình:**
  - mỗi tính năng là **một dãy bàn** có thảm màu riêng;
  - Master ngồi bàn lớn đầu dãy, Coder và Tester ở các bàn kế tiếp, ngồi quay lưng nhìn màn hình; dãy dài thì tự xuống hàng;
  - nhìn hành động là biết trạng thái: gõ phím là đang làm, gõ ngón tay là có việc chờ, giơ tay "?" là đang chờ Master trả lời, bọ đỏ trên bàn là có lỗi Tester báo, Master đứng dậy quay lại giơ tờ giấy "!" là chờ bạn, gật gù "z" là rảnh. Dưới mỗi bàn có biển tên kèm trạng thái;
  - agent rảnh đứng uống nước ở cây nước; được gọi vào việc thì đi bộ về bàn;
  - cửa mở nghĩa là có việc chờ bạn; đồng hồ đứng và đèn tắt nghĩa là `watch.sh` không chạy; tính năng vừa xong thì có pháo giấy; chó, mèo, chuột chạy khắp văn phòng: chuột chui ra từ lỗ chân tường, mèo rượt theo, chó đi dạo rồi về ổ ngủ ở góc nghỉ (bấm vào chúng thử xem);
  - bàn "BẠN" ở góc phải là của bạn: có việc chờ bạn thì hiện `!`, bấm vào để tới mục "Cần bạn". Thỉnh thoảng bạn rời bàn đi một vòng văn phòng (chó có khi đi theo) rồi về.
- **Xem thử giao diện** mà không cần dự án: `node workflow/monitor.js --demo --port 4321`. Dữ liệu giả nằm trong thư mục tạm, cứ 9 giây đổi một cảnh (đi bộ, pháo giấy, tắt đèn).
- **Bấm vào một agent** để xem file đang chờ nó và log gần nhất.
- Trang tự làm mới 3 giây một lần, **chỉ đọc**, và chỉ mở trên máy bạn: máy khác trong mạng không vào được.

Không muốn chạy trang web thì mở `workflow/STATUS.md`. Trong VS Code, bản xem trước Markdown (`Ctrl+Shift+V`) tự cập nhật khi file đổi.

## 7. Làm một tính năng

Trong phiên Master, dán:
```text
Tính năng mới: <bạn muốn gì, cho ai, chạy trên đâu, dữ liệu từ đâu>.
Hỏi tôi đến khi đủ để viết tài liệu có tiêu chí kiểm được. Không tự quyết.
Giao việc theo các agent trong workflow/agents.txt.
```

Master **chọn làn theo cỡ việc** trước, nói bạn biết một câu rồi làm ngay (xem `HOW-IT-WORKS.md` mục 3). Bạn muốn chọn trước thì nói luôn trong lời nhắn:
- **làn trực tiếp**, cho bug nhỏ: *"Sửa trực tiếp SG-30027: <link Jira>"*. Master tự sửa trên nhánh riêng và tự kiểm trên trình duyệt, không tạo file trong `workflow/`;
- **làn nhanh**: *"Làn nhanh: SG-30027, SG-30012"*. Không có bước duyệt, Master kiểm thay Tester;
- **làn đủ**: *"Làn đủ: …"*, cho tính năng lớn. Đi đủ các bước dưới đây.

**Kiểm trên trình duyệt.** Coder, Tester (và Master ở làn trực tiếp) tự kiểm trên trình duyệt. Subagent dùng chung công cụ trình duyệt của phiên chính (trình duyệt có sẵn trong ứng dụng Claude, Claude in Chrome), nên dùng chung cả phiên đăng nhập. Để không phải đăng nhập lại nhiều lần:
- Master ghi vào `workflow/DECISIONS.md` mục "Lệnh" một **cổng cố định** và cách chạy bản của một worktree trên đúng cổng đó, ví dụ:
  ```text
  Chạy sản phẩm: pnpm dev --port 5173 --strictPort, mở http://localhost:5173
  Chạy bản của worktree: pnpm --dir <worktree> exec vite --port 5173 --strictPort
  Đăng nhập: chủ dự án tự đăng nhập; agent không nhập mật khẩu
  ```
  Phiên đăng nhập gắn với `localhost:<cổng>`: đổi cổng là mất đăng nhập. `--strictPort` làm server báo lỗi thay vì tự nhảy sang cổng khác.
- Đầu mỗi tính năng có giao diện, Master chạy server và nhờ **bạn đăng nhập một lần**; server chạy tới khi nghiệm thu. Agent **không bao giờ tự nhập mật khẩu**: gặp trang đăng nhập thì chúng dừng và báo.
- Dùng công cụ xem trước của ứng dụng Claude (`.claude/launch.json`) thì đặt `"autoPort": false`, kẻo nó tự đổi cổng khi cổng đang bận. `launch.json` không cho chạy ở thư mục ngoài dự án, nên bản của worktree chạy bằng `pnpm --dir <worktree> …` như trên:
  ```json
  { "version": "0.0.1", "configurations": [
    { "name": "dev", "runtimeExecutable": "pnpm", "runtimeArgs": ["dev", "--port", "5173", "--strictPort"], "port": 5173, "autoPort": false } ] }
  ```

Từ đây (làn đủ; làn nhanh bỏ bước duyệt và khảo sát):

| Khi | Ai làm gì |
|---|---|
| Master hỏi để làm rõ | Bạn trả lời. Đọc `SPEC.md`, rồi nói **"duyệt"** |
| Coder, Tester khảo sát, hỏi, code, test | **Tự chạy**: chế độ `subagent` thì Master tự gọi; `auto` thì `watch.sh` chạy ngầm; `window` thì `watch.sh` mở cửa sổ. Nếu Master dừng giữa chừng, nói *"Tiếp tục"* |
| Có việc chờ Master (`to: master-01`) | `watch.sh` báo. Bạn nói với Master: *"Xử lý việc đang chờ."* |
| Có câu Master không chắc (`to: owner`) | `watch.sh` báo, kể cả qua Telegram. Bạn trả lời Master và bàn tới khi chốt |
| Có việc cho agent `manual` | `watch.sh` báo và chép sẵn lời nhắn vào clipboard. Bạn mở công cụ, dán |
| Có việc mới cho agent `window` mà cửa sổ của nó đang mở | `watch.sh` báo. Bạn gõ vào cửa sổ đó: *"Xử lý việc đang chờ"* |
| Báo cáo xong (`SPEC.md` có `to: owner`) | Báo cáo luôn có: nhánh, danh sách file đã đổi, lệnh xem diff, lệnh chạy test, cách thử. Bạn thử trên server **Master đã chạy sẵn từ worktree tích hợp** (địa chỉ ghi trong báo cáo); xem code thì mở thư mục worktree đó trong trình soạn thảo. Đó đúng là bản sẽ vào `main`, mỗi việc một commit. Rồi nói **"đạt"** hoặc chỉ ra chỗ chưa đạt. Không cần `git switch` ở thư mục dự án: thư mục đó để yên cho bạn và các phiên Master khác |
| Master đã gộp code | Master hỏi có push không. Đồng ý thì Master push; hoặc **bạn tự push:** `git push origin main` (với `DELIVERY=mr` thì push nhánh `feat/…` rồi mở MR) |
| Đã push nhánh MR (`DELIVERY=mr`) | Tính năng ở trạng thái **đã giao, chờ merge** (`delivered`). `watch.sh` tự `git fetch` mỗi 10 phút (`--fetch 10`) và dò nhánh đã merge, kể cả khi nhánh xa đã bị xoá hay MR gộp kiểu squash. Merge rồi thì monitor ghi "đã merge, chờ Master dọn" và **không tính** vào số việc chờ bạn; Master chuyển sang **xong** (`done`) và dọn worktree, nhánh |
| Nhờ Master review MR | Master ghi kết quả vào `workflow/reviews/MR-<số>.md` (commit đã xem, từng điểm và trạng thái). Lần review sau chỉ xem phần mới từ commit đã ghi |

**Lời nhắn cho agent `manual`**, nếu máy không chép được vào clipboard (lời nhắn cũng được lưu ở `workflow/.run/<ID>.prompt`):
```text
Đọc AGENTS.md và workflow/roles/tester.md rồi làm theo. ID của bạn: tester-03. Vai: tester.
Xử lý các file trong workflow/ có dòng "to: tester-03". Xong phần của mình thì đổi to: sang người kế tiếp.
```

## 8. Làm nhiều tính năng cùng lúc

**Làm lần lượt:** tính năng trước xong thì giao tính năng sau **ngay trong phiên Master cũ**. Master vẫn là `master-01`, không cần khai báo gì thêm. Trên trang monitor, tính năng đã xong rời khỏi văn phòng, chỉ còn tên trên bảng trắng.

**Làm song song:** mở thêm một phiên tại cùng thư mục dự án, câu đầu tiên chỉ cần nêu ID và việc:
```text
Bạn là master-02. Tính năng mới: <bạn muốn gì>.
```
- `master-02`, `master-03` đã khai sẵn trong `agents.txt`. Cần phiên thứ tư thì thêm một dòng `master-04`.
- **Nhớ nêu ID.** Quên thì Master thấy đang có tính năng dở của `master-01` và hỏi lại phiên này là ai, chứ không tự nhận `master-01`. Hai phiên cùng ID sẽ cùng xử lý một file và giẫm lên nhau.
- **Mỗi Master một bộ Coder, Tester riêng** (`master-02` dùng `coder-02`, `tester-02`…). Hai Master giao cho cùng `coder-01` thì hai subagent mang chung một ID, monitor và nhật ký lẫn lộn. `agents.txt` khai sẵn `coder-01..03`, `tester-01..03`; thêm Master thì thêm cả Coder, Tester. `watch.sh --lint` báo khi một ID bị dùng chung.
- **Thư mục gốc là của bạn.** Mọi Master làm việc trong worktree riêng (`../<dự-án>-wt/…`), kể cả làn trực tiếp, và không đổi nhánh ở thư mục gốc. Bạn thử bản của tính năng trên server Master đã chạy sẵn từ worktree, xem code bằng cách mở thư mục worktree đó.
- Phần còn lại làm như bước 7.

Một `watch.sh` lo cho mọi tính năng. Phiên mới cũng dùng chung hạn mức tài khoản, nên chỉ mở khi thật sự cần làm song song.

## 9. Khi một phiên bị dừng

- **Agent `subagent`:** nói với Master *"Tiếp tục"*; Master gọi lại subagent, subagent đọc bàn giao rồi làm tiếp.
- **Agent `auto`:** không cần làm gì. Lần tới file của nó thay đổi, nó được đánh thức lại. Nếu `STATUS.md` hoặc trang monitor báo *"đã đánh thức nhưng chưa xử lý xong"*, hãy xem log trong `workflow/logs/`. Nếu agent bị **tạm dừng** (đánh thức quá nhiều lần), xem log rồi chạy `sh workflow/watch.sh --resume <ID>`.
- **Master:** mở phiên mới tại thư mục dự án, dán:
  ```text
  Bạn là master-01, làm tiếp phiên cũ đã dừng.
  Đọc SPEC.md của tính năng đang làm và các file có "to: master-01".
  ```

## 10. Thử nhanh cơ chế đánh thức (không tốn token)

1. Trong `workflow/agents.txt`, thêm dòng:
   ```
   thu-01  coder  auto  echo
   ```
2. Tạo file `workflow/F-001-thu/tasks/T-01.md` với nội dung:
   ```
   ---
   id: T-01
   title: Việc thử
   status: ready
   to: thu-01
   ---
   ```
3. Chạy:
   ```bash
   sh workflow/watch.sh --once
   ```
4. Trong `workflow/logs/` có một file log chứa lời nhắn đánh thức là cơ chế đã chạy đúng. `STATUS.md` sẽ báo *"đã đánh thức nhưng chưa xử lý xong"*: điều này là bình thường, vì `echo` không đổi `to:` như một agent thật.
5. Xoá thư mục `workflow/F-001-thu/`, thư mục `workflow/logs/` và dòng vừa thêm trong `agents.txt`.
