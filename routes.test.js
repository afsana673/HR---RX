import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import health from "../api/health.js";
import templates from "../api/templates.js";
import generate from "../api/generate.js";

const ORIG_FETCH = globalThis.fetch;
const TINY_JPEG = new Uint8Array([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0]);

async function result(resp) { return { status: resp.status, data: await resp.json() }; }
function passwordRequest(method = "GET", opts = {}) {
  return new Request("https://example.vercel.app/api/templates", {
    method, headers: { "x-app-password": "test-secret-password", ...opts.headers }, ...opts
  });
}

process.env.APP_PASSWORD = "test-secret-password";
process.env.MARIX_API_KEY = "test-api-key";

test("health exposes only readiness status", async () => {
  const r = await result(await health.fetch(passwordRequest()));
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { status: "ok", apiConfigured: true, passwordConfigured: true });
});

test("blocks templates without website password", async () => {
  const r = await result(await templates.fetch(new Request("https://example.vercel.app/api/templates")));
  assert.equal(r.status, 401);
});

test("templates forwards only API key and returns list", async () => {
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers["x-api-key"], "test-api-key");
    return Response.json({ success: true, templates: [{ name: "anime" }, { name: "painting" }] });
  };
  try {
    const r = await result(await templates.fetch(passwordRequest()));
    assert.equal(r.status, 200);
    assert.equal(r.data.templates.length, 2);
  } finally { globalThis.fetch = ORIG_FETCH; }
});

test("generate forwards image as multipart and returns secure image URL", async () => {
  const form = new FormData();
  form.set("template", "anime");
  form.set("image", new Blob([TINY_JPEG], { type: "image/jpeg" }), "myphoto.jpg");
  const input = passwordRequest("POST", { body: form });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://marix.esite.top/api/myimg");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["x-api-key"], "test-api-key");
    const uploaded = options.body;
    assert.equal(uploaded.get("template"), "anime");
    assert.equal(uploaded.get("image").type, "image/jpeg");
    return Response.json({ success: true, result: { resultUrl: "https://images.example.com/result.webp", template: "anime", costTime: 13, consumedCredits: 1 } });
  };
  try {
    const r = await result(await generate.fetch(input));
    assert.equal(r.status, 200);
    assert.equal(r.data.resultUrl, "https://images.example.com/result.webp");
    assert.equal(r.data.result.consumedCredits, 1);
    assert.equal(JSON.stringify(r.data).includes("test-api-key"), false);
  } finally { globalThis.fetch = ORIG_FETCH; }
});

test("rejects unsupported nonimage payload", async () => {
  const form = new FormData();
  form.append("template", "anime");
  form.append("image", new Blob([Buffer.from("not an image")], { type: "image/jpeg" }), "fake.jpg");
  const r = await result(await generate.fetch(passwordRequest("POST", { body: form })));
  assert.equal(r.status, 400);
  assert.match(r.data.error, /valid JPG/);
});

test("rejects files over the backend image limit", async () => {
  const form = new FormData();
  form.append("template", "anime");
  form.append("image", new Blob([new Uint8Array(3_800_001)], { type: "image/jpeg" }), "big.jpg");
  const r = await result(await generate.fetch(passwordRequest("POST", { body: form })));
  assert.equal(r.status, 413);
});
