import { PipelineContext, AgentResult } from '../types.js';
import { GenerateOptions } from '../llm/provider.js';
import { withRetry } from '../llm/retry.js';

export abstract class BaseAgent {
    abstract readonly id: string;
    abstract readonly name: string;
    abstract readonly description: string;

    protected context: PipelineContext;

    constructor(context: PipelineContext) {
        this.context = context;
    }

    abstract run(): Promise<AgentResult>;

    protected async generateText(prompt: string, options?: GenerateOptions): Promise<string> {
        const { llm, modelId } = this.context;

        // Log thinking/action
        this.log(`Generating text with model ${modelId}...`);

        return withRetry(() => llm.generate(modelId, prompt, options));
    }

    protected async generateJSON<T>(prompt: string, schema?: any, options?: GenerateOptions): Promise<T> {
        const { llm, modelId } = this.context;

        this.log(`Generating JSON with model ${modelId}...`);

        const genOptions: GenerateOptions = {
            jsonMode: true,
            responseSchema: schema,
            ...options
        };

        const text = await withRetry(() => llm.generate(modelId, prompt, genOptions));

        try {
            // Clean markdown code blocks if present (some models wrap JSON in ```json ... ```)
            const cleanText = text.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(cleanText) as T;
        } catch (e) {
            console.error(`Failed to parse JSON from model ${modelId}:`, text);
            throw new Error(`Failed to parse JSON response: ${e}`);
        }
    }

    protected async *generateStream(prompt: string, options?: GenerateOptions) {
        const { llm, modelId } = this.context;
        this.log(`Streaming text with model ${modelId}...`);

        // Note: withRetry and generators don't mix perfectly unless the whole stream fails immediately.
        // Making the generator itself retriable is complex. For now, simple direct call.
        // If we need retry on stream failure, we'd need to reconstruct the generator.
        try {
            const stream = llm.generateStream(modelId, prompt, options);
            for await (const chunk of stream) {
                yield chunk;
            }
        } catch (error) {
            console.error(`Stream error for model ${modelId}:`, error);
            throw error;
        }
    }

    protected log(message: string, data?: any) {
        console.log(`[${this.name}] ${message}`, data || '');
        if (this.context.emit) {
            this.context.emit('agent:thinking', {
                agent: this.name,
                message,
                data,
                timestamp: new Date().toISOString()
            });
        }
    }
}
