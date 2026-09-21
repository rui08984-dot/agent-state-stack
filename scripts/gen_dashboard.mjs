#!/usr/bin/env node
// Agent State Stack · 驾驶舱面板生成器
// progress.md + architecture.mmd → dashboard.html（自包含单文件，mermaid 可本地内嵌或 CDN 兜底）
// 用法: node gen_dashboard.mjs [项目根=cwd]；可选环境变量 STACK_MERMAID=mermaid.min.js 绝对路径
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] || process.cwd();
const VENDOR = process.env.STACK_MERMAID || join(dirname(fileURLToPath(import.meta.url)), 'vendor/mermaid.min.js');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function parseKanban() {
  const p = join(root, 'progress.md');
  if (!existsSync(p)) return { title: basename(root), updated: '', lanes: { '✅': [], '🔄': [], '⛔': [], '⬜': [] } };
  const lines = readFileSync(p, 'utf8').split(/\r?\n/);
  const title = (lines.find(l => l.startsWith('# ')) || '看板').replace(/^#\s*/, '').replace(/·.*$/, '').trim();
  const updated = ((lines.find(l => l.startsWith('> 最后更新')) || '').match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
  const lanes = { '✅': [], '🔄': [], '⛔': [], '⬜': [] };
  for (const line of lines) {
    if (!line.includes('|')) continue;
    const c = line.split('|').map(s => s.trim());
    if (c.length < 5 || !c[1] || /^[-:]+$/.test(c[2] || '') || c[1] === '模块') continue;
    const lane = [...(c[2] || '')][0]; // 展开码点取完整 emoji（/u 陷阱：str[0] 会取到半个代理单元）
    if (!lanes[lane]) continue;
    lanes[lane].push({ module: c[1], status: c[2], dep: c[3] || '—', note: c[4] || '' });
  }
  return { title, updated, lanes };
}

const kb = parseKanban();
const total = Object.values(kb.lanes).reduce((a, b) => a + b.length, 0) || 1;
const done = kb.lanes['✅'].length, doing = kb.lanes['🔄'].length, blocked = kb.lanes['⛔'].length, todo = kb.lanes['⬜'].length;
const pct = Math.round(done / total * 100);

const mmdPath = join(root, 'architecture.mmd');
const mmd = existsSync(mmdPath) ? readFileSync(mmdPath, 'utf8') : 'flowchart TB\n    T["未找到 architecture.mmd"]';
const mermaidJs = existsSync(VENDOR)
  ? `<script>${readFileSync(VENDOR, 'utf8')}</script>`
  : `<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>`;

const LANES = [
  { key: '✅', label: '完成', dot: '#22C55E', glow: 'rgba(34,197,94,.45)' },
  { key: '🔄', label: '进行', dot: '#FBBF24', glow: 'rgba(251,191,36,.45)' },
  { key: '⛔', label: '阻塞', dot: '#EF4444', glow: 'rgba(239,68,68,.45)' },
  { key: '⬜', label: '未开', dot: '#64748B', glow: 'rgba(100,116,139,.35)' },
];
const seg = LANES.map(l => {
  const n = kb.lanes[l.key].length;
  return `<div class="seg" style="width:${(n / total * 100).toFixed(2)}%;background:${l.dot};box-shadow:0 0 8px ${l.glow}" title="${l.label} ${n}"></div>`;
}).join('');
const cols = LANES.map(l => `
  <section class="col">
    <header><i class="dot" style="background:${l.dot};box-shadow:0 0 10px ${l.glow}"></i>${l.label}<b>${kb.lanes[l.key].length}</b></header>
    ${kb.lanes[l.key].map(x => `
    <article class="card" style="border-left:3px solid ${l.dot}">
      <div class="m" title="${esc(x.module)}">${esc(x.module)}</div>
      <div class="meta"><span>${esc(x.status)}</span><span class="dep">依赖 · ${esc(x.dep)}</span></div>
      <div class="note" title="${esc(x.note)}">${esc(x.note)}</div>
    </article>`).join('') || '<div class="empty">—</div>'}
  </section>`).join('');

const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(kb.title)} · 状态面板</title>
<style>
:root{--bg:#0F172A;--panel:#1E293B;--line:#2b3a55;--fg:#F8FAFC;--mut:#94A3B8;--lamp:#FBBF24}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--fg);font-family:Inter,"Segoe UI","Microsoft YaHei",sans-serif;padding:20px 22px 28px;background-image:radial-gradient(ellipse 70% 42% at 50% -8%,rgba(251,191,36,.07),transparent)}
.wrap{max-width:1440px;margin:0 auto}
.eyebrow{font-size:10px;letter-spacing:.34em;color:var(--lamp);text-transform:uppercase;margin-bottom:6px}
.hd{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:10px}
.hd h1{font-size:20px;font-weight:700;letter-spacing:.08em}
.hd .meta{font-family:Consolas,monospace;font-size:11px;color:var(--mut)}
.hd .meta b{color:var(--fg);font-weight:600}
.route{display:flex;height:8px;border-radius:4px;overflow:hidden;gap:2px;background:#18213a;margin:14px 0 6px}
.legend{font-size:11px;color:var(--mut);margin-bottom:16px}
.legend b{color:var(--fg);font-weight:600}
.board{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}
.col{background:rgba(30,41,59,.42);border:1px solid var(--line);border-radius:10px;padding:10px;min-height:140px}
.col header{display:flex;align-items:center;gap:7px;font-size:12px;letter-spacing:.14em;color:var(--mut);margin:2px 2px 10px}
.col header b{margin-left:auto;font-family:Consolas,monospace;color:var(--fg);font-size:11px}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:8px}
.card .m{font-size:13px;font-weight:600;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card .meta{display:flex;gap:8px;font-size:10.5px;color:var(--mut);margin:4px 0 3px;font-family:Consolas,monospace}
.card .note{font-size:12px;color:#c7cede;line-height:1.55;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.empty{color:#3d4a63;font-size:12px;text-align:center;padding:14px 0}
.graph{background:rgba(30,41,59,.42);border:1px solid var(--line);border-radius:10px;padding:14px;margin-top:14px}
.graph h2{font-size:12px;letter-spacing:.14em;color:var(--mut);font-weight:600;margin-bottom:10px}
pre.mermaid{display:flex;justify-content:center}
.ft{margin-top:16px;padding-top:10px;border-top:1px solid var(--line);font-family:Consolas,monospace;font-size:11px;color:var(--mut);display:flex;gap:18px;flex-wrap:wrap}
.ft b{color:var(--lamp);font-weight:600}
</style></head><body><div class="wrap">
<div class="eyebrow">AGENT STATE STACK · OPS BOARD</div>
<div class="hd"><h1>${esc(kb.title)}</h1>
<div class="meta">更新 <b>${esc(kb.updated || '—')}</b> · 模块 <b>${total}</b> · 完成 <b>${pct}%</b></div></div>
<div class="route">${seg}</div>
<div class="legend"><b style="color:#22C55E">● 完成 ${done}</b> · <b style="color:#FBBF24">● 进行 ${doing}</b> · <b style="color:#EF4444">● 阻塞 ${blocked}</b> · ● 未开 ${todo}</div>
<div class="board">${cols}</div>
<div class="graph"><h2>依赖图 · DEPENDENCY GRAPH</h2>
<pre class="mermaid">
${esc(mmd)}
</pre></div>
<div class="ft"><span>状态均带出处，明细 progress.md / srelay search</span><span>刷新 node gen_dashboard.mjs</span></div>
</div>
${mermaidJs}
<script>mermaid.initialize({startOnLoad:true,theme:'dark',themeVariables:{background:'#0F172A',primaryColor:'#1E293B',primaryTextColor:'#F8FAFC',lineColor:'#94A3B8',clusterBkg:'rgba(30,41,59,.30)',clusterBorder:'#2b3a55',edgeLabelBackground:'#0F172A',fontSize:'13px'}});</script>
</body></html>`;

writeFileSync(join(root, 'dashboard.html'), html, 'utf8');
console.log(`dashboard.html 已生成: ${join(root, 'dashboard.html')} (${(html.length / 1024 / 1024).toFixed(1)} MB，mermaid 内嵌时)`);
