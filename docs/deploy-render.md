# Deploy the API on Render

The GitHub Pages workflow only hosts the static React frontend. The Fastify/SQLite API needs a web-service host, and this repo includes a Render Blueprint in `render.yaml`.

## Render Setup

1. Push the `release` branch to GitHub.
2. In Render, choose **New** -> **Blueprint**.
3. Connect this repository and select `render.yaml`.
4. Review the service:
   - Name: `gw-skills-api`
   - Branch: `release`
   - Plan: `free`
   - Build command: `npm ci && npm run db:import`
   - Start command: `npm start`
   - Health check path: `/health`
5. Create the Blueprint.
6. After deploy, open:

```text
https://<your-render-service>.onrender.com/health
```

It should return:

```json
{"ok":true}
```

## Connect GitHub Pages

After the API deploys, copy the Render URL and add it as a GitHub repository variable:

```text
VITE_API_BASE_URL=https://<your-render-service>.onrender.com
```

Then rerun the GitHub Pages workflow from the `release` branch, or push a new commit to `release`.

## Notes

- Render sets `PORT` automatically. The Blueprint sets `HOST=0.0.0.0` so the service accepts public traffic.
- The SQLite database is generated during Render's build from `data/wiki-skills/skills.summary.json`.
- Render's free web services may spin down after inactivity, so the first request after a quiet period can be slow.
