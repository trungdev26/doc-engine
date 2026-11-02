---
name: docs-writer
description: Write, edit, or review technical learning documents under src/assets/docs and their interactive demos in this repository. Use for documentation structure, lesson flow, headings, examples, explanations, Angular/RxJS links, and any request to make docs clearer, more modern, or less note-like.
---

# Documentation writer

Write in the style of current framework and platform documentation such as Angular documentation and MDN. Produce a coherent technical lesson, not a collection of notes.

## Mandatory writing rules

- Establish the prerequisite boundary before drafting. Never refer to a concept before introducing it.
- Define unfamiliar terms from the page title in plain language at their first appearance. Do not assume the reader understands title terminology.
- Do not carry wording, assumptions, or section order from an older draft unless they still serve the current lesson.
- Use conventional, searchable noun-phrase headings such as `Lexical scope và scope chain`. Do not use conversational headings such as `JavaScript tìm biến như thế nào?`.
- Use direct, neutral documentation prose. Avoid meta-commentary about the writing process.
- Do not use semicolons (`;`) to join independent ideas in prose. Split the ideas into separate sentences or introduce a short bullet list. Semicolons remain valid inside code when required by the language syntax.
- Avoid rhetorical filler and repeated lead-ins such as `Điều đáng chú ý`, `Hãy nhớ rằng`, or `Trước tiên, tạm bỏ ... sang một bên`.
- Introduce the problem before the mechanism, then define the mechanism, components, and behavior before using it in code.
- Keep each paragraph focused on one claim. Connect adjacent paragraphs explicitly when the reasoning depends on the previous one.
- Prefer one running example that grows with the lesson. Do not switch domains for every concept.
- Preserve technical depth through progressive disclosure. Explain essential components and behavior before advanced mechanisms.
- Write repository documentation in Vietnamese. Keep code keywords, API names, database operators, and standard technical terms in their canonical form when translation would reduce searchability. Preserve established demo UI labels unless the user explicitly asks to rename them.
- Present shared relational-database concepts without treating one engine as the default. Mention PostgreSQL, MySQL, or another engine only when a real difference in syntax, plan node, storage behavior, or feature availability changes how the concept is applied. Isolate that difference in a clearly labeled note instead of mixing dialect-specific details into the main explanation.
- Apply `camelCase` only to field, property, column, derived-column alias, and parameter names inside code or SQL examples. Domain fields use Vietnamese without diacritics, for example `khachHangId`, `tongTien` and `trangThai`. Stable cross-domain or infrastructure fields such as `id`, `createAt`/`createdAt`, `updateAt`/`updatedAt`, `deleteAt`/`deletedAt` and `version` may remain English. Do not apply this identifier convention to visible UI labels, prose, or navigation labels. Table, CTE, and index names may follow their own domain convention. In database-neutral SQL, keep identifiers unquoted; in engine-specific SQL, quote identifiers according to that dialect.
- Do not label prose by junior, middle, senior, level, or cấp độ.

## Lesson structure

Use this sequence when it fits the topic:

1. State the concrete behavior, task, or problem the lesson explains.
2. Name and define the mechanism in plain language.
3. Explain its components and execution behavior.
4. Introduce declaration syntax or the smallest API surface.
5. Apply it to a small example and trace the result.
6. Extend the same example into a realistic use case with one new complication at a time.
7. Show a realistic failure and debug it using the mechanism.
8. Connect the mechanism to Angular or RxJS only after the underlying model is clear.
9. End with applications and a concise summary; do not add exercise prompts unless the user explicitly requests them.

Do not force every topic into identical numbered sections. The reasoning order is mandatory; the exact section count is not.

## Headings and navigation

- Use standard technical terminology that readers can search for elsewhere.
- Keep headings short and descriptive.
- Make the heading hierarchy communicate dependency: overview, mechanism, behavior, application, debugging, practice.
- Do not preview a subject in one section and repeat its explanation in another. Give each concept one clear owner section.

## Examples

- Make examples runnable or clearly mark omitted infrastructure.
- Do not use a code example as a substitute for definition. Explain the concept and declaration form before asking the reader to interpret a use case.
- Separate declaration syntax from application: first show what can be declared and what each part controls, then show why a concrete case chooses that declaration.
- Explain output by tracing bindings, calls, queues, references, or state transitions as appropriate.
- Do not show a code block without explaining why it produces that behavior.
- Introduce no more than one major new idea per example.
- Use Angular/RxJS examples as applications of an already-explained mechanism, not as substitutes for the underlying explanation.

## Interactive demos

Inspect `package.json`, the nearest demo in `src/app/features`, and reusable components in `src/app/features/database/shared` before implementing a demo. Reuse the current stack; do not add another animation library unless the existing tools cannot express the required interaction.

### Library selection

- Use Angular state and HTML/CSS for controls, cards, tables, progress, highlighting, and simple transitions.
- Use responsive inline SVG for 2D stages, lanes, nodes, connectors, moving tokens, and labels. Give SVG a stable `viewBox`; use horizontal scrolling on narrow screens when shrinking would make text unreadable.
- Use `gsap` for coordinated 2D movement, timelines, and state-to-state transforms. Load it with `await import('gsap')` so a documentation route does not increase the initial bundle unnecessarily.
- Use `@antv/x6` only for a large interactive topology that needs graph layout, pan, zoom, ports, or editable connections. Do not use it for a short sequential explanation.
- Use `Chart.js` only when the primary output is a quantitative chart.
- Do not use Three.js for a 2D teaching demo. Use it only when the user explicitly needs spatial 3D behavior.

For GSAP components:

- Store SVG/DOM targets through `ViewChild`.
- Use `overwrite: 'auto'` when a new step can replace an active tween.
- Guard dynamic imports and async animation with a monotonically increasing version so an old request cannot animate the current state.
- Call `killTweensOf` and invalidate the version in `ngOnDestroy`.
- Derive duration from the selected demo speed and keep an immediate path for initial render or reset.

### Interaction model

- Model the demo as immutable scenario data and an ordered `steps` array. Each step should contain the state/result plus a concise `title`, `detail`, `actor`, and `operation`.
- Provide `Quay lại`, `Bước tiếp theo`, `Tự chạy`, reset/replay, progress, current-step explanation, and speed controls when the sequence has multiple steps.
- Clear timers in `ngOnDestroy`; restarting speed or scenario must stop the previous timer first.
- Render the scene from `currentStepIndex`; do not make the final state depend on an animation callback completing.
- Show the problem, input data, and question before the first step. Define simulated identifiers such as page numbers or transaction actors before they appear.
- Append completed steps to the shared `StepHistoryComponent` as an execution log. The learner must be able to reconstruct the result after animation stops.
- Split scenarios into separate demos or tabs when one stage would explain more than one independent mechanism.

### Visual and accessibility rules

- Prioritize sharp text and stable geometry over decorative effects. Do not blur inactive content to the point that labels become difficult to read.
- Reserve separate lanes for moving actors, resources, labels, and status badges. Verify every step so tokens never cover text or other controls.
- Keep the current state visually dominant through border, fill, or contrast; do not rely on motion alone.
- Support `html[data-theme='dark']` with explicit surface, border, text, muted, code, success, warning, and danger colors.
- Add `role="img"` and an informative `aria-label` to explanatory SVG. Respect `prefers-reduced-motion` by disabling nonessential CSS animation and transitions.
- Preserve usable control order and table readability on narrow screens; prefer responsive grids and scoped horizontal overflow over shrinking the entire demo.

### Demo verification

Before completing a demo:

1. Run every scenario step forward, backward, replayed, and at each speed.
2. Confirm the execution log matches the visible state and final conclusion.
3. Inspect light theme, dark theme, desktop, and narrow viewport.
4. Check for token/label overlap, clipped SVG content, stale tweens, duplicate timers, and unreadable contrast.
5. Run the production build.

## Review pass

Before completing a document:

1. Read from the perspective of someone who knows JavaScript syntax but not this mechanism.
2. Flag every term used before its definition.
3. Remove context-dependent phrases that only make sense because of an older draft or earlier conversation.
4. Replace note-like fragments with connected reasoning.
5. Check that headings are conventional and searchable.
6. Check that each example advances the same learning path.
7. Render or build the site when formatting, routes, or demos changed.
