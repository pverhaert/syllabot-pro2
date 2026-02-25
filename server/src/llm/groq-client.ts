import Groq from 'groq-sdk';
import { LLMProvider, GenerateOptions, StreamChunk } from './provider.js';

export class GroqClient implements LLMProvider {
    readonly id = 'groq';
    private client: Groq;

    constructor(apiKey: string) {
        if (!apiKey) {
            throw new Error('Groq API key is required');
        }
        this.client = new Groq({ apiKey });
    }

    async generate(
        modelId: string,
        prompt: string,
        options?: GenerateOptions
    ): Promise<string> {
        try {
            const completion = await this.client.chat.completions.create({
                messages: [
                    {
                        role: 'system',
                        content: options?.systemInstruction || 'You are a helpful AI assistant.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                model: modelId,
                temperature: options?.temperature ?? 0.7,
                response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
            });

            const text = completion.choices[0]?.message?.content || '';
            if (!text) {
                throw new Error('Empty response from Groq');
            }
            return text;
        } catch (error) {
            console.error('Groq generate error:', error);
            throw error;
        }
    }

    async *generateStream(
        modelId: string,
        prompt: string,
        options?: GenerateOptions
    ): AsyncGenerator<StreamChunk, void, unknown> {
        try {
            const stream = await this.client.chat.completions.create({
                messages: [
                    {
                        role: 'system',
                        content: options?.systemInstruction || 'You are a helpful AI assistant.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                model: modelId,
                temperature: options?.temperature ?? 0.7,
                response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
                stream: true,
            });

            for await (const chunk of stream) {
                const text = chunk.choices[0]?.delta?.content || '';
                if (text) {
                    yield { text };
                }
            }
        } catch (error) {
            console.error('Groq stream error:', error);
            throw error;
        }
    }
}
