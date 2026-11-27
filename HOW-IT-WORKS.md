# Cách hoạt động

## 1. Bài toán

Tôi là developer. Tôi muốn giao việc cho nhiều AI agent, nhưng:
- tôi **chỉ nói chuyện với một agent: Master**;
- Master cùng tôi làm rõ yêu cầu, rồi giao cho các agent khác (Coder, Tester). Các agent này có thể dùng **bất kỳ AI nào**;
- không agent nào tự đoán khi chưa rõ;
- tôi là người quyết định cuối: tính năng xong hay chưa, có push hay không.

## 2. Các vai và cách chúng trao đổi

```
                 ┌─────────────┐
                 │     BẠN     │   chỉ chat với Master · nghiệm thu · push
                 └──────┬──────┘
                        │ chat
                 ┌──────▼──────┐
                 │   MASTER    │   làm rõ, viết tài liệu, chia việc,
                 └──────┬──────┘   trả lời câu hỏi, gộp code
                        │ đọc / ghi file
  ┌─────────────────────▼──────────────────────┐
  │  "Bảng tin" chung: workflow/F-001-…/       │
  │  SPEC.md · tasks/ · questions/ · bugs/     │
  │  mỗi file có dòng  to: <ai đang phải làm>  │
  └─────────▲──────────────────────────▲───────┘
            │ đọc / ghi file           │ đọc / ghi file
      ┌─────┴─────┐              ┌─────┴─────┐
      │   CODER   │              │  TESTER   │   AI bất kỳ: Claude, Codex,
      └─────▲─────┘              └─────▲─────┘   Gemini, Antigravity…
            │ đánh thức                │ đánh thức (hoặc báo bạn)
  ┌─────────┴──────────────────────────┴───────┐
  │  watch.sh: quét file, ai có việc thì gọi   │   không tốn token khi rảnh
  └────────────────────────────────────────────┘
```

**Quy tắc cốt lõi:** mỗi file cần ai đó làm gì đều có dòng **`to:`** ghi tên người đang phải làm. Làm xong phần của mình thì **đổi `to:` sang người kế tiếp**.

**Script `watch.sh`** quét các file đó vài chục giây một lần:
- **Không tốn token**, vì chỉ là script đọc file.
- File chờ một agent chế độ **`subagent`**: script không làm gì, vì **Master tự gọi** agent đó ngay trong phiên chat. Đây là chế độ mặc định, chỉ cần ứng dụng Claude desktop.
- File chờ một agent chế độ **`auto`** (Claude Code, Antigravity, Codex, Gemini dòng lệnh): script mở cho agent đó một phiên mới **chạy ngầm**, kèm danh sách file cần xử lý.
- File chờ một agent chế độ **`window`**: script **mở một cửa sổ terminal mới**, chạy công cụ ở dạng tương tác với lời nhắn gửi sẵn. Bạn thấy agent làm gì và xen vào được.
- File chờ một agent **đánh thức tay** (`manual`, ví dụ ứng dụng Antigravity) hoặc chờ **bạn**: script báo lên màn hình và qua Telegram, chép sẵn lời nhắn vào clipboard.
- Sinh **`STATUS.md`**: bảng ai đang làm gì, ai đang chờ gì.

## 3. Một tính năng đi từ đầu đến cuối

**Trước hết Master chọn làn theo cỡ việc**, nói với bạn một câu rồi làm ngay. Bạn muốn làn khác thì nói.

| Làn | Khi nào | Đi thế nào |
|---|---|---|
| **Trực tiếp** | Bug nhỏ, Jira hoặc mockup rõ, 1–3 file | Master tự sửa trên nhánh riêng, tự kiểm trên trình duyệt, báo cáo nhánh, file, lệnh xem diff. Không tạo file trong `workflow/` |
| **Nhanh** | Vài bug hay việc nhỏ, rõ yêu cầu, nên giao cho Coder | `SPEC.md` ngắn, không chờ duyệt, mỗi bug một việc. Coder code và tự kiểm trên trình duyệt; **Master kiểm thay Tester** |
| **Đủ** | Tính năng mới, nhiều file, chạy song song, rủi ro cao | Đủ các bước dưới đây, có Tester |

Làn đủ:

```
① Bạn + Master làm rõ yêu cầu → Master đối chiếu API với máy chủ thật (nếu có), viết SPEC.md,
   chia việc (chỉ tách việc khi chạy song song được) → bạn nói "duyệt"
② Master giao việc (to: coder-01) → Master gọi Coder (hoặc watch.sh đánh thức) → Coder KHẢO SÁT
③ Chưa rõ → Coder ghi câu hỏi (to: master-01) → Master trả lời nếu có nguồn;
   KHÔNG chắc → câu hỏi chuyển sang to: owner → watch.sh báo bạn → bạn bàn với Master, chốt
④ Rõ hết → Master mở cho làm, chạy sản phẩm ở cổng cố định, bạn đăng nhập một lần
   → Coder code, test cả module, tự chèn lỗi, tự kiểm trên trình duyệt
   → to: tester-01 → Tester kiểm tra: đọc diff, chạy test, chèn lỗi thử bộ test (tối đa ~5 ca),
   chạy sản phẩm trên trình duyệt   ⇄ có lỗi thì to: coder-01 để sửa (Master gửi tiếp cho đúng agent đó)
⑤ Mọi việc đạt → Master gom mỗi việc thành MỘT commit trên nhánh tích hợp F-001/integration,
   chạy toàn bộ test → viết báo cáo: nhánh, file đã đổi, lệnh xem diff, lệnh chạy test, cách thử
   → to: owner → watch.sh báo bạn
⑥ Bạn thử trên bản Master chạy sẵn từ worktree tích hợp → "đạt": Master đưa vào nhánh chính
   (hoặc tạo nhánh feat/… để bạn mở MR, tuỳ workflow/project.conf) → push: bạn tự push, hoặc cho phép Master push
   → MR: tính năng "đã giao, chờ merge" tới khi MR vào nhánh chính thì "xong"   /   "chưa đạt": quay lại ④
```

**Bạn chỉ phải quyết định 3 lần cho mỗi tính năng:**
1. bàn yêu cầu và nói "duyệt";
2. trả lời những câu Master không chắc;
3. nghiệm thu và push.

Ngoài ra, khi `watch.sh` báo có việc chờ Master, bạn nói với Master một câu *"Xử lý việc đang chờ"*. Lý do: Master là phiên bạn đang chat, nên mặc định không chạy tự động. Có thể cho Master tự xử lý cả khi bạn vắng mặt (xem `SETUP.md`, bước 4).

## 4. Mười bốn yêu cầu và cách đáp ứng

| # | Yêu cầu | Cách đáp ứng |
|---|---|---|
| 1 | Master cùng tôi làm rõ, viết tài liệu, chia việc cho cấp 2 | Master hỏi tới khi đủ, viết `SPEC.md` (tiêu chí kiểm được, mục "Cách thử") và các file việc nhỏ |
| 2 | Cấp 2 khảo sát, hỏi chỗ chưa rõ; Master giải quyết; không chắc thì hỏi tôi | Bước ② ③. Mỗi câu hỏi là một file `questions/D-NN.md`, chuyển qua lại bằng `to:` |
| 3 | Rõ mới code; test lỗi thì Coder sửa; đạt thì báo Master, Master báo tôi; tôi quyết và push | Bước ④ ⑤ ⑥. Chỉ Master được push, và chỉ khi bạn bảo trong phiên chat. Coder, Tester không bao giờ push. Khi team gộp code qua MR (`DELIVERY=mr`), hook git `pre-push` chặn mọi người push thẳng lên nhánh chính, với mọi công cụ AI. Push nhánh khác thì dùng `git push` bình thường |
| 4, 11 | Theo dõi mọi agent: trạng thái, việc đang làm | **Trang monitor local** (`sh workflow/watch.sh` mở kèm): văn phòng pixel, mỗi tính năng một dãy bàn (mục 6). Thêm `workflow/STATUS.md` dạng bảng |
| 5, 12 | Thông báo qua Telegram, chỉ một chiều | `watch.sh` gọi `notify.sh` khi có việc chờ bạn hoặc chờ một agent đánh thức tay. Bot chỉ gửi, không nhận lệnh |
| 6 | Không tự quyết theo phán đoán | Mọi câu trả lời phải kèm **nguồn**. Không có nguồn thì chuyển `to: owner` |
| 7 | Mỗi vai có skill riêng | Luật riêng cho từng vai trong `AGENTS.md`. Với Claude Code có thêm file vai trong `.claude/agents/`; skill dùng chung có thể đặt thêm trong `.claude/skills/` |
| 8 | Lưu phiên, agent lỗi thì agent khác làm tiếp | Mọi trạng thái nằm trong file (`to:`, `status:`, bàn giao) và trong commit. Mỗi lần đánh thức là một phiên mới, đọc file là làm tiếp được |
| 9 | Tối ưu context và token | Mục 5 |
| 10 | Tôi chỉ làm việc với Master | Đúng. Các agent khác do Master gọi (chế độ `subagent`) hoặc do `watch.sh` đánh thức (chế độ `auto`); bạn không chat với họ |
| 13 | Chọn AI và model cho từng agent | Mỗi agent một dòng trong `workflow/agents.txt`: chế độ (`subagent`, `auto`, `window`, `manual`), công cụ, model, tài khoản tuỳ bạn. Master chọn agent phù hợp cho từng việc |
| 14 | Nhiều tính năng cùng lúc, không phải chờ | Mỗi tính năng một thư mục. Mỗi phiên chat là một Master (`master-01`); làm song song thì mở thêm phiên `master-02`. Một `watch.sh` đánh thức agent cho mọi tính năng |

## 5. Tối ưu context và token (yêu cầu 9)

| Cách | Tiết kiệm thế nào |
|---|---|
| **Script quét thay cho AI** | Lúc chờ không tốn token. AI chỉ chạy khi thật sự có việc |
| **Mỗi lần đánh thức là một phiên mới, ngắn** | Không phiên nào phình to vì giữ lịch sử dài. Trạng thái được đọc từ file |
| **`AGENTS.md` ngắn, việc từng vai tách riêng** | `AGENTS.md` (công cụ nào cũng tự nạp, có công cụ nạp lại mỗi lượt) chỉ giữ phần chung. Việc riêng nằm trong `workflow/roles/master.md`, `coder.md`, `tester.md`: Coder, Tester chỉ đọc file vai của mình, không đọc phần của Master. Áp dụng cho mọi công cụ, không riêng Claude |
| **Chỉ đọc file có `to:` là mình, cộng những gì `can_doc:` chỉ tới** | Agent không đọc cả dự án |
| **Phiên Master gọn** | Master không đọc code hay log, chỉ đọc tài liệu, câu hỏi và báo cáo ngắn |
| **Model theo việc** | Việc thường giao cho agent dùng model nhanh, rẻ; việc khó giao cho agent dùng model mạnh (khai trong `agents.txt`) |
| **`AGENTS.md` và `workflow/roles/` ổn định** | Ít sửa thì công cụ dùng lại được bộ nhớ đệm prompt, rẻ hơn |
| **Tính năng có sẵn của công cụ** | Claude Code: `/compact`, `/clear`, tắt các máy chủ MCP không dùng (`/mcp`), xem mức dùng bằng `/cost` hoặc `/usage` (tuỳ phiên bản). Antigravity: `--effort low` cho việc nhẹ. Codex: mức suy luận `model_reasoning_effort` |

## 6. Trang monitor

Chạy `sh workflow/watch.sh` (tự mở kèm monitor; cần Node.js 18 trở lên), rồi mở **http://localhost:4300**. Dừng bằng `sh workflow/watch.sh --stop`, khởi động lại bằng `--restart`.

```
┌─ TV · PHÒNG CHỜ ─┬ BẠN ┬─ tủ sách · cây nước · cửa (mở khi có việc chờ bạn) · bảng tính năng ─┐
│ sofa: agent rảnh │ ░░░ │  ┌─ F-001 · Đặt hàng [đang làm] ─────────────┐ ┌─ F-002 · … ─────┐ │
│  (uống nước,     │ ░░░ │  │ [bàn lớn] master-01  [bàn] coder-01 …     │ │ master-02  …    │ │
│   đọc sách…)     │ ░░░ │  └───────────────────────────────────────────┘ └─────────────────┘ │
│                  │ ░░░ │  ┌─ F-003 · Thông báo [đang làm] ────────────────────────────────┐ │
│ bể cá · máy game │ ░░░ │  │ master-02  coder-01  coder-02 …  (dãy dài thì tự xuống hàng)  │ │
│ bi lắc · ổ chó   │ ░░░ │  └───────────────────────────────────────────────────────────────┘ │
└──────────────────┴─────┴─────────────────────────────────────────────────────────────────────┘
```

- **Văn phòng vẽ kiểu hoạt hình, mỗi tính năng một dãy bàn** có thảm màu riêng. Master ngồi bàn lớn đầu dãy, Coder và Tester ở các bàn kế tiếp. Nhiều tính năng thì nhiều dãy; dãy ít người thì hẹp lại, các dãy nhỏ xếp cạnh nhau trên một tầng. Trang rộng hết màn hình: màn càng rộng thì mỗi hàng càng nhiều bàn, nhân vật giữ gần đúng cỡ; cảnh cao hơn cửa sổ thì tự thu nhỏ (và xếp nhiều bàn một hàng hơn) cho vừa, tới một mức nhỏ nhất thì mới phải cuộn; thấp hơn thì sàn kéo dài xuống cho văn phòng chiếm hết chiều cao màn hình. Chú thích các ký hiệu nằm sau nút **❔ CHÚ THÍCH** trên đầu trang (bấm để mở, Esc để đóng). Màn rộng (từ khoảng 1280px) có thêm cột ngoài cùng bên trái: **phòng chờ** (agent rảnh ngồi sofa uống nước, đọc sách, xem điện thoại hay ngủ gật; TV trên tường báo số agent đang chạy, việc chờ bạn, tính năng đã xong) và **góc giải trí** (bể cá, máy game, bi lắc, máy bán nước, ổ chó); màn từ khoảng 1440px thì phòng chờ rộng hơn, 7 chỗ một hàng. Cột trái còn chỗ thì kê thêm hàng sofa (tối đa 3 hàng), rồi lần lượt góc cà phê, bàn bóng bàn và góc đọc sách. Tính năng đã xong rời khỏi văn phòng, chỉ còn tên trên bảng trắng. Master chỉ ra phòng chờ khi thật sự rảnh: không có tính năng nào đang mở, và dòng trạng thái trống, bắt đầu bằng "Rảnh"/"Xong", hoặc nhánh nó nói đã vào nhánh chính (khi đó biển tên ghi "xong · đã merge"). Master còn việc dở mà không thuộc tính năng nào (làn trực tiếp, chờ bạn push hay duyệt MR…) ngồi ở dãy bàn **Làm trực tiếp** trong văn phòng.
- **Bàn của bạn** (biển tên "BẠN") nằm giữa phòng chờ và các phòng ban, có lối đi thảm đỏ chạy thẳng xuống (`░` trong sơ đồ). Có việc chờ bạn thì bong bóng trên đầu bạn hiện `!` kèm số việc; bấm vào bàn để tới mục "Cần bạn". Thỉnh thoảng (một hai phút một lần) bạn rời bàn đi một vòng văn phòng, dừng xem vài chỗ và nói một câu, chó có khi lẽo đẽo theo; bong bóng việc chờ bạn đi theo trên đầu. Phòng có tủ sách, góc pantry, cửa sổ có rèm, poster, cây giữa các bàn và góc nghỉ có sofa ở dưới cùng. Chó, mèo, chuột chạy khắp văn phòng theo các lối đi (sát chân tường, giữa các dãy bàn, hai bên, trước góc nghỉ): chó đi dạo, ra ngồi cạnh bàn bạn hay về ổ ngủ; chuột chui ra từ lỗ chân tường chạy một vòng, mèo rượt theo rồi ngồi canh lỗ; chó đi sát thì mèo giật mình bỏ chạy. Bấm vào chó thì nó chạy tới người gần nhất sủa vòng quanh, người đó giật mình (không có ai gần thì nó chạy vọt ra chỗ xa); bấm vào mèo thì nó nhảy lên bàn gần nhất nằm cạnh bàn phím, người ngồi đó ngừng gõ; bấm vào chuột thì nó chạy thục mạng về hang.
- **Ăn mừng:** một việc vừa kiểm tra đạt (hay xong) thì cả dãy bàn của tính năng đó reo bằng bong bóng chữ, có pháo giấy; một tính năng vừa xong (hay đã giao) thì pháo hoa phủ toàn màn hình chừng 6 giây (bấm bất kỳ đâu để tắt) và cả văn phòng đứng dậy reo. Không có âm thanh. Lần mở trang đầu tiên không ăn mừng những gì đã xong từ trước.
- **Nhân vật ngồi quay lưng nhìn màn hình, hành động theo trạng thái:** màn hình chạy code, tay gõ phím (đang làm), gõ ngón tay (có việc chờ, số trên bong bóng), giơ tay "?" (đang chờ Master trả lời câu hỏi), bọ đỏ trên bàn (có lỗi Tester báo), Master đứng dậy quay lại giơ tờ giấy "!" (chờ bạn), gật gù "z" (rảnh), bóng mờ "?" (ID chưa khai trong `agents.txt`). Master đeo tai nghe, Coder mặc hoodie, Tester mặc áo blouse và có kính lúp trên bàn. Dưới mỗi bàn có biển tên kèm trạng thái ngắn; rê chuột vào ai thì hiện đầy đủ.
- **Nhân vật nói việc thật:** cứ 8–15 giây, một người đang ngồi bàn hiện bong bóng việc mình đang làm (mã và tên việc, như "T-03: Giới hạn số lần thử", hay dòng trạng thái của Master); người ở phòng chờ thỉnh thoảng nói chuyện phiếm.
- **Đã chờ bạn bao lâu:** Master đứng dậy giơ giấy có thêm huy hiệu ⏱ (xanh dưới 30 phút, vàng dưới 2 giờ, đỏ lâu hơn); mục "Cần bạn" ghi rõ "Đã chờ bạn 2 giờ 15 phút (từ 09:30)". Tính từ lần sửa cuối của file đang chờ bạn.
- **Tên trộm:** lâu lâu (5–10 phút một lần) có tên trộm đeo mặt nạ thò đầu nhìn qua cửa sổ; có lúc lẻn qua cửa vào lấy bánh donut trên một bàn rồi chuồn. Chó đang thức mà thấy thì đuổi theo sủa, trộm bỏ chạy. Bấm vào trộm để đuổi nó đi. Chỉ là trò vui, không liên quan gì tới dự án.
- **Chuyển cảnh:** agent rảnh ngồi ở phòng chờ (màn hẹp thì đứng uống nước ở cây nước), được gọi vào việc thì đi bộ về bàn (và ngược lại). Tính năng vừa xong thì bắn pháo giấy ở bảng trắng. Cửa mở nghĩa là có việc chờ bạn; đồng hồ treo tường đứng và đèn tắt nghĩa là `watch.sh` không chạy. Trời ngoài cửa sổ theo giờ thật của máy: ban ngày nắng xanh, 17–19 giờ (và 6–7 giờ sáng) chiều tà màu cam, từ 19 giờ là đêm có trăng sao và đèn tường sáng; xem thử giờ khác bằng cách thêm `?gio=21` vào địa chỉ trang. Hệ điều hành bật "giảm chuyển động" thì không có hoạt hình.
- **Xem thử** không cần dự án: `node workflow/monitor.js --demo --port 4321` (dữ liệu giả trong thư mục tạm, 9 giây đổi một cảnh).
- **Dòng to ở đầu trang:** màu đỏ "ĐANG CHỜ BẠN" kèm việc cần làm và câu cần nói với Master; không chờ bạn thì màu xanh, ghi agent nào đang chạy (kể cả subagent Master đang gọi), từng Master đang mở và đang làm gì (kể cả lúc mới làm rõ yêu cầu, chưa có file nào), và đang đến lượt ai. `watch.sh` không chạy hay chết ngang thì có cảnh báo ở đây và huy hiệu WATCH ở đầu trang.
- **Mục "Cần bạn"** (tô vàng khi có việc): ghi rõ bạn cần làm gì (duyệt, trả lời, nghiệm thu), câu cần nói với Master, và hiện sẵn mục "Cách thử" của tính năng chờ nghiệm thu. Có thêm khung **"Bất thường"** khi `watch.sh` phát hiện việc không ai cầm, `status` và `to` lệch nhau, câu trả lời thiếu `Nguồn:`, file chờ quá lâu, hay agent bị tạm dừng vì đánh thức quá nhiều lần.
- **Bấm vào một agent:** xem file đang chờ nó và log gần nhất. Bấm vào một Master: thêm dòng trạng thái của Master (đã chờ bạn bao lâu), các tính năng nó phụ trách (tiến độ từng việc, câu hỏi và lỗi còn mở, subagent đang chạy) và việc đang chờ bạn kèm câu cần nói.
- **Chỉ đọc**, tự làm mới 3 giây một lần, chỉ mở trên máy bạn. Trang đọc đúng các file mà `watch.sh` đọc, và không cần cài thư viện nào.

**Sau này:** chat với Master và bấm duyệt ngay trên trang (thiết kế trong `specs/phase-3.md`, bản phác trong `internal/mockups/`).

## 7. Chia tài khoản: 2 tài khoản Claude và 1 tài khoản Antigravity

**Bắt đầu (chỉ cần ứng dụng Claude desktop):**

| Agent | Chạy ở đâu | Đánh thức |
|---|---|---|
| Master | Ứng dụng Claude desktop, tài khoản 1 | Bạn chat trực tiếp |
| Coder, Tester | Subagent trong phiên của Master, cùng tài khoản 1 | **Master tự gọi** |
| Tester độc lập (tuỳ chọn) | Antigravity CLI (`agy`), tài khoản Antigravity | **Tự mở cửa sổ** (`window`). Dùng ứng dụng Antigravity thì để `manual`: `watch.sh` chép sẵn lời nhắn, bạn dán |

Ở cách này, Coder và Tester **dùng chung hạn mức** với Master.

**Khi cần tách hạn mức:** cài Claude Code dòng lệnh, đăng nhập tài khoản 2 vào thư mục cấu hình riêng (biến `CLAUDE_CONFIG_DIR`), rồi chuyển Coder sang chế độ `auto`. Coder khi đó chạy bằng tài khoản 2, không ăn vào hạn mức của Master. Cách làm từng bước ở `SETUP.md`, bước 3 và 4.

Tính năng thứ hai làm song song: mở thêm một phiên Master `master-02` (tài khoản 1 hoặc 2). Làm lần lượt thì cứ giao tiếp trong phiên cũ.

---

**Triển khai từng bước:** [SETUP.md](SETUP.md).
