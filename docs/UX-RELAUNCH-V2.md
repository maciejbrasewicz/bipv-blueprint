# BIPV Workbench v2 — product UX release contract

**Design objective:** an engineering workbench in which an operator can (1) choose a real building or start from an explicitly synthetic technical scenario, (2) edit roof and obstacles, (3) compare actual panel layouts and export matching geometry, and (4) understand the evidential limitations before producing any offer. No false “verified roof” or fake physical suitability.

## Interaction model

- **Global navigation:** Studio / Electrotile QA / Production planner. Every product screen must remain accessible by mouse, keyboard and at 360 px.
- **Current project:** clear editable project name, separate account/save, download and project management actions. Guest/cloud state is explicit.
- **Three-stage actionable journey:** Building → PV layout → Data review. Every step is an actual button opening the corresponding workspace, not an ornamental progress bar. A completed layout means modules >0 and a current valid computation, not merely a successful HTTP request.
- **Design canvas:** primary workspace; modes Project, Sun, Variants, Materials, Review. The background, toolbars, 2D/3D, hover states and title are not allowed to obscure photovoltaic placements.
- **Data confidence:** synthetic demonstration vs imported/edited geometry vs EGiB with estimated massing. A 6 m flat EGiB roof never gets a “surveyed/verified” badge. Warnings are visible at both editor and result panel.
- **Output panel:** prioritize actual STC power, module count, coverage, active area and design area; then product and revision limitations. 3D GLB and JSON exports are within one click.
- **Mobile:** maintain an unobstructed 3D view; each properties/results sheet opens with a real dimming scrim, dismissible by backdrop and Escape. The workflow scrolls horizontally within its own rail; the document itself must not overflow.
- **Error states:** stale calculations, zero modules, provider outage, missing geodata or missing active surface remain distinct. A degraded external provider does not cause fabricated placements.
- **Cross-product:** same typographic scale, controls, color tokens, meaningful affordances and navigation across Studio, Production and Test Lab.

## Visual language

- Technical graphite/ink + calm white surfaces + teal activation; controlled amber exclusively for unverified geometry. Avoid neon, excessive gradients and arbitrary green status.
- Strong visual hierarchy: editorial panel title, comfortable 12–14px body text, 40–44px target minimum for common interactive controls. High contrast and focus-visible outlines.
- Architectural 3D is the hero, not a decorative marketing illustration. Functional variants occupy a compact bottom dock.
- Use spacing and a small number of border radii consistently. Motion respects reduced-motion preferences.
- No new runtime dependencies or extra always-on services. Keep rendering client-side and Railway limits unchanged.

## Required acceptance gates

1. CI formatting, TypeScript build, Python and existing Chromium regression suites.
2. A new isolated Playwright suite checks navigation, visual coordinates and genuine interactions at **1440×900** and **360×780**. On mobile assert zero document horizontal overflow and close both inspectors with the scrim/Escape.
3. Save desktop/mobile screenshots from **the exact release candidate SHA**, visually inspect them for clipped controls, overlapping headings, unreadable captions, occlusion of panels, broken states. Compare with existing `evidence/r1` before proposing merge.
4. Verify functional behavior: actual panel count after surface edits, select variants, keyboard focus, modal opening, save, import/export, 3D fallbacks. New UX must not weaken prior acceptance tests.
5. Promote to Railway only after the exact content tree passes CI. Run a separate live smoke pinned to the deployed commit. Link live screenshots and state remaining issues honestly.

## Explicitly out of scope

- A new CAD engine, real satellite-only roof detection, instant engineering validation, finished manufacturer catalog, weather yield or full procurement workflow cannot be implied by upgraded visuals.
- Fancy prototype-only screenshots without executable interactions are not acceptance evidence.
- An EGiB geometry preview alone cannot certify physical or regulatory suitability for BIPV.
