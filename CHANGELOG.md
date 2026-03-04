# Release Notes

## 1.0.2 (2026-03-04)

### Added

- **LaTeX math rendering** via KaTeX in both the course viewer (`viewer.ts`) and generation UI (`ui.ts`).
  - Installed `katex` and `marked-katex-extension` packages.
  - Inline math (`$...$`) and block math (`$$...$$`) now render as proper formatted equations.
- `math-utils.ts` — preprocessor that normalizes `$$...$$` block math onto separate lines before rendering.
- LaTeX math formatting instructions added to all content-generating agents (`chapter-agent.ts`, `exercise-agent.ts`, `quiz-agent.ts`).
- Added **Gemini 3.1 Flash Lite** and **GPT-5.3 Chat** models to the model selection.

### Changed

- Outline agent now allows 3–10 subtopics per chapter (was 3–7).
- Outline agent prompt corrected to reference em-dash (`—`) instead of en-dash (`–`).

---

## 1.0.1 (2026-02-26)

### Added

- `CHANGELOG.md` to track changes across releases.
- Agent Architecture section with Mermaid diagram to `README.md`.
- Restart reminder at the top of `.env.example`.
- `AGENTS.md` files (root, `client/`, `server/`) with coding-agent instructions, Git rules, and technical reference.

### Changed

- Simplified the **Agent Architecture** flowchart in `README.md` for better readability.
- `run.bat` now automatically checks for updates from GitHub before starting.
  - Uses `git merge-base` to correctly handle ahead / behind / diverged states.
  - Reinstalls npm dependencies only when `package.json` files changed after a pull.

---

## 1.0.0 (2026-02-26)

### Features

- Initial release of **SyllaBot Pro2**.
- Multi-model support for **Google Gemini**, **OpenRouter**, **Groq**, and **Cerebras**.
- **Tavily AI** integration for real-time web-grounded research.
- Real-time streaming architecture for course generation.
- Structured course generation including Outline, Chapters, Quizzes, and Exercises.
- Export options for **Markdown** and **DOCX** (Standard and Styled).
- Automated setup and run scripts (`install.bat`, `run.bat`).
