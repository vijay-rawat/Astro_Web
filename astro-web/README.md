# Astro web

Frontend for Astro, a company's own AI superagent: ask questions answered from
company knowledge with sources, talk to it by voice, send it into Google Meet,
Zoom or Teams calls, read generated briefs and meeting recaps, and manage
knowledge sources, agents and access.

Stack: Vite, React 18, TypeScript (strict), SCSS modules, React Router, lucide-react.

## Run it

```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:5173
npm run build        # typecheck + production build
```

Sign-in is real: run the backend first (see `../astro-api/README.md`), then
sign in at /login, for example as `aarav@kestrel.io` with `orbit-demo-2026`, or by
voice with the phrase "space is everything". Set `VITE_AUTH=mock` to skip sign-in
and use the sample session in `src/config.ts`.

With `VITE_USE_MOCKS=true` (the default) the screens behind sign-in still use
sample data for Kestrel Labs and a keyword router standing in for the supervisor.
Set it to `false` to talk to the backend for those too.

## Screens

| Route        | What it is                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| `/login`     | Sign in by voice passphrase or password, create an account, forgot and reset password |
| `/`          | Ask Astro: chat, agent picker, route trace, citations, evidence panel      |
| `/call`      | Voice call: browser speech in and out, live caption, call brief, transcript |
| `/meetings`  | Send Astro to a call by link, today's calls with a per-call invite switch, in-call settings, recent recaps |
| `/meetings/:id/live` | Full-screen live view: participant tiles, Astro's spoken answer with sources, live notes, transcript, ask privately |
| `/meetings/:id/recap` | Summary, decisions, Astro's answers, action items to approve, Slack follow-up |
| `/briefs`    | Engineering meeting brief and revenue review                              |
| `/knowledge` | Sources, the role-by-data-domain access matrix, recent access checks       |
| `/agents`    | Try the supervisor's routing; each agent's topics, roles, sources, tools and guardrails; pause an agent |
| `/setup`     | Company setup: pick a domain, connect sources                              |

The Manage group in the sidebar (Knowledge, Agents, Setup) shows when
`currentUser.canManage` is true in `src/config.ts`. Derive that from the user's
role once auth exists.

Voice uses the Web Speech API, so it works in Chrome and Edge. The call screen
has a typed fallback. Swap `src/hooks/useVoice.ts` for a streaming STT/TTS
service when you need production-quality voice.

## Backend contract

The client lives in `src/api/client.ts`. Types are in `src/types/astro.ts`.

### `POST /api/chat/stream`

Request:

```json
{ "companyId": "kestrel-labs", "message": "Why Kafka?", "mode": "auto" }
```

`mode` is `auto` (supervisor routes) or one of `mentor | tech | finance | hr | exec`.

Response: `text/event-stream`, one JSON object per `data:` line, in this order:

```
data: {"type":"route","step":{"kind":"supervisor","label":"Supervisor"}}
data: {"type":"agent","agent":"tech"}
data: {"type":"route","step":{"kind":"agent","label":"Tech agent"}}
data: {"type":"route","step":{"kind":"retrieval","label":"Architecture docs, 4 matches"}}
data: {"type":"route","step":{"kind":"access","label":"Access check passed"}}
data: {"type":"token","text":"Kestrel moved "}
...
data: {"type":"sources","sources":[{"n":1,"id":"adr-014","title":"...","kind":"...","where":"...","updated":"...","excerpt":"...","openLabel":"Open document","url":"https://..."}]}
data: {"type":"done"}
```

Answer text can use `[n]` citation markers (matching `sources[].n`), `- ` list
lines and `**bold**`. Send `{"type":"error","message":"..."}` for errors the
user should see.

A FastAPI endpoint can emit this with `StreamingResponse(gen(), media_type="text/event-stream")`
where `gen()` yields `f"data: {json.dumps(event)}\n\n"`.

### Auth (live in astro-api)

- `POST /api/auth/signup`, `verify-email`, `resend-verification`, `login`, `voice-login`, `logout`, `logout-all`, `forgot-password`, `reset-password`
- `PUT` / `DELETE /api/auth/voice-passphrase`, `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id`
- `GET /api/me` returns `{ user, company }` (`src/api/auth.ts`), or 401 when signed out

The session is an HttpOnly cookie; the app never sees a token. `src/api/http.ts` wraps every call.

### Other endpoints

- `GET /api/companies/:companyId/sources` returns `KnowledgeSource[]`
- `PUT /api/companies/:companyId/access` with `{ "rules": RoleAccess[] }`

- `GET /api/companies/:companyId/agents` returns `AgentConfig[]`
- `PATCH /api/companies/:companyId/agents/:agentId` with `{ "paused"?: boolean, "guardrails"?: [{ "id", "enabled" }] }`

### Meetings (`src/api/meetings.ts`)

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET /api/companies/:companyId/meetings` | | `Meeting[]` from the connected calendar |
| `POST /api/companies/:companyId/meetings/join` | `{ "link" }` | `{ "meetingId" }` |
| `PATCH /api/companies/:companyId/meetings/:meetingId` | `{ "astroInvited": boolean }` | |
| `PUT /api/companies/:companyId/meeting-settings` | `{ "notes", "answer", "speak", "decisions", "followups" }` (booleans) | |
| `GET /api/meetings/:meetingId/live` | | SSE stream of `MeetingLiveEvent` |
| `PATCH /api/meetings/:meetingId/live` | `{ "speak"?, "notes"? }` | |
| `POST /api/meetings/:meetingId/ask-private` | `{ "question" }` | `{ "answer", "source"? }` |
| `POST /api/meetings/:meetingId/leave` | | Astro leaves and starts the recap |
| `GET /api/meetings/:meetingId/recap` | | `MeetingRecap` |
| `POST /api/meetings/:meetingId/actions/:actionId/approve` | | Creates the Jira ticket or comment |
| `POST /api/meetings/:meetingId/follow-up` | `{ "channel", "text" }` | Posts to Slack |

The live stream is opened with `EventSource`, so it's a GET with cookies. Send
the history first, then new events as they happen, one JSON object per `data:` line:

```
data: {"type":"transcript","line":{"id":"t7","speakerId":"sana","speaker":"Sana Kulkarni","time":"10:29","text":"Astro, who else knows how the billing cron jobs work?"}}
data: {"type":"speaking","participantId":"astro"}
data: {"type":"answer","answer":{"id":"ans-2","askedBy":"Sana","time":"10:29","question":"...","answer":"...","sources":["Billing runbook, Platform wiki"]}}
data: {"type":"decision","decision":{"id":"d1","text":"...","by":"Sana Kulkarni","time":"10:17"}}
data: {"type":"action","item":{"id":"a3","task":"...","owner":"Imran Sheikh","due":"This sprint","destination":"New Jira ticket, PLAT","actionLabel":"Create ticket","doneLabel":"Created PLAT-343","status":"pending"}}
data: {"type":"ended"}
```

Rules the backend should enforce, because the UI assumes them:

- Astro joins as "Astro (<company name>)" and introduces itself.
- It speaks only when everyone in the call is from the company. With guests,
  it answers the asker privately.
- It answers only when someone says "Astro". It leaves when asked.
- Answers use the asker's permissions, the same as chat.
- Action items and follow-ups are drafts until a person approves them.
- Only invited people can open a recap or transcript.

Getting Astro into the call is the meeting-bot worker's job. The frontend
doesn't care how it's done. A bot participant (your own headless browser, or a
hosted bot service) works on Google Meet, Zoom and Teams today. Zoom's Realtime
Media Streams and Google's Meet Media API can stream call media without a bot,
but check their current availability and requirements before you depend on
them.

The server must enforce tenant isolation (`company_id` on every row and query)
and role checks before retrieval. The access matrix in the UI is only a view of
those rules.

## Where things are

```
src/
  api/client.ts          chat SSE streaming + mock mode
  api/meetings.ts        meetings, live stream, private asks, recap, approvals
  api/agents.ts          agent configuration
  hooks/useAstroChat.ts  message state, streaming, stop
  hooks/useVoice.ts      speech recognition + synthesis
  hooks/useMeetingLive.ts live meeting state from the SSE stream, call timer
  lib/formatAnswer.ts    [n] citations, lists, bold
  lib/router.ts          keyword router for mock mode and "Try the supervisor"
  components/            AppShell, Answer, RouteTrace, Composer, EvidencePanel, OrbitOrb, Switch
  pages/                 Ask, Call, Meetings, MeetLive, MeetRecap, Briefs, Knowledge, Agents, Setup
  styles/_tokens.scss    colors, type, radii, breakpoints
  data/mock.ts           chat, briefs, knowledge sample data (replace with API calls)
  data/meetings.ts       meetings, live call script, recap sample data
  data/agentConfigs.ts   agent configuration sample data
  config.ts              current company and user (replace with auth)
```

## Design tokens

Cool chart-paper ground `#EEF1F6`, ink `#14203A`, orbit indigo `#4046C8` for
actions, brass `#C98A2B` for evidence and citations. Bricolage Grotesque for
headings, IBM Plex Sans for text. The call screen uses a night palette.
