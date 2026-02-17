import { BaseAgent } from './base-agent.js';
import { PipelineContext, AgentResult, Exercise as BaseExercise } from '../types.js';

interface ExerciseLabels {
    item?: string; // "Exercise"
    solution?: string; // "Solution"
    why?: string; // "Why"
}

interface Exercise extends BaseExercise {
    sectionTitle?: string;
    labels?: ExerciseLabels;
}
import { Schema } from '@google/genai';

export class ExerciseCreatorAgent extends BaseAgent {
    readonly id = 'exercise-creator';
    readonly name = 'Exercise Creator';
    readonly description = 'Generates exercises for a chapter.';

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

        if (config.exercisesPerChapter <= 0) {
            return { success: true, data: [] };
        }

        this.log(`Generating ${config.exercisesPerChapter} exercises for: ${chapter.title}`);

        const schema: Schema = {
            type: 'ARRAY' as any,
            items: {
                type: 'OBJECT' as any,
                properties: {
                    sectionTitle: { type: 'STRING' as any, description: "The translated title for 'Exercises' in the target language (e.g. 'Oefeningen' in Dutch). Only needed for the first item." },
                    labels: {
                        type: 'OBJECT' as any,
                        description: "Translated labels for UI elements. Only needed for the first item.",
                        properties: {
                            item: { type: 'STRING' as any, description: "Translation of 'Exercise' (e.g. 'Oefening')" },
                            solution: { type: 'STRING' as any, description: "Translation of 'Solution' (e.g. 'Oplossing')" },
                            why: { type: 'STRING' as any, description: "Translation of 'Why' (e.g. 'Waarom')" }
                        }
                    },
                    question: { type: 'STRING' as any, description: "The practical task or challenge description (NOT a multiple choice question)" },
                    difficulty: { type: 'STRING' as any, description: "Difficulty level: easy, medium, or hard" },
                    solution: { type: 'STRING' as any, description: "Detailed, step-by-step solution guide" },
                    why: { type: 'STRING' as any, description: "Why this exercise matters" },
                },
                required: ["question", "difficulty", "solution", "why"],
            },
        };

        // Explicitly stringify schema for providers that don't support it natively
        const schemaString = JSON.stringify(schema, null, 2);

        const prompt = `
Create ${config.exercisesPerChapter} practical exercises based on the following chapter content.
The exercises should reinforce the concepts learned.
In the FIRST exercise object, include a "sectionTitle" field with the translation of "Exercises" in ${config.language} (e.g. "Oefeningen", "Ejercicios", etc.).
ALSO in the FIRST object, include a "labels" object with translations for "Exercise", "Solution", and "Why" in ${config.language}.

${config.specialNeeds ? `SPECIAL REQUIREMENTS / ADAPTATIONS:\n${config.specialNeeds}\n` : ''}

IMPORTANT RULES:
- ALL text MUST be written in ${config.language}.
- **Humanize the text**: Write in a natural, engaging, and conversational tone.
- **NO En-dashes**: NEVER use the En-dash character (–). Use a standard hyphen (-) or a colon (:) instead.
- Do NOT create multiple-choice questions. Create open-ended practical tasks, coding challenges, or thought experiments.
- Each exercise MUST include a difficulty level: "easy", "medium", or "hard".
- Each exercise MUST include a detailed solution with step-by-step explanation.
- **CRITICAL: Code Formatting Rules:**
  - If you include any code snippets (HTML, CSS, JS, Python, etc.), you MUST wrap them in markdown code blocks (e.g. \`\`\`javascript ... \`\`\`).
  - If you mention an HTML tag inline (e.g. <script>, <div>, <span>, <a>, etc.), you MUST wrap it in backticks (e.g. \` <script> \`, \` <div> \`, \` <span> \`, \` <a> \`).
  - **ALWAYS** ensure there is a blank line (newline) before starting a code block.
  - **NEVER** place a code block on the same line as text (e.g. INVALID: \`text\`\`\`javascript\`, VALID: \`text\\n\\n\`\`\`javascript\`).
  - **NEVER** output raw HTML tags that are not wrapped in code blocks or backticks, as they will be rendered effectively invisible by the browser.
${config.mermaidDiagrams ? `- You may use colorful Mermaid diagrams/charts (wrapped in \`\`\`mermaid code blocks) in the 'solution' if a visual explanation is specifically helpful for the exercise.
- CRITICAL: When writing Mermaid code, ALWAYS wrap node labels in double quotes (e.g. \`id["Label"]\`) to prevent syntax errors with special characters.` : '- Do NOT use Mermaid diagrams.'}
- Each exercise MUST include a "why" field explaining why this exercise is important and what concept it reinforces.
- Mix difficulties: roughly 30% easy, 40% medium, 30% hard.
- Output MUST be valid JSON matching the schema below.

JSON SCHEMA:
${schemaString}

CHAPTER CONTENT:
${chapter.content.substring(0, 10000)}
`;

        try {
            const exercises: Exercise[] = [];
            let currentLabels: ExerciseLabels = { item: 'Exercise', solution: 'Solution', why: 'Why' };
            let buffer = '';
            let arrayStarted = false;
            let depth = 0;
            let objectStartIndex = -1;

            // Header for Markdown
            let mdHeaderEmitted = false;

            const stream = this.generateStream(prompt, { maxTokens: 8192 });

            for await (const chunk of stream) {
                // Remove markdown code blocks if they appear in the stream chunk by chunk (tricky)
                // Instead, we just accumulate buffer and clean it when parsing
                const text = chunk.text;

                // Simple state machine to find objects in [ { ... }, { ... } ]
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
                            // Helper to clean potential leading comma or whitespace
                            // Actually, if we extract substring from objectStartIndex to end, it should be valid JSON
                            const rawJson = buffer.substring(objectStartIndex);

                            try {
                                const exercise = JSON.parse(rawJson) as Exercise;
                                if (exercise.question && exercise.solution) {
                                    exercises.push(exercise);

                                    if (exercise.labels) {
                                        currentLabels = { ...currentLabels, ...exercise.labels };
                                    }

                                    // Format to Markdown and Emit
                                    if (!mdHeaderEmitted) {
                                        const title = exercise.sectionTitle || 'Exercises';
                                        this.context.emit?.('stream:chunk', {
                                            chapterId: chapter.id,
                                            chunk: `\n\n---\n\n## ${title}\n\n`
                                        });
                                        mdHeaderEmitted = true;
                                    }

                                    const md = this.formatExerciseAsMarkdown(exercise, exercises.length, currentLabels);
                                    this.context.emit?.('stream:chunk', {
                                        chapterId: chapter.id,
                                        chunk: md
                                    });

                                    // Reset buffer to keep it small, but be careful not to break the array context
                                    buffer = '';
                                    objectStartIndex = -1;
                                }
                            } catch (e) {
                                this.log('Failed to parse streamed object', e);
                            }
                        }
                    }
                }
            }

            // Fallback: If streaming failed to parse anything (e.g. model outputted one huge blob),
            // try to parse the whole buffer at the end if exercises is empty
            if (exercises.length === 0 && buffer.length > 0) {
                try {
                    // Clean markdown code blocks
                    const cleanText = buffer.replace(/```json\n?|\n?```/g, '').trim();
                    const parsed = JSON.parse(cleanText);
                    let finalExercises: Exercise[] = [];

                    if (Array.isArray(parsed)) finalExercises = parsed;
                    else if (parsed.exercises && Array.isArray(parsed.exercises)) finalExercises = parsed.exercises;

                    if (finalExercises.length > 0) {
                        if (finalExercises[0]?.labels) {
                            currentLabels = { ...currentLabels, ...finalExercises[0].labels };
                        }
                        if (!mdHeaderEmitted) {
                            const title = finalExercises[0]?.sectionTitle || 'Exercises';
                            this.context.emit?.('stream:chunk', { chapterId: chapter.id, chunk: `\n\n---\n\n## ${title}\n\n` });
                        }
                        for (let i = 0; i < finalExercises.length; i++) {
                            const ex = finalExercises[i];
                            exercises.push(ex);
                            const md = this.formatExerciseAsMarkdown(ex, i + 1, currentLabels);
                            this.context.emit?.('stream:chunk', { chapterId: chapter.id, chunk: md });
                        }
                    }
                } catch (e) {
                    this.log('Failed to parse fallback buffer', e);
                }
            }

            chapter.exercises = exercises;
            this.log(`Generated ${exercises.length} exercises.`);
            return { success: true, data: exercises };

        } catch (error: any) {
            this.log(`Failed to generate exercises: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    private formatExerciseAsMarkdown(ex: Exercise, index: number, labels: ExerciseLabels): string {
        // Difficulty stars
        let stars = '*';
        if (ex.difficulty === 'medium') stars = '**';
        else if (ex.difficulty === 'hard') stars = '***';

        let md = `### ${labels.item || 'Exercise'} ${index} ${stars}\n\n${ex.question}\n\n`;
        if (ex.solution) {
            // Check if solution starts with a code block
            const solutionPrefix = ex.solution.trim().startsWith('```') ? '\n\n' : ' ';
            md += `**${labels.solution || 'Solution'}:**${solutionPrefix}${ex.solution}\n\n`;
        }
        if (ex.why) {
            // Check if why starts with a code block
            const whyPrefix = ex.why.trim().startsWith('```') ? '\n\n' : ' ';
            md += `**${labels.why || 'Why'}:**${whyPrefix}${ex.why}\n\n`;
        }
        return md;
    }
}
