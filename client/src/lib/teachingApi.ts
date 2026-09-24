import { GAS_WEB_APP_URL } from "./historyQuest";
let ready = false;
function serviceUrl(action?: string) {
  const url = new URL(GAS_WEB_APP_URL);
  if (action) url.searchParams.set("action", action);
  // Google redirects responses to a temporary URL; do not reuse a cached redirect.
  url.searchParams.set("_", crypto.randomUUID());
  return url.toString();
}
export async function serviceReady() {
  if (ready) return;
  const response = await fetch(serviceUrl("capabilities"), {
    cache: "no-store",
    credentials: "omit",
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (result.api_version !== 2)
    throw new Error(
      "成績服務尚未升級，請先部署新版 Apps Script。答案會保留在本機，稍後重試。"
    );
  ready = true;
}
export async function teachingApi<T>(
  body: Record<string, unknown>
): Promise<T> {
  await serviceReady();
  const response = await fetch(serviceUrl(), {
    method: "POST",
    cache: "no-store",
    credentials: "omit",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...body, api_version: 2 }),
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok)
    throw new Error(result.message || "成績服務未能完成操作。");
  if (result.api_version !== 2)
    throw new Error(
      "成績服務尚未升級，請先部署新版 Apps Script。答案仍保留在本機。"
    );
  return result as T;
}
