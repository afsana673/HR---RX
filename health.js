import { json } from "../lib/common.js";

export default {
  fetch(request) {
    if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
    return json({ status: "ok", apiConfigured: Boolean(process.env.MARIX_API_KEY), passwordConfigured: Boolean(process.env.APP_PASSWORD) });
  }
};
