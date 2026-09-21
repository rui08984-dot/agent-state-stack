# 运维手册（ops.md）

> 本仓库组件的故障排查、稳定性设计与回归清单。全部条目来自 2026-09-21 两轮红队审计的实战发现（32 条，P0=0/P1=7/P2=8）。

## 1. 故障排查表

| 症状 | 诊断 | 修复 |
|---|---|---|
| 新会话没简报（ZCode） | `SRELAY_BRIEF_DEBUG=1` 手跑 hook 脚本看 stderr | config.json `hooks.enabled` 丢了→重挂；脚本坏→按报错修 |
| **config 里路径出现控制字符** | `node -e` 打印 command + 逐字符扫 `<32`；**只看 enabled=true 不算验证** | 用工具直写配置文件，禁走 shell 层转义；Windows 路径一律正斜杠 |
| pi 简报缺决策/未解决段 | ①扩展里 spawn 用了 `process.execPath`——**pi 是 Bun 内核，execPath=pi.exe** ②srelay 0.5.x `unresolved` 丢弃 `--json`（空时输出人话）③决策字段是 `text`/`q` 不是 summary/title | 显式 NODE 常量；解析失败走文本兜底（本仓库脚本已内置） |
| hook 超时被杀 | hook 预算 < srelay 子进程耗时 | 本仓库默认：子进程 4s×2 + hook 预算 20s |
| 简报缺看板段 | debug 看是否 ">1MB skip" 或 kanban 报错 | progress.md 表格行须 `\| 模块 \| 状态emoji开头 \|` 四列 |
| dashboard 无图形 | mermaid vendor 文件在否 | 丢了重下，或靠 CDN 兜底（自动切换） |
| 看板状态行被面板丢弃 | emoji 正则无 `/u` 标志：🔄（U+1F504）被拆代理单元，`str[0]` 取到半个码点 | 正则一律加 `/u`；取码点用 `[...str][0]`（本仓库脚本已内置） |
| 会话捕获停摆（重启后） | Windows 自启链：Run 键→vbs→cmd→node；**SessionRelay 0.5.x 生成的 cmd 不转义 node 路径**（`C:\Program Files` 被劈成 `C:\Program`） | 给 cmd 里 node 路径加引号；上游 issue [#1](https://github.com/EwanJasper/SessionRelay/issues/1)；注意 `--install-service` 每次重装都会覆写回无引号版 |
| srelay 偶发 exit=1 | stats.json 共享 .tmp 名 + rename 竞态（高并发实测可复现） | 脚本 try/catch 兜住即可；已随 #1 上报 |

## 2. 稳定性设计原则

- **兜底链**：脚本任何异常=空输出=会话照常；srelay 挂=简报只剩看板段；看板没更=relay 原文兜底（守护 30s 入库，防上下文压缩删原文）
- **注入 ≠ 强制续作**：简报只是让代理"知道现状"，用户下一句话才是指令——这句 guard 要同时写进注入文本和 AGENTS.md
- **节流**：pi 侧按项目目录分桶 10 分钟；口令（继续/看板/接入）绕过节流但有 15s 冷却（防连发双份注入）；空简报也落位（防空轮询每轮白 spawn）
- **嵌入运行时铁律**：Bun/Electron 里 `process.execPath` ≠ node——spawn 外部脚本必须显式 node 路径
- **emoji 铁律**：JS 正则匹配 emoji 必须加 `/u`；取首码点用 `[...str][0]`
- **配置写入铁律**：用工具直写配置文件，禁走 shell 层转义；Windows 路径一律正斜杠；落盘验证必须打印实际值+控制字符扫描（布尔位不算数）

## 3. 已知边界

- md 表格格内裸 `|` 会截断该格（纪律：格内禁裸竖线）
- dashboard.html 是快照，重跑生成器才刷新
- SessionRelay 0.5.x 自动捕获源不含 pi（pi 会话原文不自动入库）；pi 侧靠 MCP 工具主动写决策弥补
- pi 简报对看板第 5+ 列不透传（固定四列重排）
- `srelay watch --uninstall` 只摘注册不杀在跑实例；正确顺序=uninstall→kill 旧 pid→拉新→补注册

## 4. 改动后必跑回归

1. **注入逻辑**（免 GPU）：临时脚本 `import` pi 扩展 + 喂假事件——七场景：栈注入/防劫持声明/口令强制/节流跳过/老项目提示/老项目节流/普通目录静默
2. **hook 三层判定**：`ZCODE_PROJECT_DIR=<栈项目|有交接链老项目|普通目录>` 三目录跑 hook 脚本验 JSON
3. **敌意样张**：竖线/引号/`<script>`/未知 emoji/巨文件(>1MB)/目录型 progress.md
4. **链路**：`srelay serve` initialize 握手 + `srelay watch --status` + watch.log 出现 `[srelay-watch]` 行
5. **面板**：生成器跑一遍，泳道计数与 progress.md 实际行数双向核对
6. GPU 争用（util>10%）时不跑真实模型端到端，留空窗
