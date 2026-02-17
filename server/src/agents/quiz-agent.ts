import { BaseAgent } from './base-agent.js';
import { PipelineContext, AgentResult, QuizQuestion as BaseQuizQuestion } from '../types.js';

interface QuizLabels {
    item?: string; // "Question"
    answer?: string; // "Answer"
    explanation?: string; // "Explanation"
}

interface QuizQuestion extends BaseQuizQuestion {
    sectionTitle?: string;
    labels?: QuizLabels;
}
import { Schema } from '@google/genai';

export class QuizCreatorAgent extends BaseAgent {
    readonly id = 'quiz-creator';
    readonly name = 'Quiz Creator';
    readonly description = 'Generates quiz questions for a chapter.';

    constructor(context: PipelineContext) {
        super(context);
    }

    async run(): Promise<AgentResult> {
        const { config, currentChapterId, outline } = this.context;

        if (!currentChapterId || !outline) {
            return { success: false, error: 'Missing chapter ID or outline' };
        }

        const chapter = outline.chapters.find(c => c.id === currentChapterId);
        if (!chapter || !chapter.content) {
            return { success: false, error: 'Chapter content missing' };
        }

        if (config.quizQuestionsPerChapter <= 0) {
            return { success: true, data: [] };
        }

        this.log(`Generating ${config.quizQuestionsPerChapter} quiz questions for: ${chapter.title}`);

        const prompt = `
Create ${config.quizQuestionsPerChapter} multiple-choice quiz questions based on the following chapter content.
In the FIRST question object, include a "sectionTitle" field with the translation of "Quiz" in ${config.language} (e.g. "Quiz", "Cuestionario", etc.).
ALSO in the FIRST object, include a "labels" object with translations for "Question", "Answer", and "Explanation" in ${config.language}.

${config.specialNeeds ? `SPECIAL REQUIREMENTS / ADAPTATIONS:\n${config.specialNeeds}\n` : ''}

IMPORTANT RULES:
- ALL text MUST be written in ${config.language}.
- **Humanize the text**: Write in a natural, engaging, and conversational tone.
- **NO En-dashes**: NEVER use the En-dash character (–). Use a standard hyphen (-) or a colon (:) instead.
- Each question MUST have exactly 6 answer options (A through F).
- Only ONE option should be the correct answer.
- The correctAnswerIndex is the zero-based index of the correct option (0=A, 1=B, 2=C, 3=D, 4=E, 5=F).
- Each question MUST include a detailed explanation of why the correct answer is right and why the other options are wrong.
- **CRITICAL: Code Formatting Rules:**
  - If you include any code snippets (HTML, CSS, JS, Python, etc.), you MUST wrap them in markdown code blocks (e.g. \`\`\`javascript ... \`\`\`).
  - If you mention an HTML tag inline (e.g. <script>, <div>, <span>, <a>etc.), you MUST wrap it in backticks (e.g. \` <script> \`, \` <div> \`, \` <span> \`, \` <a> \`).
  - **ALWAYS** ensure there is a blank line (newline) before starting a code block.
  - **NEVER** place a code block on the same line as text (e.g. INVALID: \`text\`\`\`javascript\`, VALID: \`text\\n\\n\`\`\`javascript\`).
  - **NEVER** output raw HTML tags that are not wrapped in code blocks or backticks, as they will be rendered effectively invisible by the browser.
- Options should NOT include the letter prefix (A, B, etc.), just the answer text.
- Output MUST be valid JSON matching the schema.

CHAPTER CONTENT:
${chapter.content.substring(0, 10000)}
`;

        const schema: Schema = {
            type: 'ARRAY' as any,
            items: {
                type: 'OBJECT' as any,
                properties: {
                    sectionTitle: { type: 'STRING' as any, description: "The translated title for 'Quiz' in the target language. Only needed for the first item." },
                    labels: {
                        type: 'OBJECT' as any,
                        description: "Translated labels for UI elements. Only needed for the first item.",
                        properties: {
                            item: { type: 'STRING' as any, description: "Translation of 'Question' (e.g. 'Vraag')" },
                            answer: { type: 'STRING' as any, description: "Translation of 'Answer' (e.g. 'Antwoord')" },
                            explanation: { type: 'STRING' as any, description: "Translation of 'Explanation' (e.g. 'Uitleg')" }
                        }
                    },
                    question: { type: 'STRING' as any, description: "The question text" },
                    options: {
                        type: 'ARRAY' as any,
                        items: { type: 'STRING' as any },
                        description: "Exactly 6 possible answers (A through F)"
                    },
                    correctAnswerIndex: { type: 'INTEGER' as any, description: "Zero-based index of the correct option (0-5)" },
                    explanation: { type: 'STRING' as any, description: "Detailed explanation of why the answer is correct and why other options are wrong" },
                },
                required: ["question", "options", "correctAnswerIndex", "explanation"],
            },
        };

        try {
            const quiz: QuizQuestion[] = [];
            let currentLabels: QuizLabels = { item: 'Question', answer: 'Answer', explanation: 'Explanation' };
            let buffer = '';
            let arrayStarted = false;
            let depth = 0;
            let objectStartIndex = -1;
            let mdHeaderEmitted = false;

            const stream = this.generateStream(prompt, { responseSchema: schema, jsonMode: true, maxTokens: 8192 });

            for await (const chunk of stream) {
                const text = chunk.text;

                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    buffer += char;

                    if (char === '[') {
                        if (!arrayStarted) arrayStarted = true;
                    }

                    if (char === '{') {
                        if (depth === 0) objectStartIndex = buffer.length - 1;
                        depth++;
                    } else if (char === '}') {
                        depth--;
                        if (depth === 0 && objectStartIndex !== -1) {
                            const rawJson = buffer.substring(objectStartIndex);

                            try {
                                const q = JSON.parse(rawJson) as QuizQuestion;
                                if (q.question && q.options && Array.isArray(q.options)) {
                                    // Validation / Padding
                                    if (!q.options) q.options = [];

                                    // Clean options (remove "A. ", "A) ", "1. ", etc.)
                                    q.options = q.options.map(opt => opt.replace(/^[A-F0-9][.)]\s*/i, '').trim());

                                    while (q.options.length < 6) {
                                        q.options.push(`Option ${String.fromCharCode(65 + q.options.length)}`);
                                    }
                                    q.options = q.options.slice(0, 6);
                                    if (q.correctAnswerIndex < 0 || q.correctAnswerIndex >= q.options.length) {
                                        q.correctAnswerIndex = 0;
                                    }
                                    if (!q.explanation) q.explanation = '';

                                    quiz.push(q);

                                    if (q.labels) {
                                        currentLabels = { ...currentLabels, ...q.labels };
                                    }

                                    // Emit Markdown
                                    if (!mdHeaderEmitted) {
                                        const title = q.sectionTitle || 'Quiz';
                                        this.context.emit?.('stream:chunk', {
                                            chapterId: chapter.id,
                                            chunk: `\n\n---\n\n## ${title}\n\n`
                                        });
                                        mdHeaderEmitted = true;
                                    }

                                    const md = this.formatQuizQuestionAsMarkdown(q, quiz.length, currentLabels);
                                    this.context.emit?.('stream:chunk', {
                                        chapterId: chapter.id,
                                        chunk: md
                                    });

                                    buffer = '';
                                    objectStartIndex = -1;
                                }
                            } catch (e) {
                                this.log('Failed to parse raw JSON chunk from stream', e);
                            }
                        }
                    }
                }
            }

            // Fallback parsing
            if (quiz.length === 0 && buffer.length > 0) {
                try {
                    const cleanText = buffer.replace(/```json\n?|\n?```/g, '').trim();
                    const parsed = JSON.parse(cleanText);
                    let finalQuiz: QuizQuestion[] = [];

                    if (Array.isArray(parsed)) finalQuiz = parsed;
                    else if (parsed.quiz && Array.isArray(parsed.quiz)) finalQuiz = parsed.quiz;
                    else if (parsed.questions && Array.isArray(parsed.questions)) finalQuiz = parsed.questions;

                    if (finalQuiz.length > 0) {
                        if (finalQuiz[0]?.labels) {
                            currentLabels = { ...currentLabels, ...finalQuiz[0].labels };
                        }
                        if (!mdHeaderEmitted) {
                            const title = finalQuiz[0]?.sectionTitle || 'Quiz';
                            this.context.emit?.('stream:chunk', { chapterId: chapter.id, chunk: `\n\n---\n\n## ${title}\n\n` });
                        }
                        for (let i = 0; i < finalQuiz.length; i++) {
                            const q = finalQuiz[i];
                            // Validation / Padding
                            if (!q.options) q.options = [];
                            while (q.options.length < 6) q.options.push(`Option ${String.fromCharCode(65 + q.options.length)}`);
                            q.options = q.options.slice(0, 6);
                            if (q.correctAnswerIndex < 0 || q.correctAnswerIndex >= q.options.length) q.correctAnswerIndex = 0;
                            if (!q.explanation) q.explanation = '';

                            quiz.push(q);
                            const md = this.formatQuizQuestionAsMarkdown(q, i + 1, currentLabels);
                            this.context.emit?.('stream:chunk', { chapterId: chapter.id, chunk: md });
                        }
                    }
                } catch (e) {
                    this.log('Failed to parse fallback buffer', e);
                }
            }

            chapter.quiz = quiz;
            this.log(`Generated ${quiz.length} quiz questions.`);
            return { success: true, data: quiz };
        } catch (error: any) {
            this.log(`Failed to generate quiz: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    private formatQuizQuestionAsMarkdown(q: QuizQuestion, index: number, labels: QuizLabels): string {
        let md = `### ${labels.item || 'Question'} ${index}\n\n${q.question}\n\n`;
        q.options.forEach((opt, j) => {
            const letter = String.fromCharCode(65 + j); // A, B, C, D, E, F
            md += `- **${letter}.** ${opt}\n`;
        });
        const correctLetter = String.fromCharCode(65 + (q.correctAnswerIndex || 0));
        md += `\n**${labels.answer || 'Answer'}: ${correctLetter}**`;
        if (q.explanation) {
            // Check if explanation starts with a code block
            const explanationPrefix = q.explanation.trim().startsWith('```') ? '\n\n' : ' ';
            md += `\n\n**${labels.explanation || 'Explanation'}:**${explanationPrefix}${q.explanation}`;
        }
        md += `\n\n`;
        return md;
    }
}
