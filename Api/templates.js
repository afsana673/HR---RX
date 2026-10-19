import { API_BASE, apiHeaders, checkAccess, errorMessage, exceptionResponse, json, upstreamJson } from "../lib/common.js";

export default {
  async fetch(request) {
    if (request.method !== "GET") return json({ success: false, error: "Method not allowed." }, 405);
    const denied = checkAccess(request);
    if (denied) return denied;

    try {
      const response = await fetch(`${API_BASE}/templates`, {
        headers: apiHeaders(),
        signal: AbortSignal.timeout(30_000)
      });
      const data = await upstreamJson(response, "Could not load templates");
      if (!data.success) return json({ success: false, error: errorMessage(data, "Could not load templates") }, 502);
      return json({ success: true, templates: Array.isArray(data.templates) ? data.templates : [] });
    } catch (err) {
      return exceptionResponse(err);
    }
  }
};
