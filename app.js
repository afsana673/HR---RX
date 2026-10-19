"use strict";

const $ = id => document.getElementById(id);
const MAX_SOURCE = 15 * 1024 * 1024;
const MAX_UPLOAD = 3_750_000; // Allow room for Vercel's 4.5 MB multipart request limit.

let selectedFile = null;
let previewObjectUrl = null;
let busy = false;
let currentResultUrl = "";

function report(message, state = "") {
  const node = $("status");
  node.className = "status" + (state ? " " + state : "");
  node.textContent = message;
}

function fileSize(bytes) { return (bytes / 1024 / 1024).toFixed(2) + " MB"; }

function setBusy(state) {
  busy = state;
  $("generate").disabled = state;
  $("loadTemplates").disabled = state;
  $("generate").innerHTML = state ? "⏳ Generating image..." : "<span>✦</span> Generate Image <span>→</span>";
}

function clearPreviewUrl() {
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = null;
}

function pickFile(file) {
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return report("Only JPG, PNG and WEBP images are supported.", "error");
  }
  if (file.size > MAX_SOURCE) {
    return report("Source image exceeds 15 MB. Choose a smaller photo.", "error");
  }
  selectedFile = file;
  $("imageUrl").value = "";
  clearPreviewUrl();
  previewObjectUrl = URL.createObjectURL(file);
  $("preview").src = previewObjectUrl;
  $("chosen").hidden = false;
  $("fileName").textContent = file.name || "selected-photo";
  $("fileSize").textContent = fileSize(file.size);
  report("Photo selected. Ready to generate.", "success");
}

$("file").addEventListener("change", e => pickFile(e.target.files[0]));
$("clearFile").addEventListener("click", () => $("file").click());
$("imageUrl").addEventListener("input", e => {
  if (!e.target.value.trim()) return;
  selectedFile = null;
  $("file").value = "";
  $("chosen").hidden = true;
  clearPreviewUrl();
});

const drop = $("drop");
for (const eventName of ["dragenter", "dragover"]) {
  drop.addEventListener(eventName, e => {
    e.preventDefault();
    drop.classList.add("over");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  drop.addEventListener(eventName, e => {
    e.preventDefault();
    drop.classList.remove("over");
  });
}
drop.addEventListener("drop", e => pickFile(e.dataTransfer?.files?.[0]));

function accessHeaders() {
  const password = $("password").value;
  if (!password) throw new Error("Enter the website password you configured in Vercel.");
  return { "x-app-password": password };
}

async function fetchJson(path, options = {}) {
  const response = await fetch(path, { cache: "no-store", ...options });
  let data = null;
  try { data = await response.json(); } catch { throw new Error("Invalid response from server."); }
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Request failed (HTTP ${response.status}).`);
  }
  return data;
}

$("loadTemplates").addEventListener("click", async () => {
  if (busy) return;
  $("loadTemplates").disabled = true;
  report("Loading templates from Mirax...");
  try {
    const data = await fetchJson("/api/templates", { headers: accessHeaders() });
    const container = $("templates");
    container.replaceChildren();
    for (const item of data.templates) {
      const name = typeof item === "string" ? item : item?.name;
      if (!name || typeof name !== "string") continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "template-item";
      btn.textContent = name;
      btn.addEventListener("click", () => {
        $("template").value = name;
        container.querySelectorAll("button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
      container.appendChild(btn);
    }
    report(`Loaded ${container.children.length} templates. Choose one below.`, "success");
  } catch (err) {
    report(err.message, "error");
  } finally {
    if (!busy) $("loadTemplates").disabled = false;
  }
});

async function imageFromUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("Enter a valid image URL."); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Use an HTTP or HTTPS image URL.");
  report("Downloading source image...");
  const response = await fetch(url.href);
  if (!response.ok) throw new Error("The image URL could not be downloaded.");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_SOURCE) throw new Error("Image URL file exceeds 15 MB.");
  const blob = await response.blob();
  if (blob.size > MAX_SOURCE) throw new Error("Image URL file exceeds 15 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type)) {
    throw new Error("URL must return a JPG, PNG or WEBP image.");
  }
  return new File([blob], "url-image", { type: blob.type });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not compress image.")), "image/webp", quality);
  });
}

async function imageSource(file) {
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to read image."));
      image.src = url;
    });
  } finally {
    // Revoke after decoding completes.
    URL.revokeObjectURL(url);
  }
}

async function compressIfNeeded(file) {
  if (file.size <= MAX_UPLOAD) return file;
  report(`Optimizing ${fileSize(file.size)} photo for Vercel...`);
  const source = await imageSource(file);
  try {
    const originalWidth = source.width || source.naturalWidth;
    const originalHeight = source.height || source.naturalHeight;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Image processing is not supported by this browser.");
    for (const maxSide of [2400, 2000, 1700, 1400, 1100, 850]) {
      const ratio = Math.min(1, maxSide / Math.max(originalWidth, originalHeight));
      canvas.width = Math.max(1, Math.round(originalWidth * ratio));
      canvas.height = Math.max(1, Math.round(originalHeight * ratio));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.88, 0.75, 0.6, 0.45]) {
        const blob = await canvasToBlob(canvas, quality);
        if (blob.size <= MAX_UPLOAD && blob.type === "image/webp") {
          return new File([blob], "mirax-compressed.webp", { type: "image/webp" });
        }
      }
    }
    throw new Error("Image is still too large. Use a lower-resolution photo.");
  } finally {
    if (typeof source.close === "function") source.close();
  }
}

$("generate").addEventListener("click", async () => {
  if (busy) return;
  const template = $("template").value.trim();
  const imageUrl = $("imageUrl").value.trim();
  if (!template) return report("Choose a template first.", "error");
  if (!selectedFile && !imageUrl) return report("Upload a photo or enter its image URL.", "error");

  setBusy(true);
  $("result").hidden = true;
  $("placeholder").hidden = false;
  currentResultUrl = "";

  try {
    const headers = accessHeaders();
    let photo = selectedFile || await imageFromUrl(imageUrl);
    photo = await compressIfNeeded(photo);
    const form = new FormData();
    form.append("image", photo, photo.name);
    form.append("template", template);

    report("AI is generating your image. This may take a little while...");
    const data = await fetchJson("/api/generate", { method: "POST", headers, body: form });
    const result = data.result || {};
    currentResultUrl = data.resultUrl;
    $("resultImage").src = currentResultUrl;
    $("download").href = currentResultUrl;
    const detail = [
      `Template: ${result.template || template}`,
      result.costTime == null ? null : `Time: ${result.costTime}s`,
      result.consumedCredits == null ? null : `Credits: ${result.consumedCredits}`
    ].filter(Boolean);
    $("resultInfo").textContent = detail.join(" · ");
    $("result").hidden = false;
    $("placeholder").hidden = true;
    report("Image generated! Open the result to save it.", "success");
  } catch (err) {
    report(err.message || "Generation failed.", "error");
  } finally {
    setBusy(false);
  }
});

$("resultImage").addEventListener("error", () => {
  if (currentResultUrl) report("Result generated, but preview is blocked. Use 'Download / Open Image' to view it.", "error");
});
