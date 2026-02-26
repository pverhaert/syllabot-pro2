# SyllaBot Pro² – Client Agent Instructions

This file contains instructions for AI coding agents working in the `client/` directory.

> **See the root [`AGENTS.md`](../AGENTS.md) for Git & publishing rules — they apply here too.**

---

## Client Overview

The client is a **Vite + TypeScript** single-page app. It handles user input, communicates with the backend via Socket.io, and renders streamed course content in real time.

### Tech Stack

- **Vite** — dev server and build tool
- **TypeScript** — type-safe frontend code
- **TailwindCSS v4** — utility-first styling
- **Socket.io-client** — real-time WebSocket events
- **Mermaid** — renders AI-generated diagrams in course content
- **Lucide** — icon set

### Key Files

- `src/main.ts` — app entry point
- `src/socket.ts` — Socket.io connection and event handlers
- `src/ui/` — UI components (form, viewer, progress, history)

---

## Socket.io Events (Client → Server)

| Event | Payload | Description |
| :--- | :--- | :--- |
| `course:generate` | config object | Starts the full generation pipeline |
| `chapter:generate` | `{ chapterId }` | Requests a single chapter to be generated |

## Socket.io Events (Server → Client)

| Event | Payload | Description |
| :--- | :--- | :--- |
| `agent:thinking` | `{ agent, message, data }` | Live agent status — display in thinking console |
| `outline:ready` | `{ courseId, outline, courseName }` | Outline is ready — render chapter list |
| `chapter:completed` | `{ chapter }` | Chapter done — append to viewer |
| `progress:update` | `{ step, status, chapterId? }` | Pipeline progress — update progress indicators |
| `error` | `{ message, chapterId? }` | An agent failed — show error to user |

---

## UI Components

| Component | Role |
| :--- | :--- |
| **Course Config Form** | Collects topic, language, audience, model, and options |
| **Outline Preview** | Displays the `OutlineCreatorAgent` output; triggers per-chapter generation |
| **Course Viewer** | Renders streamed Markdown content including Mermaid diagrams |
| **Export Toolbar** | Triggers Markdown / DOCX download from the server |
| **History Panel** | Lists previously generated courses from the server's `data/history/` |
