---
description: Run the research process on a topic and persist findings to research_agent.md
argument-hint: "<topic or prompt>"
---
Research the given topic fully and persist the final report to `research_agent.md`.

Topic: $ARGUMENTS

## Process

Use the **research skill** (`research_agent.md` in `.pi/skills/research/`) for the full research
process:

1. Analyze the topic and break it into dimensions
2. Generate relevant questions and testable hypotheses
3. Research each hypothesis systematically using the DAAI Report wiki (source analysis, test results)
4. Synthesize findings into a structured report
5. Write the final report to `research_agent.md` in the root

## Output Format

The report saved to `research_agent.md` should follow this structure:

     ```markdown
     # Research Report: <Topic Title>

     **Date:** <current date>
     **Topic:** <the topic being researched>

     ## Research Questions and Hypotheses
     <questions with hypotheses and evidence, including supporting and counter-evidence>

     ## Key Findings
     <synthesized findings with evidence>

     ## Areas of Consensus
     <what sources agree on>

     ## Areas of Disagreement
     <where sources conflict>

     ## Knowledge Gaps
     <remaining uncertainties>

     ## Sources Consulted
     <list of references>
     ```

## Constraints

- Research must be thorough and cite multiple sources
- Be specific and evidence-based, not speculative
- Note uncertainty where evidence is limited
- The final report goes to `research_agent.md` at the repository root
