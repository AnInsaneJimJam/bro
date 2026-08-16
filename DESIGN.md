# Bro — Design System & UI Upgrade Plan

Last updated: 2026-08-16

This document is an **upgrade path, not a redesign.** Bro's current interface is
functional and already has a real identity — a Georgia serif voice, a coral
accent, generous white space, and a calm fixed sidebar. None of that changes.

What's missing is **system**. The design reads as unpolished not because the
choices are wrong, but because there are too many of them, applied
inconsistently. This document replaces the drift with tokens, fixes the specific
defects an audit found, and raises the craft floor screen by screen.

---

## 1. The diagnosis

An audit of `apps/web/app/styles.css` (3,046 lines) found the following drift.
These numbers are the whole argument for this document:

| Axis           | Distinct values in use | Should be    | Evidence                                                            |
| -------------- | ---------------------- | ------------ | ------------------------------------------------------------------- |
| Hex colors     | **~40**                | 14 tokens    | Only 7 CSS variables exist; the rest are inline literals            |
| Font sizes     | **18** (8px → 52px)    | 9            | `8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 27, 28, 36, 39, 52` |
| Border radii   | **12** (3px → 25px)    | 4            | `3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 20, 25`                           |
| Padding values | **~37**                | 10-step ramp | `3px` through `120px`, largely arbitrary                            |
| Gap values     | **~28**                | same ramp    | `2px` through `60px`                                                |
| Box shadows    | **13**                 | 4 elevations | Mixed alpha notation: `#0002`, `#0000000a`, `#12121218`             |
| Spacing tokens | **0**                  | 10           | No spacing scale exists at all                                      |

Three values sitting one pixel apart (`6px`, `7px`, `8px` radius) don't read as
three decisions — they read as no decision. That subtle, everywhere-at-once
inconsistency is what makes an interface feel amateur even when every individual
screen is fine.

### Three concrete defects worth fixing first

**1. The body font is Arial.** (`styles.css:796`)

```css
font-family: Arial, 'Helvetica Neue', sans-serif;
```

This is the single largest "unfinished" signal in the product. Arial reads as
_unstyled_ — it's what a page looks like before anyone chose a typeface. Paired
against Georgia it's also a genuinely awkward match: two faces from different
eras with clashing proportions and no shared skeleton.

**2. Coral text fails WCAG AA contrast.**

`--coral: #f14e42` on white measures **3.55:1**. AA requires **4.5:1** for normal
text. Every coral link, "View all" button, and section action in the app
currently fails. The same 3.55:1 applies to _white text on a coral fill_ — so the
"Publish now", "Send", and "Burn in captions" buttons fail too.

This is not a subjective call; it's measurable and it will be flagged by any
audit. It's fixed below without changing the brand color.

**3. The coral rail motif exists — inconsistently.**

The vertical coral rule appears four times, implemented three different ways:

```
styles.css:854   box-shadow: inset 3px 0 var(--coral);   /* nav active */
styles.css:1162  border-left: 3px solid var(--coral);    /* suggestions */
styles.css:2643  border-left: 3px solid var(--coral);    /* analysis */
styles.css:2930  border-top: 4px solid var(--coral);     /* confirmation */
```

This is Bro's most distinctive device and it's being used by accident. Section 6
makes it deliberate.

---

## 2. What stays (the identity)

Do not change these. They are the reason Bro doesn't look like every other
SaaS dashboard, and the goal is to make them _look intentional_, not to replace
them.

- **Georgia for display type.** Nearly every creator tool ships all-sans. A serif
  headline gives Bro an editorial, considered voice that suits a product about
  _writing and publishing_. Keep it — but use it with discipline (§4).
- **Coral `#f14e42` as the single accent.** One accent color, used sparingly, is
  a stronger position than a palette. Keep it.
- **White background.** Explicitly **not** cream/off-white. The warm-cream +
  serif + terracotta combination is the current house style of AI-generated
  design; drifting there would make Bro look generic, not premium. White with a
  warm coral accent is the sharper, more specific choice.
- **The fixed sidebar and airy density.** Bro is a calm tool for one person, not
  an analytics console. Resist the urge to densify.

---

## 3. Color tokens

Replace the 7 existing variables with a complete, semantic set. Every literal hex
in the stylesheet should resolve to one of these.

```css
:root {
  /* ── Text ─────────────────────────────────────────── */
  --ink: #17171a; /* primary text, headings          */
  --ink-2: #3f3f46; /* secondary body text  (10.8:1)   */
  --muted: #6b6b76; /* labels, captions      (5.3:1)   */
  --faint: #9a9aa4; /* disabled, timestamps  (2.9:1)   */

  /* ── Surfaces ─────────────────────────────────────── */
  --surface: #ffffff; /* cards, panels, page             */
  --surface-2: #fafafa; /* inset wells, hover rows         */
  --surface-3: #f4f4f5; /* rails, disabled fields          */
  --scrim: rgba(23, 23, 26, 0.32);

  /* ── Lines ────────────────────────────────────────── */
  --line: #e7e7ea; /* default hairline                */
  --line-2: #d6d6db; /* input borders, stronger divides */

  /* ── Brand ────────────────────────────────────────── */
  --coral: #f14e42; /* fills ≥18px, icons, decoration  */
  --coral-ink: #c2382e; /* ANY text/small UI      (5.4:1)  */
  --coral-wash: #fff3f1; /* tinted backgrounds              */
  --coral-line: #ffd9d4; /* tinted borders                  */

  /* ── Status ───────────────────────────────────────── */
  --ok: #14804a;
  --ok-wash: #ecf7f0;
  --warn: #b45309;
  --warn-wash: #fdf4e7;
  --danger: #c2352b;
  --danger-wash: #fdeceb;
  --info: #3f3f46;
  --info-wash: #f4f4f5;
}
```

### Contrast rules (non-negotiable)

| Use                                           | Token              | Ratio on white           |
| --------------------------------------------- | ------------------ | ------------------------ |
| Body text                                     | `--ink-2`          | 10.8:1 ✓                 |
| Labels, captions                              | `--muted`          | 5.3:1 ✓                  |
| **Any coral text under 18px**                 | `--coral-ink`      | **5.4:1 ✓**              |
| Coral as a _background_ with white text       | `--coral-ink` fill | 5.4:1 ✓                  |
| Large display coral (≥24px, or ≥18.66px bold) | `--coral`          | 3.55:1 ✓ (large-text AA) |
| Decorative fills, icons, rails                | `--coral`          | n/a                      |

**The rule of thumb:** if coral is carrying _words_, use `--coral-ink`. If it's
carrying _shape_, use `--coral`. The brand color is preserved everywhere it's
actually seen as color; only the text-bearing instances shift one step darker,
which reads as richer, not different.

### Status color usage

Status color belongs on a **wash + ink pair**, never as a bare colored border or
bare colored text on white:

```css
.badge-ok {
  background: var(--ok-wash);
  color: var(--ok);
}
.badge-warn {
  background: var(--warn-wash);
  color: var(--warn);
}
.badge-danger {
  background: var(--danger-wash);
  color: var(--danger);
}
```

This also fixes the current `--warn: #d9553d` (an orange-red that reads as
"coral, but wrong" and competes with the brand). The new `--warn: #b45309` is
unambiguously amber and never confused with the accent.

---

## 4. Typography

### The pairing

| Role          | Face                          | Why                                                        |
| ------------- | ----------------------------- | ---------------------------------------------------------- |
| **Display**   | Georgia                       | Keep. Bro's voice. Headings, brand, panel titles only.     |
| **UI / body** | System stack                  | Replaces Arial. Crisp, platform-native, zero network cost. |
| **Numerals**  | System stack + `tabular-nums` | Aligned columns in Calendar, scores, counts.               |

```css
:root {
  --font-display: Georgia, 'Iowan Old Style', 'Times New Roman', serif;
  --font-ui:
    system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
}

body {
  font-family: var(--font-ui);
  color: var(--ink-2);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

h1,
h2,
h3,
.brand,
.landing-logo {
  font-family: var(--font-display);
  color: var(--ink);
}
```

**Why the system stack over Arial or a webfont:** on macOS/iOS this resolves to
SF Pro, on Windows to Segoe UI, on Android to Roboto — all three are optically
sized, hinted, and tuned for screen UI in a way Arial never was. It costs zero
bytes, adds no render-blocking request, and instantly makes the interface look
_designed_ rather than defaulted. Georgia against SF Pro/Segoe is a genuine
editorial-meets-utility pairing: a warm serif voice for what Bro _says_, a
neutral precise sans for what the creator _operates_.

> **Optional upgrade:** if you later want more distinctiveness, self-host a
> variable sans (Inter Tight, Söhne, or similar) as `--font-ui`. The token
> makes it a one-line swap. Don't do this before launch — the system stack is
> already a large win and carries no performance risk.

### The scale

Collapse 18 sizes to 9. Every size has one job.

```css
:root {
  --t-micro: 0.6875rem; /* 11px — eyebrows, uppercase labels     */
  --t-caption: 0.75rem; /* 12px — captions, metadata, help text  */
  --t-sm: 0.8125rem; /* 13px — dense UI, table cells, chips   */
  --t-body: 0.9375rem; /* 15px — default body, inputs           */
  --t-lead: 1.0625rem; /* 17px — intro paragraphs, card titles  */

  --d-sm: 1.3125rem; /* 21px — card/section headings          */
  --d-md: 1.625rem; /* 26px — panel titles                   */
  --d-lg: 2.125rem; /* 34px — page titles                    */
  --d-xl: 2.875rem; /* 46px — brand, landing hero            */
}
```

### Optical tracking and leading

Tracking is size-specific. A single `letter-spacing` value is wrong somewhere.

| Size band                | `letter-spacing` | `line-height` |
| ------------------------ | ---------------- | ------------- |
| `--d-xl` (46px)          | `-0.022em`       | `1.02`        |
| `--d-lg` (34px)          | `-0.018em`       | `1.1`         |
| `--d-md` (26px)          | `-0.014em`       | `1.2`         |
| `--d-sm` (21px)          | `-0.01em`        | `1.3`         |
| `--t-lead` / `--t-body`  | `0`              | `1.6`         |
| `--t-sm` / `--t-caption` | `0.005em`        | `1.5`         |
| `--t-micro` uppercase    | `0.06em`         | `1.4`         |

Large type reads too loose at its natural spacing and small type reads too tight
— this table is what optically-sized type does automatically and Georgia does
not.

Also apply to all display text:

```css
h1,
h2,
h3 {
  text-wrap: balance;
}
p,
li {
  text-wrap: pretty;
} /* kills orphans in body copy */
```

---

## 5. Spacing, radius, elevation

### Spacing — 4px base

```css
:root {
  --s-1: 0.25rem; /*  4px */
  --s-6: 1.5rem; /* 24px */
  --s-2: 0.5rem; /*  8px */
  --s-8: 2rem; /* 32px */
  --s-3: 0.75rem; /* 12px */
  --s-10: 2.5rem; /* 40px */
  --s-4: 1rem; /* 16px */
  --s-12: 3rem; /* 48px */
  --s-5: 1.25rem; /* 20px */
  --s-16: 4rem; /* 64px */
}
```

Every `padding`, `margin`, and `gap` resolves to one of these. The current `13px`
/ `17px` / `19px` / `22px` values become `12` / `16` / `20` / `24`. Nobody will
notice the individual 1–3px shifts; everybody notices that things suddenly line
up.

Use `rem` (not `px`) so the layout scales with a user's browser text-size
setting instead of breaking.

### Radius — 4 tiers

```css
:root {
  --r-sm: 6px; /* chips, badges, inputs, small buttons */
  --r-md: 10px; /* cards, panels, buttons               */
  --r-lg: 16px; /* modals, sheets, media frames         */
  --r-full: 999px; /* pills, avatars, toggles              */
}
```

Nesting rule: an inner radius should be the outer radius minus its padding.
A `--r-lg` card with `--s-3` (12px) padding holds `--r-sm` (6px) children — this
is what makes nested corners look concentric instead of accidental.

### Elevation — 4 levels, one shade

Every current shadow uses a different color and alpha notation. Unify on one ink
ramp, so light appears to come from a single source:

```css
:root {
  --e-1: 0 1px 2px rgba(23, 23, 26, 0.05);
  --e-2: 0 2px 4px rgba(23, 23, 26, 0.04), 0 8px 16px rgba(23, 23, 26, 0.06);
  --e-3: 0 4px 8px rgba(23, 23, 26, 0.05), 0 16px 32px rgba(23, 23, 26, 0.08);
  --e-4: 0 8px 16px rgba(23, 23, 26, 0.08), 0 32px 64px rgba(23, 23, 26, 0.14);
}
```

| Level              | Used by                               |
| ------------------ | ------------------------------------- |
| flat (border only) | list rows, table cells, inline cards  |
| `--e-1`            | resting cards (My Videos, Ideas)      |
| `--e-2`            | hovered cards, dropdowns, popovers    |
| `--e-3`            | toasts, the publish confirmation card |
| `--e-4`            | modals, the mobile sidebar            |

**Depth discipline:** a surface gets _either_ a border _or_ a shadow — rarely
both. Bordered-and-shadowed is the most common cause of a UI looking "heavy" and
cheap. Cards get `--e-1` + no border; wells get a border + no shadow.

### Motion tokens

```css
:root {
  --dur-fast: 120ms; /* press feedback, hovers      */
  --dur-base: 220ms; /* enters, exits, layout moves */
  --dur-slow: 320ms; /* sheets, large surfaces      */
  --ease-out: cubic-bezier(0.2, 0, 0, 1); /* default: snappy settle */
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1); /* reversible transitions */
}
```

---

## 6. The signature: the coral rail

**This is the one thing to be bold about.** Everything else in this document is
discipline; this is the memorable element.

Bro's content is vertical video — a tall rectangle is the atom of the entire
product. The vertical coral rule already living in four places is the right
motif; it just needs to become a _rule_ instead of an accident.

**The rail means: "this is yours, or Bro made this for you."**

```css
.rail {
  position: relative;
  padding-left: var(--s-5);
}
.rail::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: var(--r-full);
  background: var(--coral);
}
/* A muted rail marks system/AI output awaiting review */
.rail--draft::before {
  background: var(--coral-line);
}
```

Apply it consistently to exactly these, and nowhere else:

| Surface                         | Rail                      | Meaning                   |
| ------------------------------- | ------------------------- | ------------------------- |
| Active sidebar item             | solid                     | where you are             |
| AI-drafted post fields (Upload) | draft                     | Bro wrote this, review it |
| Comment analysis result         | solid                     | grounded output           |
| "Try asking Bro" suggestions    | solid                     | Bro speaking              |
| Script read view                | draft                     | your draft                |
| Publish confirmation card       | solid (**left**, not top) | an external action        |

Changing the confirmation card from `border-top: 4px` to a left rail is what
turns four coincidences into one language. Once the rail is consistent, a
creator can scan any screen and instantly tell _what Bro produced_ from _what
they typed_ — that's the rail doing real informational work, not decoration.

**Restraint:** the rail is the accessory Bro keeps. Which means: no gradient
accents, no colored card borders, no decorative dividers elsewhere. One device,
used well.

---

## 7. Component upgrades

### Buttons

Bro currently has one visual button style doing every job. Establish three tiers
so importance is legible at a glance:

```css
/* Primary — one per screen, the thing you came to do */
.btn-primary {
  background: var(--coral-ink); /* 5.4:1 with white text ✓ */
  color: #fff;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  padding: 0.625rem 1rem;
  font: 600 var(--t-sm) / 1 var(--font-ui);
  box-shadow: var(--e-1);
}
.btn-primary:enabled:hover {
  background: #ad3128;
}

/* Secondary — the common alternative */
.btn-secondary {
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--line-2);
  border-radius: var(--r-md);
}
.btn-secondary:enabled:hover {
  background: var(--surface-2);
  border-color: var(--faint);
}

/* Ghost — tertiary, in-context, low commitment */
.btn-ghost {
  background: none;
  border: 0;
  color: var(--coral-ink);
  padding: 0.375rem 0.5rem;
}
.btn-ghost:enabled:hover {
  background: var(--coral-wash);
}
```

Rules:

- **One primary per screen.** If two things are primary, neither is.
- Minimum hit target **44×44px** (pad the box, not just the label).
- Destructive actions are `--danger`, ghost-styled by default, and _never_ the
  visual primary — the delete on My Videos should not compete with Schedule.
- Every button keeps its `data-busy` spinner and press-scale (already shipped).

### Inputs

```css
.field {
  width: 100%;
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  padding: 0.625rem 0.75rem;
  font: var(--t-body) / 1.4 var(--font-ui);
  color: var(--ink);
  background: var(--surface);
  transition:
    border-color var(--dur-fast),
    box-shadow var(--dur-fast);
}
.field::placeholder {
  color: var(--faint);
}
.field:hover {
  border-color: var(--faint);
}
.field:focus {
  outline: none;
  border-color: var(--coral);
  box-shadow: 0 0 0 3px var(--coral-wash); /* ring, not outline jump */
}
.field[aria-invalid='true'] {
  border-color: var(--danger);
  box-shadow: 0 0 0 3px var(--danger-wash);
}
```

Label pattern — every field gets all three parts, in this order:

```
Label            ← --t-micro, --muted, 600 weight
[ input ]
Helper or error  ← --t-caption; --muted normally, --danger when invalid
```

Character counters (`0/100` on the YouTube title) go **right-aligned on the
helper line** with `tabular-nums`, and turn `--warn` at 90% and `--danger` at
100% — currently they're a static gray that gives no signal at the limit.

### Cards

```css
.card {
  background: var(--surface);
  border-radius: var(--r-md);
  box-shadow: var(--e-1);
  padding: var(--s-5);
  transition:
    box-shadow var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}
.card:hover {
  box-shadow: var(--e-2);
  transform: translateY(-1px);
}
```

The 1px lift on hover is the smallest possible gesture that says "this is
interactive" — it costs nothing and makes a grid of cards feel alive.

### Badges & status pills

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: 0.1875rem 0.5rem;
  border-radius: var(--r-full);
  font: 600 var(--t-micro) / 1.4 var(--font-ui);
  white-space: nowrap;
}
```

Add a **6px status dot** before the label. A dot + word is scannable at a glance
in a way a word alone isn't, and it's the standard vocabulary users already know
from every deploy dashboard.

### Empty states

Every empty region gets the same three-part treatment — currently most are a
bare `<p>`:

```
[ glyph, 32px, --faint ]
Headline           ← --t-lead, --ink, states the situation plainly
One line of help   ← --t-caption, --muted, says what to do
[ Primary action ] ← the single next step
```

**An empty screen is an invitation, not an apology.** "No videos yet" is a
status; "Upload your first video" with a button is an invitation. Every empty
state in the app should end in a button.

### Loading states — skeletons, not sentences

Replace `<p>Loading your videos…</p>` and `<p>Refreshing time-bounded
signals…</p>` with shape-matched skeletons. Text placeholders cause a layout
jump when real content arrives; skeletons don't, and they communicate _what's
coming_.

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--surface-3) 25%,
    var(--surface-2) 37%,
    var(--surface-3) 63%
  );
  background-size: 400% 100%;
  border-radius: var(--r-sm);
  animation: shimmer 1.4s ease infinite;
}
@keyframes shimmer {
  to {
    background-position: -135% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
    background: var(--surface-3);
  }
}
```

Render 3 skeleton cards matching the real card's dimensions.

---

## 8. Per-screen improvements

### App shell

- **Sidebar:** add a `--surface-2` background to separate it from the content
  plane (currently white-on-white with only a hairline). Nav items get
  `--r-sm`, `--s-2` vertical rhythm, and the coral rail on active.
- **Nav grouping:** nine flat items is above the scannable limit. Group them
  under two `--t-micro` uppercase `--muted` eyebrows:
  - **Create** — Home, Bro Chat, Ideas, Scripts
  - **Publish** — Upload, My Videos, Calendar
  - **Manage** — Comments, Connections, Settings
- **Header:** the niche/country facts should be a quiet `--t-caption` metadata
  row, not bordered boxes competing with the page title.
- **The composer** is the biggest shell problem: it's `position: fixed` on
  _every_ screen, overlapping content, even where chat is irrelevant (Settings,
  Connections). Recommendation: keep it persistent only on Home and Bro Chat;
  elsewhere collapse it to a floating action button that expands on click. This
  reclaims 120px of vertical space on eight screens.

### Home

- Lead with **one** clear next action, not five equal-weight sections. The
  hierarchy should be: _what should I do right now_ → _what's in flight_ →
  _everything else_.
- Idea rank numbers (`1`, `2`, `3`) currently render at 26px Georgia in
  `#b8b8bd` — heavier than the idea titles they're numbering. Drop to
  `--t-micro`, `--faint`, uppercase, and let the topic own the row.
- The opportunity score is the one number worth emphasizing: keep it large,
  `tabular-nums`, with a `--t-micro` "Opportunity" label beneath.

### Ideas

- Card grid instead of a full-width list — five wide rows of text is a lot of
  eye travel on a 1440px screen.
- Score deserves a **visual** encoding, not just a number: a 3px progress bar
  under the score, `--coral` fill, `--surface-3` track.
- "Generate script" is the primary action per card; keep it visible rather than
  hover-revealed (hover-only actions are invisible on touch).

### Scripts

- The read view is the right default (already shipped). Refine it: set the
  script body in **Georgia at `--t-lead` with `1.75` line-height** and a
  `68ch` max-width. A script is _written to be read aloud_ — treating it as
  prose rather than form data is both better looking and better UX.
- Beat labels become `--t-micro` uppercase `--muted` eyebrows with the coral
  draft rail.
- Add estimated read time / word count in the header — creators care about
  duration and Bro already computes it.

### Upload

- The 9:16 frame is the hero. Give it `--r-lg`, `--e-2`, and let it dominate.
- Merge the three status surfaces (status dot line, `video-hint` paragraph,
  and the drafting `<em>`) into **one** status region. Currently three separate
  bits of text explain state; one line with a dot and one help line is enough.
- Destination cards: show the platform's own mark and account name once
  connected. "Connected" as bare text is weaker than `● YouTube · @channel`.
- Captions editor: number the cues in a `--faint` gutter, show cue timing as
  `0:04 → 0:07` in `tabular-nums`, and give the active cue a coral rail.

### My Videos

- Cards look sparse because the thumbnail is small relative to the card. Let
  the 9:16 thumbnail fill the card width and treat the metadata as an overlay
  footer — this is the pattern every creator already knows from YouTube Studio
  and CapCut.
- Status pill moves to the thumbnail's top-left with a subtle scrim behind it
  for legibility over arbitrary video frames.
- Add a hover play-preview (muted, 2s loop) — the single highest-value
  interaction on this screen and nearly free, since the signed URL is loaded.
- Grid: `repeat(auto-fill, minmax(200px, 1fr))` so a single video doesn't sit
  alone in a wide row.

### Calendar

- Past days: replace the gray fill with `--faint` day numbers on white. A filled
  cell reads as "occupied"; the day isn't occupied, it's just gone.
- Today's marker is right. Add a subtle `--coral-wash` cell background to the
  _selected_ day so selection and today are distinguishable.
- Job pills: platform icon + time, with the status expressed by dot color, not
  fill color — filled pills at three different colors makes a busy month look
  like confetti.
- The schedule form is long; make destination sections collapsible and remember
  the last-used destination.
- **Weekend columns** get a `--surface-2` tint — creators post differently on
  weekends and it aids grid scanning.

### Comments

- Show the actual comment text in the list. Currently the screen reports counts
  and analysis but the comments themselves — the actual content — aren't
  browsable.
- Analysis output gets the coral rail, `--t-lead` summary, and themes as chips.
- Sentiment: a single stacked bar (positive/neutral/negative) is worth more than
  three numbers, and carries the "approximate" caveat better.

### Connections

- Each provider row: real platform mark, account name, last-synced timestamp,
  and one status pill. Currently the letter-in-a-box avatar reads as a
  placeholder that was never finished.
- Failed/reconnect states get `--danger-wash` row tint so a problem is visible
  without reading.

### Settings

- Group into cards with `--d-sm` Georgia headings: **Publishing**, **System**,
  **Session**, **Privacy**.
- The delete-account action gets a `--danger` bordered "danger zone" card,
  separated by `--s-12` from everything above it.

### Chat

- Message bubbles: user messages right-aligned in `--surface-3`, Bro's responses
  full-width with the coral rail. Never two competing bubble colors.
- Tool calls render as an inline `--t-caption` chip ("Scheduled a post") rather
  than raw prose — showing _what Bro did_ as a distinct object builds trust.
- Add a typing indicator (three dots) instead of only the busy spinner.

### Login / Onboarding / Landing

- Login: center a single `--r-lg`, `--e-3` card on `--surface-2`. Currently it
  sits on plain white with a hairline border, which reads as a form on a page
  rather than a considered entry point.
- Onboarding: add a step indicator (`1 ─ 2 ─ 3 ─ 4`) — this _is_ a genuine
  sequence, so numbering carries real information here (unlike decorative
  numbering elsewhere).
- Landing: the hero already works. Tighten the display tracking per §4 and
  ensure the product screenshot uses `--e-4` to read as a real floating artifact.

---

## 9. Interaction & accessibility floor

Most of this is already shipped this session; it's recorded here as the standard
to hold.

- **Feedback on press, not release.** Every control has a `:active` press
  state. ✅ shipped
- **Busy state on every async control** via `data-busy`. ✅ shipped
- **Visible focus ring** on all interactive elements; never `outline: none`
  without a replacement. ✅ shipped
- **`prefers-reduced-motion`** honored — cross-fade instead of slide/scale.
  ✅ shipped
- **Confirm before destructive actions**, never before reversible ones.
  ✅ shipped
- **`touch-action: manipulation`** and neutral tap highlight. ✅ shipped
- **`tabular-nums`** on all number columns. ✅ shipped
- Animate only `transform` and `opacity`; never `transition: all`. ✅ holds
- **44px minimum hit targets** — to verify across icon-only buttons.
- **Keyboard:** every flow completable without a mouse; `Esc` closes the sheet,
  scrim, and confirmation card.
- **Contrast:** all text ≥4.5:1 (see §3 — currently violated by coral text).
- **`aria-live`** on every async status region. ✅ shipped

---

## 10. Rollout order

Sequenced so the largest visible gain lands first and nothing is a rewrite.

| #   | Change                                                              | Effort    | Impact                                 |
| --- | ------------------------------------------------------------------- | --------- | -------------------------------------- |
| 1   | Swap Arial → system stack; add font tokens                          | 15 min    | **Highest** — instantly looks designed |
| 2   | Add all tokens to `:root` (color, space, radius, elevation, motion) | 30 min    | Enables everything else                |
| 3   | Fix coral contrast: `--coral-ink` for text and button fills         | 20 min    | Fixes an AA failure                    |
| 4   | Replace hardcoded hex/px with tokens, file section by section       | 2–3 h     | Removes the drift                      |
| 5   | Button tiers (primary/secondary/ghost)                              | 1 h       | Clear action hierarchy                 |
| 6   | Systematize the coral rail (§6)                                     | 45 min    | The signature                          |
| 7   | Skeleton loading states                                             | 1 h       | Perceived performance                  |
| 8   | Empty states with actions                                           | 1 h       | Activation                             |
| 9   | Per-screen refinements (§8)                                         | iterative | Polish                                 |

Steps 1–3 are roughly an hour and account for most of the perceived jump from
"functional" to "professional." Everything after is compounding refinement.

---

## 11. Principles to hold

1. **Systematize before decorating.** Bro doesn't need more visual ideas; it
   needs the existing ones applied consistently.
2. **One accent, one signature.** Coral, and the rail. Everything else is
   ink, line, and space.
3. **Every value is a decision you can defend.** If a padding is `13px`, be able
   to say why it isn't `12px`. If you can't, it's `12px`.
4. **Depth is information, not decoration.** Elevation communicates layer, not
   importance. Border _or_ shadow, rarely both.
5. **Empty and error states are the product.** They're where a creator is most
   confused and most likely to leave.
6. **Restraint is the finish.** Before shipping a screen, remove one thing.
