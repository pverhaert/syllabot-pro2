# SyllaBot Pro² – Server Agent Instructions

This file contains instructions for AI coding agents working in the `server/` directory.

> **See the root [`AGENTS.md`](../AGENTS.md) for Git & publishing rules — they apply here too.**

---

## Server Overview

The server is a **Node.js + Express + Socket.io** app written in TypeScript. It hosts the agent pipeline and streams results back to the client in real time.

### Tech Stack

- **Express** — HTTP API (config endpoint, export endpoints)
- **Socket.io** — WebSocket layer for real-time streaming
- **TypeScript** — compiled to `dist/` for production
- **Google GenAI SDK** — Gemini model support
- **Groq SDK** — Llama model support
- **OpenRouter / Cerebras** — additional provider clients

### Key Files

- `src/pipeline/orchestrator.ts` — coordinates the full agent pipeline
- `src/agents/` — individual agent implementations (see below)
- `src/llm/` — LLM provider clients (`gemini-client.ts`, `groq-client.ts`, etc.)
- `src/utils/file-store.ts` — course state and Markdown history persistence
- `src/utils/tavily-client.ts` — optional web search integration

---

## Agent Reference

All agents extend `BaseAgent` (`src/agents/base-agent.ts`) and receive a shared `PipelineContext`.

### `BaseAgent`

Abstract base class. Provides:

- `generateText(prompt)` — single-shot LLM call
- `generateJSON<T>(prompt, schema)` — structured JSON output
- `generateStream(prompt)` — async generator for streamed text
- `log(message)` — emits `agent:thinking` event to the client

### `OutlineCreatorAgent` (`outline-agent.ts`)

- **Input:** topic, audience, number of chapters, optional Tavily web search
- **Output:** `CourseOutline` JSON (chapters with IDs, titles, subtopics)

### `CourseNameAgent` (`course-name-agent.ts`)

- **Input:** topic, audience, language
- **Output:** plain text course title (3–6 words)

### `ChapterWriterAgent` (`chapter-agent.ts`)

- **Input:** chapter metadata from outline, writing style, optional Tavily search
- **Output:** Markdown content (streamed chunk by chunk via `chapter:stream` event)

### `ExerciseCreatorAgent` (`exercise-agent.ts`)

- **Input:** chapter content, number of exercises, language
- **Output:** array of `Exercise` objects `{ question, solution, why, difficulty }`

### `QuizCreatorAgent` (`quiz-agent.ts`)

- **Input:** chapter content, number of questions, language
- **Output:** array of `QuizQuestion` objects `{ question, options, correctAnswerIndex, explanation }`

---

## Orchestration Flow (`orchestrator.ts`)

```text
startOutlineGeneration()
  └─ OutlineCreatorAgent.run()
  └─ CourseNameAgent.run()
  └─ saveState()
  └─ emit: outline:ready

generateChapter(chapterId)
  └─ ChapterWriterAgent.run()       (streams content)
  └─ ExerciseCreatorAgent.run()     (if exercisesPerChapter > 0)
  └─ QuizCreatorAgent.run()         (if quizQuestionsPerChapter > 0)
  └─ saveState() + saveMarkdownHistory()
  └─ emit: chapter:completed
```

---

## Adding a New Agent

1. Create `src/agents/my-agent.ts` extending `BaseAgent`.
2. Implement the `run(): Promise<AgentResult>` method.
3. Add it to `src/agents/index.ts`.
4. Call it from `orchestrator.ts` at the appropriate pipeline step.
5. Update the root `AGENTS.md` agent table and `README.md` diagram if the pipeline changes.
