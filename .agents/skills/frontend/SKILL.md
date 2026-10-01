---
name: frontend
description: Use when translating supplied or selected Figma frames into the ConnectSphere Nuxt and TypeScript frontend, especially responsive UI built with the repository's configured shadcn-vue design system.
---

# Figma to Nuxt Frontend

## Required dependency

**REQUIRED SUB-SKILL:** Use `test-driven-development` before writing implementation code. Every behavior must begin with an observed failing test.

## Source of truth

Implement only the frames or nodes the user supplied or selected. Do not infer adjacent Figma frames, states, pages, or routes as in scope.

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
6. Preserve accessibility: headings, labels, keyboard behavior, focus states, ARIA names, input types, and autocomplete.
7. Keep integrations not represented by the frames out of scope; do not invent backend behavior or destination routes.

## Verification gate

Run focused tests through RED and GREEN, then the relevant full suite, Nuxt typecheck, and production build. Render the page in a browser at every supplied Figma frame size, exercise each visible interaction, inspect console errors, and compare fresh screenshots against the Figma screenshots. Iterate on spacing, typography, wrapping, tokens, assets, and states until the implementation matches. Report explicit blockers or intentional deviations.
