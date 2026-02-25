import { Schema } from '@google/genai';

export interface GenerateOptions {
    systemInstruction?: string;
    temperature?: number;
    responseSchema?: Schema; // Using Gemini's schema type for compatibility, or we can define a generic one
    jsonMode?: boolean; // If true but no schema, force JSON output
    searchGrounding?: boolean; // Enable Google search grounding (Gemini only)
    maxTokens?: number; // Maximum number of tokens to generate
}

export interface StreamChunk {
    text: string;
}

export interface LLMProvider {
    /**
     * unique identifier for the provider (e.g. "gemini", "openrouter")
     */
    readonly id: string;

    /**
     * Generate text response (non-streaming)
     */
    generate(
        modelId: string,
        prompt: string,
        options?: GenerateOptions
    ): Promise<string>;

    /**
     * Generate text response (streaming)
     */
    generateStream(
        modelId: string,
        prompt: string,
        options?: GenerateOptions
    ): AsyncGenerator<StreamChunk, void, unknown>;
}
