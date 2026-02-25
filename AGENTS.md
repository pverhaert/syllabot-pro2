# Syllabot Pro 2: Agentic Architecture

Syllabot Pro 2 is built on a multi-agent orchestration architecture designed to automate the creation of high-quality, structured course materials. The system uses specialized AI agents, coordinated by a central orchestrator, to perform distinct tasks within the content generation pipeline.

## System Overview

The core of the system is a **Multi-Agent Orchestration** model that leverages Large Language Models (LLMs) from Google Gemini, Groq, Cerebras, and OpenRouter. Each agent is responsible for a specific domain-level task, ensuring that the final course material is coherent, comprehensive, and pedagogically sound.

## The Core Pipeline

The generation process follows a structured workflow:

1.  **Request & Configuration:** The user provides a topic, target audience, and desired output parameters (number of chapters, exercises, quiz questions, etc.) through the web client.
2.  **Orchestration:** The `CourseOrchestrator` (Server) initializes the pipeline and manages the lifecycle of each agent.
3.  **Outline Creation:** The `OutlineCreatorAgent` generates a hierarchical course structure (chapters, sub-chapters, and learning objectives).
4.  **Course Naming:** The `CourseNameAgent` generates a compelling title for the course based on the topic and generated outline.
5.  **Content Generation:** For each chapter in the outline, the `ChapterWriterAgent` produces in-depth pedagogical content.
6.  **Supplementary Material:** Depending on the configuration, the `ExerciseCreatorAgent` and `QuizCreatorAgent` generate interactive components to reinforce learning.
7.  **Export:** The final structured data is converted into Markdown and Docx formats for user download.

## Agent Responsibilities

| Agent | Responsibility | Output Format |
| :--- | :--- | :--- |
| **OutlineCreatorAgent** | Designs the curriculum structure and learning goals. | Structured JSON (CourseOutline) |
| **CourseNameAgent** | Crafts a creative and relevant title for the course. | Plain Text |
| **ChapterWriterAgent** | Produces detailed, high-quality educational content. | Markdown |
| **ExerciseCreatorAgent** | Generates practical exercises based on chapter material. | Structured JSON |
| **QuizCreatorAgent** | Creates multiple-choice questions for knowledge validation. | Structured JSON |
| **SummaryAgent** | (Internal) Generates course-wide introductions and conclusions. | Markdown |

## Interaction & Feedback

The system uses **Socket.io** for real-time communication between the server and the client. This allows users to see:
- **Thinking Logs:** Insights into what each agent is currently processing.
- **Progress Updates:** Visual feedback as chapters and supplementary materials are completed.
- **Streaming Content:** Real-time text generation as it happens.

For more details on implementation, see the `AGENTS.md` files in the [server](./server/AGENTS.md) and [client](./client/AGENTS.md) directories.
