# Product

## Register

product

## Users

InkMirror serves novelists at any altitude — the serious literary writer who wants the tool to disappear, the aspiring novelist on draft three, the NaNoWriMo sprinter chasing word count, the longform genre writer tracking five POVs across a series. The connecting thread is "writing a novel," not a persona.

The writer comes in late at night, or early before work, with a chapter open and a reservoir of attention they cannot afford to spend on UI. They want to leave the session having seen the shape of what they are building — not just having added words, but having understood pacing, mood, and character arcs as they emerge.

## Product Purpose

InkMirror is an offline-first novel-writing webapp that holds a mirror up to the writer. It is not a coauthor. AI analyzes, reflects, warns — never generates prose. Story Pulse (sentiment ECG), mood heatmap, character sentiment, and ambient sonification are tools for self-perception: they let the writer see what their text is doing emotionally, structurally, and rhythmically.

Two surfaces, one soul: the editor (product register) is where the writing happens; the public landing, roadmap, and privacy pages (brand register) are where the literary identity gets articulated. PRODUCT.md defaults to `product` because day-to-day decisions live in the editor, but brand-register surfaces deserve equal craft and should explicitly override the register per task.

Success: the writer closes InkMirror feeling confident in the work — clearer about what they are building than when they sat down.

## Brand Personality

**Intimate, literary, observant.**

Voice is low-key and certain. Never marketing-speak ("Unleash your story!"), never AI-startup hype ("10x your output!"), never twee ("Let us craft magic together"). Closer to a careful editor's note than a copywriter's. Serif-forward, warm light, slow gestures, real OpenType small-caps where they earn their place. The "two hearts" duality (writer-violet, story-orange) is architecture, not garnish — every motion, sound, and color choice serves the writer↔story connection.

Quiet by default, reveals depth on attention. The mirror metaphor is read literally: the app reflects, sometimes uncannily.

## Anti-references

InkMirror should not look or feel like any of these:

- **Sudowrite, Novelcrafter, NovelAI, ChatGPT-as-novelist.** Generative-AI-coauthor SaaS. "Continue writing" buttons, AI prompts inside the writing surface, anything that suggests the machine writes for you. InkMirror's AI is a reader, not a writer.
- **Notion, Google Docs, generic block editors.** Bland, infinitely flexible, no opinion. Slash menus that go nowhere, blue-on-white default chrome, comment threads as the primary metaphor.
- **Scrivener, yWriter, classic desktop writing suites.** Toolbar-heavy, every panel docked, '90s power-user UI. The "aircraft cockpit" feel that punishes opening the app.
- **Linear / Vercel / AI-startup landing-page aesthetic.** Indigo-to-purple gradients, hero-metric cards, glassmorphism, dark-mode-by-reflex, "Built with [logo] [logo] [logo]" trust strips. Anything that screams "shipped 2025 in San Francisco."
- The standing absolute bans (gradient text, side-stripe accents, glassmorphism as decoration, identical card grids, modal-as-first-thought) — none of which fit InkMirror anyway.

## Design Principles

1. **The mirror, not the pen.** Every AI feature is reflective, not generative. If a design suggests the machine is writing, drafting, or completing for the user, it has failed. The writer's prose is sacred.
2. **Two hearts, one soul.** Writer-violet and story-orange are not a palette — they are a metaphor made visible. Use them only when the design is genuinely about the writer↔story connection. Do not dilute them with decorative re-use.
3. **Quiet by default, deep on attention.** Chrome stays out of the way during writing. Information density appears when the writer asks for it (panels, dashboards, command palette) — never as a default surface. Reflexive minimalism is wrong; *earned* minimalism is right.
4. **Premium craft as the language of trust.** Real small-caps, tinted neutrals, three-tier elevation, mirror-breath motion, ECG draw-in — these signal that the app respects the writer's seriousness. Skipping the craft details *is* the AI-slop tell.
5. **The novel never leaves the browser without permission.** Privacy is architecture, not policy. Local-first by design, opt-in E2E sync, no telemetry. Surface this in the design when relevant; do not oversell it.

## Accessibility & Inclusion

- **WCAG 2.1 AA** is the baseline. Color contrast, keyboard navigation for every primary action, visible focus rings.
- **Reduced motion is non-negotiable.** Every `@keyframes` in `src/index.css` already has a matching `prefers-reduced-motion` override, and any new motion must too. Mirror-breath, ECG draw-in, modal scale-fade, and block enter all collapse to instant fades when reduced motion is requested.
- **Colorblind-safe palette is a hard constraint.** Writer-violet (#7F77DD) and story-orange (#D85A30) sit on opposite ends of the protan/deutan axis on purpose. The mood heatmap and per-character sentiment scales must be verified against protanopia, deuteranopia, and tritanopia simulators. Color never carries meaning alone — always pair with shape, label, or position.
- **i18n is shipped (English + Magyar)**, every user-facing string routes through `t()`. Adding a language is a one-file operation. Translations are first-class, not afterthoughts.
- **Internationalized typography:** the serif chain must support whatever script the active language requires. Latin + Hungarian diacritics work today; any CJK or RTL addition is a font review, not a font swap.
