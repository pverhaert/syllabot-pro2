# SyllaBot Pro² – Agent Instructions

This file contains instructions for AI coding agents (e.g. Copilot, Cursor, Antigravity, Codex) working in this repository.

---

## Git & Publishing Rules

> **Do NOT push to GitHub automatically.** Always wait until the user explicitly says to push.

Before pushing to GitHub, always complete these steps in order:

1. **Update `README.md`** if the changes affect features, setup, usage, or architecture.
2. **Update `CHANGELOG.md`** with a summary of what changed under the correct version heading.
3. **Bump the version in `package.json`** following semantic versioning:
   - Patch release for fixes and small improvements: `1.0.0 → 1.0.1 → 1.0.2 → ...`
   - Minor release for new features: `1.0.0 → 1.1.0`
   - Major release for breaking changes: `1.0.0 → 2.0.0`

---

## Project Overview

SyllaBot Pro² is a multi-agent AI system that generates structured course materials. A central **CourseOrchestrator** coordinates specialized agents over a real-time WebSocket connection.

### Tech Stack

- **Frontend:** Vite + TypeScript (`client/`)
- **Backend:** Node.js + Express + Socket.io (`server/`)
- **LLM Providers:** Google Gemini (required), OpenRouter, Groq, Cerebras (optional)
- **Optional:** Tavily AI for web-grounded research

### Agent Pipeline

| Step | Agent | Output |
| :--- | :--- | :--- |
| 1 | `OutlineCreatorAgent` | Structured course outline (JSON) |
| 2 | `CourseNameAgent` | Short course title (text) |
| 3 | `ChapterWriterAgent` | Chapter content (Markdown, streamed) |
| 4 | `ExerciseCreatorAgent` | Practical exercises (JSON) |
| 5 | `QuizCreatorAgent` | Multiple-choice questions (JSON) |

All agents extend `BaseAgent` (`server/src/agents/base-agent.ts`) and share a `PipelineContext` object containing the LLM client, course config, and a Socket.io emit function.

### Key Files

- `server/src/pipeline/orchestrator.ts` — coordinates the full generation pipeline
- `server/src/agents/` — individual agent implementations
- `server/src/llm/` — LLM provider clients
- `client/src/` — frontend UI and WebSocket handling
- `.env` / `.env.example` — API keys and port configuration (**restart required after any change**)

### Real-Time Communication

The server emits Socket.io events that the client listens to:

- `agent:thinking` — live agent status/logs
- `outline:ready` — outline has been generated
- `chapter:completed` — a chapter (with exercises and quiz) is done
- `progress:update` — step-level progress updates

For more details, see also `server/AGENTS.md` and `client/AGENTS.md`.
