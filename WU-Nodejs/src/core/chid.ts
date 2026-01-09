import { validate as uuidValidate } from "uuid";
import { ApiException } from "../api/http";
import { promptText } from "../ui/wrangler";

const GuidCanonicalRegex =
  /^\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}?$/;

export function normalizeChidsRequired(input: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    const s = String(raw || "").trim();
    if (!s) continue;

    if (!GuidCanonicalRegex.test(s)) {
      throw new ApiException(`CHID 不是合法 GUID（需 8-4-4-4-12 且带连字符）: ${s}`);
    }

    const core = s.startsWith("{") && s.endsWith("}") ? s.slice(1, -1) : s;
    if (!uuidValidate(core)) throw new ApiException(`CHID 不是合法 GUID: ${s}`);

    const norm = core.toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }

  if (out.length === 0) throw new ApiException("至少需要 1 个 CHID。");
  return out;
}

export async function promptChidsRequired() {
  while (true) {
    const raw = await promptText("CHIDs（必填，逗号分隔，可多个）");
    const parts = raw.split(",").map(x => x.trim()).filter(Boolean);
    try {
      return normalizeChidsRequired(parts);
    } catch (ex: any) {
      // 继续循环
      console.log(`输入有误：${ex?.message || ex}`);
    }
  }
}
