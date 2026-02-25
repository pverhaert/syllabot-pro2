# Client-Side Agents: Visualization and Interaction

While the core agentic logic of Syllabot Pro 2 resides on the server, the client plays a crucial role in visualizing the agentic process and providing a user interface for interaction.

## Real-Time Feedback

The client communicates with the backend agents using **Socket.io**. This enables a "live" experience where users can see:

### 1. Agent Thinking Process
The client listens for `agent:thinking` events, which are emitted by server-side agents during their internal processing.
-   **Events:** `socket.on('agent:thinking', (data) => { ... })`
-   **Data:** Includes the agent name, a descriptive message, and an optional data payload.
-   **Visualization:** Displayed as a "Thinking Console" or a live feed that provides transparency into the AI's reasoning and current tasks.

### 2. Progress Updates
The client receives `progress:update` events to show the overall status of the course generation pipeline.
-   **Events:** `socket.on('progress:update', (data) => { ... })`
-   **Steps:** `outline`, `chapter`, `exercise`, `quiz`, `summary`, `export`.
-   **Visualization:** Progress bars, status icons, and step-by-step indicators.

### 3. Chapter Completion
As each chapter is finalized by the agents, the client receives the completed data.
-   **Events:** `socket.on('chapter:completed', (data) => { ... })`
-   **Data:** Includes the finalized chapter content, exercises, and quizzes.
-   **Visualization:** Updates the viewer interface dynamically, allowing users to review the material as it's being generated.

## UI Components & Agents

The client-side UI is built using **TypeScript**, **Vite**, and **TailwindCSS v4**, with **Mermaid** for rendering agent-generated diagrams.

| UI Component | Agent Interaction |
| :--- | :--- |
| **Course Config Form** | Captures user inputs to initialize the agentic pipeline. |
| **Outline Preview** | Displays the output of the `OutlineCreatorAgent`. |
| **Course Viewer** | Renders the content produced by the `ChapterWriterAgent`, `ExerciseCreatorAgent`, and `QuizCreatorAgent`. |
| **Export Tool** | Triggers server-side export agents/utilities for Docx and Markdown. |

## Technology Stack (Client)
-   **TypeScript:** Robust front-end development.
-   **Vite:** Fast development and optimized builds.
-   **TailwindCSS v4:** Utility-first styling with modern features.
-   **Socket.io-client:** Real-time event handling.
-   **Mermaid:** Client-side rendering of AI-generated diagrams.
-   **Lucide:** Consistent and modern iconography.
