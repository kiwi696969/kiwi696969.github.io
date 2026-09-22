#!/bin/bash
# ============================================================
#  Markdown front matter 体检
#
#  编辑器（尤其 MarkText）有时会把文件开头的 front matter 字段
#  悄悄吃掉。丢字段的后果：
#    - 缺 date        → 文章日期漂移
#    - 缺 categories  → 分类页少一条
#    - 缺 tags        → 标签页少一条、旧链接 404
#    - 缺 layout:about → 关于页的头像/名字/简介整块不显示
#
#  deploy.sh 会在发布前自动调用它；也可以单独运行：
#    bash check_frontmatter.sh
# ============================================================

cd "$(dirname "$0")" || exit 1

BAD=0

check_file() {
  local f="$1"
  local first
  first=$(head -1 "$f" | tr -d '\r')

  if [ "$first" != "---" ]; then
    echo "  [缺少 front matter] $f"
    echo "      第一行应该是 ---  ，实际是：${first:0:45}"
    BAD=1
    return
  fi

  local fm
  fm=$(sed -n '2,/^---[[:space:]]*$/p' "$f")

  local key
  for key in title date; do
    if ! printf '%s\n' "$fm" | grep -q "^${key}:"; then
      echo "  [缺少 $key] $f"
      BAD=1
    fi
  done
}

echo "检查 Markdown front matter ..."

while IFS= read -r f; do
  check_file "$f"
done < <(find source -name '*.md' -type f | sort)

# 关于页有额外要求：没有 layout: about 就不会渲染头像那一块
if [ -f source/about/index.md ]; then
  if ! grep -q '^layout:[[:space:]]*about' source/about/index.md; then
    echo "  [缺少 layout: about] source/about/index.md"
    echo "      少了它，关于页的头像 / 名字 / 简介整块都不会显示"
    BAD=1
  fi
fi

if [ "$BAD" -eq 0 ]; then
  echo "  OK   所有文件的字段都在"
else
  echo
  echo "  补法：把缺的字段加回文件开头两条 --- 之间，例如"
  echo "        ---"
  echo "        title: 文章标题"
  echo "        date: 2026-09-22 21:00:00"
  echo "        categories: [博客]"
  echo "        tags: [Hexo]"
  echo "        ---"
fi

exit "$BAD"
