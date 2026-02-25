import { LLMProvider } from './llm/provider.js';

export interface CourseConfig {
    language: string;
    topic: string;
    audience: string;
    writingStyle: string; // e.g., 'academic', 'conversational'
    minChapters: number;
    wordsPerChapter: number;
    exercisesPerChapter: number;
    quizQuestionsPerChapter: number;
    specialNeeds?: string;
    generatedTopics?: string; // User-provided list of topics/chapters
    mermaidDiagrams?: boolean; // Whether to include Mermaid diagrams in content
    enableSearch?: boolean; // Web search grounding
    tavilyApiKey?: string; // API Key for Tavily search (non-Gemini fallback)
}

export interface Chapter {
    id: string;
    title: string;
    description: string;
    order: number;
    content?: string; // Markdown content
    subtopics?: string[]; // List of subtopics/sections
    exercises?: Exercise[];
    quiz?: QuizQuestion[];
    status: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface Exercise {
    question: string;
    difficulty?: string; // easy, medium, hard
    solution?: string;
    why?: string; // why this exercise matters
}

export interface QuizQuestion {
    question: string;
    options: string[];
    correctAnswerIndex: number;
    explanation?: string;
}

export interface CourseOutline {
    title: string;
    description: string;
    chapters: Chapter[];
}

export interface PipelineContext {
    courseId: string;
    config: CourseConfig;
    llm: LLMProvider;
    modelId: string;

    // State
    outline?: CourseOutline;
    courseName?: string;
    currentChapterId?: string;

    // Utils
    emit?: (event: string, data: any) => void;
    // signal?: AbortSignal; // For cancellation
}

export interface AgentResult {
    success: boolean;
    data?: any;
    error?: string;
}
