# Release Notes

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
