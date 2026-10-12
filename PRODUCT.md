# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 18, Vite, TypeScript and Tailwind CSS v4, matching the deployed build this replaces. The frontend is a static single-page app that calls the existing backend at `/api` (hosted at `unijourney-yu-a12fda.fly.dev`). The backend is not part of this project and is not changed. The original frontend source is not available; this is a from-scratch rebuild of the frontend only.

## Users

Students at Al Yamamah University (YU) in Riyadh and Khobar, on a phone between classes or on a laptop at a desk. The primary persona is a current undergraduate (Sara, Level 6 Software Engineering) who needs to know what today asks of her, plan her degree, find her way around campus and build a career record. Secondary personas use the same app: applicants, graduating students, club leads, and university staff (student affairs reviewers, admissions and registrar officers, campus security, club advisors, a demo operator).

The immediate audience is hackathon judges watching a short live demo. They decide in minutes whether this is a credible, finished product.

## Product Purpose

UniJourney connects the whole student journey in one place: admission, academics, campus life and career. It exists so a student does not have to move between a portal, a map, a notes group chat, a jobs board and a paper form. Success for the student is acting on what matters today without hunting for it. Success for this rebuild is winning the hackathon: the same features, working, presented so well that the product reads as real.

## Positioning

One connected record from applicant to alumni. Attendance, excuses, events, clubs, competitions and coursework feed the same calendar, the same digital card and the same portfolio, so evidence earned in one module shows up in the next. The app is honest about what is simulated: every demo adapter and policy is labelled as such.

## Operating Context

- Riyadh time; teaching days are Sunday to Thursday.
- Bilingual: English (left to right) and Arabic (right to left), switchable at any time. Arabic is a first-class language, not a translation afterthought.
- Light and dark themes.
- Demo mode with a frozen clock (27 Sept 2026, 9:00 am), synthetic people and records, and ten switchable personas.
- The user's stated demo highlights: prerequisite chains, learning resources, campus map and parking, and the portfolio.
- Installed-app use on phones (PWA manifest, safe areas, bottom navigation).

## Capabilities and Constraints

Existing modules, all of which the rebuild keeps:

- **Today**: schedule, inbox of things needing action, suggestions.
- **Academics**: overview, degree plan, registration planning with proposals and approvals, timetable, attendance, absence excuses with evidence, study planner, GPA planner, peer plan sharing, course pages.
- **Prerequisite chains**: per-programme map and list of what each course needs and unlocks, coloured by the student's transcript.
- **Learning resources**: student-shared notes with search, filters, bookmarks, previews, helpful votes, reports and moderation.
- **Campus life**: clubs, events with RSVP and conflict checks, community feed, people, direct messages, digital student card.
- **UniPoints (loyalty)**: points earned from the student's own records (verified event attendance, clubs, classes, study tasks, feedback, competitions, shared notes), spent on menu items at the campus outlets (Barn's, Kaftoon, Key Coffee, Go Greek, Erleens Burger, SPAR, Dunkin' Donuts) as vouchers with a code and QR. Requested by the owner; the backend has no rewards service, so vouchers are kept on the device and labelled as such.
- **Live points loop**: a venue poster with a QR that checks students in and awards points on the spot, vouchers the student redeems, and a cashier desk where staff scan a voucher once. Requested by the owner.
- **University insights**: a staff page showing students who may need a check-in and why, course feedback needing action, campus engagement and UniPoints use. Built from the demo personas' records; labelled as such. Requested by the owner.
- **Plan with a classmate**: connect with a one-time code, share chosen courses, join or suggest sections; the planner can keep a student in a classmate's sections. Uses the API's existing peer calls. Requested by the owner.
- **Study coach**: quizzes and flashcards from a student's notes with paragraph references, and a revision plan laid around classes. Requested by the owner.
- **Assistant**: an agent that acts through the app for the student: plans, compares, approves and submits registration; summarises learning resources; books events; checks attendance and tasks; spends UniPoints; routes on the map. Runs on Claude when a server key is set, on a built-in planner otherwise. Requested by the owner.
- **Campus map**: buildings and rooms, walking and step-free routing, parking availability, two campuses.
- **Lost and found**: report, status check, security desk workflow.
- **Portfolio**: profile, experience, projects, evidence-backed skills, awards, opportunities matched to evidence, LinkedIn and GitHub linking, privacy controls.
- **Career**: opportunities, application tracker, hiring-email inbox, interviews.
- **Competitions**: listings, entries, results that become awards.
- **My Journey**: admission application, onboarding, graduation audit.
- **Feedback and help**: anonymous course and instructor ratings shown as KPIs, help tickets.
- **Staff desk**: excuse review, admissions review, graduation review, moderation, security desk, club management, feedback desk.
- **Cross-cutting**: notifications, approval centre, calendar, demo panel.

Constraints:

- No new features unless one is clearly more important than what exists, or the owner asks for it (UniPoints and the assistant were asked for). Improve and fix what is there.
- The API contract is fixed: JSON envelope `{ ok, data }` or `{ ok: false, error }`, cookie session, no CORS headers (the frontend must be served from the same origin as the API or behind a proxy).
- All interface copy already exists in English and Arabic (about 3,000 keys) and is reused.

## Brand Commitments

- Name: UniJourney. Institution: Al Yamamah University (YU).
- The incumbent brand colour is a warm orange (`#f0762b`) on warm neutrals. It is evidence of the subject, not a binding constraint on the new look. The owner rejected both the incumbent look and a first rebuild (a dark navy rail with flat white sheets and ruled lists) as ugly: the product must read as a bright, rich, consumer-grade app, not an admin tool.
- Voice: plain, direct, honest about limits ("Nothing here guarantees an interview or eligibility").
- Demo honesty labels stay: simulated services and illustrative policies are always marked.

## Evidence on Hand

- The live deployed app and its API, with seeded demo data for every module.
- The complete English and Arabic string tables extracted from the deployed build.
- No brand guidelines, logo files, photography or university-approved assets were provided. None may be invented as official.

## Product Principles

1. Today first: the app opens on what needs the student now, not on a menu.
2. One record: anything earned or done in one module appears wherever it is relevant.
3. Evidence over claims: verified activity outranks self-declared skills, and the interface shows why.
4. The student approves: nothing is submitted, reserved or spent on the student's behalf without an explicit approval, including when the assistant does it.
5. Honest by default: simulated and illustrative parts are labelled.

## Accessibility & Inclusion

Full right-to-left support for Arabic, keyboard operability, visible focus, reduced-motion support, touch targets sized for phones, and step-free routing on the map are existing commitments and are preserved.
