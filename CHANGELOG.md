# Release Notes

## 1.0.4 (2026-03-05)

### Added

- **Interactive p5.js Runner**: Added support for p5.js sketches.
  - New `p5-runner.ts` module with sandboxed iframe execution.
  - Integrated p5.js library (v1.9.0) from CDN.
  - Support for `p5js` and `p5` language tags in markdown.
  - Added p5.js specific icon and "Render" action in the viewer.
  - **Enhanced Viewer Logic**: Added auto-detection for p5.js patterns in standard `javascript` blocks (e.g. `setup()` + `createCanvas()`) to ensure backward compatibility.
  - **Agent Prompts Updated**: Instructed all generation agents (`Chapter`, `Exercise`, `Quiz`) to specifically use the `p5js` tag for sketches.

---

## 1.0.3 (2026-03-05)

### Added (1.0.4)

- **Interactive Code Runners** for Python, JavaScript, TypeScript, HTML, and React directly inside the syllabus viewer.
  - Python execution runs client-side via Pyodide, supporting Matplotlib rendering and interactive `input()` via JS popups.
  - HTML runs in a scalable, sandboxed iframe.
  - React dynamically transpiles and mounts using Babel standalone.
- JavaScript and TypeScript snippets can now access the DOM context of a preceding HTML playground block.
- "Run/Preview/Render" functionality attached cleanly to language blocks.
- Universal "Copy" clipboard buttons attached to the toolbar of every markdown code snippet.
- Custom styled code output consoles that handle execution errors and `stdout`/`stderr` logging.

---

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
