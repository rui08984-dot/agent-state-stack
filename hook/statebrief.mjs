#!/usr/bin/env node
// Agent State Stack · ZCode SessionStart hook
// 每次新会话注入项目状态简报：progress.md 的 🔄⛔ 行 + SessionRelay 决策/未解决段
// 三层判定：①栈项目(.sessionrelay)→注入简报 ②有历史交接链未接入→提示"接入" ③其他→静默
// 任何失败=空输出=不阻塞会话（hook 规范：空输出合法）
//
// 安装：见仓库 README（config.json hooks 事件挂载）；可选环境变量：
//   STACK_NODE / SRELAY_JS / SRELAY_BRIEF_DEBUG=1（排障，错误走 stderr 不污染 hook JSON）
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const NODE = process.env.STACK_NODE || 'node'; // node 可执行文件（argv 直传，无需引号）
const SRELAY = process.env.SRELAY_JS
  || (process.platform === 'win32'
    ? join(process.env.APPDATA || '', 'npm/node_modules/@ewanjasper/sessionrelay/dist/srelay.js')
    : '/usr/lib/node_modules/@ewanjasper/sessionrelay/dist/srelay.js');
const DBG = process.env.SRELAY_BRIEF_DEBUG === '1';

const root = process.env.ZCODE_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const emit = (ctx) => process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx }
}));

function srelay(args) {
  try {
    return execFileSync(NODE, [SRELAY, ...args], { cwd: root, timeout: 4000, encoding: 'utf8', windowsHide: true });
  } catch (e) {
    if (DBG) console.error('[statebrief] srelay:', (e && e.message) || e);
    return null;
  }
}

function kanbanLines() {
  const p = join(root, 'progress.md');
  if (!existsSync(p)) return null;
  if (statSync(p).size > 1048576) { if (DBG) console.error('[statebrief] progress.md >1MB, skip'); return null; }
  try {
    const lines = readFileSync(p, 'utf8').split(/\r?\n/);
    const updated = ((lines.find(l => l.startsWith('> 最后更新')) || '').match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
    // 表格行：第 2 列以状态 emoji 开头；只取进行/阻塞行。正则必须 /u（emoji 代理单元陷阱）
    const rows = lines.filter(l => {
      const c = l.split('|').map(s => s.trim());
      return c.length >= 5 && /^[✅🔄⛔⬜]/u.test(c[2] || '') && /[🔄⛔]/u.test(c[2] || '');
    }).slice(0, 5);
    if (!rows.length) return null;
    return `看板(progress.md${updated ? ' ' + updated : ''})进行中/阻塞:\n${rows.join('\n')}`;
  } catch (e) {
    if (DBG) console.error('[statebrief] kanban:', (e && e.message) || e);
    return null;
  }
}

// decisions/unresolved 的 JSON 输出；解析失败走纯文本兜底（上游 0.5.x 的 unresolved 丢弃 --json）
function section(raw, jsonKey, max, label) {
  if (!raw) return null;
  let items = null;
  try {
    const j = JSON.parse(raw);
    const arr = j[jsonKey] || j.unresolved || [];
    items = arr.slice(0, max).map(d => `- ${String(d.text ?? d.summary ?? d.title ?? JSON.stringify(d)).slice(0, 90)}`);
  } catch {
    const clean = raw.replace(/\[[0-9;]*m/g, '').split(/\r?\n/).map(s => s.trim())
      .filter(s => s && !s.startsWith('（') && !s.startsWith('('));
    if (clean.length && !/暂无/.test(raw)) items = clean.slice(0, max).map(s => `- ${s.slice(0, 90)}`);
  }
  return items && items.length ? `${label}:\n${items.join('\n')}` : null;
}

try {
  const hasStack = existsSync(join(root, '.sessionrelay'));
  const handoffDir = join(root, '.scratch', 'handoff');
  const hasHistory = existsSync(handoffDir) && readdirSync(handoffDir).filter(f => f.endsWith('.md')).length > 0;

  if (!hasStack && !hasHistory) process.exit(0); // 普通目录零打扰

  if (!hasStack && hasHistory) {
    emit(`【状态栈提示】${basename(root)} 检测到历史交接链(.scratch/handoff/)但未接入状态栈。用户说"接入"即执行：srelay init → 从交接链/锚点生成 progress.md 看板与 architecture.mmd。本轮先按原文件工作即可。`);
    process.exit(0);
  }

  const parts = [`📍 项目状态简报（自动注入，出处可信；注入≠强制续作——你下一句话才是指令；说"继续"按此续作）`];
  const kb = kanbanLines();
  if (kb) parts.push(kb);
  const rel = section(srelay(['decisions', '--limit', '3', '--json']), 'decisions', 3, '最近决策');
  if (rel) parts.push(rel);
  const unr = section(srelay(['unresolved', '--limit', '2', '--json']), 'items', 2, '未解决');
  if (unr) parts.push(unr);

  let ctx = parts.join('\n');
  if (ctx.length > 1500) ctx = ctx.slice(0, 1500) + '\n…(截断，细节 srelay search)';
  if (ctx.length > 60) emit(ctx);
  process.exit(0);
} catch (e) {
  if (DBG) console.error('[statebrief]', (e && e.message) || e);
  process.exit(0);
}
