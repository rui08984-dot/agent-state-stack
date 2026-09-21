#!/usr/bin/env node
// Agent State Stack · 驾驶舱面板生成器 v3
// progress.md + architecture.mmd → dashboard.html
// v3：依赖图滚轮缩放+拖拽平移+适配按钮；字体升级（Inter/JetBrains Mono/Noto Sans SC，离线自动回退）；排版打磨
// 用法: node gen_dashboard.mjs [项目根=cwd]；可选环境变量 STACK_MERMAID=mermaid.min.js 绝对路径
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
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
    const lane = [...(c[2] || '')][0]; // 展开码点取完整 emoji（str[0] 会取到半个代理单元）
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
  { key: '✅', label: '完成', dot: '#22C55E', glow: 'rgba(34,197,94,.5)', tint: 'rgba(34,197,94,.12)' },
  { key: '🔄', label: '进行', dot: '#FBBF24', glow: 'rgba(251,191,36,.5)', tint: 'rgba(251,191,36,.12)' },
  { key: '⛔', label: '阻塞', dot: '#EF4444', glow: 'rgba(239,68,68,.5)', tint: 'rgba(239,68,68,.12)' },
  { key: '⬜', label: '未开', dot: '#64748B', glow: 'rgba(100,116,139,.4)', tint: 'rgba(100,116,139,.12)' },
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
      <div class="meta"><span class="pill" style="background:${l.tint};color:${l.dot}">${esc(x.status)}</span><span class="dep">依赖 · ${esc(x.dep)}</span></div>
      <div class="note" title="${esc(x.note)}">${esc(x.note)}</div>
    </article>`).join('') || '<div class="empty">—</div>'}
  </section>`).join('');

const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(kb.title)} · 状态面板</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0B1120;--panel:#151E31;--panel2:#1B2740;--line:#26334d;--line2:#33436b;
  --fg:#F1F5F9;--mut:#8C9BB4;--dim:#5B6B87;--lamp:#FBBF24;
  --green:#34D399;--amber:#FBBF24;--red:#F87171;--gray:#7C8DA6;
}
*{box-sizing:border-box;margin:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--fg);font-family:"Inter","Noto Sans SC","Segoe UI","Microsoft YaHei",system-ui,sans-serif;
  font-size:14px;line-height:1.6;padding:22px 26px 30px;
  background-image:radial-gradient(ellipse 72% 44% at 50% -6%,rgba(251,191,36,.06),transparent)}
.wrap{max-width:1480px;margin:0 auto}
.eyebrow{font-family:"JetBrains Mono",Consolas,monospace;font-size:10px;letter-spacing:.38em;color:var(--lamp);text-transform:uppercase;margin-bottom:8px}
.hd{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:14px}
.hd h1{font-size:22px;font-weight:700;letter-spacing:.05em;line-height:1.3}
.hd .meta{font-family:"JetBrains Mono",Consolas,monospace;font-size:11px;color:var(--mut);text-align:right;line-height:1.9}
.hd .meta b{color:var(--fg);font-weight:600;font-size:12px}
.route{display:flex;height:9px;border-radius:5px;overflow:hidden;gap:2px;background:#141d33;margin:16px 0 7px}
.seg{min-width:5px;transition:width .25s ease}
.legend{font-size:11.5px;color:var(--mut);margin-bottom:18px;display:flex;gap:16px;flex-wrap:wrap;align-items:center}
.legend b{color:var(--fg);font-weight:600}
.legend .pct{margin-left:auto;font-family:"JetBrains Mono",Consolas,monospace;color:var(--lamp);font-weight:600}
.board{display:grid;grid-template-columns:repeat(auto-fit,minmax(238px,1fr));gap:12px}
.col{background:linear-gradient(180deg,rgba(27,39,64,.55),rgba(21,30,49,.42));border:1px solid var(--line);border-radius:12px;padding:12px;min-height:150px}
.col header{display:flex;align-items:center;gap:8px;font-size:12px;letter-spacing:.16em;color:var(--mut);margin:2px 2px 12px;font-weight:500}
.col header b{margin-left:auto;font-family:"JetBrains Mono",Consolas,monospace;color:var(--fg);font-size:11px;background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:1px 7px}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:9px 11px;margin-bottom:9px;transition:transform .15s ease,border-color .15s ease}
.card:hover{transform:translateY(-1px);border-color:var(--line2)}
.card .m{font-size:13px;font-weight:600;line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card .meta{display:flex;gap:8px;align-items:center;font-size:10.5px;color:var(--mut);margin:5px 0 4px;font-family:"JetBrains Mono",Consolas,monospace}
.card .pill{border-radius:5px;padding:0 6px;font-weight:600}
.card .dep{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card .note{font-size:12px;color:#C9D3E3;line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.empty{color:#3D4A63;font-size:12px;text-align:center;padding:16px 0}
.graph{background:linear-gradient(180deg,rgba(27,39,64,.55),rgba(21,30,49,.42));border:1px solid var(--line);border-radius:12px;padding:14px;margin-top:16px}
.gbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.gbar h2{font-size:12px;letter-spacing:.16em;color:var(--mut);font-weight:500}
.tools{margin-left:auto;display:flex;gap:6px;align-items:center}
.tools button{background:var(--panel2);border:1px solid var(--line);color:var(--fg);border-radius:7px;padding:3px 11px;font-size:12px;cursor:pointer;font-family:inherit;transition:border-color .15s ease}
.tools button:hover{border-color:var(--line2);background:#22304f}
.tools .hint{font-size:10.5px;color:var(--dim);font-family:"JetBrains Mono",Consolas,monospace}
.gview{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#0d1526;cursor:grab;height:560px;position:relative}
.gview.dragging{cursor:grabbing}
.gcanvas{transform-origin:0 0;display:inline-block;padding:18px;will-change:transform}
pre.mermaid{display:flex;justify-content:center}
.ft{margin-top:18px;padding-top:12px;border-top:1px solid var(--line);font-family:"JetBrains Mono",Consolas,monospace;font-size:11px;color:var(--dim);display:flex;gap:20px;flex-wrap:wrap}
.ft b{color:var(--lamp);font-weight:600}
@media (prefers-reduced-motion:no-preference){.card,.seg{transition:transform .15s ease,border-color .15s ease,width .25s ease}}
@media (max-width:760px){.gview{height:380px}}
</style></head><body><div class="wrap">
<div class="eyebrow">Agent State Stack · Ops Board</div>
<div class="hd"><h1>${esc(kb.title)}</h1>
<div class="meta">看板更新 <b>${esc(kb.updated || '—')}</b> · 模块 <b>${total}</b><br>完成度 <b>${pct}%</b></div></div>
<div class="route">${seg}</div>
<div class="legend"><b style="color:var(--green)">● 完成 ${done}</b><b style="color:var(--amber)">● 进行 ${doing}</b><b style="color:var(--red)">● 阻塞 ${blocked}</b><span>● 未开 ${todo}</span><span class="pct">▍${pct}%</span></div>
<div class="board">${cols}</div>
<div class="graph">
  <div class="gbar"><h2>依赖图 · DEPENDENCY GRAPH</h2>
    <div class="tools"><button id="zin">＋</button><button id="zout">－</button><button id="zfit">适配</button><button id="zreset">1:1</button><span class="hint">滚轮缩放 · 拖拽平移 · 双击复位</span></div>
  </div>
  <div class="gview" id="gview"><div class="gcanvas" id="gcanvas"><pre class="mermaid">
${esc(mmd)}
</pre></div></div>
</div>
<div class="ft"><span>口令：<b>继续</b> 续作 · <b>看板</b> 渲染 · <b>接入</b> 老项目接管</span><span>状态均带出处 · 明细 progress.md / srelay search</span><span>生成于 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</span></div>
</div>
${mermaidJs}
<script>
mermaid.initialize({startOnLoad:true,theme:'dark',themeVariables:{background:'#0d1526',primaryColor:'#1E293B',primaryTextColor:'#F1F5F9',lineColor:'#8C9BB4',clusterBkg:'rgba(30,41,59,.30)',clusterBorder:'#33436b',edgeLabelBackground:'#0d1526',fontSize:'13px'},flowchart:{useMaxWidth:false}});
(function(){
  var view=document.getElementById('gview'),canvas=document.getElementById('gcanvas');
  var s=1,x=0,y=0,drag=null,userTouched=false;
  function apply(){canvas.style.transform='translate('+x+'px,'+y+'px) scale('+s+')';}
  function userTouch(){userTouched=true;}
  function fit(){
    var vw=view.clientWidth-36,vh=view.clientHeight-36;
    var cw=canvas.scrollWidth,ch=canvas.scrollHeight;
    if(cw>4&&ch>4){s=Math.min(1.15,Math.min(vw/cw,vh/ch));if(s<0.1)s=0.1;}
    x=(view.clientWidth-canvas.scrollWidth*s)/2;y=(view.clientHeight-canvas.scrollHeight*s)/2;
    if(y<10)y=10;apply();
  }
  view.addEventListener('wheel',function(e){e.preventDefault();userTouch();
    var r=view.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
    var f=e.deltaY<0?1.12:0.89,ns=Math.min(3,Math.max(0.15,s*f));
    x=mx-(mx-x)*(ns/s);y=my-(my-y)*(ns/s);s=ns;apply();
  },{passive:false});
  view.addEventListener('pointerdown',function(e){if(e.target.closest('button'))return;userTouch();drag={px:e.clientX,py:e.clientY,x:x,y:y};view.classList.add('dragging');view.setPointerCapture(e.pointerId);});
  view.addEventListener('pointermove',function(e){if(!drag)return;x=drag.x+(e.clientX-drag.px);y=drag.y+(e.clientY-drag.py);apply();});
  view.addEventListener('pointerup',function(){drag=null;view.classList.remove('dragging');});
  view.addEventListener('dblclick',fit);
  document.getElementById('zin').onclick=function(){userTouch();var r=view.getBoundingClientRect();zoomAt(r.width/2,r.height/2,1.25);};
  document.getElementById('zout').onclick=function(){userTouch();var r=view.getBoundingClientRect();zoomAt(r.width/2,r.height/2,0.8);};
  document.getElementById('zfit').onclick=function(){userTouch();fit();};
  document.getElementById('zreset').onclick=function(){userTouch();s=1;x=18;y=18;apply();};
  function zoomAt(mx,my,f){var ns=Math.min(3,Math.max(0.15,s*f));x=mx-(mx-x)*(ns/s);y=my-(my-y)*(ns/s);s=ns;apply();}
  // mermaid 异步渲染完成晚于定时器——DOM 一变就重新适配（用户手动操作后让位）
  new MutationObserver(function(){if(!userTouched)fit();}).observe(canvas,{childList:true,subtree:true});
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){if(!userTouched)fit();});}
  [400,1200,2500].forEach(function(t){setTimeout(function(){if(!userTouched)fit();},t);});
})();
</script>
</body></html>`;

writeFileSync(join(root, 'dashboard.html'), html, 'utf8');
console.log(`dashboard.html v3 已生成: ${join(root, 'dashboard.html')} (${(html.length / 1024 / 1024).toFixed(1)} MB，mermaid 内嵌时)`);
