---
name: UniJourney
description: The student journey at Al Yamamah University, carried as passes.
colors:
  pine: "oklch(0.33 0.075 160)"
  pine-hover: "oklch(0.4 0.09 158)"
  lime: "oklch(0.9 0.19 128)"
  lime-ink: "oklch(0.28 0.075 145)"
  ground: "oklch(0.972 0.006 150)"
  card: "oklch(0.997 0.002 150)"
  card-2: "oklch(0.958 0.008 150)"
  card-3: "oklch(0.925 0.012 150)"
  ink: "oklch(0.21 0.028 165)"
  ink-2: "oklch(0.44 0.022 165)"
  ink-3: "oklch(0.54 0.02 165)"
  rule: "oklch(0.918 0.009 150)"
  rule-strong: "oklch(0.84 0.014 150)"
  points-orange: "oklch(0.74 0.17 55)"
  study-blue: "oklch(0.56 0.18 258)"
  campus-orange: "oklch(0.72 0.17 52)"
  career-orchid: "oklch(0.56 0.2 318)"
  done-green: "oklch(0.62 0.16 152)"
  pending-yellow: "oklch(0.85 0.16 90)"
  needs-you-red: "oklch(0.6 0.21 26)"
typography:
  display:
    fontFamily: "Mona Sans Variable, Noto Kufi Arabic Variable, system-ui, sans-serif"
    fontSize: "clamp(1.625rem, 1.35rem + 0.9vw, 2.125rem)"
    fontWeight: 740
    lineHeight: 1.1
    letterSpacing: "-0.028em"
    fontVariation: "'wdth' 108"
  headline:
    fontFamily: "Mona Sans Variable, Noto Kufi Arabic Variable, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 2rem + 3.4vw, 4.25rem)"
    fontWeight: 780
    lineHeight: 0.95
    letterSpacing: "-0.035em"
    fontVariation: "'wdth' 112"
  title:
    fontFamily: "Mona Sans Variable, Noto Kufi Arabic Variable, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 680
    lineHeight: 1.3
    letterSpacing: "-0.012em"
  body:
    fontFamily: "Mona Sans Variable, Noto Kufi Arabic Variable, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Mona Sans Variable, Noto Kufi Arabic Variable, system-ui, sans-serif"
    fontSize: "0.78125rem"
    fontWeight: 620
    lineHeight: 1.3
rounded:
  pill: "999px"
  field: "12px"
  well: "14px"
  pop: "16px"
  card: "20px"
  pass: "24px"
spacing:
  row-x: "1.25rem"
  card: "1.25rem"
  grid-gap: "1.25rem"
  section: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.pine}"
    textColor: "{colors.card}"
    rounded: "{rounded.pill}"
    height: "2.5rem"
    padding: "0 1.0625rem"
  button-primary-hover:
    backgroundColor: "{colors.pine-hover}"
  button-accent:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.lime-ink}"
    rounded: "{rounded.pill}"
    height: "2.5rem"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "2.5rem"
  chip:
    backgroundColor: "{colors.card-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    height: "1.5rem"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "1.25rem"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "2.75rem"
---

# Design System: UniJourney

## Overview

**Creative North Star: "The Pass Wallet"**

What a student carries is a pass. The next class, a reward voucher and the points balance are drawn as tickets: a coloured field, printed fields with small captions, two semicircle notches and a dashed perforation where the stub tears off. Everything else sits on a bright, slightly green-tinted ground as soft white cards, so the passes are the loudest things on any screen.

The system is consumer-grade and energetic rather than administrative. Colour does real jobs at page scale: a pine field for the thing to act on next, an orange field for points, module colours on navigation icons and icon tiles, and three state colours. Controls are pills. Motion is short and purposeful: cards deal in once, figures count to their value, a voucher stamps when used.

The first rebuild of this product (a night-navy rail, flat white sheets, hairline-ruled lists, ink buttons) was rejected by the owner and is the anti-reference.

**Key Characteristics:**
- One pass per screen at most on the pine field; orange is reserved for points.
- White cards with a 20px radius and a soft, green-tinted shadow on a pale ground.
- Pill controls; lime only on pine or as the assistant's mark.
- One grotesque in three widths: wide for titles and figures, regular for reading, narrow for codes.
- Light and dark themes; English and Arabic with full right-to-left mirroring.

## Colors

A pine and lime brand on cool-green neutrals, with five working colours that each keep one job.

### Primary
- **Pine** (oklch(0.33 0.075 160)): the field of the main pass, primary buttons, the open page in the side navigation. In dark mode the pine field stays and Lime takes over as the button and active colour.
- **Lime** (oklch(0.9 0.19 128)): the signal on pine (primary action on a pass, current stop, progress), the assistant's orb and Ask button, focus halo. Text on lime is Lime Ink (oklch(0.28 0.075 145)).

### Secondary
- **Points Orange** (oklch(0.74 0.17 55)): the UniPoints field wherever the balance appears. Text on it is a dark brown (oklch(0.24 0.06 50)), never white.

### Tertiary
- **Study Blue** (oklch(0.56 0.18 258)), **Campus Orange** (oklch(0.72 0.17 52)), **Career Orchid** (oklch(0.56 0.2 318)): module colours, used on navigation icons, icon tiles and course blocks.
- **Done Green** (oklch(0.62 0.16 152)), **Pending Yellow** (oklch(0.85 0.16 90)), **Needs-you Red** (oklch(0.6 0.21 26)): state only.

Each working colour has an `-ink` (text on a light surface) and a `-tint` (chip and tile background). An element picks its colour with `data-tone`, which sets `--tone`, `--tone-ink` and `--tone-tint`.

### Neutral
- **Ground** (oklch(0.972 0.006 150)): the page.
- **Card** (oklch(0.997 0.002 150)), **Card 2** (0.958), **Card 3** (0.925): surfaces, wells and pressed states.
- **Ink** (oklch(0.21 0.028 165)), **Ink 2** (0.44), **Ink 3** (0.54): text. Ink 3 is the lightest text allowed on Card.
- **Rule** (oklch(0.918 0.009 150)), **Rule Strong** (0.84): dividers and control borders.

### Named Rules
**The One Field Rule.** A screen has at most one pine field. If two things compete for it, one of them is a card.

**The Lime Is A Signal Rule.** Lime never fills a large area in light mode. It marks the action on a pass, the current stop, and the assistant.

**The Colour Has A Job Rule.** Blue, orange and orchid name modules; green, yellow and red name states. None of them is used for decoration.

## Typography

**Display Font:** Mona Sans Variable (with system-ui)
**Body Font:** Mona Sans Variable (with system-ui)
**Arabic:** Noto Kufi Arabic Variable, with line-height raised to 1.7

**Character:** One family worked across its width axis. Wide and heavy for titles and figures gives the ticket-office voice; regular width keeps reading plain.

### Hierarchy
- **Headline / figure** (780, clamp(2.75rem, 2rem + 3.4vw, 4.25rem), 0.95, width 112): the course code on the class pass, the points balance. Class `.fig`.
- **Display** (740, clamp(1.625rem, 1.35rem + 0.9vw, 2.125rem), 1.1, width 108): page titles. Class `.t-page`.
- **Title** (680, 1.0625rem, 1.3): card and section headings. Class `.t-title`.
- **Body** (400, 0.9375rem, 1.5): everything read. Prose is capped at 68ch.
- **Label** (620, 0.78125rem, sentence case): data labels and group names. Class `.t-label`.
- **Pass caption** (660, 0.6875rem, 0.08em, uppercase): the small printed field names on a pass only. Class `.t-cap`.
- **Code** (660, width 92, tabular figures): course codes, times, voucher codes. Class `.t-code`.

### Named Rules
**The Caption Stays On The Pass Rule.** Uppercase tracked captions appear only as field names printed on a pass. Headings elsewhere never get a label above them.

## Layout

A 252px side navigation from 1024px up; below that a top bar, a floating pill dock with the assistant in its centre, and a drawer for the full navigation. Content is centred at a maximum of 1240px with 2rem side padding (1rem on phones). Sections are 1.5rem apart and grids use a 1.25rem gap.

Hero rows split into columns only from 1280px, because the side navigation takes the room below that. Lists become single-column on phones; horizontal sets (suggestion pills, shortcuts, outlet filters) scroll sideways rather than wrap. The assistant panel is 26rem wide and overlays the page from the inline end; on phones it is full-screen.

## Elevation & Depth

Soft and layered. Cards rest on a faint two-part shadow tinted with the brand hue; links that are cards lift 2px on hover. Passes use `filter: drop-shadow` on a wrapper, because their notches are cut with a mask and a box shadow would be clipped. Dark mode drops card shadows and separates surfaces by tone.

### Shadow Vocabulary
- **Card** (`0 1px 2px oklch(0.3 0.05 160 / 0.05), 0 10px 28px -16px oklch(0.3 0.05 160 / 0.16)`): every card at rest.
- **Lift** (`0 2px 4px oklch(0.25 0.05 160 / 0.06), 0 18px 36px -16px oklch(0.25 0.05 160 / 0.26)`): hover on a linked card, the phone dock.
- **Pop** (`0 2px 6px oklch(0.25 0.05 160 / 0.08), 0 28px 56px -18px oklch(0.25 0.05 160 / 0.34)`): menus, dialogs, the open assistant panel.

## Shapes

Three radii with fixed owners: pills (999px) for every control and chip, 20px for cards, 12px for form fields. Passes and the pine field use 24px. Icon tiles are 12px squares on their tone's tint. A pass has two 12px semicircle notches at the tear line and a 2px dashed perforation; the stub sits beside the body from 768px and under it below that.

## Components

### Buttons
- **Shape:** pill (999px), 2.5rem tall, 2.875rem on touch screens.
- **Primary:** Pine with near-white text and a faint inner highlight. On a pine or orange field the primary is the field's signal colour instead (lime on pine, dark brown on orange).
- **Accent:** Lime with Lime Ink text; the Ask button and the send button only.
- **Secondary / Ghost:** Card with a Rule Strong border; ghost is text only until hover.
- **Hover / Focus:** background shift over 140ms; press scales to 0.97; focus is a 2px brand outline, offset 2px.

### Chips
- **Style:** pill, 1.5rem, the tone's tint with its ink; `solid` fills with the tone.
- **Picks:** selectable chips (`.pick`, 2.125rem) for filters and quick choices; selected is Pine with white text.

### Cards / Containers
- **Corner Style:** 20px.
- **Background:** Card on Ground.
- **Shadow Strategy:** Card at rest, Lift on hover when the whole card is a link.
- **Border:** 1px Rule at 80%.
- **Internal Padding:** 1.25rem; a title row sits above with no divider.
- Rows inside a card are 3.5rem tall, divided by a 1px Rule, and lead with an icon tile.

### Inputs / Fields
- **Style:** Card background, 1px Rule Strong border, 12px radius, 2.75rem tall.
- **Focus:** brand border and a 4px lime halo.
- **Error / Disabled:** red border with a message below; disabled drops to Card 2.

### Navigation
- Side navigation: 2.375rem rows, module-coloured icons, the open page a Pine pill with white text. Tabs are a pill group on Card 2 with the open tab raised to Card. Phone dock: a floating pill with four destinations and the assistant's orb raised in the centre.

### Pass (signature)
A two-part ticket: body and stub joined at a perforation. Colour-ways: pine (default), orange (UniPoints), paper (vouchers, with the outlet's colour as a top band). Field names are pass captions; values are semibold. Vouchers carry a real QR code and stamp "Used" when redeemed at the counter.

### Assistant
A lime orb marks it everywhere. The panel lists each step it takes as a compact row with a link to the result, and puts anything that submits, reserves or spends in a confirmation card before it acts.

## Do's and Don'ts

### Do:
- **Do** give each screen one thing to carry and draw it as a pass or a pine field.
- **Do** keep controls as pills, cards at 20px and fields at 12px.
- **Do** lead list rows with an icon tile in the row's module or state colour.
- **Do** set figures and codes in the wide or narrow cuts with tabular numbers.
- **Do** label anything simulated or stored on the device.

### Don't:
- **Don't** bring back the dark side rail, ink buttons or flat hairline-ruled sheets of the rejected first rebuild.
- **Don't** use lime as a large fill in light mode, or white text on lime or orange.
- **Don't** put an uppercase label above a heading; captions belong to pass fields.
- **Don't** split a hero row into columns below 1280px while the side navigation is showing.
- **Don't** let the assistant submit, reserve or spend without a confirmation card.

## The CV sheet

The CV (`src/styles/cv.css`) is a printed document, not an app surface, so it stands outside the tokens on purpose: white paper in both themes, its own ink greys, one accent the student picks (pine, ink, cobalt or plum), sizes in pt and mm so the print matches the preview. Everything around it on the CV page uses the system as usual.
