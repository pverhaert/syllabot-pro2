export interface CourseDefaults {
    language: string;
    minChapters: number;
    wordsPerChapter: number;
    exercisesPerChapter: number;
    quizQuestionsPerChapter: number;
    writingStyle: string;
    demoMode: boolean;
    demoModeChapters: number;
}

const defaults: Omit<CourseDefaults, 'demoModeChapters'> = {
    language: 'English',
    minChapters: 8,
    wordsPerChapter: 3000,
    exercisesPerChapter: 10,
    quizQuestionsPerChapter: 10,
    writingStyle: 'academic',
    demoMode: false,
};

export function getDefaults(): CourseDefaults {
    return { 
        ...defaults,
        demoModeChapters: Number(process.env.DEMO_MODE_CHAPTERS) || 3
    };
}

export const availableLanguages = [
    'English',
    'Dutch',
    'French',
    'German',
    'Spanish',
    'Italian',
    'Portuguese',
    'Chinese',
    'Japanese',
    'Korean',
    'Arabic',
    'Russian',
    'Hindi',
    'Turkish',
    'Polish',
    'Swedish',
    'Norwegian',
    'Danish',
    'Finnish',
    'Czech',
];
