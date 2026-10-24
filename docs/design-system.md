# Relay Miden design system

The supplied “Relay Miden UI Showcase.png” is the primary reference. Its desktop dashboard uses a forest sidebar, cream workspace, compact metric cards, task rows, connection states, and a narrow quick form. Its mobile screens use a forest header, full-width controls, and anchored bottom navigation. The implementation adapts proportions to real viewports rather than reproducing the decorative device mockups.

## Palette

| Token                | Exact color | Role                                       |
| -------------------- | ----------- | ------------------------------------------ |
| `--color-primary`    | `#004225`   | Sidebar, mobile header, primary text/icons |
| `--color-background` | `#F5F5DC`   | Main workspace                             |
| `--color-action`     | `#FFB000`   | Meaningful primary actions                 |
| `--color-accent`     | `#FFCF9D`   | Sparse supporting accent; text selection   |

These four declarations live only in `apps/web/src/styles/palette.css` in application code. That file also owns surface, text, muted, border, strong border, focus, hover, disabled, warning, error, information, and success colors. Tailwind theme tokens in `globals.css` reference the variables. Additional hues are functional, such as water/medical icons and warnings, not decorative accents. Amber buttons use dark text; warning indicators use a darker amber-derived semantic color for readability. No inline brand hex values are permitted in components.

## Typography and spacing

DM Sans 400/500/600 is bundled locally with system fallbacks. Body text is 14px; card/detail text is 12–14px; metadata is 10–12px; desktop headings are 28–30px; mobile headings are 20–24px. Metrics use tabular numerals at 26–30px. Headings use modest negative tracking, navigation medium weight, and body copy relaxed line height. There are no decorative oversized headings.

Use a 4px spacing base: 8/12px internal gaps, 16/20px card padding, 24px section gaps, and 28–36px desktop workspace padding. Corners are 6px for controls/buttons and 8px for cards. Rounded avatar/language controls are limited to their specific roles. Panels have thin borders and no decorative shadows, gradients, glow, or glass effects.

## Components

- Primary button: amber background, dark text, a useful outline icon, minimum 44px target. Hover darkens the token; active moves 1px. Disabled controls use explicit neutral disabled tokens.
- Secondary button: thin border and transparent surface. Text links underline on hover. Keyboard focus is an offset visible outline.
- Cards: cream surface with a 1px neutral border. Avoid extra boxes when rows and separators communicate hierarchy.
- Form fields: labels above controls, 44px minimum height, min-width zero in grids, clear inline validation and error associations. Native selects/radios preserve keyboard behavior.
- Priority selector: four text options with a selected underline, not fills. The selected radio retains keyboard focus indication.
- Icons: Lucide React throughout, consistent 1.75 outline stroke; task icons have functional color and no filled tile.
- Empty states: concise explanation with a route back to example tasks. QR controls are disabled and adjacent copy explains why.

**Dashboard metric icons and all priority/status indicators must never have colored background fills. Priorities are text indicators, not badges or pills.** Low uses forest; medium/high use readable warning text; urgent uses error red. Status timeline lines and outline icons communicate progression. There is no colored selected-row background.

## Responsive layout

At 1024px and above a 224px fixed forest sidebar anchors navigation. At 1280px and above the dashboard splits into a flexible overview and 286px quick form; the overview splits recent tasks and connection/mission content. At 1024px the form moves below the overview to avoid compressing task rows. At tablet widths the sidebar is replaced by the mobile header/bottom nav while content can use two columns. Under 768px, metrics remain compact, task rows hide secondary timestamps/arrows, and the dashboard form moves to the dedicated Create route. Send/Receive shortcuts keep QR routes discoverable on mobile.

Mobile uses a minimum 80px forest header, generous 16px side padding, and five bottom navigation destinations. Safe-area padding and content bottom clearance prevent overlap. Every form and details/QR screen is intentionally single-column at narrow widths. Target widths include 320, 375, 390, 430, 768, 1024, and larger desktops.

## Accessibility and honest states

Semantic headings, landmarks, labels, a skip link, route-change focus, active navigation, polite result announcements, native radios/selects, and reduced-motion support are included. Text accompanies color so priority/status is not conveyed by hue alone. Task previews explicitly say “not saved.” Static connection values say “not live connectivity.” The offline promise is future-facing, and no camera permission or fake QR interaction is used.
