# DESIGN.md — ShelfSense Design Rules

> Scope: every screen of the ShelfSense web app (`frontend/`).
> These rules sit on top of [`AGENTS.md`](AGENTS.md); domain rules there always win
> (소비기한 wording, "Demo data" badge on every screen, Level 3 autonomy shown disabled,
> labor disclaimer).

![ShelfSense logo](docs/logo.png)

---

## 1. Subject, audience, job

| | |
|---|---|
| **Subject** | Back-of-house operations for one small Korean restaurant, 서울 김치찌개집: stock on shelves, 소비기한, orders, prep, waste, staff hours. |
| **Audience** | The owner, standing in the kitchen at 09:00 on a tablet or phone, often with wet hands and a supplier call in 20 minutes. Bilingual (Korean first, English second). |
| **Primary job** | Show what needs a decision this morning, and let the owner approve it in one tap. Everything else is supporting evidence. |

The visual vocabulary comes from the back-of-house itself: **shelves, shelf-edge labels,
and kitchen tickets**. The logo (a shelf with jars and a signal arc) is the source of the
system: navy structure, blue signal, white space.

---

## 2. Colour

Only three colours are allowed. No other hex values, no Tailwind default palette (gray,
teal, red, amber, emerald…), no gradients, no shadows.

| Token | Hex | Role |
|---|---|---|
| `ink` | `#04225c` | Text, structure (shelf rails, rules, table headers), **critical** status fill. |
| `signal` | `#0d67f7` | Actions (primary buttons, links), focus ring, live/forecast data, **attention** status fill. |
| `paper` | `#ffffff` | Every surface and the page background. Text on `ink`/`signal` fills. |

**Opacity variants** of `ink` and `signal` are the only derived tones, and only for these jobs:

| Variant | Use |
|---|---|
| `ink/70` | Secondary text (meta, captions, axis labels). Contrast on white ≈ 6:1. |
| `ink/35` | Disabled text and dashed disabled borders only. |
| `ink/15` | Hairlines: table row dividers, tile outlines, chart grid. |
| `ink/5` | Row hover and zebra fill. |
| `signal/10` | Selected row or the one highlighted item in a list. |

Contrast: `ink` on `paper` is 14.9:1; `signal` on `paper` (and `paper` on `signal`) is ≈ 4.7:1, so
signal text must be ≥ 14 px.

### Status without red, amber, green

Hue cannot carry meaning here, so status is carried by **fill weight, outline, icon and word**,
always together, never colour alone.

| Meaning | Examples | Treatment (class) |
|---|---|---|
| **Critical** | Lot past 소비기한, at-risk stock, labor-law violation, over budget, rejected | Solid `ink` fill, white text, warning icon. `ss-chip-critical` |
| **Attention** | Expires within 2 days, proposed order, +12% price surge, slow shift | Solid `signal` fill, white text, icon. `ss-chip-attention` |
| **In progress / info** | Incoming order, edited order, forecast value | 1.5 px `signal` outline, `signal` text. `ss-chip-info` |
| **OK / done** | Received, compliant, within budget | 1 px `ink` outline, `ink` text, check icon. `ss-chip-ok` |
| **Disabled** | Autonomy Level 3, unavailable actions | `ink/35` text, dashed `ink/35` border, lock icon, `cursor: not-allowed`. `ss-chip-disabled` |

Critical rows in tables also get a 4 px solid `ink` bar on their leading edge.

---

## 3. Typography

**One family: Arial.** Stack: `Arial, "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`.
Arial has no Hangul glyphs, so the Korean fallbacks render 한국어 text; Latin and numerals are
always Arial.

Scale (classic typographic scale, px): **12 · 14 · 16 · 21 · 24 · 36 · 48**

| Role | Size / weight / line-height | Notes |
|---|---|---|
| Hero statement (Morning Summary only) | 48 / bold / 1.1, tracking −0.02em | 36 on mobile. The one loud thing in the app. |
| Page title | 24 / bold / 1.2 | Sits on the shelf rail. |
| Section title | 21 / bold / 1.25 | Sits on a 2 px `ink` rule. |
| Key figure | 36 / bold / 1, `tabular-nums` | Shelf-label tiles. |
| Body | 16 / regular / 1.5 | Line length ≤ 72 characters. |
| Table data, controls | 14 / regular / 1.4, `tabular-nums` for numbers | Numbers right-aligned. |
| Meta, captions, axis | 12 / regular / 1.4, `ink/70` | Never smaller than 12. |

Rules:
- **Sentence case everywhere.** No all-caps labels, no tracked-out eyebrows above headings.
- No accenting a single word in a headline with a different colour, weight or italic.
- Bold is for headings, key figures and status words, not for emphasis inside sentences.
- Currency `₩1,104,000`, weights `21.76 kg`, percentages `27.6%`: always tabular numerals.

---

## 4. Layout and structure

### The shelf rail (signature element)

The logo's shelf becomes the app's structural device. A **6 px solid `ink` rail** runs the full
width under the header, and page titles sit on a rail the same way jars sit on a shelf.
Sections sit on a **2 px `ink` rule** instead of being boxed in cards. This is the only
decorative device; spend no boldness elsewhere.

```
┌───────────────────────────────────────────────────────────────┐
│ [logo] ShelfSense  (Demo data)        09:00 Wed 4 Nov  [한국어] │  header, paper
██████████████████████████████████████████████████████████████████  6 px ink rail
│ Morning summary │                                               │
│ Forecast        │  Page title                                   │
│ Stock & scan    │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ 2 px    │
│█Orders         ▌│  ┌────────┐ ┌────────┐ ┌────────┐ shelf labels │
│ Prep sheet      │  │ 25.0 kg│ │ 27.6 % │ │ 3 lots │             │
│ Waste log       │  │ Pork…  │ │ Labor… │ │ At risk│             │
│ Labor           │  └────────┘ └────────┘ └────────┘              │
│ Settings        │  Section title                                │
│                 │  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀        │
│                 │  table / form / chart                         │
└───────────────────────────────────────────────────────────────┘
```

### Morning Summary hero (the one bold moment)

A full-width `ink` block with white type, directly under the shelf rail. It states the single
most important decision of the morning as a plain sentence (e.g. *"Order 25 kg of pork shoulder
today. 4 kg in stock expires before you can use it."*), with one `signal` primary button that
goes to the decision. No big-number-plus-gradient treatment, no illustration.

### Grid, spacing, alignment

- Content is **left-aligned**. Numbers in tables are right-aligned. Nothing is centred except
  empty-state messages.
- Max content width 1200 px; left navigation 232 px on ≥ 768 px; horizontal tab strip on mobile.
- Spacing scale (px): 4 · 8 · 12 · 16 · 24 · 32 · 48. Sections are separated by 32; items inside
  a section by 12–16.
- Radius has hierarchy, not one value for everything: **0** for sections and rails,
  **2 px** for shelf-label tiles, chips and inputs (printed labels have sharp-ish corners),
  **6 px** for buttons only.
- **No box shadows. No gradients. No identical rounded cards for every block.** Group with
  rules and whitespace; use a 1 px `ink/15` outline only for shelf-label tiles and inputs.

---

## 5. Components

| Component | Rule | Class |
|---|---|---|
| Page title | 24 bold `ink`, 6 px `ink` rail beneath, 24 px space below. Optional one-line description in 16 `ink/70`. | `ss-page-title`, `ss-rail` |
| Section | Title 21 bold on a 2 px `ink` rule; content follows with no box. | `ss-section`, `ss-section-title` |
| Shelf-label tile | `paper`, 1 px `ink/15` outline, 2 px radius, 16 px padding. Figure 36 bold on top, label 14 `ink/70` below. Critical tile: `ink` fill with white text. | `ss-tile`, `ss-tile-critical` |
| Primary button | `signal` fill, white text, 6 px radius, 40 px min height (44 px touch on mobile). One per view region. | `ss-btn ss-btn-primary` |
| Secondary button | `paper`, 1.5 px `ink` border, `ink` text. Used for Edit, Cancel, Reject (no red). | `ss-btn ss-btn-secondary` |
| Quiet button / link | `signal` text, underline on hover. | `ss-btn-quiet` |
| Chip / status label | 2 px radius, 12–14 px bold, icon + word. See status table. | `ss-chip ss-chip-*` |
| Table | Header: 14 bold `ink`, 2 px `ink` bottom border, sentence case. Rows: 1 px `ink/15` dividers, `ink/5` hover. Critical row: 4 px `ink` leading bar. | `ss-table`, `ss-row-critical` |
| Input / select | `paper`, 1 px `ink/35` border, 2 px radius, 40 px height; focus = 2 px `signal` border. | `ss-input` |
| Note / disclaimer | 1 px `ink` outline, info icon, 14 px text. Used for the labor "scheduling estimate, not payroll" disclaimer. | `ss-note` |
| Demo data badge | `signal` 1.5 px outline chip in the header, always visible on every screen. | `ss-chip-info` |
| Navigation item | 14/16 `ink/70`; hover `ink` text with `ink/5` fill; active: `ink` fill, white text, 4 px `signal` notch on the leading edge. | — |

### Charts (Recharts)

- Forecast bars: **median = solid `ink`**; the **upper-bound increment (upper − median) = `signal`
  diagonal hatch on white** (pattern `#ss-hatch`), stacked on top. No double counting.
- Grid lines `ink/15`, axis text 12 `ink/70`, no chart border.
- Tooltip: `paper`, 1 px `ink` border, no shadow.
- Weather / holiday annotations use `signal` text and icons.
- `isAnimationActive={false}` on all series.

### Icons

`lucide-react`, 16 px in text and buttons, 20 px in section titles, stroke 2, colour inherits
from text. Icons always pair with a word for status.

---

## 6. Motion

- No entrance animations, no hover lifts, no scattered transitions.
- Motion only answers an action: an approved order changing status, an expanded row opening
  (≤ 150 ms, opacity/height).
- `prefers-reduced-motion: reduce` disables all transitions.

---

## 7. Writing

- Sentence case, plain verbs, Korean and English both kept short.
- Buttons say what happens: **"Approve order"**, **"Log waste"**, **"Save count"**, not "Submit".
  The same action keeps its name in toasts and audit log ("Order approved").
- Always **소비기한** (Use-by date), never 유통기한.
- Errors state what happened and what to do ("Barcode not found. Register the product once
  to scan it next time."). Empty states invite the next action.
- No `→` appended to buttons, no `A · B · C` meta strings, no "WORD — fragment" labels.

---

## 8. Accessibility floor

- Visible keyboard focus everywhere: 2 px `signal` outline, 2 px offset.
- Touch targets ≥ 44 px on mobile.
- Status never by colour alone (icon + word, see §2).
- Responsive down to 360 px wide; tables scroll horizontally inside their section.
- `lang` attribute follows the selected language.

---

## 9. Review against generic defaults

Checked against the common generated-UI patterns before building:

| Generic default | Decision here |
|---|---|
| SaaS card kit (identical rounded cards + soft shadows) | Replaced with shelf rails and rules; tiles only for key figures, no shadows. |
| Big number + gradient hero | Hero is a sentence stating today's decision on solid `ink`. |
| Red/amber/green status | Impossible with the palette; replaced by fill-weight + icon + word system. |
| ALL-CAPS eyebrows, middle-dot meta, `→` buttons | Banned (§3, §7). |
| One radius everywhere | 0 / 2 / 6 px hierarchy (§4). |
| Monospace data labels | Arial tabular numerals only. |

---

## 10. Implementation

- Tokens and component classes live in [`frontend/src/index.css`](frontend/src/index.css)
  (Tailwind v4 `@theme`). The default Tailwind colour palette is **reset**, so only
  `ink`, `signal`, `paper`/`white` utilities exist (e.g. `text-ink`, `bg-signal`,
  `border-ink/15`). A stray `bg-red-500` generates no CSS.
- Logo: [`frontend/public/logo.png`](frontend/public/logo.png), shown at 40 px height in the
  header on `paper` only (never on `ink` or `signal`). Also used as the favicon.
