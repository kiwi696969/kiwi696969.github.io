// ==========================================================================
//  生成「我的仓库」页面
//
//  作用：调用 GitHub API 拉取 kiwi696969 的全部仓库，
//        渲染成 source/repos/index.md（Hexo 会把它编译成 /repos/ 页面）。
//
//  用法：
//    本地    node --use-system-ca tools/gen-repos.mjs
//    云端    由 .github/workflows/deploy.yml 在构建前自动调用
//
//  两个注意点：
//   1. 本地 curl 连不上 GitHub（沙箱证书问题），所以本机必须加 --use-system-ca
//   2. API 挂了不能让构建失败 —— 会自动退回上次缓存的 tools/repos-cache.json
// ==========================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(__dirname, 'repos-cache.json');
const TARGET = path.join(ROOT, 'source', 'repos', 'index.md');

const USER = 'kiwi696969';
const SELF_REPO = `${USER}.github.io`; // 博客本身，单独标注
const API = `https://api.github.com/users/${USER}/repos?per_page=100&sort=pushed`;

// 语言配色（GitHub 官方色，用来画小圆点）
const LANG_COLOR = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', HTML: '#e34c26',
  CSS: '#563d7c', SCSS: '#c6538c', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
  Java: '#b07219', Vue: '#41b883', Svelte: '#ff3e00', 'Jupyter Notebook': '#DA5B0B',
  Shell: '#89e051', Bash: '#89e051', Go: '#00ADD8', Rust: '#dea584', Kotlin: '#A97BFF',
  Swift: '#F05138', PHP: '#4F5D95', Ruby: '#701516', Dart: '#00B4AB', Lua: '#000080',
  Dockerfile: '#384d54', Batchfile: '#C1F12E', PowerShell: '#012456', Makefile: '#427819',
  'EJS': '#a91e50', Stylus: '#ff6347', SCSS2: '#c6538c', MDX: '#fcb32c', 'Jinja': '#a52a2a',
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function relDate(iso) {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d <= 0) return '今天';
  if (d === 1) return '昨天';
  if (d < 30) return `${d} 天前`;
  if (d < 365) return `${Math.floor(d / 30)} 个月前`;
  const dt = new Date(iso);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function card(r) {
  const lang = r.language
    ? `<span class="repo-lang"><i style="background:${LANG_COLOR[r.language] || '#8b949e'}"></i>${esc(r.language)}</span>`
    : '';
  const stars = r.stargazers_count > 0
    ? `<span class="repo-stat" title="Star">★ ${r.stargazers_count}</span>` : '';
  const forks = r.forks_count > 0
    ? `<span class="repo-stat" title="Fork">⑂ ${r.forks_count}</span>` : '';
  const badges = [
    r.name === SELF_REPO ? '<span class="repo-badge repo-badge-self">本站</span>' : '',
    r.fork ? '<span class="repo-badge">Fork</span>' : '',
    r.archived ? '<span class="repo-badge">已归档</span>' : '',
  ].join('');
  const desc = r.description
    ? esc(r.description)
    : '<span class="repo-desc-empty">暂无描述</span>';
  const topics = (r.topics || []).slice(0, 4)
    .map((t) => `<span class="repo-topic">${esc(t)}</span>`).join('');

  return `<a class="repo-card" href="${esc(r.html_url)}" target="_blank" rel="noopener noreferrer">`
    + `<div class="repo-head"><span class="repo-name">${esc(r.name)}</span>${badges}</div>`
    + `<div class="repo-desc">${desc}</div>`
    + `<div class="repo-foot">${lang}${stars}${forks}`
    + `<span class="repo-stat repo-updated" title="最后更新">更新于 ${relDate(r.pushed_at)}</span>`
    + `</div>`
    + (topics ? `<div class="repo-topics">${topics}</div>` : '')
    + `</a>`;
}

function render(repos) {
  const own = repos.filter((r) => !r.fork);
  const forked = repos.filter((r) => r.fork);
  const totalStars = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0);
  const langs = [...new Set(repos.map((r) => r.language).filter(Boolean))];

  // 注意：markdown 里整块 HTML 不能出现空行，否则 marked 会把它切成两半
  const head = `<div class="repo-wrap">`
    + `<p class="repo-summary">共 <b>${repos.length}</b> 个仓库`
    + `（自建 ${own.length} · Fork ${forked.length}），`
    + `累计 <b>${totalStars}</b> 个 Star，涉及 ${langs.length} 种语言。`
    + `<a href="https://github.com/${USER}" target="_blank" rel="noopener noreferrer">去 GitHub 看看 →</a></p>`
    + `<div class="repo-grid">`;

  const body = [...own, ...forked].map(card).join('');

  return head + body + `</div></div>`;
}

async function fetchRepos() {
  const headers = {
    'User-Agent': 'kiwi-blog-repos-generator',
    Accept: 'application/vnd.github+json',
  };
  // Actions 里塞了 GITHUB_TOKEN，能拿到更宽松的限流额度；本地没有就算了
  const tok = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (tok) headers.Authorization = `Bearer ${tok}`;

  const res = await fetch(API, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('返回体不是数组: ' + JSON.stringify(data).slice(0, 200));
  return data;
}

async function main() {
  let repos;
  let src;
  try {
    repos = await fetchRepos();
    src = '线上实时数据';
  } catch (e) {
    console.warn(`⚠️  拉取失败（${e.message}），改用本地缓存`);
    if (!fs.existsSync(CACHE)) {
      console.error('❌ 连缓存都没有，本次跳过生成，保留已有页面');
      process.exit(0);
    }
    repos = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    src = '本地缓存';
  }

  // 只有拿到新数据才更新缓存
  if (src === '线上实时数据') {
    fs.writeFileSync(CACHE, JSON.stringify(repos, null, 2), 'utf8');
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
    + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  // description 必须显式给：否则主题会把整块卡片 HTML 压成 meta 描述
  const langs = [...new Set(repos.map((r) => r.language).filter(Boolean))];
  const desc = `${USER} 在 GitHub 上的全部仓库，共 ${repos.length} 个`
    + `（涵盖 ${langs.length} 种语言），按最近更新排序。`;

  const md = `---
title: 我的仓库
description: ${desc}
date: ${stamp}
layout: page
comments: false
---

${render(repos)}
`;

  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.writeFileSync(TARGET, md, 'utf8');
  console.log(`✅ 已生成 ${path.relative(ROOT, TARGET)}（${repos.length} 个仓库 · 来源：${src}）`);
}

main().catch((e) => {
  // 生成失败也不能拖垮构建
  console.error('❌ 生成页面出错：', e.message);
  process.exit(0);
});
