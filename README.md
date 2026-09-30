# Learn with Yoot — YOUTH Computer Tachileik

Level 1 learning app (6 subjects) with student/teacher/parent accounts.

- Static app: `index.html` (+ `fonts/`, `vendor/`), installable and offline-capable through `sw.js`.
- API: `api/index.js` (Vercel serverless function) with Upstash Redis (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) and `YOOT_ADMIN_KEY` for the one-time `#setup`.
- Data merge shared with the app: `api/merge.js`.

Version f81c5d0830
