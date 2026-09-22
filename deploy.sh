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

echo "===== 1/4 本地构建自检 ====="
# 先在本机编译一遍，有问题当场暴露，不用等 Actions 白跑一趟
hexo clean
hexo g

echo "===== 2/4 检查源文件改动 ====="
git status --short

echo "===== 3/4 提交 ====="
git add -A
git commit -m "$MSG" || echo "  没有变更需要提交"

echo "===== 4/4 推送到 GitHub ====="
git push origin main

echo
echo "✅ 已推送！GitHub Actions 会自动开始构建"
echo "   站点：   https://kiwi696969.github.io"
echo "   构建进度：https://github.com/kiwi696969/kiwi696969.github.io/actions"
echo "   通常 1 分钟左右生效，刷新页面时按 Ctrl+F5 强制刷新"
