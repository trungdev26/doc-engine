---
name: docs-writer
description: Use when writing, editing, or reviewing technical documents under src/assets/docs and their interactive demos. Enforces modern framework-documentation style, progressive lesson flow, prerequisite ordering, standard headings, and connected explanations instead of learning-note fragments.
---

# Documentation writer

Write in the style of current Angular documentation, React documentation, and MDN. Produce a coherent technical lesson, not a collection of notes.

## Discovery-driven chapter structure

For architecture, infrastructure, framework, database, messaging, concurrency, and distributed-system topics, build one causal argument instead of listing concepts. Use one realistic scenario that grows throughout the chapter.

The default reasoning arc is:

```text
Working system without the concept
→ new requirement or load appears
→ simplest intuitive solution
→ exact condition where that solution still works
→ reproducible failure window or operational ceiling
→ invariant the system must preserve
→ concept/mechanism introduced to protect that invariant
→ minimal installation and working implementation
→ observe the mechanism through output, state, logs, metrics, or UI
→ remaining limitation
→ next mechanism
```

Do not begin with a catalogue of components such as `Connection`, `Channel`, `Exchange`, `Queue`, and `Binding`. First establish the problem that makes the overall abstraction necessary. Introduce each component at the point where the running system needs its responsibility.

For every major mechanism, answer these questions in the prose, code, and diagrams:

| Question | Required evidence |
|---|---|
| What problem exists before this mechanism? | A concrete business or runtime scenario |
| What would the first intuitive implementation look like? | Minimal code or execution flow |
| Why is that implementation insufficient? | Exact failure window, race, bottleneck, or lifecycle event |
| What invariant must remain true? | A precise correctness statement |
| How does the mechanism protect it? | Step-by-step runtime trace |
| What does the mechanism not guarantee? | The next remaining boundary |
| How can the reader verify it? | Observable output, UI state, query result, test, or metric |

Basic usage must precede deeper mechanics. The reader should be able to install the dependency, run a minimal example, observe its result, and understand the everyday API before reaching retry, concurrency, failure recovery, scaling, or production tuning.

When a document covers production code, use the repository's actual runtime version, packages, configuration, and project boundaries. Explain why each class belongs in its layer and trace configuration through dependency injection to the executed code. Do not present pseudocode as if it were the current implementation; label reference models and future upgrade paths explicitly.

Use noun phrases for document titles and headings. A heading names the concept or mechanism; the prose below it carries the causal transition from the previous section. Avoid narrative headings such as `Khi chưa có Message Queue`, `X ra đời để làm gì?`, `Theo dõi lần chạy đầu tiên`, or `X vẫn chưa giải quyết Y`.

Edit for reading rhythm after the reasoning is complete. One paragraph carries one claim. When a paragraph combines a scenario, a list of actors or timings, and a conclusion, split it into three visible units: the scenario in prose, the named values in bullets or a table, and the conclusion in its own paragraph. A sequence of short sentences is not automatically readable if every sentence introduces a new category the reader must retain.

Mermaid is enabled globally in `MarkdownDocComponent`. Use fenced `mermaid` blocks for architecture, sequence, state, and data-flow diagrams when a diagram makes the relationship easier to understand. Keep labels short, validate every diagram through the rendered route, and do not replace a short explanation with a decorative diagram.

## Mandatory rules

- **MUST**: match the actual page format of angular.dev/React.dev/MDN, not just their tone. This has been corrected repeatedly — tone alone (rule below) is not enough. Concretely:
  - Keep paragraphs short (2–4 sentences). When a paragraph is doing more than one job — explaining a reason AND listing cases AND giving a recommendation — split it into a bulleted list or a table instead of one long reasoning chain.
  - Any set of named options, parameters, states, or config keys goes in a table (`Tên | Kiểu/Giá trị | Mô tả`), not a paragraph that narrates them one by one in prose.
  - Do not chain a list of distinct items into one sentence with commas and parentheses, e.g. `X còn giữ A (ví dụ ...), B đang được giữ, và C của D`. Each item picked up by "và", or explained via a parenthetical aside, is a signal the sentence is actually a list wearing prose clothing — break it into a bulleted list or table, one item per line, so a reader can scan and retain it instead of parsing a run-on clause.
  - Use blockquote callouts for a warning/tip/caveat that would otherwise be buried mid-paragraph, e.g. `> **Lưu ý:** ...` — the way angular.dev uses `IMPORTANT`/`TIP` boxes and MDN uses "Note" asides.
  - A reader skimming only headings, bold terms, code, and tables should already get the shape of the page. If understanding a section requires reading every sentence of running prose, restructure it.
- Establish the prerequisite boundary before drafting. Never refer to a concept before introducing it.
- Define unfamiliar terms from the page title in plain language at their first appearance. Do not assume the reader understands title terminology.
- Do not carry wording, assumptions, or section order from an older draft unless they still serve the current lesson.
- Use conventional, searchable noun-phrase headings. Do not use conversational questions as headings.
- Use direct, neutral documentation prose without meta-commentary. Write like a reference page (Angular docs, MDN), not like a spoken explanation or a chat reply to the reader. State facts about the subject; do not narrate what the document itself is about to do.
  - Avoid: `Trước khi đi vào chi tiết, ...`, `Các mục dưới đây lần lượt sẽ ...`, `Hãy cùng ...`, `Chúng ta sẽ tìm hiểu ...`, `Ở phần này mình sẽ ...`, or any first/second-person framing that addresses the reader like a conversation.
  - Prefer stating the definition or behavior directly, then letting the section structure itself carry the "what's next" — don't announce it in prose.
- Avoid rhetorical filler and repeated lead-ins such as `Điều đáng chú ý`, `Hãy nhớ rằng`, or `Trước tiên, tạm bỏ ... sang một bên`.
- Avoid spoken-register hedges that report common usage instead of stating the fact: `ngoài đời (code review) người ta thường nói`, `X có đúng một nhiệm vụ là...`, `nói nôm na là`, `kiểu như`. If a term has a formal name and a commonly-spoken shorter name, state both as facts in one clean clause (`Tên chính thức là X, thường được gọi ngắn gọn là Y`) — do not frame it as reporting what people say out loud.
- Never interrupt a sentence's main clause with a long em-dash hedge/caveat aside (e.g. `Một cách hình dung phổ biến — không phải yêu cầu của đặc tả ECMAScript, nhưng đúng với cách các engine phổ biến triển khai — là primitive được lưu trên stack`). State the claim directly first; if a caveat about scope, accuracy, or spec-compliance is needed, put it in its own trailing sentence after. Short em-dash asides (a few words, a concrete example, or a named exception) are fine — the banned pattern is specifically a multi-clause hedge/disclaimer wedged inside the main sentence.
- State the plain-language theory or definition of a concept before any code that demonstrates it. The reader must know what a code block is about to prove before reading it — never open a section with unexplained code that only gets named afterward.
- The first example for a concept must be simple enough that someone who just read the definition can trace it by hand: no unrelated advanced syntax (generics, utility types, uncommon APIs) mixed into it. Save idiomatic/advanced implementations for the deeper extension that follows.
- Keep each paragraph focused on one claim and connect dependent ideas explicitly.
- Every major heading, especially an H2-level topic shift, must open by connecting to what the previous section established — state the conclusion just reached and the question it leaves open — not a bare topic announcement (`Phần này nói về X`, `Phần này mô tả...`) and not a fact that could equally open any section. A reader moving from one heading to the next should feel one argument continuing, at a level a newcomer to that argument (not just to the syntax) can follow — not a new, independent chapter starting. This applies regardless of the reader's seniority: the throughline must hold for someone reading the document top to bottom for the first time.
- Prefer one running example that grows one concept at a time.
- After the base definition and example, extend into deeper mechanics, edge cases, or trade-offs under their own subheading — a distinct "how it really works" layer, the way React.dev uses "Deep Dive" callouts and angular.dev uses advanced-usage sections following the basic explanation. Never label this by audience ("dành cho senior", "nâng cao dành cho middle") — frame it by what it covers (mechanism, edge case, trade-off), not by who it's for.
- Do not label document prose by junior, middle, senior, level, or cấp độ.
- Cover the full basic-to-advanced range, not just the interesting middle. Before the mechanism/trade-off content, include: what the thing is (formal definition), installation/setup (packages, minimal working config), and the core API/options a reader needs to use it day to day. Do not skip straight from a one-paragraph definition into an isolated code snippet — a reader who has never touched the subject must be able to get it running from the document alone. This has been a repeated correction: documents that read as "just the advanced/interesting parts" are treated as incomplete, not as appropriately concise.

## Vietnamese prose and code-example conventions

Distilled from repeated corrections while writing the RabbitMQ chapter — apply these on every Vietnamese-language document under `src/assets/docs`, not just that one.

- Never use a semicolon inside prose sentences. End the clause with a period, or join two closely related clauses with an em dash (`—`). Semicolons stay fine inside fenced code/SQL blocks, where they are language syntax, not prose punctuation.
- Never write in first-person plural (`chúng ta`) or address the reader directly (`bạn`). State facts about the subject in impersonal voice, consistent with rule 66 above.
- When a term needs a short gloss on first use, attach it inline right where the term appears — `**Term** (giải thích ngắn)` or `**Term** — giải thích ngắn` — instead of a separate sentence that defines it after the fact.
- When an idea benefits from a concrete analogy (an everyday-object metaphor: bưu điện, băng chuyền hành lý, kho hàng...), state the technical claim in its own sentence or paragraph first, then introduce the analogy as its own clearly labeled block afterward (e.g. a paragraph opening `Ví dụ dễ hình dung: ...`). Never interleave the metaphor's vocabulary into the technical sentence itself — a reader who skips the analogy block must not lose any information.
- When a page's top-level headings are numbered (`## 1.`, `## 2.`, ...), never introduce another numbered `##` level to break up a section internally — that collides with the numbering and breaks the table of contents. Use unnumbered `####` subheadings instead.
- When a formula, config key, code identifier, or invariant reused from an earlier section reappears, name that section (`(mục 10)`, `đã tính ở mục 10`) instead of restating or silently reusing it — this lets the reader jump back to the original explanation instead of re-deriving it. Apply the same cross-referencing to a checklist or scope-summary section that synthesizes the whole document: tag each line with the section(s) it came from.
- Even a mechanism explicitly marked "reference model" or "not yet in production" should get concrete, compilable-looking code (schema, dispatcher, retry topology, partitioning, etc.) — don't leave it prose-only when the rest of the document demonstrates other mechanisms with code. A reader should be able to see what the implementation would actually look like, not just why it's needed.
- In code examples, prefer inline `//` comments on the specific line or argument they explain — or numbered step comments (`// 1. ...`, `// 2. ...`) for a sequential flow — over a paragraph of prose that walks through the same code line by line afterward.
- Never label prose or a section by seniority or audience level (`Tư duy Senior`, `dành cho Middle`, `cho Architect thực thụ`) — this restates rule 78 above but has recurred specifically when adapting outside drafts; strip the label and keep only the technical content.
- When adapting a draft supplied by the user or another source, still apply every rule above — strip emoji headers, LaTeX math (this renderer has no KaTeX; use fenced ```text``` blocks), `[INDEX]`-style citation placeholders, chat framing (opening greetings, closing "sẵn sàng sang mục tiếp theo?"), and any `bạn`/`chúng ta` before merging its content in.

## Default lesson flow

1. State the plain-language theory/definition of the concept.
2. Show a minimal example a newcomer to the concept can trace by hand.
3. Trace the execution in order, connecting each step back to the definition.
4. Extend into deeper mechanics, edge cases, or trade-offs under a distinct subheading.
5. Diagnose a realistic failure using that mechanism.
6. Apply it to Angular or RxJS after the JavaScript model is clear.
7. End with focused practice and a concise summary.

Do not force an identical section count across topics. Preserve the reasoning order.

## Review checklist

Before completing a document:

1. Read it as someone who knows syntax but not the mechanism.
1b. Read each sentence and ask: would this appear in MDN or angular.dev, or does it sound like something explained out loud to a colleague? Rewrite anything in the second category — this has been the single most repeated correction on this skill, so check for it explicitly rather than assuming earlier rules already caught it.
2. Remove terms used before their definition.
3. Remove phrases that depend on an older draft or conversation.
4. Replace note fragments with connected reasoning.
5. Verify headings are standard and searchable.
6. Verify each example advances the same learning path.
7. Build or render the site when formatting, routes, or demos changed.
8. Confirm installation/setup and the everyday API surface are covered before the advanced material — not just the mechanism deep-dive.
9. Skim only the headings, bold terms, tables, and code — if that skim doesn't convey the page, convert some running prose into tables/bullets/callouts per the MUST rule above.
10. Read only the heading plus opening sentence of every major section, in document order. Confirm it reads as one continuing argument — each opening line traces back to the prior section's conclusion — not a list of independent topics. This is a distinct check from 1b: a page can pass every sentence-level check and still read as disconnected chapters at the heading level.
11. Grep every `###`/`####` heading and check what immediately follows it. A heading followed directly by a fenced code block or diagram with no sentence in between is a violation of rule 28 even if the rest of the document is fine — this slips past checks 1b and 10 because it's a structural gap, not a wording one. Add one sentence stating what the block shows or proves before it.
12. Grep for `;` outside fenced code blocks and for `chúng ta` / `bạn` anywhere — fix every hit per the Vietnamese prose conventions above.
13. Grep for a numbered `##` used below the top level, for seniority-label phrases (`Senior`, `Middle`, `Architect thực thụ`, `cấp độ`), and — if any content in this pass came from a pasted draft — for leftover `[INDEX]` placeholders, LaTeX (`$$`), emoji section markers, and chat framing (greetings, "sẵn sàng sang mục tiếp theo?").
