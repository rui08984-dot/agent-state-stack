/**
 * Agent State Stack · pi 扩展（before_agent_start 注入开场简报）
 * 与 hook/statebrief.mjs（ZCode 侧）同源逻辑：progress.md 🔄⛔ 行 + SessionRelay 决策/未解决段
 *
 * 安装：本文件放进 ~/.pi/agent/extensions/，改下方 NODE/SRELAY 两行常量。
 * 节流：按项目目录分桶 10 分钟（防跨项目互相吞简报）；用户消息含"继续/看板/接入"时
 *       绕过 10 分钟节流（但有 15 秒冷却，防连发双份注入）。
 * 任何异常=不注入，绝不阻塞对话。
 *
 * ⚠️ pi 是 Bun 内核：process.execPath 指向 pi.exe 本体——spawn srelay 必须显式 NODE，
 *    不能用 process.execPath（这是红队抓过的 P1）。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

// ===== 按你的机器改这两行 =====
const NODE = "node"; // node 可执行文件绝对路径最稳
const SRELAY = "C:/Users/<你>/AppData/Roaming/npm/node_modules/@ewanjasper/sessionrelay/dist/srelay.js";
// ==============================
const DBG = process.env.SRELAY_BRIEF_DEBUG === "1";
const THROTTLE_MS = 10 * 60 * 1000;
const FORCE_WORDS = ["继续", "看板", "接入"];
const FORCED_COOLDOWN_MS = 15 * 1000;
const MAX_LEN = 1200;

const lastInjectByCwd = new Map<string, number>();

function srelay(args: string[]): string | null {
	try {
		return execFileSync(NODE, [SRELAY, ...args], {
			cwd: process.cwd(),
			timeout: 4000,
			encoding: "utf8",
			windowsHide: true,
		});
	} catch (e) {
		if (DBG) console.error("[statebrief] srelay:", (e as any)?.message ?? e);
		return null;
	}
}

function kanbanLines(): string | null {
	const p = join(process.cwd(), "progress.md");
	if (!existsSync(p)) return null;
	if (statSync(p).size > 1048576) {
		if (DBG) console.error("[statebrief] progress.md >1MB, skip");
		return null;
	}
	try {
		const lines = readFileSync(p, "utf8").split(/\r?\n/);
		const updated =
			(lines.find((l) => l.startsWith("> 最后更新"))?.match(/\d{4}-\d{2}-\d{2}/) ?? [""])[0] ?? "";
		const rows = lines
			.map((l) => l.split("|").map((s) => s.trim()))
			.filter((c) => c.length >= 5 && /^[✅🔄⛔⬜]/u.test(c[2] ?? "") && /[🔄⛔]/u.test(c[2] ?? ""))
			.map((c) => `| ${c[1]} | ${c[2]} | ${c[3] ?? "—"} | ${c[4] ?? ""} |`)
			.slice(0, 5);
		if (!rows.length) return null;
		return `看板(progress.md${updated ? " " + updated : ""})进行中/阻塞:\n${rows.join("\n")}`;
	} catch (e) {
		if (DBG) console.error("[statebrief] kanban:", (e as any)?.message ?? e);
		return null;
	}
}

function jsonItems(raw: string | null, key: string, max: number): string[] {
	if (!raw) return [];
	try {
		const j = JSON.parse(raw);
		const arr: any[] = j[key] ?? j.unresolved ?? [];
		return arr
			.slice(0, max)
			.map((d: any) => `- ${String(d.text ?? d.summary ?? d.title ?? JSON.stringify(d)).slice(0, 90)}`);
	} catch {
		// srelay 0.5.x 的 unresolved --json 注册有笔误（丢弃 --json）：空时输出人话——文本兜底
		const clean = raw
			.replace(/\[[0-9;]*m/g, "")
			.split(/\r?\n/)
			.map((s: string) => s.trim())
			.filter((s: string) => s && !s.startsWith("（") && !s.startsWith("("));
		if (!clean.length || /暂无/.test(raw)) return [];
		return clean.slice(0, max).map((s: string) => `- ${s.slice(0, 90)}`);
	}
}

export default function stateBrief(pi: any) {
	pi.on("before_agent_start", (event: any, ctx: any) => {
		try {
			const prompt: string = event.prompt ?? "";
			const forced = FORCE_WORDS.some((w) => prompt.includes(w));
			const cwd = process.cwd();
			const last = lastInjectByCwd.get(cwd) ?? 0;
			const elapsed = Date.now() - last;
			if (!forced && elapsed < THROTTLE_MS) return undefined;
			if (forced && elapsed < FORCED_COOLDOWN_MS) return undefined;

			const hasStack = existsSync(join(cwd, ".sessionrelay"));
			const handoffDir = join(cwd, ".scratch", "handoff");
			const hasHistory =
				existsSync(handoffDir) && readdirSync(handoffDir).some((f) => f.endsWith(".md"));

			if (!hasStack && !hasHistory) return undefined; // 普通目录零打扰

			if (!hasStack && hasHistory) {
				lastInjectByCwd.set(cwd, Date.now());
				return {
					message: {
						customType: "state-brief",
						content: `【状态栈提示】${basename(cwd)} 有历史交接链(.scratch/handoff/)未接入状态栈。用户说"接入"即执行：srelay init → 从交接链/锚点生成 progress.md 与 architecture.mmd。`,
						display: false,
					},
				};
			}

			const parts: string[] = ["📍 项目状态简报(自动注入,出处可信;注入≠强制续作——你下一句话才是指令;说\"继续\"按此续作)"];
			const kb = kanbanLines();
			if (kb) parts.push(kb);
			const dec = jsonItems(srelay(["decisions", "--limit", "3", "--json"]), "decisions", 3);
			if (dec.length) parts.push("最近决策:\n" + dec.join("\n"));
			const unres = jsonItems(srelay(["unresolved", "--limit", "2", "--json"]), "items", 2);
			if (unres.length) parts.push("未解决:\n" + unres.join("\n"));

			let text = parts.join("\n");
			if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN) + "\n…(截断,细节 srelay search)";
			lastInjectByCwd.set(cwd, Date.now()); // 空简报也落位，防空轮询每轮白 spawn
			if (text.length <= 60) return undefined;

			return {
				message: {
					customType: "state-brief",
					content: text,
					display: false,
				},
			};
		} catch (e) {
			if (DBG) console.error("[statebrief]", (e as any)?.message ?? e);
			return undefined;
		}
	});
}
