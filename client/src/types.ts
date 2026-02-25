export interface CourseConfig {
    language: string;
    topic: string;
    audience: string;
    writingStyle: string;
    minChapters: number;
    wordsPerChapter: number;
    exercisesPerChapter: number;
    quizQuestionsPerChapter: number;
    specialNeeds?: string;
    generatedTopics?: string;
}

export interface Chapter {
    id: string;
    title: string;
    description: string;
    order: number;
    content?: string;
    subtopics?: string[];
    status: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface CourseOutline {
    title: string;
    description: string;
    chapters: Chapter[];
}
