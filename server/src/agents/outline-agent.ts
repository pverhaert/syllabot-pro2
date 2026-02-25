import { BaseAgent } from '../agents/base-agent.js';
import { PipelineContext, AgentResult, CourseOutline } from '../types.js';
import { Schema } from '@google/genai';
import { TavilyClient } from '../utils/tavily-client.js';

export class OutlineCreatorAgent extends BaseAgent {
    readonly id = 'outline-creator';
    readonly name = 'Outline Creator';
    readonly description = 'Generates a structured course outline based on user configuration.';

    constructor(context: PipelineContext) {
        super(context);
    }

    async run(): Promise<AgentResult> {
        const { config } = this.context;

        this.log(`Creating outline for topic: "${config.topic}" in ${config.language}`);

        // Research Context (Search Grounding)
        let researchContext = '';
        if (config.enableSearch) {
            const isGemini = this.context.modelId.toLowerCase().includes('gemini');

            if (!isGemini && config.tavilyApiKey) {
                this.log(`Performing Tavily search for outline topic: ${config.topic}`);
                const tavily = new TavilyClient(config.tavilyApiKey);
                // Broad search for outline structure
                const query = `comprehensive course curriculum for "${config.topic}" for ${config.audience || 'general'} level`;
                researchContext = await tavily.search(query, 5);
            }
        }

        const prompt = `
Create a comprehensive course outline for the following topic:
TOPIC: ${config.topic}
LANGUAGE: ${config.language} (The content MUST be in this language, but JSON keys MUST be in English)
AUDIENCE: ${config.audience || 'General Audience'}
WRITING STYLE: ${config.writingStyle}
MINIMUM CHAPTERS: ${config.minChapters}

${config.generatedTopics ? `REQUIRED TOPICS/CHAPTERS TO INCLUDE:\n${config.generatedTopics}\n` : ''}
${config.generatedTopics ? `REQUIRED TOPICS/CHAPTERS TO INCLUDE:\n${config.generatedTopics}\n` : ''}
${config.specialNeeds ? `SPECIAL REQUIREMENTS:\n${config.specialNeeds}\n` : ''}

${researchContext}

The course should be structured logically from beginner to advanced concepts.
For each chapter, provide a title, a brief description, and a list of 3-7 subtopics/sections to be covered.

IMPORTANT GUIDELINES:
- **Humanize the text**: Use a natural and engaging tone. Avoid overly robotic or formal academic language.
- **NO En-dashes**: NEVER use the En-dash character (–). Use a standard hyphen (-) or a colon (:) instead.
- The output MUST be valid JSON matching the schema.
IMPORTANT: Do NOT translate the JSON keys (like "chapters", "title", "description", "subtopics"). Keep them in English. Only translate the values.
`;

        // Schema for Gemini structured output
        const schema: Schema = {
            type: 'OBJECT' as any,
            properties: {
                title: { type: 'STRING' as any, description: "The title of the entire course" },
                description: { type: 'STRING' as any, description: "A brief summary of what the course covers" },
                chapters: {
                    type: 'ARRAY' as any,
                    items: {
                        type: 'OBJECT' as any,
                        properties: {
                            title: { type: 'STRING' as any, description: "Title of the chapter" },
                            description: { type: 'STRING' as any, description: "Brief description of the chapter content" },
                            subtopics: {
                                type: 'ARRAY' as any,
                                items: { type: 'STRING' as any },
                                description: "List of subtopics or sections in this chapter"
                            },
                        },
                        required: ["title", "description", "subtopics"],
                    },
                },
            },
            required: ["title", "description", "chapters"],
        };

        try {
            const outlineData = await this.generateJSON<any>(prompt, schema, { maxTokens: 8192 });

            this.log(`Raw outline data keys: ${JSON.stringify(Object.keys(outlineData))}`);

            // Robust extraction — handles localized keys if model ignores instructions
            const normalizeChapter = (ch: any): { title: string; description: string; subtopics: string[] } | null => {
                if (!ch || typeof ch !== 'object') return null;
                // Try English keys first, then localized variants
                const title = ch.title || ch.titel || ch.name || ch.naam || ch.hoofdstuk || ch.chapter || '';
                const desc = ch.description || ch.desc || ch.summary || ch.samenvatting || ch.inhoud || ch.content || ch.omschrijving || '';

                // Extract subtopics
                let subtopics: string[] = [];
                const possibleKeys = ['subtopics', 'topics', 'sections', 'points', 'onderwerpen', 'subtitel', 'inhoudsopgave'];
                for (const key of possibleKeys) {
                    if (Array.isArray(ch[key])) {
                        subtopics = ch[key].map(String);
                        break;
                    }
                }

                if (!title) return null;
                return {
                    title: String(title),
                    description: String(desc || title), // Fallback description to title if missing
                    subtopics: subtopics
                };
            };

            const extractChapters = (data: any): any[] | null => {
                // Helper: Direct check
                const getDirect = (obj: any): any[] | null => {
                    if (!obj || typeof obj !== 'object') return null;
                    const candidates = ['chapters', 'content', 'modules', 'hoofdstukken', 'sections', 'parts'];
                    for (const key of candidates) {
                        if (Array.isArray(obj[key])) return obj[key];
                    }
                    return null;
                };

                // 1. Check top level
                const top = getDirect(data);
                if (top) return top;

                // 2. Scan properties
                for (const key of Object.keys(data)) {
                    const val = data[key];

                    // If value is array, check if it contains chapters
                    if (Array.isArray(val) && val.length > 0) {
                        if (typeof val[0] === 'object' && normalizeChapter(val[0])) {
                            return val;
                        }
                    }

                    // If value is object, check inside it (e.g. data.course.chapters)
                    if (val && typeof val === 'object' && !Array.isArray(val)) {
                        const nested = getDirect(val);
                        if (nested) return nested;
                    }
                }

                // 3. If data itself is array
                if (Array.isArray(data) && data.length > 0) {
                    if (typeof data[0] === 'object' && normalizeChapter(data[0])) {
                        return data;
                    }
                }

                return null;
            };

            const extractedRawChapters = extractChapters(outlineData);
            if (!extractedRawChapters || extractedRawChapters.length === 0) {
                this.log(`Could not extract chapters from response: ${JSON.stringify(outlineData).substring(0, 500)}`);
                throw new Error('No chapters found in LLM response');
            }

            // Normalize chapters
            const normalizedChapters = extractedRawChapters
                .map(normalizeChapter)
                .filter(ch => ch !== null) as { title: string; description: string; subtopics: string[] }[];

            if (normalizedChapters.length === 0) {
                throw new Error('Failed to normalize chapters from response');
            }

            const outline: CourseOutline = {
                title: outlineData.title || outlineData.cursus_titel || outlineData.name || config.topic,
                description: outlineData.description || outlineData.samenvatting || `A course about ${config.topic}`,
                chapters: normalizedChapters.map((ch, index) => ({
                    id: `ch-${index + 1}`,
                    title: ch.title,
                    description: ch.description,
                    subtopics: ch.subtopics,
                    status: 'pending',
                    order: index + 1,
                    content: '',
                })),
            };

            this.log(`Outline created with ${outline.chapters.length} chapters.`);
            return { success: true, data: outline };

        } catch (error: any) {
            this.log(`Failed to generate outline: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}
