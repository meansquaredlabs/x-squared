---
description: |
  Guide the full research process: analyze a topic, generate questions and hypotheses,
  research and test each hypothesis systematically, synthesize findings into a structured
  report. Use the read tool to load this skill file, then apply the process to the
  user's topic. Persist final output to research_agent.md.
---

# Research Process Skill

## Overview

This skill defines the end-to-end research workflow. Given a topic or prompt, generate
relevant questions and hypotheses, research each one by reading the DAAI Report wiki,
test competing hypotheses against evidence, then produce a structured report saved to
`research_agent.md`.

**Source:** All research draws exclusively from the local wiki at
`/Users/pascal/Documents/GitHub/the_DAAI_report/Ressources/wiki`. Do not use web search.

## Process

### Phase 1: Topic Analysis

1. Read the user's topic/prompt carefully.
2. Break the topic into key dimensions and angles.
3. Identify the most important unanswered questions in the space.

### Phase 2: Question & Hypothesis Generation

For each dimension, formulate:
- **Research questions** — specific, answerable queries that probe the topic
- **Hypotheses** — testable claims with predicted outcomes
- For each hypothesis, consider both supporting and counter-arguments

Example:
```
Topic: "The future of AI in healthcare"

Questions:
  Q1: What clinical diagnoses can AI perform at par with specialists?
  Q2: Which regulatory frameworks govern AI in clinical settings?
  Q3: What is the economic impact of AI adoption in healthcare?

Hypotheses:
  H1: AI has surpassed human radiologists in imaging diagnosis reliability.
    Counter: AI fails on edge cases and lacks clinical context reasoning.
  H2: Regulatory frameworks are insufficient for autonomous AI systems.
    Counter: Frameworks have been updated (FDA, EU AI Act) to address this gap.
```

### Phase 3: Systematic Research

**Wiki path:** `/Users/pascal/Documents/GitHub/the_DAAI_report/Ressources/wiki`

**Token budget constraint: read at most 12 wiki files in total across the entire research
process. Exceeding this causes context exhaustion and an aborted run.**

Steps:
1. Read `index.md` once. The 200-character summary per page is your primary source —
   use it to answer questions whenever possible without opening the file.
2. From the index summaries, identify the 8–12 pages most directly relevant to the topic.
   Rank by relevance; only read files whose full content is necessary to test a hypothesis.
3. Read those files from `concepts/`, `entities/`, `synthesis/`, `trends/`, or
   `use-cases/`. File names match the slugs listed in the index.
4. Do not follow `links:` fields into additional files unless you have remaining budget.
5. Cross-reference findings across pages to identify consensus and counter-evidence.
6. Test each hypothesis against collected evidence — accept, reject, or qualify.
7. If no relevant wiki content exists for a hypothesis, note it as a knowledge gap.

Do not perform web searches. All evidence must come from the wiki.

### Phase 4: Synthesis

Combine research results into:
- **Key Findings** — ranked by evidence strength and relevance
- **Areas of Consensus** — where multiple sources agree
- **Areas of Disagreement** — where sources conflict
- **Knowledge Gaps** — what remains unclear or unverified
- **Sources Consulted** — list of references used

### Phase 5: Report Generation

**Step 5a — Markdown report**

Write the complete report to `research_agent.md` at the repo root:

```markdown
# Research Report: <Topic Title>

**Date:** <current date>
**Process:** Research skill v1

## Executive Summary
<One-paragraph high-level summary>

## Research Questions and Hypotheses

### Question 1: <question>
- **Hypothesis:** <claim>
- **Evidence:** <what the research showed>
- **Verdict:** Supported / Refuted / Mixed

## Key Findings
### Finding 1: <title>
Detailed analysis...

## Areas of Consensus
## Areas of Disagreement
## Knowledge Gaps
## Sources Consulted
- <wiki slug, e.g. `concepts/ai-agents-core-concept.md`>
```

**Step 5b — HTML slide report**

Read the template at `.pi/skills/research/report-template.html`.
Replace the following placeholders and write the result to
`reports/research_agent_<YYYYMMDD_HHMMSS>.html`:

| Placeholder | Content |
|---|---|
| `{{REPORT_TITLE}}` | Full report title |
| `{{DATE}}` | Current date (YYYY-MM-DD) |
| `{{EXEC_LEAD}}` | One-sentence executive hook (the single most important insight) |
| `{{EXEC_BODY}}` | 2–3 `<p>` tags with the executive summary body |
| `{{CONTENT_SLIDES}}` | One `<section class="slide">` per key finding (5–8 slides max) |

For `{{CONTENT_SLIDES}}`, write one slide per key finding using the
`<section class="slide" id="sN">` pattern shown in the template comments.
Use `class="final-slide"` on the last slide. Update the counter `1 / N`
to match the actual slide count (cover + content slides).

Do NOT rewrite the CSS or JS — copy from the template exactly.

## Constraints

- Be thorough — cover at least 3–5 distinct dimensions of the topic.
- Cite specific evidence, not generic summaries.
- Note uncertainty explicitly when evidence is limited.
- Test hypotheses actively: do not selectively cherry-pick confirming evidence.
- If evidence is insufficient for a hypothesis, note it as a knowledge gap rather than
  drawing a weak conclusion.
