import fs from "fs";
import path from "path";
import { banner, section, item, endLine, ok, fail, promptText, promptPassword, spin } from "./ui/wrangler";
import { parseOptions } from "./core/args";
import { getCredentialPath } from "./config/paths";
import { loadCredential, saveCredential } from "./config/credentialStore";
import { firstNonEmpty } from "./config/env";
import { tryParseSubmissionShortcut } from "./core/shortcut";
import { acquireToken, getSubmission, findDriverMetadataUrl, downloadDriverMetadata, createShippingLabel } from "./api/devcenter";
import { printWorkflowStatus } from "./core/workflow";
import { parseAllCandidatesWithUi } from "./core/metadata";
import { selectCandidatesSinglePage } from "./ui/select";
import { normalizeChidsRequired, promptChidsRequired } from "./core/chid";
import { buildShippingLabelPayload } from "./core/payload";
import { ApiException } from "./api/http";

async function main() {
  const opt = parseOptions(process.argv.slice(2));

  banner("WU", "1.0.0");
  console.log("Hardware Dashboard API - Shipping Label Creator");
  console.log("=".repeat(100));

  // Step 1/4: Credentials & IDs
  section({ title: "Initialize & Auth", current: 1, total: 4 });
  item("Loading credentials", path.join(".", "credential.json"));

  const credPath = getCredentialPath();
  const cred = loadCredential(credPath);

  opt.TenantId = firstNonEmpty(cred.TenantId, opt.TenantId, process.env.HW_TENANT_ID);
  opt.ClientId = firstNonEmpty(cred.ClientId, opt.ClientId, process.env.HW_CLIENT_ID);
  opt.ClientSecret = firstNonEmpty(cred.ClientSecret, opt.ClientSecret, process.env.HW_CLIENT_SECRET);

  // 1. Prompt for credentials if missing
  if (!opt.TenantId?.trim()) opt.TenantId = await promptText("tenant_id");
  if (!opt.ClientId?.trim()) opt.ClientId = await promptText("client_id");
  if (!opt.ClientSecret?.trim()) opt.ClientSecret = await promptPassword("client_secret");

  cred.TenantId = opt.TenantId!;
  cred.ClientId = opt.ClientId!;
  cred.ClientSecret = opt.ClientSecret!;
  saveCredential(credPath, cred);

  // 2. Acquire Token *BEFORE* asking for Product/Submission ID
  const token = await spin("Acquiring token", async () => {
    return await acquireToken(opt.TenantId!, opt.ClientId!, opt.ClientSecret!);
  });
  // ok("token OK"); // Spinner success checkmark is enough

  // 3. Now Prompt for Product/Submission ID (if not provided via args)
  if (!opt.ProductId?.trim()) {
    const raw = await promptText("productId (or submission string)");
    const parsed = tryParseSubmissionShortcut(raw);
    if (parsed.ok) {
      opt.ProductId = parsed.productId;
      if (!opt.SubmissionId?.trim()) opt.SubmissionId = parsed.submissionId;
    } else {
      opt.ProductId = raw;
    }
  }
  if (!opt.SubmissionId?.trim()) opt.SubmissionId = await promptText("submissionId");

  endLine("Ready");
  ok("Inputs OK & Authenticated");

  // Step 2/4: Fetch Submission
  section({ title: "Fetch submission", current: 2, total: 4 });

  const submission = await spin("Fetching submission", async () => {
    return await getSubmission(token, opt.ProductId!, opt.SubmissionId!);
  });

  printWorkflowStatus(submission);
  endLine("Fetched");

  // Step 3/4: Metadata + selection
  section({ title: "Parse driverMetadata", current: 3, total: 4 });

  const metaRoot = await spin("Downloading driverMetadata", async () => {
    const url = findDriverMetadataUrl(submission);
    return await downloadDriverMetadata(token, url);
  });

  item("Building candidates list");
  const parsed = parseAllCandidatesWithUi(metaRoot);
  ok(`candidates=${parsed.candidates.length}`);

  if (parsed.candidates.length === 0) {
    throw new ApiException("metadata 中没有任何候选项，无法继续");
  }

  const selected = opt.SelectAll
    ? parsed.candidates
    : await selectCandidatesSinglePage(parsed.candidates, parsed.ui, opt);

  ok(`selected hardwareIds=${selected.length}`);
  endLine("Selected");

  // Step 4/4: Build payload + POST
  section({ title: "Create shipping label", current: 4, total: 4 });
  const chids = opt.Chids.length ? normalizeChidsRequired(opt.Chids) : await promptChidsRequired();

  const name = opt.Name?.trim()
    ? opt.Name.trim()
    : await promptText("Shipping label name", "{OEM Name}: {Project Name}");

  const body = buildShippingLabelPayload(opt, name, selected, chids);

  fs.writeFileSync(opt.OutPath, JSON.stringify(body, null, 2), "utf8");
  ok(`request saved: ${opt.OutPath}`);

  if (opt.DryRun) {
    endLine("--dry-run (no POST)");
    ok("Done");
    return;
  }

  const resp = await spin("POST /shippingLabels", async () => {
     return await createShippingLabel(token, opt.ProductId!, opt.SubmissionId!, body);
  });

  const shippingId = typeof resp?.id === "number" ? resp.id : null;
  if (shippingId) {
    const shippingUrl = `https://partner.microsoft.com/en-us/dashboard/hardware/driver/${opt.ProductId}/submission/${opt.SubmissionId}/ShippingLabel/${shippingId}`;
    ok(`Created: ${shippingUrl}`);
  } else {
    ok("Created (id not found in response)");
  }

  endLine("Complete");
}

main().catch((ex: any) => {
  if (ex?.name === "AbortError") {
    fail("用户取消或超时。");
    process.exitCode = 130;
    return;
  }
  if (ex instanceof ApiException) {
    fail(ex.message);
    process.exitCode = 1;
    return;
  }
  fail("未预期错误：");
  console.error(ex);
  process.exitCode = 1;
});
