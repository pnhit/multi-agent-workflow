#!/usr/bin/env sh
# watch.sh: theo dõi các file trao đổi trong workflow/, đánh thức agent có việc, sinh STATUS.md.
#
# Dùng:
#   sh workflow/watch.sh                 chạy liên tục, quét 30 giây một lần, mở kèm trang monitor (Ctrl+C để dừng)
#   sh workflow/watch.sh --stop          dừng watch.sh và monitor đang chạy (ở terminal nào cũng được)
#   sh workflow/watch.sh --restart       dừng bản đang chạy rồi chạy lại ở terminal này
#   sh workflow/watch.sh --interval 60   đổi chu kỳ quét
#   sh workflow/watch.sh --once          quét một lần rồi thoát
#   sh workflow/watch.sh --lint          chỉ in các trạng thái bất thường (mã 1 nếu có), không đánh thức ai
#   sh workflow/watch.sh --resume <ID>   cho agent đang bị tạm dừng (vì đánh thức quá nhiều lần) chạy lại
# Tuỳ chọn thêm:
#   --max-wakes 6    số lần đánh thức tối đa cho MỘT agent trong 1 giờ (auto, window); vượt thì tạm dừng
#                    agent đó và báo bạn, để agent bị kẹt không đốt token mãi. 0 = không giới hạn
#   --timeout 60     số phút tối đa cho một lần chạy agent auto; quá thì dừng nó và báo. 0 = không giới hạn
#   --stale 24       số giờ một file chờ agent mà không đổi thì báo là bất thường. 0 = không kiểm
#   --port 4300      cổng của trang monitor
#   --no-monitor     không mở kèm monitor
#   --fetch 10       cứ bao nhiêu phút thì `git fetch` một lần (để biết MR nào đã merge). 0 = không fetch.
#                    Chỉ watch.sh fetch theo lịch: nhiều phiên cùng fetch trên Windows dễ va nhau
#
# Chạy liên tục thì watch.sh:
#   - chỉ cho một bản chạy cùng lúc (ghi .run/watch.pid);
#   - ghi nhịp tim vào .run/watch.beat mỗi vòng quét; monitor báo đỏ khi nhịp tim cũ (watch.sh chết ngang);
#   - chạy từ bản sao .run/watch.run.sh, nên chép đè workflow/watch.sh lúc đang chạy không làm hỏng nó;
#     thấy watch.sh hay monitor.js đổi thì tự nạp lại bản mới, không cần khởi động lại.
#
# Quy tắc: file nào có dòng `to: <ID>` ở đầu là đang chờ agent đó.
#   - Agent "auto" trong agents.txt: chạy lệnh đánh thức (một phiên mới, không tương tác, chạy ngầm).
#   - Agent "window": mở một cửa sổ terminal mới, chạy công cụ ở dạng tương tác với lời nhắn gửi sẵn.
#     Cửa sổ còn mở mà có việc mới thì không mở thêm, chỉ báo.
#   - Agent "manual": báo ra màn hình và qua Telegram (nếu đã cấu hình), chép sẵn lời nhắn vào clipboard.
#   - Agent "subagent": không làm gì; Master tự gọi subagent đó trong phiên chat của nó.
#   - `to: owner`: báo chủ dự án.
# Script không tốn token khi không có việc: chỉ đọc file và so sánh.
# Một agent chỉ được đánh thức lại khi các file chờ nó THAY ĐỔI, để tránh vòng lặp.

set -u
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
W="$ROOT/workflow"
RUN="$W/.run"
LOGS="$W/logs"
AGENTS="$W/agents.txt"
INTERVAL=30
ONCE=0
LINT=0
RESUME=""
MAXWAKES=6
TIMEOUT=60
STALE=24
PORT=4300
FETCH=10
NOMON=0
STOP=0
RESTART=0
PASS_ARGS=""   # tham số để tự chạy lại (giá trị không có khoảng trắng), bỏ --restart, --stop

need_num() { case "${2:-}" in ''|*[!0-9]*) echo "$1 cần một số nguyên"; exit 1 ;; esac; }
while [ $# -gt 0 ]; do
  case "$1" in
    --once) ONCE=1 ;;
    --lint) LINT=1 ;;
    --interval) need_num "$1" "${2:-}"; shift; INTERVAL="$1" ;;
    --max-wakes) need_num "$1" "${2:-}"; shift; MAXWAKES="$1" ;;
    --timeout) need_num "$1" "${2:-}"; shift; TIMEOUT="$1" ;;
    --stale) need_num "$1" "${2:-}"; shift; STALE="$1" ;;
    --resume) [ -n "${2:-}" ] || { echo "--resume cần ID agent"; exit 1; }; shift; RESUME="$1" ;;
    --port) need_num "$1" "${2:-}"; shift; PORT="$1" ;;
    --fetch) need_num "$1" "${2:-}"; shift; FETCH="$1" ;;
    --no-monitor) NOMON=1 ;;
    --stop) STOP=1 ;;
    --restart) RESTART=1 ;;
    *) echo "Tham số không hiểu: $1"; exit 1 ;;
  esac
  shift
done
PASS_ARGS="--interval $INTERVAL --max-wakes $MAXWAKES --timeout $TIMEOUT --stale $STALE --port $PORT --fetch $FETCH"
[ "$NOMON" = 1 ] && PASS_ARGS="$PASS_ARGS --no-monitor"

[ -f "$AGENTS" ] || { echo "Thiếu $AGENTS. Xem SETUP.md."; exit 1; }
mkdir -p "$RUN" "$LOGS"

if [ -n "$RESUME" ]; then
  rm -f "$RUN/$RESUME.paused" "$RUN/$RESUME.wakes" "$RUN/$RESUME.sig"
  echo "Đã cho $RESUME chạy lại. watch.sh sẽ đánh thức nó ở lần quét tới nếu còn việc chờ."
  exit 0
fi

# Lệnh timeout kiểu GNU (Git Bash, Linux có sẵn; macOS cần coreutils). Trên Windows, timeout.exe của
# hệ thống có cú pháp khác nên thử chạy một lần để chắc đúng loại.
HAS_TIMEOUT=0
timeout 5 true >/dev/null 2>&1 && HAS_TIMEOUT=1

say() { echo "[$(date '+%H:%M:%S')] $*"; }

# running <id>: agent đang chạy thật (tiến trình ghi trong file .pid còn sống)
running() { [ -f "$RUN/$1.pid" ] && kill -0 "$(cat "$RUN/$1.pid" 2>/dev/null)" 2>/dev/null; }

notify() {
  if [ -f "$W/notify.sh" ]; then sh "$W/notify.sh" "$1" >/dev/null 2>&1; fi
  say "THÔNG BÁO: $1"
}

# fm <file> <khoá>: đọc một khoá trong phần đầu file (giữa hai dòng ---).
# "#" chỉ là chú thích khi có khoảng trắng ở cả hai bên ("status: review  # review | …"), nên "Sửa lỗi #123" giữ nguyên;
# bỏ một cặp ngoặc "…" hay '…' bao quanh giá trị.
# Cùng quy tắc với frontmatter() trong monitor.js.
fm() {
  awk -v k="$2" '
    NR==1 && $0 !~ /^---/ { exit }
    /^---/ { c++; if (c==2) exit; next }
    c==1 && index($0, k ":")==1 {
      v = substr($0, length(k)+2); sub(/[ \t]#([ \t].*)?$/, "", v); gsub(/^[ \t]+|[ \t\r]+$/, "", v)
      if (length(v) >= 2 && (v ~ /^".*"$/ || v ~ /^\047.*\047$/)) v = substr(v, 2, length(v) - 2)
      print v; exit
    }' "$1"
}

# job_of <danh sách file>: "F-001 T-01, F-001 B-02" để monitor biết agent đang chạy cho tính năng nào
job_of() {
  echo "$1" | sed -n 's#^\(F-[0-9][0-9]*\)[^/]*/[a-z]*/\([^/]*\)\.md$#\1 \2#p' | awk 'NF { printf "%s%s", (n++ ? ", " : ""), $0 }'
}

# owner_lines <dòng scan có to: owner>: mỗi dòng nói rõ chủ dự án cần làm gì
owner_lines() {
  echo "$1" | awk -F'|' '{
    f = $3; if (match(f, /^F-[0-9]+/)) f = substr(f, 1, RLENGTH)
    if ($3 ~ /\/SPEC\.md$/ && $2 == "acceptance") a = "Xong, chờ bạn nghiệm thu (thử rồi nói \"đạt\" với Master)"
    else if ($3 ~ /\/SPEC\.md$/) a = "Tài liệu chờ bạn duyệt (đọc rồi nói \"duyệt\" với Master)"
    else if ($3 ~ /\/questions\//) a = "Câu hỏi chờ bạn trả lời (Master sẽ hỏi trong phiên chat)"
    else a = "Cần bạn xem"
    printf "- [%s] %s: %s (`%s`)\n", f, a, $4, $3
  }'
}

# Liệt kê mọi file trao đổi: <to>|<status>|<đường dẫn tương đối>|<tiêu đề>
scan() {
  for f in "$W"/F-*/SPEC.md "$W"/F-*/tasks/*.md "$W"/F-*/questions/*.md "$W"/F-*/bugs/*.md; do
    [ -f "$f" ] || continue
    to=$(fm "$f" to); st=$(fm "$f" status); ti=$(fm "$f" title)
    [ -n "$to" ] || to="none"
    echo "$to|$st|${f#$W/}|$ti"
  done
}

# wake_count <id>: số lần agent được đánh thức trong 1 giờ qua (bỏ các mốc cũ hơn)
wake_count() {
  f="$RUN/$1.wakes"
  [ -f "$f" ] || { echo 0; return; }
  awk -v n="$(date +%s)" '$1 > n - 3600' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  grep -c . "$f"
}

# has_open_question <thư mục tính năng> <giá trị blocked_by>: còn câu hỏi nào chưa closed không
has_open_question() {
  for d in $(echo "$2" | tr -d '[]"' | tr ',' ' '); do
    for q in "$1/questions/$d.md" "$1/questions/$d"-*.md; do
      [ -f "$q" ] || continue
      [ "$(fm "$q" status)" != "closed" ] && return 0
    done
  done
  return 1
}

BASE=$(sed -n 's/^BASE_BRANCH=//p' "$W/project.conf" 2>/dev/null | tail -n 1 | tr -d '\r" ')
[ -n "$BASE" ] || BASE=main

# is_merged <nhánh>: in "yes" khi nhánh đã vào nhánh chính, "no" khi chưa, không in gì khi không tìm thấy nhánh.
# Xét nhánh ở máy trước rồi tới nhánh xa: GitLab, GitHub thường xoá nhánh xa sau khi merge, nhánh ở máy còn lại.
#   - gộp bằng merge commit: đầu nhánh nằm trong nhánh chính, nhưng không nằm trên dòng cha thứ nhất của nó
#     (nhánh vừa tạo, chưa có commit nào, cũng "nằm trong" nhánh chính nhưng là chưa merge);
#   - gộp kiểu squash: nhánh có commit riêng, nhưng gộp thử (ảo) nhánh vào nhánh chính thì nhánh chính không đổi gì:
#     mọi thay đổi của nhánh đã có trong đó. `git merge-tree --write-tree` (git 2.38+); git cũ hơn thì dùng
#     `git cherry` (chỉ nhận ra khi squash từ đúng một commit).
is_merged() {
  for r in "refs/heads/$1" "refs/remotes/origin/$1"; do
    git -C "$ROOT" rev-parse -q --verify "$r" >/dev/null 2>&1 || continue
    for t in "refs/remotes/origin/$BASE" "refs/heads/$BASE"; do
      git -C "$ROOT" rev-parse -q --verify "$t" >/dev/null 2>&1 || continue
      tip=$(git -C "$ROOT" rev-parse "$r")
      if git -C "$ROOT" merge-base --is-ancestor "$r" "$t" 2>/dev/null; then
        if git -C "$ROOT" rev-list --first-parent --max-count=20000 "$t" | grep -qx "$tip"; then echo no; else echo yes; fi
        return
      fi
      if [ "$(git -C "$ROOT" rev-list --count "$t..$r" 2>/dev/null)" -gt 0 ]; then
        mt=$(git -C "$ROOT" merge-tree --write-tree "$t" "$r" 2>/dev/null | head -n 1)
        if [ -n "$mt" ]; then
          [ "$mt" = "$(git -C "$ROOT" rev-parse "$t^{tree}")" ] && { echo yes; return; }
        elif ! git -C "$ROOT" cherry "$t" "$r" 2>/dev/null | grep -q '^+'; then echo yes; return
        fi
      fi
      echo no; return
    done
    echo no; return
  done
}

# branches_in <văn bản>: các tên nhánh có thật (ở máy hay nhánh xa) xuất hiện trong văn bản, mỗi dòng một tên
branches_in() {
  printf '%s\n' "$1" | grep -oE '[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)+' | sort -u | while read -r b; do
    b=${b%.}
    git -C "$ROOT" rev-parse -q --verify "refs/heads/$b" >/dev/null 2>&1 || \
      git -C "$ROOT" rev-parse -q --verify "refs/remotes/origin/$b" >/dev/null 2>&1 || continue
    echo "$b"
  done
}

# merged_scan: nhánh giao hàng (dòng delivery: của SPEC.md đang delivered) và nhánh nêu trong dòng .now của Master
# đã vào nhánh chính. Ghi .run/merged.txt cho monitor: "spec <F-NNN> <nhánh> <master>" hay "now <master> <nhánh>"
merged_scan() {
  for fd in "$W"/F-*/; do
    s="$fd/SPEC.md"; [ -f "$s" ] || continue
    [ "$(fm "$s" status)" = delivered ] || continue
    b=$(fm "$s" delivery); [ -n "$b" ] || continue
    [ "$(is_merged "$b")" = yes ] && echo "spec $(fm "$s" id) $b $(fm "$s" master)"
  done
  for nf in "$RUN"/*.now; do
    [ -f "$nf" ] || continue
    id=$(basename "$nf" .now); txt=$(head -n 1 "$nf" | tr -d '\r'); [ -n "$txt" ] || continue
    branches_in "$txt" | while read -r b; do
      [ "$(is_merged "$b")" = yes ] && echo "now $id $b"
    done
  done
}

# lint: in các trạng thái bất thường, mỗi dòng một chỗ (không in gì là ổn).
# Cách chuyền lượt bằng to: hỏng nhất ở chỗ một việc không còn ai cầm; hàm này tìm những chỗ đó.
lint() {
  ids=" owner none $(grep -v '^[[:space:]]*#' "$AGENTS" | awk 'NF {printf "%s ", $1}')"
  masters=" $(grep -v '^[[:space:]]*#' "$AGENTS" | awk '$2 == "master" {printf "%s ", $1}')"
  base=$BASE
  busy=""   # "<agent> <master> <tính năng>" của các việc đang chờ agent làm, để tìm ID dùng chung giữa các Master
  for fd in "$W"/F-*/; do
    [ -d "$fd" ] || continue
    fd=${fd%/}
    sst=""; fmaster=""
    [ -f "$fd/SPEC.md" ] && { sst=$(fm "$fd/SPEC.md" status); fmaster=$(fm "$fd/SPEC.md" master); }
    if [ -f "$fd/SPEC.md" ]; then
      # Tính năng đã giao: nhánh giao hàng đã merge thì Master đặt done và dọn
      if [ "$sst" = delivered ]; then
        b=$(fm "$fd/SPEC.md" delivery)
        if [ -z "$b" ]; then echo "\`$(basename "$fd")/SPEC.md\`: delivered mà chưa có dòng delivery: <nhánh giao hàng>, không dò được MR đã merge chưa"
        elif [ "$(is_merged "$b")" = yes ]; then echo "\`$(basename "$fd")/SPEC.md\`: $b đã merge vào $base: ${fmaster:-Master} đặt status: done và dọn worktree, nhánh"
        fi
      fi
      # Việc treo: "- chờ <nhánh>: <việc>" trong mục "## Việc treo" của SPEC.md; nhánh đã vào nhánh chính thì tới lúc làm
      awk '/^## +Việc treo/ { f = 1; next } /^## / { f = 0 } f && /^[-*] *chờ +[^ :]+ *:/' "$fd/SPEC.md" | while IFS= read -r line; do
        b=$(printf '%s' "$line" | sed 's/^[-*] *chờ *\([^ :]*\) *:.*/\1/')
        if [ "$(is_merged "$b")" = yes ]; then
          echo "\`$(basename "$fd")/SPEC.md\`: việc treo tới lúc làm, $b đã vào $base: $(printf '%s' "$line" | sed 's/^[-*] *//' | tr -d '\r')"
        fi
      done
    fi
    for f in "$fd/SPEC.md" "$fd"/tasks/*.md "$fd"/questions/*.md "$fd"/bugs/*.md; do
      [ -f "$f" ] || continue
      rel=${f#$W/}
      to=$(fm "$f" to); [ -n "$to" ] || to="none"
      st=$(fm "$f" status)
      # Người được giao (assignee, tester, master) phải có trong agents.txt, kể cả khi chưa đến lượt họ:
      # bắt lỗi ngay lúc Master viết file việc, trước khi to: chuyển tới một ID không ai đánh thức được
      for k in assignee tester master; do
        v=$(fm "$f" "$k")
        [ -n "$v" ] || continue
        case "$ids" in *" $v "*) ;; *) echo "\`$rel\`: $k: $v không có trong agents.txt" ;; esac
      done
      case "$ids" in
        *" $to "*) ;;
        *) echo "\`$rel\`: to: $to không có trong agents.txt"; continue ;;
      esac
      # Tính năng đang viết tài liệu, đã giao (chờ MR merge) hay đã xong: chỉ kiểm ID
      case "$sst" in draft|done|delivered) continue ;; esac
      case "$rel" in
        */tasks/*)
          case "$st" in ready|in_progress|reopened) [ "$to" != "none" ] && busy="$busy$to ${fmaster:-?} $(basename "$fd")
" ;; esac
          if [ "$to" = "none" ]; then
            case "$st" in
              review|reviewed|ready|in_progress|in_test|reopened)
                # Việc "Kế hoạch kiểm thử" (kind: test-plan) của tính năng tạo trước khi bỏ loại việc này: bình thường
                if [ "$st" = "reviewed" ] && [ "$(fm "$f" kind)" = "test-plan" ]; then :
                elif ! has_open_question "$fd" "$(fm "$f" blocked_by)"; then
                  echo "\`$rel\`: không ai cầm (status: $st, to: none, không còn câu hỏi nào đang mở)"
                fi ;;
            esac
          else
            want=""
            case "$st" in
              in_test) want=$(fm "$f" tester) ;;
              ready|in_progress|reopened) want=$(fm "$f" assignee) ;;
            esac
            [ -n "$want" ] && [ "$to" != "$want" ] && echo "\`$rel\`: status: $st nhưng to: $to (lẽ ra là $want)"
          fi ;;
        */questions/*)
          case "$st" in open|answered) [ "$to" = "none" ] && echo "\`$rel\`: câu hỏi $st mà to: none, không ai cầm" ;; esac
          case "$st" in
            answered|closed)
              grep -qE '^[-*> ]*[*_]*(Nguồn|NGUỒN|nguồn)[*_]*[[:space:]]*:' "$f" || echo "\`$rel\`: câu trả lời chưa có dòng \"Nguồn:\"" ;;
          esac ;;
        */bugs/*)
          case "$st" in open|fixed) [ "$to" = "none" ] && echo "\`$rel\`: lỗi $st mà to: none, không ai cầm" ;; esac ;;
      esac
      if [ "$STALE" -gt 0 ] && [ "$to" != "none" ] && [ "$to" != "owner" ] && [ -n "$(find "$f" -mmin +$((STALE * 60)) 2>/dev/null)" ]; then
        echo "\`$rel\`: chờ $to đã hơn $STALE giờ mà không đổi"
      fi
    done
  done
  # Một ID có việc dở ở tính năng của hai Master khác nhau: hai phiên sẽ cùng gọi một ID, giẫm lên nhau
  printf '%s' "$busy" | awk 'NF == 3 { k = $1 SUBSEP $2; if (!(k in seen)) { seen[k] = 1; n[$1]++; ms[$1] = ms[$1] " " $2 } fs[$1] = fs[$1] " " $3 }
    END { for (a in n) if (n[a] > 1) printf "%s|%s|%s\n", a, ms[a], fs[a] }' | while IFS='|' read -r a ms fs; do
    echo "\`agents.txt\`: $a đang có việc dở ở nhiều Master ($(echo $ms | tr ' ' ','): $(echo $fs | tr ' ' ',')). Mỗi ID chỉ làm cho một Master một lúc: giao cho ID khác"
  done
  # Dòng .now: chỉ Master ghi; dòng của Master nói về nhánh đã merge thì đã cũ
  for nf in "$RUN"/*.now; do
    [ -f "$nf" ] || continue
    id=$(basename "$nf" .now); txt=$(head -n 1 "$nf" | tr -d '\r'); [ -n "$txt" ] || continue
    case "$masters" in
      *" $id "*)
        branches_in "$txt" | while read -r b; do
          [ "$(is_merged "$b")" = yes ] && echo "\`.run/$id.now\`: nói về $b, nhánh này đã merge vào $base: dòng trạng thái đã cũ, $id dọn và cập nhật"
        done ;;
      *) echo "\`.run/$id.now\`: chỉ Master ghi .now ($id không phải Master trong agents.txt); việc đang chờ ghi vào file việc và to:" ;;
    esac
  done
  # .hist: giờ xong trước giờ bắt đầu (ghi theo trí nhớ thay vì lấy giờ thật)
  for hf in "$RUN"/*.hist; do
    [ -f "$hf" ] || continue
    awk -v f="$(basename "$hf")" 'NF >= 2 && $2 < $1 { printf "`.run/%s`: dòng %d có giờ xong (%s) trước giờ bắt đầu (%s); lấy giờ thật bằng date khi ghi\n", f, NR, $2, $1 }' "$hf" | head -n 3
  done
  # Subagent của Claude Code: giá trị trong phần đầu file có ": " hay " #" mà không đặt trong ngoặc kép thì YAML
  # hỏng, Claude Code lặng lẽ bỏ qua cả agent đó và Master không gọi được
  for af in "$ROOT"/.claude/agents/*.md; do
    [ -f "$af" ] || continue
    if awk 'NR==1 { next } /^---/ { exit } { v = $0; sub(/^[A-Za-z_]+:[ \t]*/, "", v); sub(/\r$/, "", v)
          if (v !~ /^".*"$/ && (v ~ /: / || v ~ / #/)) { bad = 1; exit } } END { exit !bad }' "$af"; then
      echo "\`.claude/agents/$(basename "$af")\`: phần đầu file có \": \" trong một giá trị mà không đặt trong ngoặc kép, Claude Code sẽ bỏ qua subagent này"
    fi
  done
}

# Chữ ký nội dung của một danh sách file (để biết có gì thay đổi)
sig_of() {
  [ -n "$1" ] || { echo "empty"; return; }
  # shellcheck disable=SC2086
  (cd "$W" && echo "$1" && cat $1) | cksum | awk '{print $1}'
}

# make_prompt <id> <vai> <danh sách file>: lời nhắn cho agent, chỉ trỏ tới đúng file cần đọc
make_prompt() {
  list=$(echo $3)   # gộp các dòng thành một dòng, cách nhau một khoảng trắng
  if [ "$2" = "master" ]; then
    echo "Xử lý việc đang chờ (to: $1): $list"
  else
    echo "Đọc AGENTS.md và workflow/roles/$2.md rồi làm theo. ID của bạn: $1. Vai: $2. Các file đang chờ bạn (to: $1): $list. Chỉ xử lý những file đó. File trong workflow/ luôn sửa ở thư mục bạn đang được mở (thư mục gốc dự án), không sửa bản trong worktree. Xong phần của mình thì đổi to: sang người kế tiếp. Trả lời ngắn."
  fi
}

# to_clipboard: chép stdin vào clipboard nếu máy có công cụ phù hợp (Windows, macOS, Linux)
to_clipboard() {
  if command -v clip.exe >/dev/null 2>&1 && command -v iconv >/dev/null 2>&1; then
    # clip.exe chỉ hiểu đúng tiếng Việt khi nhận UTF-16LE
    iconv -f UTF-8 -t UTF-16LE | clip.exe
  elif command -v pbcopy >/dev/null 2>&1; then pbcopy
  elif command -v wl-copy >/dev/null 2>&1; then wl-copy
  elif command -v xclip >/dev/null 2>&1; then xclip -selection clipboard
  else cat >/dev/null; return 1
  fi
}

# open_window <id> <vai> <lệnh> <danh sách file>: mở cửa sổ terminal mới chạy công cụ ở dạng tương tác
open_window() {
  id="$1"; role="$2"; cmd="$3"; files="$4"
  make_prompt "$id" "$role" "$files" > "$RUN/$id.prompt"
  log="$LOGS/$(date '+%Y%m%d-%H%M%S')-$id.log"
  launcher="$RUN/$id.window.sh"
  cat > "$launcher" <<EOF
#!/usr/bin/env sh
# Do watch.sh sinh để mở cửa sổ cho $id. Đừng sửa tay.
cd "$ROOT" || exit 1
echo \$\$ > "$RUN/$id.pid"
echo "[mở cửa sổ \$(date '+%H:%M:%S'), lệnh: $cmd]" > "$log"
printf '\033]0;%s\007' "$id ($role)"
echo "== $id ($role) == Cửa sổ do watch.sh mở. Lời nhắn đã gửi sẵn cho công cụ."
$cmd "\$(cat "$RUN/$id.prompt")"
code=\$?
echo "[kết thúc, mã \$code]" >> "$log"
rm -f "$RUN/$id.pid"
echo
echo "Công cụ đã thoát (mã \$code). Bấm Enter để đóng cửa sổ."
read -r _
EOF
  if command -v wt.exe >/dev/null 2>&1 && command -v cygpath >/dev/null 2>&1; then
    # Windows Terminal: chạy Git Bash trong một cửa sổ mới
    wt.exe -w new nt --title "$id" "$(cygpath -w /)\\bin\\bash.exe" --login "$(cygpath -w "$launcher")" >/dev/null 2>&1 &
  elif command -v mintty >/dev/null 2>&1; then
    mintty -t "$id" /bin/sh "$launcher" >/dev/null 2>&1 &
  elif command -v osascript >/dev/null 2>&1; then
    osascript -e "tell application \"Terminal\" to do script \"sh '$launcher'\"" >/dev/null 2>&1
  elif command -v x-terminal-emulator >/dev/null 2>&1; then
    x-terminal-emulator -e sh "$launcher" >/dev/null 2>&1 &
  else
    notify "Không mở được cửa sổ cho $id: máy không có Windows Terminal, mintty, Terminal (macOS) hay x-terminal-emulator. Chạy tay: sh $launcher"
    return
  fi
  say "Mở cửa sổ cho $id ($role)."
}

wake() { # wake <id> <vai> <lệnh> <danh sách file>
  id="$1"; role="$2"; cmd="$3"; files="$4"
  prompt=$(make_prompt "$id" "$role" "$files")
  log="$LOGS/$(date '+%Y%m%d-%H%M%S')-$id.log"
  tcmd=""
  [ "$TIMEOUT" -gt 0 ] && [ "$HAS_TIMEOUT" = 1 ] && tcmd="timeout ${TIMEOUT}m"
  (
    cd "$ROOT" || exit 1
    # shellcheck disable=SC2086
    $tcmd $cmd "$prompt" > "$log" 2>&1 < /dev/null
    code=$?
    echo "[kết thúc, mã $code]" >> "$log"
    if [ -n "$tcmd" ] && [ "$code" = 124 ]; then
      echo "[hết giờ: chạy quá $TIMEOUT phút nên bị dừng]" >> "$log"
      notify "$id ($role) chạy quá $TIMEOUT phút nên bị dừng. Xem log ${log#$ROOT/}"
    elif [ "$code" != 0 ]; then
      notify "$id ($role) kết thúc với lỗi (mã $code). Xem log ${log#$ROOT/}"
    fi
  ) &
  echo $! > "$RUN/$id.pid"
  say "Đánh thức $id ($role). Log: ${log#$ROOT/}"
}

write_status() { # write_status <kết quả scan>
  data="$1"; out="$W/STATUS.md"; tmp="$RUN/STATUS.tmp"
  {
    echo "# Trạng thái"
    echo
    echo "_Do watch.sh tự sinh lúc $(date '+%d/%m/%Y %H:%M'). Đừng sửa tay._"
    echo
    echo "## Chờ bạn"
    echo
    owner=$(echo "$data" | awk -F'|' '$1=="owner"')
    if [ -n "$owner" ]; then owner_lines "$owner"; else echo "Không có."; fi
    echo
    echo "## Bất thường"
    echo
    if [ -s "$RUN/lint.txt" ]; then sed 's/^/- /' "$RUN/lint.txt"; else echo "Không có."; fi
    echo
    echo "## Agent"
    echo
    echo "| Agent | Vai | Đánh thức | Đang chạy | File đang chờ |"
    echo "|---|---|---|---|---|"
    grep -v '^[[:space:]]*#' "$AGENTS" | grep -v '^[[:space:]]*$' | while read -r id role mode rest; do
      n=$(echo "$data" | awk -F'|' -v a="$id" '$1==a' | grep -c . )
      running="không"; running "$id" && running="**đang chạy**"
      [ -f "$RUN/$id.paused" ] && running="⏸ **tạm dừng** từ $(cat "$RUN/$id.paused"), chạy lại: \`sh workflow/watch.sh --resume $id\`"
      list=$(echo "$data" | awk -F'|' -v a="$id" '$1==a {printf "%s ", $3}')
      warn=""
      if [ "$n" -gt 0 ] && ! running "$id" && [ -f "$RUN/$id.sig" ] && [ "$mode" = "auto" ]; then
        files=$(echo "$data" | awk -F'|' -v a="$id" '$1==a {print $3}')
        [ "$(sig_of "$files")" = "$(cat "$RUN/$id.sig")" ] && warn=" ⚠ đã đánh thức nhưng chưa xử lý xong, xem log"
      fi
      echo "| $id | $role | $mode | $running | ${list:-–}$warn |"
    done
    echo
    echo "## Tính năng"
    for d in "$W"/F-*/; do
      [ -d "$d" ] || continue
      name=$(basename "$d")
      echo
      echo "### $name"
      echo
      echo "| File | Tiêu đề | Trạng thái | Đang chờ |"
      echo "|---|---|---|---|"
      echo "$data" | awk -F'|' -v p="$name/" 'index($3,p)==1 {printf "| `%s` | %s | %s | %s |\n", substr($3, length(p)+1), $4, $2, $1}'
    done
  } > "$tmp"
  # Chỉ ghi khi nội dung (bỏ dòng giờ) thay đổi, để file không đổi liên tục
  if [ ! -f "$out" ] || [ "$(grep -v '^_Do watch.sh' "$tmp")" != "$(grep -v '^_Do watch.sh' "$out")" ]; then
    mv "$tmp" "$out"
  else
    rm -f "$tmp"
  fi
}

tick() {
  data=$(scan)
  # Agent trong agents.txt
  grep -v '^[[:space:]]*#' "$AGENTS" | grep -v '^[[:space:]]*$' | while read -r id role mode cmd; do
    # subagent: Master tự gọi trong phiên chat của nó, watch.sh không đánh thức và không báo
    [ "$mode" = "subagent" ] && continue
    # Dọn dấu "đang chạy" của tiến trình đã chết (ví dụ cửa sổ bị đóng bằng nút X)
    [ -f "$RUN/$id.pid" ] && ! running "$id" && rm -f "$RUN/$id.pid"
    files=$(echo "$data" | awk -F'|' -v a="$id" '$1==a {print $3}')
    [ -n "$files" ] || { rm -f "$RUN/$id.sig"; continue; }
    [ "$mode" = "auto" ] && running "$id" && continue
    if [ "$mode" = "window" ] && running "$id"; then
      # Cửa sổ đang mở: agent tự sửa file của nó là bình thường; chỉ báo khi có FILE MỚI chờ nó
      new=$(echo "$files" | while read -r f; do grep -qxF "$f" "$RUN/$id.list" 2>/dev/null || echo "$f"; done)
      if [ -n "$new" ]; then
        echo "$files" > "$RUN/$id.list"; job_of "$files" > "$RUN/$id.job"
        notify "Có việc mới cho $id ($role), cửa sổ của nó đang mở: gõ vào đó \"Xử lý việc đang chờ\". File mới: $(echo $new)"
      fi
      continue
    fi
    s=$(sig_of "$files")
    [ -f "$RUN/$id.sig" ] && [ "$s" = "$(cat "$RUN/$id.sig")" ] && continue
    if [ "$mode" = "auto" ] || [ "$mode" = "window" ]; then
      # Đang tạm dừng: chờ chủ dự án xem rồi chạy --resume
      [ -f "$RUN/$id.paused" ] && continue
      if [ "$MAXWAKES" -gt 0 ] && [ "$(wake_count "$id")" -ge "$MAXWAKES" ]; then
        date '+%d/%m %H:%M' > "$RUN/$id.paused"
        notify "Tạm dừng $id ($role): đã đánh thức $MAXWAKES lần trong 1 giờ mà vẫn còn việc chờ nó, có thể đang lặp. Xem log trong workflow/logs/ và các file: $(echo $files). Xong thì chạy: sh workflow/watch.sh --resume $id"
        continue
      fi
      date +%s >> "$RUN/$id.wakes"
    fi
    echo "$s" > "$RUN/$id.sig"
    case "$mode" in auto|window) job_of "$files" > "$RUN/$id.job" ;; esac
    case "$mode" in
      auto) wake "$id" "$role" "$cmd" "$files" ;;
      window) echo "$files" > "$RUN/$id.list"; open_window "$id" "$role" "$cmd" "$files" ;;
      *)
        make_prompt "$id" "$role" "$files" > "$RUN/$id.prompt"
        if to_clipboard < "$RUN/$id.prompt"; then where="đã chép vào clipboard, mở công cụ rồi dán"; else where="xem workflow/.run/$id.prompt"; fi
        notify "Có việc cho $id ($role): $(echo $files). Lời nhắn $where." ;;
    esac
  done
  # Việc chờ chủ dự án
  ofiles=$(echo "$data" | awk -F'|' '$1=="owner" {print $3}')
  if [ -n "$ofiles" ]; then
    s=$(sig_of "$ofiles")
    if [ ! -f "$RUN/owner.sig" ] || [ "$s" != "$(cat "$RUN/owner.sig")" ]; then
      echo "$s" > "$RUN/owner.sig"
      notify "Cần bạn:
$(owner_lines "$(echo "$data" | awk -F'|' '$1=="owner"')" | tr -d '`')"
    fi
  else
    rm -f "$RUN/owner.sig"
  fi
  # Nhánh đã merge (cho monitor: dòng "Chờ bạn" cũ thành "đã merge, chờ Master dọn")
  merged_scan > "$RUN/merged.tmp" 2>/dev/null && mv "$RUN/merged.tmp" "$RUN/merged.txt"
  # Trạng thái bất thường: ghi cho STATUS.md và monitor, báo khi danh sách thay đổi
  lint > "$RUN/lint.txt"
  if [ -s "$RUN/lint.txt" ]; then
    s=$(cksum < "$RUN/lint.txt" | awk '{print $1}')
    if [ ! -f "$RUN/lint.sig" ] || [ "$s" != "$(cat "$RUN/lint.sig")" ]; then
      echo "$s" > "$RUN/lint.sig"
      notify "Bất thường trong workflow (xem STATUS.md hoặc monitor; nói với Master \"Xử lý việc đang chờ\"):
$(sed 's/^/- /' "$RUN/lint.txt" | tr -d '`')"
    fi
  else
    rm -f "$RUN/lint.sig"
  fi
  write_status "$data"
}

# ---------- Chạy liên tục: một bản duy nhất, nhịp tim, kèm monitor ----------

watch_alive() { [ -f "$RUN/watch.pid" ] && kill -0 "$(cat "$RUN/watch.pid" 2>/dev/null)" 2>/dev/null; }

# monitor_stop: dừng monitor đang chạy (do watch.sh mở hay bạn tự mở) bằng lệnh dừng của chính nó.
# Không cần tìm PID: monitor ghi cổng và mã bí mật vào .run/, chỉ ai đọc được thư mục này mới dừng được.
monitor_stop() {
  [ -f "$RUN/monitor.token" ] && [ -f "$RUN/monitor.port" ] || return 1
  command -v node >/dev/null 2>&1 || return 1
  node -e '
    const fs = require("fs"), http = require("http");
    let token = "", port = 0;
    try { token = fs.readFileSync(process.argv[1], "utf8").trim(); port = +fs.readFileSync(process.argv[2], "utf8").trim(); } catch { process.exit(1); }
    const r = http.request({ host: "127.0.0.1", port, path: "/api/stop", method: "POST", headers: { "X-Token": token }, timeout: 3000 },
      res => process.exit(res.statusCode === 200 ? 0 : 1));
    r.on("error", () => process.exit(1)); r.on("timeout", () => { r.destroy(); process.exit(1); }); r.end();
  ' "$RUN/monitor.token" "$RUN/monitor.port"
}

MON_STARTED=0; MON_SIG=""
# monitor_up: monitor trên cổng $PORT có trả lời không (không dựa vào PID: monitor chạy tách khỏi terminal)
monitor_up() {
  node -e '
    const r = require("http").get({ host: "127.0.0.1", port: +process.argv[1], path: "/api/state", timeout: 3000 },
      res => { res.resume(); process.exit(res.statusCode === 200 ? 0 : 1); });
    r.on("error", () => process.exit(1)); r.on("timeout", () => { r.destroy(); process.exit(1); });
  ' "$PORT" 2>/dev/null
}
# monitor_start: mở monitor TÁCH khỏi terminal, để terminal của watch.sh bị đóng (hay watch.sh chết) thì monitor vẫn
# sống và hiện đỏ "watch.sh đã chết". Windows: Start-Process (tiến trình riêng); máy khác: nohup (và setsid nếu có).
monitor_start() {
  [ "$NOMON" = 1 ] && return
  command -v node >/dev/null 2>&1 || { say "Không có node (cần Node.js 18+), không mở monitor."; NOMON=1; return; }
  [ -f "$W/monitor.js" ] || { NOMON=1; return; }
  MON_SIG=$(cksum < "$W/monitor.js")
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*)
      powershell.exe -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath node -ArgumentList '\"$W/monitor.js\"','--port','$PORT' -RedirectStandardOutput '$RUN/monitor.log' -RedirectStandardError '$RUN/monitor.err'" >/dev/null 2>&1 \
        || node "$W/monitor.js" --port "$PORT" > "$RUN/monitor.log" 2>&1 & ;;
    *)
      if command -v setsid >/dev/null 2>&1; then setsid nohup node "$W/monitor.js" --port "$PORT" > "$RUN/monitor.log" 2>&1 < /dev/null &
      else nohup node "$W/monitor.js" --port "$PORT" > "$RUN/monitor.log" 2>&1 < /dev/null &
      fi ;;
  esac
  i=0; while [ $i -lt 8 ] && ! monitor_up; do sleep 1; i=$((i + 1)); done
  if monitor_up; then
    MON_STARTED=1; say "Monitor: http://localhost:$PORT"
  else
    say "Không mở được monitor:"; cat "$RUN/monitor.log" "$RUN/monitor.err" 2>/dev/null | sed 's/^/    /'
    say "watch.sh vẫn chạy, không có monitor. Sửa xong thì: sh workflow/watch.sh --restart"
    NOMON=1
  fi
}

# monitor_check: mỗi vòng quét, monitor chết thì mở lại, monitor.js đổi thì nạp bản mới
monitor_check() {
  [ "$NOMON" = 1 ] && return
  if [ "$(cksum < "$W/monitor.js" 2>/dev/null)" != "$MON_SIG" ]; then
    say "monitor.js đã đổi, mở lại monitor."
    monitor_stop; sleep 1; monitor_start; return
  fi
  monitor_up || { say "Monitor đã dừng, mở lại."; monitor_start; }
}

beat() { echo "$(date +%s) $INTERVAL $$" > "$RUN/watch.beat"; }

# fetch_if_due: cứ FETCH phút thì `git fetch --prune origin` một lần (có remote origin), để dò MR đã merge.
# Chỉ watch.sh fetch theo lịch; Master dùng ref nó lấy về. Lỗi thì chỉ báo một dòng, không dừng.
LAST_FETCH=0
fetch_if_due() {
  [ "$FETCH" -gt 0 ] || return 0
  now=$(date +%s); [ $((now - LAST_FETCH)) -ge $((FETCH * 60)) ] || return 0
  LAST_FETCH=$now
  git -C "$ROOT" remote get-url origin >/dev/null 2>&1 || return 0
  if [ "$HAS_TIMEOUT" = 1 ]; then out=$(timeout 120 git -C "$ROOT" fetch --quiet --prune origin 2>&1)
  else out=$(git -C "$ROOT" fetch --quiet --prune origin 2>&1); fi
  [ $? -eq 0 ] || say "git fetch lỗi (sẽ thử lại sau $FETCH phút): $(printf '%s' "$out" | head -n 1)"
}

STOP_REASON=""; KEEP_MON=0
on_exit() {
  # Dừng chủ ý (Ctrl+C, --stop) thì dừng cả monitor. Terminal bị đóng thì để monitor sống, hiện đỏ cho chủ dự án thấy
  # (giữ nguyên nhịp tim cũ để monitor báo "watch.sh đã chết" thay vì "đang tắt")
  rm -f "$RUN/watch.pid"
  if [ "$KEEP_MON" = 1 ]; then return; fi
  [ "$MON_STARTED" = 1 ] && monitor_stop
  rm -f "$RUN/watch.beat"
  echo "$(date +%s) ${STOP_REASON:-thoát}" > "$RUN/watch.stopped"
}

do_stop() {
  any=0
  if watch_alive; then
    p=$(cat "$RUN/watch.pid"); kill "$p" 2>/dev/null
    i=0; while kill -0 "$p" 2>/dev/null && [ $i -lt 20 ]; do sleep 0.5; i=$((i + 1)); done
    if kill -0 "$p" 2>/dev/null; then
      kill -9 "$p" 2>/dev/null; rm -f "$RUN/watch.pid" "$RUN/watch.beat"
      echo "$(date +%s) lệnh --stop" > "$RUN/watch.stopped"
    fi
    echo "Đã dừng watch.sh (pid $p)."; any=1
  fi
  if monitor_stop; then echo "Đã dừng monitor."; any=1; fi
  [ "$any" = 1 ] || echo "Không có watch.sh hay monitor nào đang chạy (monitor bản cũ, nếu có, phải đóng terminal của nó)."
}

# Khi khởi động: chỉ dọn dấu "đang chạy" của tiến trình đã chết
for p in "$RUN"/*.pid; do
  [ -f "$p" ] || continue
  a=$(basename "$p" .pid)
  [ "$a" = monitor ] && continue   # PID của node trên Windows, kill -0 trong Git Bash không nhận; monitor tự dọn
  running "$a" || rm -f "$p"
done

if [ "$STOP" = 1 ]; then do_stop; exit 0; fi
if [ "$LINT" = "1" ]; then
  out=$(lint)
  if [ -n "$out" ]; then echo "Bất thường:"; echo "$out" | sed 's/^/- /'; exit 1; fi
  echo "Không có gì bất thường."; exit 0
fi
if [ "$ONCE" = "1" ]; then tick; exit 0; fi

[ "$RESTART" = 1 ] && do_stop
if watch_alive; then
  echo "watch.sh đang chạy rồi (pid $(cat "$RUN/watch.pid")). Dừng: sh workflow/watch.sh --stop. Chạy lại ở đây: sh workflow/watch.sh --restart"
  exit 1
fi
# Chạy từ bản sao trong .run/: sh đọc script dần dần trong lúc chạy, chép đè file đang chạy sẽ làm hỏng nó
if [ "${WATCH_SH_COPY:-}" != 1 ]; then
  cp "$W/watch.sh" "$RUN/watch.run.sh" || exit 1
  export WATCH_SH_COPY=1
  # shellcheck disable=SC2086
  exec sh "$RUN/watch.run.sh" $PASS_ARGS
fi
unset WATCH_SH_COPY

echo $$ > "$RUN/watch.pid"
rm -f "$RUN/watch.stopped"
trap on_exit EXIT
trap 'STOP_REASON="Ctrl+C"; exit 130' INT
trap 'STOP_REASON="lệnh --stop"; exit 143' TERM
trap 'STOP_REASON="terminal bị đóng"; KEEP_MON=1; exit 129' HUP
SRC_SIG=$(cksum < "$W/watch.sh")
beat
say "Bắt đầu theo dõi $W, quét mỗi $INTERVAL giây. Dừng: Ctrl+C, hoặc sh workflow/watch.sh --stop ở terminal khác."
monitor_start
while true; do
  fetch_if_due
  tick
  beat
  monitor_check
  # watch.sh vừa được cập nhật (ví dụ chép bộ khởi đầu mới): nạp lại bản mới, nếu file đã chép xong và đúng cú pháp
  s=$(cksum < "$W/watch.sh" 2>/dev/null)
  if [ -n "$s" ] && [ "$s" != "$SRC_SIG" ]; then
    sleep 1
    if [ "$(cksum < "$W/watch.sh" 2>/dev/null)" = "$s" ] && sh -n "$W/watch.sh" 2>/dev/null; then
      say "watch.sh đã được cập nhật, nạp lại bản mới."
      trap - EXIT INT TERM HUP
      [ "$MON_STARTED" = 1 ] && { monitor_stop; sleep 1; }
      rm -f "$RUN/watch.pid"
      # shellcheck disable=SC2086
      exec sh "$W/watch.sh" $PASS_ARGS
    fi
  fi
  # sleep chạy nền rồi wait: Ctrl+C hay --stop được xử lý ngay, không phải chờ hết chu kỳ
  sleep "$INTERVAL" & wait $!
done
