import { GoogleGenAI, Schema, Part } from '@google/genai';
import { LLMProvider, GenerateOptions, StreamChunk } from './provider.js';

export class GeminiClient implements LLMProvider {
    readonly id = 'gemini';
    private client: GoogleGenAI;

    constructor(apiKey: string) {
        if (!apiKey) {
            throw new Error('Gemini API key is required');
        }
        this.client = new GoogleGenAI({ apiKey });
    }

    async generate(
        modelId: string,
        prompt: string,
        options?: GenerateOptions
    ): Promise<string> {
        try {
            const config: any = {
                model: modelId,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    systemInstruction: options?.systemInstruction,
                    temperature: options?.temperature,
                    responseMimeType: options?.responseSchema || options?.jsonMode ? 'application/json' : undefined,
                    responseSchema: options?.responseSchema,
                },
                tools: options?.searchGrounding ? [{ google_search_retrieval: {} }] : undefined
            };

            const result = await this.client.models.generateContent(config);

            const text = result.text;
            if (!text) {
                throw new Error('Empty response from Gemini');
            }
            return text;
        } catch (error) {
            console.error('Gemini generate error:', error);
            throw error;
        }
    }

    async *generateStream(
        modelId: string,
        prompt: string,
        options?: GenerateOptions
    ): AsyncGenerator<StreamChunk, void, unknown> {
        try {
            const config: any = {
                model: modelId,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    systemInstruction: options?.systemInstruction,
                    temperature: options?.temperature,
                    responseMimeType: options?.responseSchema || options?.jsonMode ? 'application/json' : undefined,
                    responseSchema: options?.responseSchema,
                },
                tools: options?.searchGrounding ? [{ google_search_retrieval: {} }] : undefined
            };

            const result = await this.client.models.generateContentStream(config);

            for await (const chunk of result) {
                const text = chunk.text;
                if (text) {
                    yield { text };
                }
            }
        } catch (error) {
            console.error('Gemini stream error:', error);
            throw error;
        }
    }
}
