import fs from "fs";
import { Credential } from "../models/types";

function defaults(): Credential {
  return {
    TenantId: "",
    ClientId: "",
    ClientSecret: "",
    MsContact: "feizh@microsoft.com",
    ValidationsPerformed: "Product assurance team full range tested",
    AffectedOems: ["N/A"],
    BusinessJustification: "to meet MDA requirements"
  };
}

export function loadCredential(filePath: string): Credential {
  try {
    if (!fs.existsSync(filePath)) return defaults();
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.trim()) return defaults();
    const obj = JSON.parse(text);
    return { ...defaults(), ...(obj || {}) };
  } catch {
    return defaults();
  }
}

export function saveCredential(filePath: string, cred: Credential) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(cred, null, 2), "utf8");
  } catch {
    // ignore
  }
}
