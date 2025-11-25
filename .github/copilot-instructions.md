# Repo-specific Copilot Instructions

Summary

- Small single-service Node.js app that serves a browser frontend and performs OCR on photos of an odometer.
- Key files: `server.js` (Express + Tesseract + SQLite), `public/client.js` (camera capture + upload), `public/index.html`, `package.json`.

Big picture / architecture

- Single-process Express server listening on port `3000` by default (`server.js`).
- Static frontend served from `public/`. The frontend accesses the device camera, captures a JPEG data-URL and POSTs JSON to `/upload-mileage`.
- Server-side OCR: `tesseract.js` is used via `Tesseract.recognize(imageBuffer, 'eng')`. The code uses the static API — workers are created/managed automatically on demand.
- Persistence: SQLite database file `mileage_tracker.db` is created in the project root. Table `records(id, mileage, timestamp)` stores numeric mileage values and ISO timestamps.

API surface (examples)

- POST `/upload-mileage`
  - Request: `Content-Type: application/json` body `{ "image": "data:image/jpeg;base64,..." }`
  - Server: strips the data URI header, converts to `Buffer`, calls `Tesseract.recognize`, extracts numeric text with `/[\d\.]+/g`, inserts `mileage` and `timestamp` into `records`.
  - Response: JSON `{ message, mileage, timestamp }` on success; error JSON with `message` on failure.
- GET `/records`
  - Returns latest 10 records: `[{ mileage, timestamp }, ...]` (ordered by id DESC, LIMIT 10).

Important implementation notes & gotchas

- OCR language: `server.js` passes `'eng'` to Tesseract — numeric-only images work, but language/whitelist adjustments may help accuracy.
- `multer` is listed in `package.json` but not used — the frontend sends base64 JSON, not multipart form-data. Do not add multer middleware unless changing the upload method.
- SQLite file location: `mileage_tracker.db` in repo root. Deleting this file resets data.
- Port and run scripts: `npm start` / `npm run dev` both run `node server.js`. Expect `http://localhost:3000`.
- Logs: OCR progress messages are logged by `tesseract.js` (logger in `server.js`). Use console output for debugging OCR lifecycle.

Developer workflows

- Start dev server:
  - `npm install` (first time)
  - `npm start` or `npm run dev`
- Debugging tips:
  - Reproduce client flow by opening `http://localhost:3000` in a device or desktop (browser must allow camera access).
  - To test upload without camera, POST JSON to `/upload-mileage` with a `data:image/...;base64,` value (use curl or Postman).
  - Check console for Tesseract logger messages and server errors.

Project conventions & patterns

- Minimal dependency surface: no build step, no bundler — plain Node.js server + static assets.
- Frontend uses direct DOM scripting (`public/client.js`) rather than a framework; follow its simple imperative style when modifying UI.
- DB access is synchronous-style callbacks via `sqlite3` (no ORM). Keep SQL simple and parameterized as shown.

Integration points

- `tesseract.js` (OCR) — heavy CPU; it loads language data at runtime. Expect slower first request as the worker and language are initialized.
- `sqlite3` — lightweight persistence stored on disk; concurrent writes are rare but be mindful if adding heavy parallelism.

Files to inspect when modifying behavior

- `server.js` — OCR, DB schema, APIs, static middleware.
- `public/client.js` — camera selection, capture, upload flow, and UI updates.
- `public/index.html` — simple layout and script include.
- `package.json` — start/dev scripts and dependencies.

When updating the repo

- If switching to multipart uploads, remove base64 handling in `server.js` and add `multer` middleware in the same file.
- When changing DB schema, update the `CREATE TABLE IF NOT EXISTS` clause in `server.js` and consider a small migration script.

If anything here is unclear or you want this doc extended (examples, cURL snippets, migration checklist), tell me which section to expand.
