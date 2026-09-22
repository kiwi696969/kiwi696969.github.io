#!/bin/bash
# ============================================================
#  本地预览（只在你这台电脑上看得见，不会发布）
#  用法：bash preview.sh
#  然后浏览器打开  http://localhost:4000
#  关掉：在终端按 Ctrl+C
# ============================================================
set -e
cd "$(dirname "$0")"

hexo clean
hexo g
echo
echo ">>> 本地预览地址：http://localhost:4000  （Ctrl+C 停止）"
echo
hexo s
