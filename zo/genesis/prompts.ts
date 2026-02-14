/**
 * Genesis Processing Prompts
 *
 * Prompt templates for LLM-based theme extraction and analysis.
 *
 * @module zo/genesis/prompts
 */

/**
 * Prompt for extracting themes from a group of related thoughts.
 */
export const THEME_EXTRACTION_PROMPT = `You are analyzing a group of related ideas from a brainstorming session.

Given these thoughts:
{{thoughts}}

Identify:
1. A concise theme (2-4 words) that captures what unifies these thoughts
2. A short name for this cluster (1-3 words)
3. Any subtle connections between ideas that aren't obvious

Respond in JSON format:
{
  "theme": "...",
  "name": "...",
  "connections": ["..."]
}`;

/**
 * Prompt for assessing session completeness.
 */
export const COMPLETENESS_PROMPT = `Analyze this brainstorming session for completeness:

Session content:
{{content}}

Clusters identified so far:
{{clusters}}

Assess whether the session seems complete based on:
- Coverage: Are multiple distinct themes touched?
- Depth: Are ideas elaborated beyond single mentions?
- Closure: Are there summarizing phrases or conclusions?
- Repetition: Is the user circling back without new material?

Respond in JSON:
{
  "coverage": 0-1,
  "depth": 0-1,
  "closure": 0-1,
  "repetition": 0-1,
  "summary": "..."
}`;
