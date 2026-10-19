import { API_BASE, UPLOAD_LIMIT, apiHeaders, checkAccess, errorMessage, exceptionResponse, json, mimeFromMagic, safeResultUrl, upstreamJson } from "../lib/common.js";

export default {
  async fetch(request) {
    if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
    const denied = checkAccess(request);
    if (denied) return denied;

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      return json({ success: false, error: "Upload must use multipart/form-data." }, 415);
    }
    const declaredSize = Number(request.headers.get("content-length"));
    if (declaredSize > 4_200_000) {
      return json({ success: false, error: "Upload exceeds Vercel's limit. Try a smaller photo." }, 413);
    }

    try {
      const form = await request.formData();
      const template = String(form.get("template") || "").trim();
      const image = form.get("image");
      if (!template || template.length > 100) {
        return json({ success: false, error: "Choose a template (1–100 characters)." }, 400);
      }
      if (!image || typeof image.arrayBuffer !== "function") {
        return json({ success: false, error: "Please select an image." }, 400);
      }
      if (!image.size || image.size > UPLOAD_LIMIT) {
        return json({ success: false, error: "Processed image must be under 3.8 MB. Enable compression or choose another image." }, 413);
      }

      const bytes = Buffer.from(await image.arrayBuffer());
      const kind = mimeFromMagic(bytes);
      if (!kind) return json({ success: false, error: "Use a valid JPG, PNG or WEBP image." }, 400);

      const payload = new FormData();
      payload.append("image", new Blob([bytes], { type: kind.mime }), `mirax-source.${kind.ext}`);
      payload.append("template", template);
      if (process.env.MARIX_TOKEN) payload.append("token", process.env.MARIX_TOKEN);

      const response = await fetch(`${API_BASE}/api/myimg`, {
        method: "POST",
        headers: apiHeaders(),
        body: payload,
        signal: AbortSignal.timeout(260_000)
      });
      const data = await upstreamJson(response, "Mirax image generation failed");
      if (!data.success || !data.result?.resultUrl) {
        return json({ success: false, error: errorMessage(data, "Mirax did not return an image URL.") }, 502);
      }

      const result = data.result;
      return json({
        success: true,
        resultUrl: safeResultUrl(result.resultUrl),
        result: {
          template: result.template || template,
          templateId: result.templateId || null,
          costTime: result.costTime ?? null,
          consumedCredits: result.consumedCredits ?? null
        }
      });
    } catch (err) {
      // request.formData() can throw if the multipart body is malformed.
      if (err instanceof TypeError && /formdata|multipart|boundary/i.test(err.message)) {
        return json({ success: false, error: "Invalid image upload. Please select the image again." }, 400);
      }
      return exceptionResponse(err);
    }
  }
};
