# Accessibility notes

CloudFlow aims at WCAG 2.2 AA for its main flows. This document records how that is checked and what is not covered. It is a statement of method, not a conformance claim.

## Automated checks

- axe-core runs against every route of the assembled app (real router and shell, mocked API), in both signed-in and signed-out states, plus the command palette, a row menu and a confirmation dialog while open. A violation fails the test run.
- A contrast test reads the design tokens from `src/index.css`, converts them to sRGB and checks WCAG ratios for every text and component pairing in the light and dark themes: 4.5:1 for text, 3:1 for form control borders, focus rings and status graphics.
- Tests assert the page semantics that axe cannot judge: one h1 per page, a named main landmark, a document title per route, focus moving to main after a navigation and not after a filter change, and a skip link.

## Manual checks

Done before each release: keyboard-only use of every page (including the palette, dialogs and the step timeline), a screen reader pass (NVDA or Narrator) over the dashboard, a workflow edit and an execution failure, 200% and 400% zoom, a Windows contrast theme, and reduced motion enabled.

## Known gaps

- Charts have a text summary but no data table alternative.
- Contrast is computed from tokens, not from rendered pixels, so a colour used outside the documented pairings is not covered.
- Screen reader behaviour is checked by hand only.
- Right-to-left layouts and translations are not supported.
