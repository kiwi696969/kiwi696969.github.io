#!/bin/bash
# ============================================================
#  发布博客（GitHub Actions 自动构建模式）
#  用法：在 Git Bash 里执行  bash deploy.sh "这次改了啥"
#
#  仓库 main 分支现在存的是【源文件】（Markdown、配置、主题），
#  推上去之后 GitHub Actions 会自动 hexo g 并发布到 Pages。
#
#  ⚠️ 不要再手工 push public/ 目录，也不要执行 hexo d，
#     否则会把 main 上的源文件整个覆盖掉。
# ============================================================
set -e
cd "$(dirname "$0")"

MSG="${1:-更新博客: $(date '+%Y-%m-%d %H:%M:%S')}"

echo "===== 1/6 源文件体检 ====="
# 编辑器（尤其 MarkText）偶尔会吃掉 front matter 字段，
# 缺 date 会让文章日期在云端构建时漂移，缺 tags/categories 会让分类标签页消失
if ! bash check_frontmatter.sh; then
  echo
  echo "⚠️  上面这些文件字段不全，这样发布会带着问题上线。"
  if [ -t 0 ]; then
    echo "    补好字段后按回车继续；想中止就按 Ctrl+C。"
    read -r _
  else
    echo "    （非交互运行，已自动继续）"
  fi
fi
echo

echo "===== 2/6 刷新仓库列表页 ====="
# GitHub API 拉最新仓库 → 重新生成 source/repos/index.md
# 本机 curl 连不上 GitHub，必须用 node 的 --use-system-ca 走系统证书库
# 拉了也没关系，脚本自己会退回缓存并正常退出，不会中断发布
env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
  node --use-system-ca tools/gen-repos.mjs || echo "  （跳过，保留现有页面）"
echo

echo "===== 3/6 本地构建自检 ====="
# 先在本机编译一遍，有问题当场暴露，不用等 Actions 白跑一趟
hexo clean
hexo g

echo "===== 4/6 检查源文件改动 ====="
git status --short

echo "===== 5/6 提交 ====="
git add -A
git commit -m "$MSG" || echo "  没有变更需要提交"

echo "===== 6/6 推送到 GitHub ====="
git push origin main

echo
echo "✅ 已推送！GitHub Actions 会自动开始构建"
echo "   站点：   https://kiwi696969.github.io"
echo "   构建进度：https://github.com/kiwi696969/kiwi696969.github.io/actions"
echo "   通常 1 分钟左右生效，刷新页面时按 Ctrl+F5 强制刷新"
