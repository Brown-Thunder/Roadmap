# Team Roadmap

A visual, editable roadmap web app for the Host/Platform and Customer teams.

- **3 columns**: This Week · Next Week · Future
- **Swimlanes by pod**, grouped by business area. The **Lockers** area splits into
  *3rd Party Lockers*, *Internal Lockers*, and a highlighted **Shared** lane for
  initiatives that span both pods.
- **Click any initiative** for full detail, and **edit / add / delete** directly
  in the app (writes back to Airtable).
- **Post snapshot to Slack** — a static image of the board, posted to `#temp-roadmap`.
- **Weekly draft for approval** — every Monday a draft snapshot is DM'd to you;
  you approve and publish from the in-app review page.

Data lives in Airtable (base **Team Roadmap**), so it's a shared source of truth
the whole team can also edit directly in Airtable.

---

## 1. Prerequisites

You'll create three secrets: an Airtable token, a Slack bot token, and a cron secret.

### Airtable Personal Access Token
1. Go to https://airtable.com/create/tokens
2. Create a token with scopes `data.records:read` and `data.records:write`.
3. Give it access to the **Team Roadmap** base (`appTQYKyMR6Lm1TQM`).
4. Copy the token (`pat...`).

### Slack app + bot token
1. Go to https://api.slack.com/apps → **Create New App** → *From scratch*.
2. Under **OAuth & Permissions**, add these **Bot Token Scopes**:
   - `chat:write`
   - `files:write`
   - `im:write` (so it can DM you the weekly draft)
   - `chat:write.public` (optional — lets it post without being invited)
3. **Install to Workspace** and copy the **Bot User OAuth Token** (`xoxb-...`).
4. Invite the bot to the channel: in `#temp-roadmap`, type `/invite @YourAppName`.

The channel and approver IDs are already filled in `.env.example`:
- `SLACK_CHANNEL_ID=C0B9XRL15C2` (#temp-roadmap)
- `SLACK_APPROVER_USER_ID=U0AUPLDPW8P` (you, Amit)

---

## 2. Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the secrets
npm run dev
```

Open http://localhost:3000

---

## 3. Deploy to Vercel

1. Push this folder to a Git repo (GitHub/GitLab/Bitbucket).
2. In Vercel: **Add New… → Project** and import the repo.
3. Add the environment variables (Project → Settings → Environment Variables) —
   the same keys as `.env.example`:
   - `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_NAME`
   - `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_APPROVER_USER_ID`
   - `CRON_SECRET` (any long random string)
   - `APP_URL` (optional; set to your final domain, e.g. `https://roadmap.yourco.com`)
4. **Deploy.** Share the deployment URL with both teams — they can view, edit, and
   add initiatives.

### Weekly schedule
`vercel.json` already defines a cron job:

```
/api/cron/weekly   →   every Monday 08:00 UTC
```

Vercel automatically sends the `CRON_SECRET` as a Bearer token, which the route
verifies. To change the day/time, edit the `schedule` (standard cron syntax) and
redeploy. Cron jobs require a Vercel Pro plan (or run the route manually / via an
external scheduler hitting `GET /api/cron/weekly` with the `Authorization: Bearer
<CRON_SECRET>` header).

---

## 4. How posting works

| Action | Where | Result |
|---|---|---|
| **Post snapshot to Slack** (button) | Board page | Captures the board exactly as shown and posts the image to `#temp-roadmap`. |
| **Send draft for approval** (button) | Board page | DMs the snapshot to you to review. |
| **Weekly cron** | Automatic, Mondays | DMs you a draft snapshot + a link to the review page. |
| **Approve & post** | `/review` page | Publishes the snapshot to `#temp-roadmap`. |

The manual button uses a pixel-perfect capture of the on-screen board
(`html-to-image`). The cron/review path renders the same layout server-side via
`next/og` (no browser needed).

---

## 5. Data model (Airtable → app)

Table **Initiatives** in base `appTQYKyMR6Lm1TQM`:

| Field | Type | Notes |
|---|---|---|
| Name | text | Initiative title |
| Description | long text | What it is / why it matters |
| Team | single select | Host/Platform, Customer |
| Area | single select | Lockers, Partnerships, Engineering, Organic Search |
| Pod | single select | Internal Lockers, 3rd Party Lockers, Partnerships, Engineering, Organic Search |
| Spans Pods | checkbox | True → shows in the highlighted Shared lane |
| Timeframe | single select | This Week, Next Week, Future (the 3 columns) |
| Status | single select | In Flight, To Do, At Risk, Blocked, Done (card colour) |
| Owner | text | Display name(s) |
| Owner Slack IDs | text | Comma-separated, for future @mentions |
| Link | url | GitHub issue / milestone / doc |
| Notes | long text | Extra context |
| Order | number | Sort order within a cell |

To add a new swimlane area or pod, add the option in Airtable **and** to the
matching list in `lib/types.ts`.

---

## 6. Project structure

```
app/
  page.tsx                 board (server: loads Airtable, renders board)
  review/page.tsx          approval / publish page
  api/initiatives/         CRUD endpoints
  api/slack/post/          post snapshot (channel or DM draft)
  api/og/                  server-rendered snapshot image (next/og)
  api/cron/weekly/         weekly draft DM (Vercel cron)
components/
  RoadmapBoard.tsx         interactive board + capture + buttons
  InitiativeModal.tsx      view / edit / create / delete
lib/
  airtable.ts  slack.ts  roadmap.ts  summary.ts  types.ts
```
