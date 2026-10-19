import { createHash, timingSafeEqual } from "node:crypto";

export const API_BASE = (process.env.MARIX_API_BASE || "https://marix.esite.top").replace(/\/+$/, "");
export const UPLOAD_LIMIT = 3_800_000; // Vercel Function whole request cap is 4.5 MB.

export function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}

export function checkAccess(request) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    return json({ success: false, error: "Set APP_PASSWORD in Vercel Environment Variables before using the API." }, 503);
  }
  const supplied = request.headers.get("x-app-password") || "";
  const expectedDigest = createHash("sha256").update(password).digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  if (!timingSafeEqual(expectedDigest, suppliedDigest)) {
    return json({ success: false, error: "Incorrect website password." }, 401);
  }
  return null;
}

export function apiHeaders() {
  const apiKey = process.env.MARIX_API_KEY;
  if (!apiKey) throw new Error("MARIX_API_KEY is not configured in Vercel Environment Variables.");
  return { "x-api-key": apiKey };
}

export function errorMessage(payload, fallback) {
  if (payload && typeof payload === "object") {
    const candidate = payload.error || payload.message || payload.detail;
    if (candidate) return typeof candidate === "string" ? candidate : JSON.stringify(candidate);
  }
  return fallback;
}

export async function upstreamJson(response, fallbackMessage) {
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = null; }
  if (!response.ok) {
    // Avoid exposing upstream headers / auth details.
    const message = errorMessage(data, `${fallbackMessage} (HTTP ${response.status})`);
    throw new Error(message.slice(0, 400));
  }
  if (!data || typeof data !== "object") throw new Error("Mirax API returned an invalid JSON response.");
  return data;
}

export function mimeFromMagic(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    return { mime: "image/png", ext: "png" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export function safeResultUrl(raw) {
  const url = new URL(raw, API_BASE);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Mirax returned an invalid result URL.");
  return url.href;
}

export function exceptionResponse(err) {
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return json({ success: false, error: "Mirax request timed out. Try again." }, 504);
  }
  console.error("Mirax API failure:", err?.message || err);
  return json({ success: false, error: (err?.message || "Upstream API request failed.").slice(0, 400) }, 502);
}
