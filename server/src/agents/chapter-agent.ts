import { BaseAgent } from './base-agent.js';
import { PipelineContext, AgentResult, Chapter } from '../types.js';
import { TavilyClient } from '../utils/tavily-client.js';

export class ChapterWriterAgent extends BaseAgent {
    readonly id = 'chapter-writer';
    readonly name = 'Chapter Writer';
    readonly description = 'Generates content for a single chapter.';

    constructor(context: PipelineContext) {
        super(context);
    }

    async run(): Promise<AgentResult> {
        const { config, currentChapterId, outline } = this.context;

        if (!currentChapterId || !outline) {
            return { success: false, error: 'Missing chapter ID or outline in context' };
        }

        const chapter = outline.chapters.find(c => c.id === currentChapterId);
        if (!chapter) {
            return { success: false, error: `Chapter ${currentChapterId} not found` };
        }

        this.log(`Writing chapter: ${chapter.title}`);

        // Update status
        chapter.status = 'generating';
        // TODO: Emit status update

        const fullOutline = outline.chapters.map(c => `- ${c.title}: ${c.description}`).join('\n');

        // Get previous chapter content for continuity (Headers only to save tokens)
        const prevChapter = outline.chapters.find(c => c.order === chapter.order - 1);
        let previousContext = '';
        if (prevChapter && prevChapter.content) {
            // Extract only headers (H1-H6)
            const headers = prevChapter.content.match(/^#{1,6}\s+.+/gm) || [];
            if (headers.length > 0) {
                previousContext = `
PREVIOUS CHAPTER STRUCTURE (Chapter ${prevChapter.order}: "${prevChapter.title}"):
The following topics were covered in the previous chapter:
${headers.join('\n')}
`;
            }
        }

        // Subtopics
        let subtopicsContext = '';
        if (chapter.subtopics && chapter.subtopics.length > 0) {
            subtopicsContext = `
CHAPTER STRUCTURE:
The chapter MUST cover the following key topics in order:
${chapter.subtopics.map(s => `- ${s}`).join('\n')}
`;
        }

        // Research Context (Search Grounding)
        let researchContext = '';
        if (config.enableSearch) {
            // 1. Gemini Native Grounding (handled in generateStream via options)
            // 2. Tavily Fallback (if not Gemini or if preferred? For now, if Tavily key exists and not Gemini)

            const isGemini = this.context.modelId.toLowerCase().includes('gemini');

            if (!isGemini && config.tavilyApiKey) {
                this.log(`Performing Tavily search for chapter: ${chapter.title}`);
                const tavily = new TavilyClient(config.tavilyApiKey);
                const query = `detailed information about "${chapter.title}" in the context of a course on "${config.topic}"`;
                researchContext = await tavily.search(query, 3);
            }
        }

        const prompt = `
You are writing a comprehensive course on "${outline.title}".
Your task is to write the FULL content for CHAPTER ${chapter.order}: "${chapter.title}".

CONTEXT:
Topic: ${config.topic}
Audience: ${config.audience || 'General Audience'}
Language: ${config.language}
Writing Style: ${config.writingStyle}
Target Word Count: ${config.wordsPerChapter}
Description: ${chapter.description}

Full Course Outline:
${fullOutline}
${previousContext}
${subtopicsContext}
${researchContext}

INSTRUCTIONS:
- Write in ${config.language}.
- Use Markdown formatting (headings, lists, bold, etc.).
- Be educational, engaging, and thorough.
- **CRITICAL: Do NOT hallucinate!** If you are not sure about something, do NOT include it in the response, even if it means you cannot- Do NOT include the chapter title as the first line (the system adds it automatically).
- The content MUST start with a Level 2 Heading (##) for the first section.
- Do NOT use Level 1 Headings (#) anywhere.
- Focus ONLY on the content for this specific chapter.
- ensure that the content builds upon the previous chapter(s) and avoids unnecessary repetition.
- Refer to concepts learned in the previous chapter if applicable.
- **CRITICAL: Code Formatting Rules:**
  - If you include any code snippets (HTML, CSS, JS, Python, etc.), you MUST wrap them in markdown code blocks (e.g. \`\`\`javascript ... \`\`\`).
  - If you mention an HTML tag inline (e.g. <script>, <div>, <span>, <a>, etc.), you MUST wrap it in backticks (e.g. \` <script> \`, \` <div> \`, \` <span> \`, \` <a> \`).
  - **ALWAYS** ensure there is a blank line (newline) before starting a code block.
  - **NEVER** place a code block on the same line as text (e.g. INVALID: \`text\`\`\`javascript\`, VALID: \`text\\n\\n\`\`\`javascript\`).
  - **NEVER** output raw HTML tags that are not wrapped in code blocks or backticks, as they will be rendered effectively invisible by the browser.
${config.enableSearch ? `- **CRITICAL**: You have been provided with search results. Use them to verify facts and enrich the content.
- Please append a **"Reference"** or **"Sources"** section at the very end of the chapter if you used any information from the search results.
- Format citations as bullet points: \`- [Title](URL)\`.` : ''}
${config.mermaidDiagrams ? `- Use colorful Mermaid diagrams/charts (wrapped in \`\`\`mermaid code blocks) to visualize processes, workflows, state machines, or complex relationships where appropriate.
- CRITICAL: When writing Mermaid code, ALWAYS wrap node labels in double quotes (e.g. \`id["Label (with text)"]\`) to prevent syntax errors with special characters.` : '- Do NOT use Mermaid diagrams.'}

STYLE GUIDELINES:
- **Humanize the text**: Write in a natural, engaging, and conversational tone. Avoid robotic or overly formal language. Use varied sentence structures and active voice where possible.
- **NO En-dashes**: NEVER use the En-dash character (–). Use a standard hyphen (-) or a colon (:) instead.
- Do NOT use HTML <details> and <summary> tags. Use standard Markdown headings or blockquotes for "Deep Dive" sections.
- Use **Markdown Tables** to compare concepts or list features.
- Use **Blockquotes** (>) for important facts, tips, or warnings.
- Structure the content with clear headings (Start with H2, then H3).
- Do NOT use the section titles "Exercises" or "Quiz" (these are handled by separate agents). Instead, use "Examples", "Case Studies", or "Practical Demonstrations".
- NEVER skip heading levels (e.g., do not jump from H2 to H4).
- Avoid long walls of text; use bullet points and lists.
`;


        try {
            let content = '';

            // Stream the content
            const stream = this.generateStream(prompt, {
                searchGrounding: config.enableSearch, // This triggers native Gemini grounding if model supports it
                maxTokens: 8192
            });

            for await (const chunk of stream) {
                content += chunk.text;

                // Emit streaming event
                if (this.context.emit) {
                    this.context.emit('stream:chunk', {
                        chapterId: chapter.id,
                        chunk: chunk.text,
                        fullContent: content // Optional: send full content or just chunk
                    });
                }
            }

            // Remove potential title repetition at start
            // Matches lines like "# 1. Title" or "## Title" at the very beginning
            // Safety check: Remove H1 if the model included it despite instructions
            // Only removes lines starting with # (but not ##) at the very beginning
            content = content.replace(/^#\s+.*(\r?\n|\r)\s*/, '');

            chapter.content = content;
            chapter.status = 'completed';

            this.log(`Chapter ${chapter.order} completed. Length: ${content.length} chars.`);

            return { success: true, data: chapter };

        } catch (error: any) {
            chapter.status = 'failed';
            this.log(`Failed to write chapter: ${error.message} `);
            return { success: false, error: error.message };
        }
    }
}
