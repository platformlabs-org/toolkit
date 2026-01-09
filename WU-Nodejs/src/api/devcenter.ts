import { ApiException, fetchWithTimeout } from "./http";

const BaseApi = "https://manage.devcenter.microsoft.com/v2.0/my/hardware";

export async function acquireToken(tenantId: string, clientId: string, clientSecret: string) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/token`;
  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    resource: "https://manage.devcenter.microsoft.com"
  });

  const resp = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form
  });

  const text = await resp.text();
  if (!resp.ok) throw new ApiException(`获取 token 失败: ${resp.status}\n${text}`);

  const json = JSON.parse(text);
  const token = json?.access_token;
  if (!token) throw new ApiException(`响应缺少 access_token: ${text}`);
  return String(token);
}

export async function getSubmission(token: string, productId: string, submissionId: string) {
  const url = `${BaseApi}/products/${productId}/submissions/${submissionId}`;
  const resp = await fetchWithTimeout(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });

  const text = await resp.text();
  if (!resp.ok) throw new ApiException(`GET submission 失败: ${resp.status}\n${text}`);
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new ApiException("submission 响应不是 JSON object");
  return obj;
}

export function findDriverMetadataUrl(submission: any) {
  const items = submission?.downloads?.items;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (String(it?.type || "").toLowerCase() === "drivermetadata" && it?.url) return String(it.url);
    }
  }
  const links = submission?.links;
  if (Array.isArray(links)) {
    for (const lk of links) {
      if (String(lk?.rel || "").toLowerCase() === "drivermetadata" && lk?.href) return String(lk.href);
    }
  }
  throw new ApiException("submission 中未找到 driverMetadata URL");
}

export async function downloadDriverMetadata(token: string, url: string) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (url.toLowerCase().includes("manage.devcenter.microsoft.com")) headers.Authorization = `Bearer ${token}`;

  const resp = await fetchWithTimeout(url, { method: "GET", headers });
  const text = await resp.text();
  if (!resp.ok) throw new ApiException(`GET driverMetadata 失败: ${resp.status}\n${text}`);

  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new ApiException("driverMetadata JSON 不是 object");
  return obj;
}

export async function createShippingLabel(token: string, productId: string, submissionId: string, body: any) {
  const url = `${BaseApi}/products/${productId}/submissions/${submissionId}/shippingLabels`;
  const resp = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await resp.text();
  if (!resp.ok) throw new ApiException(`POST /shippingLabels 失败: ${resp.status}\n${text}`);
  return JSON.parse(text);
}
