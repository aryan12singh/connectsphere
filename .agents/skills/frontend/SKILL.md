---
name: frontend
description: Use when translating supplied Figma frames, screenshots, or visual references into the ConnectSphere Nuxt and TypeScript frontend, especially responsive UI built with the repository's configured shadcn-vue design system.
---

# Design Evidence to Nuxt Frontend

## Required dependency

**REQUIRED SUB-SKILL:** Use `test-driven-development` before writing implementation code. Every behavior must begin with an observed failing test.

## Source of truth

Implement only the frames, screenshots, visual references, nodes, states, pages, or routes the user supplied or selected. Do not infer adjacent scope.

Use the supplied visual evidence in this order:

1. Figma node data and variables when Figma is supplied.
2. Supplied screenshots, captures, or approved visual references when Figma is not supplied.
3. Existing product conventions only for details the supplied evidence does not establish.

When working from a screenshot, treat visible hierarchy, spacing, density, typography, interaction affordances, and responsive intent as the source of truth. Do not copy unrelated branding, imagery, or content that the user has excluded.

Acquire design evidence through a Figma MCP integration:

- For remote Figma node URLs, request design context and a rendered screenshot for every node ID.
- For frames selected in the Figma desktop app, use the local Figma MCP server to read the current selection, then request each selected frame's context and screenshot.
- Extract dimensions, auto-layout, spacing, typography, variables, colors, radii, shadows, assets, states, copy, and responsive differences. Preserve matching Figma variable names. Prefer semantic MCP data over estimation; use screenshots to confirm fidelity.
- If one MCP path is unavailable, try the other. If neither can return the frames, stop and request exported screenshots/assets rather than inventing details.

## Project and shadcn setup

Inspect the Nuxt configuration, package manager, `components.json`, existing UI, global CSS, and tests first. Reuse installed components.

For an uninitialized Nuxt project, use the approved preset exactly:

```bash
npx shadcn-vue@latest init --preset a5ncD4r4 --template nuxt
```

If `components.json` already contains this configuration, do not reinitialize it. Inspect component metadata and documentation, then add only missing components from the configured registry:

```bash
npx shadcn-vue@latest info
npx shadcn-vue@latest docs button card input checkbox switch field
npx shadcn-vue@latest add @shadcn/button @shadcn/card @shadcn/input @shadcn/checkbox @shadcn/switch @shadcn/field
```

Replace the example list with the smallest set required. Review generated files.

## Visual quality, accessibility, and cleanliness

Treat neatness, accessibility, and consistency as implementation requirements:

1. Establish a clear reading order: page purpose, primary action, and supporting information must be apparent without decorative noise.
2. Apply one spacing scale, typography hierarchy, action hierarchy, border treatment, and status treatment across the affected feature. Reuse existing semantic UI primitives where they fit.
3. Reorganize supplied data without adding, hiding, renaming, or misrepresenting it. Preserve backend contracts, routes, permissions, loading states, errors, and available actions unless the task explicitly changes them.
4. Use semantic landmarks, meaningful heading levels, real lists/tables/definition lists when appropriate, labelled form controls, descriptive links, and visible keyboard focus. Ensure text and interactive controls meet accessible contrast and touch-target expectations.
5. Design for narrow and wide viewports without horizontal loss of content. Keep long names, dates, and IDs readable, and make overflow intentional and accessible.
6. Use semantic design tokens and existing utilities. Avoid raw colors, arbitrary one-off spacing, redundant wrappers, duplicate controls, visual-only labels, and image-only meaning.

## Component-driven development

Build from stable components outward. Before page code, inventory existing shadcn-vue primitives, reusable project patterns, feature components, and page composition. Define each feature component's responsibility, props, events, slots, visible states, responsive behavior, and accessibility semantics.

Develop the smallest meaningful component in isolation through RED–GREEN–REFACTOR, testing its public behavior rather than internal markup or Tailwind classes. Compose verified components into feature sections, then add page-level integration tests. Keep route pages focused on routing, data loading, and orchestration.

Prefer composition and explicit variants over duplicated markup or empty wrappers. Choose boundaries by cohesive responsibility, repeated patterns, meaningful state, or independent behavior—not merely because Figma contains a frame or visual box.

## Implementation contract

1. Inventory copy, frame sizes, assets, layout, states, responsive changes, and component boundaries.
2. Write and run focused component tests first. Confirm RED fails because the required behavior is absent, not because test setup is broken.
3. Implement components from primitives to feature sections to page composition, using preconfigured shadcn-vue primitives where their semantics match and semantic HTML otherwise.
4. Style with existing semantic variables and Tailwind utilities such as `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, and `text-primary-foreground`. Do not duplicate theme colors with raw hex values or manual dark-mode overrides.
5. Use one responsive implementation for equivalent desktop/mobile frames unless their structures genuinely differ.
6. Preserve accessibility: headings, labels, keyboard behavior, focus states, ARIA names, input types, autocomplete, contrast, responsive readability, and complete keyboard access.
7. Keep integrations not represented by the frames out of scope; do not invent backend behavior or destination routes.

## Verification gate

Run focused tests through RED and GREEN, then the relevant full suite, Nuxt typecheck, and production build. Render the page in a browser at every supplied Figma frame or screenshot size, exercise each visible interaction, inspect console errors, and compare fresh screenshots against the design evidence. Iterate on spacing, typography, wrapping, tokens, assets, and states until the implementation matches. If the user expressly limits files that may change, do not expand scope to add tests elsewhere; update only existing authorized coverage and report the verification boundary. Report explicit blockers or intentional deviations.
