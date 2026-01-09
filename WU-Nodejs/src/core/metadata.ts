import chalk from "chalk";
import { ApiException } from "../api/http";
import { HwidCandidate, UiMapping } from "../models/types";

function palette() {
  return [
    chalk.cyan,
    chalk.yellow,
    chalk.green,
    chalk.magenta,
    chalk.blue,
    chalk.white,
    chalk.cyanBright,
    chalk.yellowBright,
    chalk.greenBright,
    chalk.magentaBright,
  ] as Array<(s: string) => string>;
}

export function parseAllCandidatesWithUi(metaRoot: any): { candidates: HwidCandidate[]; ui: UiMapping } {
  const bundleInfoMap = metaRoot?.BundleInfoMap;
  if (!bundleInfoMap || typeof bundleInfoMap !== "object") {
    throw new ApiException("driverMetadata 缺少 BundleInfoMap（结构不符合示例）");
  }

  const bundleIds = Object.keys(bundleInfoMap).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  const colors = palette();

  const ui: UiMapping = {
    bundleTagById: new Map(),
    bundleColorById: new Map(),
    legends: [],
  };

  for (let i = 0; i < bundleIds.length; i++) {
    const id = bundleIds[i];
    ui.bundleTagById.set(id, `B${i + 1}`);
    ui.bundleColorById.set(id, colors[i % colors.length]);
  }

  const all: HwidCandidate[] = [];
  const seen = new Set<string>();

  const infSetByBundle = new Map<string, Set<string>>();
  const countByBundle = new Map<string, number>();

  for (const bundleId of bundleIds) {
    const bundleObj = bundleInfoMap[bundleId];
    if (!bundleObj || typeof bundleObj !== "object") continue;

    const infInfoMap = bundleObj?.InfInfoMap;
    if (!infInfoMap || typeof infInfoMap !== "object") continue;

    if (!infSetByBundle.has(bundleId)) infSetByBundle.set(bundleId, new Set());

    for (const infId of Object.keys(infInfoMap)) {
      infSetByBundle.get(bundleId)!.add(infId);

      const infObj = infInfoMap[infId];
      if (!infObj || typeof infObj !== "object") continue;

      const osPnpInfoMap = infObj?.OSPnPInfoMap;
      if (!osPnpInfoMap || typeof osPnpInfoMap !== "object") continue;

      for (const osCode of Object.keys(osPnpInfoMap)) {
        const pnpDict = osPnpInfoMap[osCode];
        if (!pnpDict || typeof pnpDict !== "object") continue;

        for (const pnpString of Object.keys(pnpDict)) {
          const detailObj = pnpDict[pnpString] ?? {};
          const manufacturer = detailObj?.Manufacturer ?? null;
          const deviceDescription = detailObj?.DeviceDescription ?? null;

          const key = `${bundleId}|${infId}|${osCode}|${pnpString}`;
          if (seen.has(key)) continue;
          seen.add(key);

          all.push({
            BundleId: bundleId,
            BundleTag: ui.bundleTagById.get(bundleId)!,
            InfId: infId,
            OperatingSystemCode: osCode,
            PnpString: pnpString,
            Manufacturer: manufacturer,
            DeviceDescription: deviceDescription,
          });

          countByBundle.set(bundleId, (countByBundle.get(bundleId) || 0) + 1);
        }
      }
    }
  }

  // legend
  for (const bundleId of bundleIds) {
    const cnt = countByBundle.get(bundleId) || 0;
    const tag = ui.bundleTagById.get(bundleId)!;
    const set = infSetByBundle.get(bundleId) || new Set<string>();
    const sampleInfs = Array.from(set).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })).slice(0, 3);
    ui.legends.push({ bundleId, tag, itemCount: cnt, sampleInfs });
  }

  all.sort((x, y) => {
    const a = x.BundleTag.localeCompare(y.BundleTag, "en", { sensitivity: "base" });
    if (a !== 0) return a;
    const b = x.InfId.localeCompare(y.InfId, "en", { sensitivity: "base" });
    if (b !== 0) return b;
    const c = x.OperatingSystemCode.localeCompare(y.OperatingSystemCode, "en", { sensitivity: "base" });
    if (c !== 0) return c;
    return x.PnpString.localeCompare(y.PnpString, "en", { sensitivity: "base" });
  });

  return { candidates: all, ui };
}

function fit(s: string, w: number) {
  s = s ?? "";
  if (w <= 0) return "";
  if (s.length === w) return s;
  if (s.length < w) return s.padEnd(w);
  if (w <= 1) return s.slice(0, w);
  return s.slice(0, w - 1) + "…";
}

export function buildSinglePageRowText(c: HwidCandidate) {
  const width = Math.max(80, (process.stdout.columns || 120) - 1);

  let infW = 28, osW = 28, pnpW = 28;
  const minInf = 16, minOs = 18, minPnp = 18;

  const contentBudget = width - 20;
  const needed = 3 + 1 + infW + 3 + osW + 3 + pnpW + 3 + 10;
  if (contentBudget < needed) {
    let reduce = needed - contentBudget;
    while (reduce > 0 && (infW > minInf || osW > minOs || pnpW > minPnp)) {
      if (pnpW > minPnp) { pnpW--; reduce--; if (!reduce) break; }
      if (osW > minOs) { osW--; reduce--; if (!reduce) break; }
      if (infW > minInf) { infW--; reduce--; if (!reduce) break; }
    }
  }

  const b = (c.BundleTag ?? "").padEnd(3);
  const inf = fit(c.InfId, infW);
  const os = fit(c.OperatingSystemCode, osW);
  const pnp = fit(c.PnpString, pnpW);

  const extraParts: string[] = [];
  if (c.Manufacturer?.trim()) extraParts.push(c.Manufacturer.trim());
  if (c.DeviceDescription?.trim()) extraParts.push(c.DeviceDescription.trim());
  const extra = extraParts.length ? extraParts.join(" | ") : "";

  return extra
    ? `${b} ${inf} | ${os} | ${pnp} | ${extra}`
    : `${b} ${inf} | ${os} | ${pnp}`;
}
