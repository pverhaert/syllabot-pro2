# Gemini Advanced Capabilities: Search, Thinking, and URL Context

Here is the breakdown regarding your questions about Gemini's advanced capabilities and their availability.

## 1. Search Grounding (Google Search)

* **What it does:** Allows the model to search the web for up-to-date information to "ground" its answers in reality, reducing hallucinations.
* **Is it better?** **Yes**, absolutely. It ensures the course content (especially for technical or rapidly changing topics) is current and accurate.
* **Free Tier?** **Generally No.** While Google AI Studio has free testing, using Search Grounding via the API generally incurs a cost (approx. $35 per 1,000 queries) and is not part of the standard free tier API quota.
  * *Recommendation:* Use this only if you have a paid account and accurate, real-time data is critical.

## 2. Thinking Models (e.g., `gemini-2.0-flash-thinking-exp`)

* **What it does:** These models are trained to "think" (chain-of-thought) before answering, producing a higher quality, more reasoned output.
* **Is it better?** **Yes**, especially for outlining complex courses (`outline-agent`) or generating intricate exercises (`exercise-agent`).
* **Free Tier?** **Yes!** The "Thinking" experimental models are often available for free in the preview/experimental phase.
  * *Action:* Changing your default model to `gemini-2.0-flash-thinking-exp` is a free and impactful upgrade.

## 3. URL Context

* **What it does:** Allows you to pass a URL (like a documentation page or article) directly to the model to use as source material.
* **Is it better?** **Yes**, if you want the course to be based on specific existing material.
* **Free Tier?** **Yes.** This counts towards your **token usage** (input tokens). The free tier currently offers generous limits (e.g., 1M tokens/minute for some models).
  * *Note:* The current `GeminiClient` in your app only sends text. To effective use URLs, we would need to update the client to handle multimodal inputs or fetch the URL content before sending it.

### 4. Available "Tools" in Free Tier

The Gemini API free tier provides access to several powerful tools:

* **Function Calling:** **YES, Free.**
  * *What it is:* You can define your own functions (like `save_to_database()` or `calculate_score()`) and the model will intelligently ask to run them.
  * *Cost:* Free (counts towards your standard token usage).

* **Code Execution:** **YES, Free.**
  * *What it is:* The model can write and *execute* Python code in a sandbox to solve math problems, process data, or generate charts.
  * *Availability:* Supported on models like `gemini-2.0-flash` and `gemini-1.5-pro`.

* **Google Search Grounding:** **PARTIALLY Free.**
  * *Details:* There is often a limited free allowance (e.g., ~1,500 requests/day for some Flash models or 5,000 prompts/month for specific previews) where search is included.
  * *Caution:* Beyond specific free tier limits, this is a paid feature ($35/1k queries). It is safest to assume it is **restricted** on the standard free tier unless you are using Google AI Studio.

## Summary & Recommendation

For **free tier** usage, the best immediate upgrade is to **switch to a "Thinking" model**.

### Proposed Next Steps

1. **Update Config:** Change the default model in your configuration to `gemini-2.0-flash-thinking-exp-01-21`.
2. **UI Selector:** Add a dropdown in the UI to let you select the model (Standard vs. Thinking) per course.
