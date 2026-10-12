# UniJourney web

A rebuilt frontend for UniJourney, the connected student journey app for Al Yamamah University. It is a single-page app (React, TypeScript, Vite, Tailwind CSS v4) that talks to the existing UniJourney backend over `/api`. The backend is not in this folder and is not changed.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` to the deployed backend at `https://unijourney-yu-a12fda.fly.dev`, so the app runs on the live demo data. To point at another backend, set `UNIJOURNEY_API` in `.env.local`.

## Connect the assistant to Claude

The assistant works out of the box through a built-in planner that recognises the common requests. To let Claude handle anything a student types:

1. Copy `.env.example` to `.env.local`.
2. Put your Anthropic API key in `ANTHROPIC_API_KEY`.
3. Restart `npm run dev`.

The key stays on the server (`server/agent.mjs`); it is never sent to the browser. The header of the assistant shows which one is answering: `Claude Sonnet 5.5` or `Built-in planner`. Set `AGENT_MODEL=claude-opus-5-5` for the most capable model.

How it works: the server fixes the system prompt and the tool list and relays one model turn at a time. The tools (`src/agent/tools.ts`) run in the browser with the student's own session: plan, choose, approve and submit a registration; search and read learning resources; list and book events; attendance; study tasks; UniPoints; the campus map; prerequisites; opportunities. Anything that submits, reserves or spends shows a confirmation card first.

## Registration planning

The backend's own planner only recognises a few fixed phrases, so a free sentence can come back as a default plan. `src/lib/regplan.ts` plans in the browser instead, for both the Register page and the assistant:

1. It reads the request itself: free days, minimum and maximum credits, earliest start and latest finish, courses to include or leave out. Typos such as "thurday" and Arabic are handled. Words like "usually" or "prefer" make a time a preference rather than a rule.
2. It searches every combination of open sections the student is eligible for, around anything already registered and inside the term's credit limit.
3. It writes the best fit into a draft through the proposal's add, remove and swap calls, so the backend still runs its checks. Nothing is approved or submitted.
4. It returns up to three plans, each with every rule marked met or not met and the reason.

If the student already has a submitted registration for the term and nothing more fits, it says so, shows how that timetable measures against the request, and shows the from-scratch plan for comparison only.

## UniPoints, live

The loyalty programme lives at `/campus/rewards`. Points are worked out from the student's own records (verified event attendance, clubs, classes attended, study tasks, course feedback, competitions, shared notes, practice quizzes), so doing something anywhere in the app adds points without a second entry. The rules and the outlet menus are in `shared/rewards.mjs`, used by both the browser and the server.

The whole loop runs on real devices:

1. **Check in.** An event's organiser opens **Venue poster** on the event page and shows it on a screen. A student scans the QR with any phone camera; the app opens, checks them in through the API, and 100 points land. The count on the poster climbs as people scan.
2. **Redeem.** The student spends points on a menu item and gets a voucher with a code and a QR.
3. **Till.** A staff account opens **Cashier desk** (`/cashier`), scans or types the code, and confirms. The student's phone stamps the voucher "Used" within a few seconds. A voucher works once.

The balance is computed on the server (`server/rewards.mjs`) from the student's records, read with the student's own session, so a browser cannot claim points it does not have. Vouchers and bonuses are stored in `data/unijourney.json` (set `UNIJOURNEY_DATA` to move it). The outlets' real tills are not connected: in the demo any staff persona acts as the till. On static hosting with no server, the same rules run in the browser and vouchers stay on the device; the page says which mode is in use.

**Phones.** `npm run dev` listens on your network, so a phone on the same Wi-Fi can open `http://<your computer's address>:5173`. Scanning a poster or voucher with the phone's own camera works over that link. The in-app scanner needs a camera permission that browsers only give to https pages or localhost, so deploy behind https to use it on phones; the code can always be typed instead.

## University insights

`/staff/insights`, for staff accounts. It shows which students may need a check-in and why (absences against the warning and denial limits, unexcused absences, overdue work, GPA), course feedback that needs action, event and club engagement, UniPoints use by outlet, and what is waiting at each desk.

The API has no aggregate feed, so `server/insights.mjs` builds the student list from each student persona's own records through the demo persona switch. That works only in demo mode and covers only the synthetic personas; a real deployment would replace `readStudents()` with a registrar feed. The page says this. Desk numbers are read with the viewer's own session, so each role sees only what the API allows it.

## Plan with a classmate

On the Register page. Two students connect with a one-time code given in person, each chooses which courses to share, and either can join the other's section or suggest their own. Only first names cross the link. This uses the API's existing peer calls (`/academics/peers`). The planner understands it too: "same sections as Layan, at least 15 credits" keeps the student in the classmate's sections where they fit and reports where they could not.

## Study coach

- **Quiz and flashcards** from any learning resource that has text (`/academics/coach/<resource id>`, or "Quiz me" on the resource). With a Claude key the questions are written from the notes and each answer cites its paragraph; without one, a built-in generator makes fill-in-the-gap questions from the same text. Finishing a quiz with 60% or more earns 15 UniPoints, once per resource.
- **Revision plan** on the Study planner: sittings for the assessments in the next three weeks, placed in free time around classes, one a day working back from each date. Nothing is added until the student confirms.
- The assistant can do both: "quiz me on SWE 302", "plan my revision", "add the revision plan".

## CV in one click

"Create my CV" on the portfolio opens `/portfolio/cv` with the document already written: profile, experience, projects and awards from the portfolio, degree, GPA and strongest courses from the academic record, clubs, volunteering and workshops from the digital card. Entries the university has verified carry a small seal. The sheet is real A4, tightens itself until it fits one page, and "Save as PDF" prints exactly what is on screen (text, not an image, so applicant systems can read it). Two templates, four accents, English or Arabic, per-section switches, and a plain-text copy for application forms. Contact details typed on the page stay in the browser.

With a Claude key on the server, "Polish the wording" rewrites the summary and bullets through `/agent/cv`; the model is told to rephrase only and never add facts. Code: `src/lib/cv.ts`, `src/pages/CV.tsx`, `src/styles/cv.css`.

## Scanning

The QR button in the top bar opens one scanner for the whole app (also on Today, Events and UniPoints). An event poster checks the student in, a voucher opens the cashier desk for staff, and a code can always be typed under the camera. A camera needs https or localhost. Code: `src/lib/scan.ts`, `src/app/GlobalScanner.tsx`, `src/ui/Scanner.tsx`.

## Focus mode

The Focus switch in the top bar strips the app down to what the person marked as important; switching it off brings everything back. Settings (`/settings`, in the menu and the account menu) decides what is kept, one switch per thing: every page of the menu, the blocks of Today, the Academics tabs, the blocks of Campus Life, and the top-bar buttons. Four presets (Essentials, Exam week, Job hunt, Campus life) set all the switches at once, and a preview shows the menu as it will be. Hiding only changes what is shown: a hidden page still opens from a link. Choices are stored in the browser, per account. Code: `src/lib/focus.ts`, `src/app/focusCatalog.ts`, `src/pages/Settings.tsx`.

## Check and build

```bash
npm run typecheck
npm run check:i18n
npm run build
```

`check:i18n` fails if the source uses a translation key that the string tables do not define. `npm run build` writes the site to `dist/`.

## Deploy

The backend sends no CORS headers and uses a cookie session, so the app must be served from the same origin as `/api`.

1. **With the server (recommended).** `npm run build && npm start` runs `server.mjs`: it serves `dist/`, proxies `/api` to the backend and answers `/agent`, `/rewards` and `/insights`. Set `PORT`, `UNIJOURNEY_API`, `ANTHROPIC_API_KEY` in the environment. Any Node 22.9+ host works (Fly, Render, Railway).
2. **Static only.** Copy `dist/` over the static files the backend already serves, or host it behind a rewrite (`vercel.json` and `public/_redirects` are included). Without the server the assistant falls back to the built-in planner, vouchers stay on the device, and the cashier desk and insights are unavailable.

## How it is organised

| Path | What lives there |
| --- | --- |
| `src/app` | Router, shell (side navigation, top bar, phone dock), navigation config |
| `src/agent` | The assistant: panel and prompt bar, model loop and built-in planner, tools and their schema |
| `shared` | Rules used by both browser and server (UniPoints) |
| `src/lib` | API client and query hook, session and roles, i18n, UniPoints, date and number formatting |
| `src/ui` | Shared components: buttons, cards, dialogs, toasts, passes (`Pass`, `QR`, `Ring`, `CountUp`) and lines (`StageLine`, `Stops`) |
| `src/pages` | One file or folder per module |
| `src/i18n` | English and Arabic string tables from the original app, plus `extra.ts` for new strings |
| `src/styles/app.css` | Design tokens and component styles |
| `server/` | This app's own services: assistant and study coach (`agent.mjs`), UniPoints and the till (`rewards.mjs`), insights (`insights.mjs`) |
| `server.mjs` | The production server: built app, API proxy and the services on one origin |

## Design

The visual system is recorded in `DESIGN.md`. In short: a bright ground and white cards, with the things a student carries (the next class, vouchers, the points balance) drawn as passes with a tear-off stub. Pine green and lime are the brand, orange is UniPoints and campus, blue is Study, orchid is Career; green means done, yellow pending, red needs you. Light and dark themes and English and Arabic (right to left) are supported throughout.

## Not carried over yet

These parts of the original are simplified or missing in this rebuild:

- **GPA planner**: this-term letter-grade estimates and targets only. The per-assessment calculator and saved what-if scenarios are not rebuilt; estimates are kept on the device.
- **Registration**: plan from a free-text request, compare, choose, approve and submit work. Pinning or swapping individual sections by hand and the simulation controls are not rebuilt. A submitted registration cannot be withdrawn (the backend has no call for it).
- **Study planner**: quick add, to-do list, done and delete work. The week and month calendar views with drag and drop, and the plan-repair flow, are not rebuilt.
- **Portfolio**: importing a LinkedIn data export (ZIP) is not rebuilt. Linking LinkedIn and GitHub works.
- **Peer plan sharing** in registration is not rebuilt.
- **Feedback**: course and instructor KPI detail pages are folded into expandable rows; per-term trends and themes are not shown.
- **Community**: image posts, post editing, pinning and reporting, and blocking are not rebuilt.
- **Staff desk**: club event editing and attendance verification, the found-item log form and community moderation details are reduced to the core decisions.
- **Campus map**: Google Maps tiles are not supported (OpenStreetMap and satellite are).
