# Mirax AI — Vercel Ready

A complete static HTML/CSS/JS website + Vercel Node.js API Functions for the Mirax image-to-image service.

## Folder structure

```
mirax-vercel/
├── api/
│   ├── generate.js      POST /api/generate
│   ├── templates.js     GET /api/templates
│   └── health.js        GET /api/health
├── lib/
│   └── common.js        Shared server-only helpers
├── public/
│   ├── index.html       Website
│   ├── app.js           Upload, compression, templates, image result
│   └── style.css        Design
├── package.json
├── vercel.json
├── .env.example
└── .gitignore
```

## Deploy using GitHub + Vercel

1. Extract the ZIP. Upload the **contents** of `mirax-vercel` to the root of a new GitHub repository. Preserve the `api`, `lib` and `public` folders.
2. Go to https://vercel.com/new, import the GitHub repository.
3. **Framework Preset**: `Other`. **Root Directory**: project root. **Output Directory**: `public` (automatically selected when present). No build command needed.
4. Add **Environment Variables** in Vercel before deploying:
   - `MARIX_API_KEY` — a new/rotated Mirax API key. Do not put it in client-side HTML or GitHub.
   - `APP_PASSWORD` — a **strong unique** password required to use the image generator. Do not share publicly.
   - `MARIX_TOKEN` (optional) — only if Mirax requires one.
   - `MARIX_API_BASE` (optional) — defaults to `https://marix.esite.top`.
5. Click **Deploy**. Open your Vercel domain, enter `APP_PASSWORD`, load templates, upload a photo and generate.
6. Test `https://your-project.vercel.app/api/health` to verify server environment setup. Both configuration flags should be true.

Changing environment variables usually requires a redeploy for the deployment to use their new values.

## Vercel-specific changes

- Converted persistent Express server into file-based Serverless Functions in `api/`.
- Removed temporary server image storage and `setTimeout`-based cleanup. Serverless functions are not persistent. The output is displayed from the `resultUrl` returned by Mirax and an open/save link is provided.
- Vercel Function request and response payloads are limited to **4.5 MB**, so images are compressed in the browser to below **3.75 MB** before uploading. Original source files up to **15 MB** are accepted for client-side compression, but highly detailed images may need manual resizing.
- Uses built-in Node 20+ Web APIs; no npm dependencies or continuous Node server needed.
- Configures `maxDuration: 300` for generation (`vercel.json`). This requires **Fluid Compute** (enabled by default for supported projects). Functions may still time out if the upstream service takes too long.
- Since output images load from the Mirax-provided result URL, browser saving and image display depend on that URL being accessible. The "Download / Open Image" link lets users open/save it.

## Security

- Server requires both `MARIX_API_KEY` and `APP_PASSWORD`. `APP_PASSWORD` protects the API routes from casual unauthorized use; for a truly public or large-use deployment, add account authentication and provider-backed rate limits/WAF rules.
- Never upload a `.env` with real credentials to GitHub. Use Vercel Environment Variables. Rotate any credential that was previously posted publicly.
- Image URL input downloads within the user's browser, so it requires the image host to support CORS and only supports JPEG/PNG/WEBP.
- No claim of live Mirax generation test: this conversion is based on the original API endpoints provided by the user. Validate key permissions and the API response in production.

## Endpoints

- `GET /api/health` — public config status (without secrets)
- `GET /api/templates` — protected template list; requires `x-app-password`
- `POST /api/generate` — protected multipart image-to-image generation; fields `image`, `template`; requires `x-app-password`

## Test locally

Run `npm run check` for JavaScript syntax and `npm test` for mock route tests. For a full local Vercel-like environment, use `npx vercel dev` and configure variables in the linked project.
