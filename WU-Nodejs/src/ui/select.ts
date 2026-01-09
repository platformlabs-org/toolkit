import chalk from "chalk";
import inquirer from "inquirer";
import { Options, HwidCandidate, UiMapping } from "../models/types";
import { ApiException } from "../api/http";
import { promptConfirm, promptText, warn, info } from "./wrangler";
import { buildSinglePageRowText } from "../core/metadata";

// no-ui fallback：支持 a / 1,3,5 / 2-6
function parseIndexExpr(expr: string, n: number) {
  const s = (expr ?? "").trim().toLowerCase();
  if (["a", "all", "*"].includes(s)) return Array.from({ length: n }, (_, i) => i);
  if (!s) return [];
  const chosen = new Set<number>();
  const parts = s.split(",").map(x => x.trim()).filter(Boolean);

  for (const token of parts) {
    const m = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) if (1 <= i && i <= n) chosen.add(i - 1);
      continue;
    }
    if (/^\d+$/.test(token)) {
      const i = parseInt(token, 10);
      if (1 <= i && i <= n) chosen.add(i - 1);
      continue;
    }
    throw new Error(`无法解析: ${token}`);
  }

  return Array.from(chosen).sort((a, b) => a - b);
}

async function fallbackChoose(items: string[]) {
  console.log("\n" + "─".repeat(120));
  console.log("选择硬件目标（no-ui 模式）");
  console.log("提示：输入 a 全选；支持 1,3,5 或 2-6；回车无效（必须选至少一个）");
  console.log("─".repeat(120));
  items.forEach((t, i) => console.log(`[${String(i + 1).padStart(5)}] ${t}`));
  console.log("─".repeat(120));

  while (true) {
    const expr = await promptText("选择序号表达式");
    try {
      const idxs = parseIndexExpr(expr, items.length);
      if (idxs.length === 0) {
        console.log("至少选择一个。");
        continue;
      }
      if (idxs.some(i => i < 0 || i >= items.length)) {
        console.log("序号超范围。");
        continue;
      }
      return idxs;
    } catch (ex: any) {
      console.log(`输入有误：${ex?.message || ex}`);
    }
  }
}

// Wrangler-ish：先显示 legend，再单页 checkbox
export async function selectCandidatesSinglePage(
  all: HwidCandidate[],
  ui: UiMapping,
  opt: Options
): Promise<HwidCandidate[]> {
  let working = all;

  // 大量候选 -> 询问是否过滤（保留 C# 行为）
  if (working.length > 300 && opt.OfferFilter) {
    const yes = await promptConfirm(`候选组合很多（${working.length}），是否先用关键字过滤？`, true);
    if (yes) {
      const kw = await promptText("过滤关键字（匹配 INF/OS/PNP/描述；留空=不筛选）", "");
      if (kw.trim()) {
        const low = kw.toLowerCase();
        working = working.filter(c => {
          const inf = (c.InfId || "").toLowerCase();
          const os = (c.OperatingSystemCode || "").toLowerCase();
          const pnp = (c.PnpString || "").toLowerCase();
          const man = (c.Manufacturer || "").toLowerCase();
          const desc = (c.DeviceDescription || "").toLowerCase();
          return inf.includes(low) || os.includes(low) || pnp.includes(low) || man.includes(low) || desc.includes(low);
        });
        info(`过滤后 candidates=${working.length}`);
      }
    }
  }

  if (working.length === 0) throw new ApiException("过滤后没有任何候选项。");

  const legendLine =
    ui.legends.length > 1
      ? ui.legends
          .map(l => {
            const colorFn = ui.bundleColorById.get(l.bundleId) || ((s: string) => s);
            const infHint = l.sampleInfs.length ? ` (${l.sampleInfs.join(", ")})` : "";
            return colorFn(`${l.tag}:${l.itemCount}${infHint}`);
          })
          .join("  ")
      : null;

  if (legendLine) {
    console.log("");
    console.log(`${chalk.gray("Bundles:")} ${legendLine}`);
  }

  // 生成单页文本（颜色只给 bundle tag 整行染色即可）
  const rows = working.map((c, idx) => {
    const colorFn = ui.bundleColorById.get(c.BundleId) || ((s: string) => s);
    const text = buildSinglePageRowText(c);
    return {
      idx,
      label: colorFn(`${String(idx + 1).padStart(5)} ${text}`),
    };
  });

  // no-ui 走文本选择
  if (opt.NoUi) {
    warn("--no-ui：使用文本选择器");
    const idxs = await fallbackChoose(rows.map(r => r.label.replace(/\x1b\[[0-9;]*m/g, ""))); // strip color
    return idxs.map(i => working[i]);
  }

  // inquirer checkbox：单页组合列表
  const pageSize = Math.min(22, Math.max(10, (process.stdout.rows || 30) - 8));
  const ans = await inquirer.prompt([
    {
      type: "checkbox",
      name: "picked",
      message: "选择硬件目标（空格勾选 / 回车确认）",
      pageSize,
      loop: false,
      choices: rows.map(r => ({ name: r.label, value: r.idx })),
      validate: (arr: number[]) => (arr && arr.length > 0 ? true : "至少选择一个（或 Ctrl+C 退出）"),
    },
  ]);

  const picked = (ans.picked as number[]).slice().sort((a, b) => a - b);
  return picked.map(i => working[i]);
}
