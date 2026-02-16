import { BaseAgent } from './base-agent.js';
import { PipelineContext, AgentResult } from '../types.js';

export class CourseNameAgent extends BaseAgent {
    readonly id = 'course-namer';
    readonly name = 'Course Namer';
    readonly description = 'Generates a short, descriptive name for the course.';

    constructor(context: PipelineContext) {
        super(context);
    }

    async run(): Promise<AgentResult> {
        const { config } = this.context;

        this.log(`Generating course name for topic: "${config.topic}"`);

        const prompt = `
You are naming a course. Generate a SHORT, descriptive course name (3-6 words maximum).

TOPIC: ${config.topic}
AUDIENCE: ${config.audience || 'General Audience'}
LANGUAGE: ${config.language}

Rules:
- The name MUST be in ${config.language}.
- Keep it concise: 3 to 6 words.
- Make it descriptive and professional.
- Do NOT include quotes, colons, or special characters.
- Do NOT include generic words like "Course" or "Tutorial".
- Output ONLY the name, nothing else.

Examples of good names:
- "JavaScript for Beginners"
- "Advanced Machine Learning Concepts"
- "Introduction to Web Development"
`;

        try {
            const name = await this.generateText(prompt, { temperature: 0.3 });
            // Clean up: remove quotes, trim, limit length
            const cleanName = name
                .replace(/["""'']/g, '')
                .replace(/[\n\r]/g, '')
                .trim()
                .substring(0, 80);

            if (!cleanName) {
                throw new Error('Empty name returned');
            }

            this.log(`Course name: "${cleanName}"`);
            return { success: true, data: cleanName };
        } catch (error: any) {
            // Fallback to sanitized topic
            const fallback = config.topic.substring(0, 60);
            this.log(`Failed to generate name, falling back to: "${fallback}"`);
            return { success: true, data: fallback };
        }
    }
}
