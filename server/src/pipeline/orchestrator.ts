import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { PipelineContext, CourseConfig, CourseOutline } from '../types.js';
import { GeminiClient } from '../llm/gemini-client.js';
import { OpenRouterClient } from '../llm/openrouter-client.js';
import { GroqClient } from '../llm/groq-client.js';
import { CerebrasClient } from '../llm/cerebras-client.js';
import { OutlineCreatorAgent } from '../agents/outline-agent.js';
import { CourseNameAgent } from '../agents/course-name-agent.js';
import { ChapterWriterAgent } from '../agents/chapter-agent.js';
import { ExerciseCreatorAgent } from '../agents/exercise-agent.js';
import { QuizCreatorAgent } from '../agents/quiz-agent.js';
import { FileStore } from '../utils/file-store.js';

export class CourseOrchestrator {
    private context: PipelineContext;
    private socket: Socket;

    private getFormattedTimestamp(): string {
        const now = new Date();
        return now.getFullYear().toString()
            + String(now.getMonth() + 1).padStart(2, '0')
            + String(now.getDate()).padStart(2, '0')
            + '_'
            + String(now.getHours()).padStart(2, '0')
            + String(now.getMinutes()).padStart(2, '0')
            + String(now.getSeconds()).padStart(2, '0');
    }

    constructor(socket: Socket, courseId?: string) {
        this.socket = socket;
        this.context = {
            courseId: courseId || uuidv4(),
            config: {} as any, // Initialized later
            llm: null as any,  // Initialized later
            modelId: '',
            emit: (event, data) => {
                this.socket.emit(event, data);
            }
        };
    }

    private initLLM(provider: string, modelId: string) {
        // TODO: Get API keys from env or secure storage
        if (provider === 'gemini') {
            this.context.llm = new GeminiClient(process.env.GEMINI_API_KEY || '');
        } else if (provider === 'openrouter') {
            this.context.llm = new OpenRouterClient(process.env.OPENROUTER_API_KEY || '');
        } else if (provider === 'groq') {
            this.context.llm = new GroqClient(process.env.GROQ_API_KEY || '');
        } else if (provider === 'cerebras') {
            this.context.llm = new CerebrasClient(process.env.CEREBRAS_API_KEY || '');
        } else {
            throw new Error(`Unknown provider: ${provider}`);
        }
        this.context.modelId = modelId;
    }

    async startOutlineGeneration(config: any) {
        try {
            this.context.config = config;
            this.initLLM(config.provider, config.modelId);

            console.log(`[Orchestrator] Starting outline generation with provider: ${config.provider}, model: ${config.modelId}`);
            this.socket.emit('progress:update', { step: 'outline', status: 'generating' });

            // Initialize Creation Timestamp for consistent filenames
            (this.context as any).createdAt = this.getFormattedTimestamp();

            const agent = new OutlineCreatorAgent(this.context);
            const result = await agent.run();

            if (result.success && result.data) {
                this.context.outline = result.data;

                // Generate course name
                try {
                    const nameAgent = new CourseNameAgent(this.context);
                    const nameResult = await nameAgent.run();
                    if (nameResult.success && nameResult.data) {
                        this.context.courseName = nameResult.data;
                    }
                } catch (e) {
                    console.warn('Course name generation failed, using topic as fallback');
                    this.context.courseName = config.topic;
                }

                await this.saveState();
                this.socket.emit('outline:ready', {
                    courseId: this.context.courseId,
                    outline: this.context.outline,
                    courseName: this.context.courseName
                });
                this.socket.emit('progress:update', { step: 'outline', status: 'completed' });
            } else {
                throw new Error(result.error || 'Failed to generate outline');
            }
        } catch (error: any) {
            console.error('Orchestrator error:', error);
            this.socket.emit('error', { message: error.message });
        }
    }

    async generateChapter(chapterId: string) {
        try {
            // Ensure context is loaded if continuing
            if (!this.context.outline) {
                const loaded = await FileStore.loadCourse(this.context.courseId);
                if (loaded) {
                    this.context.outline = loaded.outline;
                    this.context.config = loaded.config;
                    this.context.courseName = loaded.courseName; // Restore course name
                    (this.context as any).createdAt = loaded.createdAt; // Restore timestamp
                    this.initLLM(loaded.config.provider, loaded.config.modelId);
                } else {
                    throw new Error('Course context not found');
                }
            }

            this.context.currentChapterId = chapterId;
            const chapter = this.context.outline!.chapters.find(c => c.id === chapterId);
            if (!chapter) throw new Error('Chapter not found');

            this.socket.emit('progress:update', { step: 'chapter', chapterId, status: 'generating' });

            // 1. Write Content
            const writer = new ChapterWriterAgent(this.context);
            const writeResult = await writer.run();
            if (!writeResult.success) throw new Error(writeResult.error);

            // Track which sections failed (non-fatal: content was written successfully)
            const sectionFailures: string[] = [];

            // 2. Create Exercises
            if (this.context.config.exercisesPerChapter > 0) {
                try {
                    const exerciseAgent = new ExerciseCreatorAgent(this.context);
                    const exResult = await exerciseAgent.run();
                    if (!exResult.success) throw new Error(exResult.error || 'Exercise generation failed');
                    const exercises = Array.isArray(exResult.data) ? exResult.data : [];
                    if (exercises.length > 0) {
                        chapter.exercises = exercises;
                        const exerciseMd = this.formatExercisesAsMarkdown(exercises);
                        chapter.content = (chapter.content || '') + exerciseMd;
                    }
                } catch (exError: any) {
                    console.error(`[Orchestrator] Exercise generation failed for chapter ${chapterId}:`, exError);
                    sectionFailures.push('exercises');
                    this.socket.emit('chapter:section-failed', {
                        chapterId,
                        section: 'exercises',
                        message: exError.message
                    });
                }
            }

            // 3. Create Quiz
            if (this.context.config.quizQuestionsPerChapter > 0) {
                try {
                    const quizAgent = new QuizCreatorAgent(this.context);
                    const qzResult = await quizAgent.run();
                    if (!qzResult.success) throw new Error(qzResult.error || 'Quiz generation failed');
                    const quiz = Array.isArray(qzResult.data) ? qzResult.data : [];
                    if (quiz.length > 0) {
                        chapter.quiz = quiz;
                        const quizMd = this.formatQuizAsMarkdown(quiz);
                        chapter.content = (chapter.content || '') + quizMd;
                    }
                } catch (qzError: any) {
                    console.error(`[Orchestrator] Quiz generation failed for chapter ${chapterId}:`, qzError);
                    sectionFailures.push('quiz');
                    this.socket.emit('chapter:section-failed', {
                        chapterId,
                        section: 'quiz',
                        message: qzError.message
                    });
                }
            }

            // Mark chapter completed even with partial section failures — content was written
            chapter.status = 'completed';
            await this.saveState();
            await this.saveMarkdownHistory(); // Incremental save

            this.socket.emit('chapter:completed', { chapter, sectionFailures });
            this.socket.emit('progress:update', { step: 'chapter', chapterId, status: 'completed' });

        } catch (error: any) {
            console.error(`Error generating chapter ${chapterId}:`, error);
            this.socket.emit('error', { message: error.message, chapterId });
        }
    }

    async generateChapterSection(chapterId: string, section: 'exercises' | 'quiz') {
        try {
            // Load context if needed
            if (!this.context.outline) {
                const loaded = await FileStore.loadCourse(this.context.courseId);
                if (loaded) {
                    this.context.outline = loaded.outline;
                    this.context.config = loaded.config;
                    this.context.courseName = loaded.courseName;
                    (this.context as any).createdAt = loaded.createdAt;
                    this.initLLM(loaded.config.provider, loaded.config.modelId);
                } else {
                    throw new Error('Course context not found');
                }
            }

            this.context.currentChapterId = chapterId;
            const chapter = this.context.outline!.chapters.find(c => c.id === chapterId);
            if (!chapter) throw new Error('Chapter not found');

            // NOTE: Do NOT emit progress:update with 'generating' here —
            // that triggers content clearing on the client, which would wipe the chapter text.
            this.socket.emit('agent:thinking', {
                agent: 'Orchestrator',
                message: `Retrying ${section} for chapter "${chapter.title}"...`
            });

            if (section === 'exercises') {
                const exerciseAgent = new ExerciseCreatorAgent(this.context);
                const exResult = await exerciseAgent.run();
                if (!exResult.success) throw new Error(exResult.error || 'Exercise generation failed');
                const exercises = Array.isArray(exResult.data) ? exResult.data : [];
                if (exercises.length > 0) {
                    chapter.exercises = exercises;
                    const exerciseMd = this.formatExercisesAsMarkdown(exercises);
                    chapter.content = (chapter.content || '') + exerciseMd;
                }
            } else if (section === 'quiz') {
                const quizAgent = new QuizCreatorAgent(this.context);
                const qzResult = await quizAgent.run();
                if (!qzResult.success) throw new Error(qzResult.error || 'Quiz generation failed');
                const quiz = Array.isArray(qzResult.data) ? qzResult.data : [];
                if (quiz.length > 0) {
                    chapter.quiz = quiz;
                    const quizMd = this.formatQuizAsMarkdown(quiz);
                    chapter.content = (chapter.content || '') + quizMd;
                }
            }

            await this.saveState();
            await this.saveMarkdownHistory();

            this.socket.emit('chapter:section-completed', { chapterId, section });

        } catch (error: any) {
            console.error(`[Orchestrator] Section retry failed for chapter ${chapterId} section ${section}:`, error);
            this.socket.emit('chapter:section-failed', { chapterId, section, message: error.message });
        }
    }

    // Save current state to disk
    private async saveState() {
        const result = await FileStore.saveCourse(this.context.courseId, {
            config: this.context.config,
            outline: this.context.outline,
            courseName: this.context.courseName,
            createdAt: (this.context as any).createdAt // Persist timestamp
        });

        // Update context ID if it changed (e.g. from UUID to filename)
        if (result && result.id && result.id !== this.context.courseId) {
            console.log(`[Orchestrator] Updating courseId from ${this.context.courseId} to ${result.id}`);
            this.context.courseId = result.id;
        }
    }

    // Save full course as markdown to history
    async saveMarkdownHistory() {
        if (!this.context.outline) return;
        const name = this.context.courseName || this.context.config.topic || 'course';

        // Use the consistent timestamp from context
        const timestamp = (this.context as any).createdAt;
        if (!timestamp) {
            console.warn('[Orchestrator] No createdAt timestamp found in context, generating new one');
        }

        await FileStore.saveMarkdown(name, this.context.outline, timestamp);
    }

    private formatExercisesAsMarkdown(exercises: { question: string; difficulty?: string; solution?: string; why?: string }[]): string {
        let md = '\n\n---\n\n## Exercises\n\n';
        exercises.forEach((ex, i) => {
            // Difficulty stars
            let stars = '*';
            if (ex.difficulty === 'medium') stars = '**';
            else if (ex.difficulty === 'hard') stars = '***';

            md += `### Exercise ${i + 1} ${stars}\n\n${ex.question}\n\n`;
            if (ex.solution) {
                const solutionPrefix = ex.solution.trim().startsWith('```') ? '\n\n' : ' ';
                md += `**Solution:**${solutionPrefix}${ex.solution}\n\n`;
            }
            if (ex.why) {
                const whyPrefix = ex.why.trim().startsWith('```') ? '\n\n' : ' ';
                md += `**Why:**${whyPrefix}${ex.why}\n\n`;
            }
        });
        return md;
    }

    private formatQuizAsMarkdown(quiz: { question: string; options: string[]; correctAnswerIndex: number; explanation?: string }[]): string {
        let md = '\n\n---\n\n## Quiz\n\n';
        quiz.forEach((q, i) => {
            md += `### Question ${i + 1}\n\n${q.question}\n\n`;
            q.options.forEach((opt, j) => {
                const letter = String.fromCharCode(65 + j); // A, B, C, D, E, F
                md += `- **${letter}.** ${opt}\n`;
            });
            const correctLetter = String.fromCharCode(65 + (q.correctAnswerIndex || 0));
            md += `\n**Answer: ${correctLetter}**`;
            if (q.explanation) {
                const explanationPrefix = q.explanation.trim().startsWith('```') ? '\n\n' : ' ';
                md += `\n\n**Explanation:**${explanationPrefix}${q.explanation}`;
            }
            md += `\n\n`;
        });
        return md;
    }
}
