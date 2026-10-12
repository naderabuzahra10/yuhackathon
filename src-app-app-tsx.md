---
version: 1
slug: "src-app-app-tsx"
primary_target: "src/app/App.tsx"
related_targets: []
---

# UniJourney app (whole product UI)

Scope: every route of the student and staff app. Visitor mode: Operate.

Audience and job: a YU student on a phone between classes or a laptop at night, finding what today asks of them and acting on it. Hackathon judges watch the same screens in a short live demo. Demo highlights named by the owner: prerequisite chains, learning resources, campus map and parking, portfolio, and now the assistant, registration and UniPoints.

Constraints: same features and copy as the deployed app; English and Arabic (RTL); light and dark; fixed API. The owner added two features by request: a loyalty programme (UniPoints) and an AI assistant that can act.

History: the first rebuild ("Metro Line": a night-navy rail, flat white sheets, hairline-ruled lists, ink buttons) was rejected by the owner as ugly. It is the anti-reference: no dark rail, no flat ruled lists as the page structure, no ink buttons.

Unresolved: none.

## Direction contract

THESIS: What a student carries is a pass. The next class, a reward voucher and the points balance are tickets with a tear-off stub, on a bright ground of soft white cards. Refuses the grey admin dashboard of flat ruled lists and one accent colour, and the dark sidebar that goes with it.

OWN-WORLD: Jet-age ticket wallet, rendered modern. Pine green field with fine diagonal security print and a lime glow; lime is the signal on pine and the brand in dark mode. Orange is UniPoints and campus, blue Study, orchid Career; green done, yellow pending, red needs you. Passes have semicircle notches and a dashed perforation. Controls and chips are pills, cards 20px, fields 12px. One grotesque in three widths: wide for titles and figures, regular for reading, narrow for codes.

STORY: The student opens on what to do next, sees it as something to carry, and can ask the assistant to do the rest. Points earned anywhere show up as a balance they can spend.

FIRST VIEWPORT: Today, 1440 wide. Left, a 252px white side navigation with module-coloured icons and a pine pill on the open page; an orange points row above the account. Right: greeting, then a prompt bar with a lime orb and four suggestion pills. Below, the next class as a pine boarding pass (course code at 4rem, room, time, Route in lime) with the day's schedule on its stub, beside an orange UniPoints tile with the balance and Redeem. Then shortcut pills, then Inbox and For you.

SIGNATURE INTERACTION: the pass. Cards deal in on first paint in a short stagger; the balance counts up or down when it changes; redeeming issues a paper voucher with a real QR code, and marking it used stamps it. The assistant slides in from the side and shows each step it takes.

FORM: Jet-age airline ticket wallet (catalog challenger, bolder re-roll round 1), fused with the product; palette translated by the build. Seed key dd4f426f.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
