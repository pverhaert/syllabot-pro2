import { LLMProvider, GenerateOptions, StreamChunk } from './provider.js';

export class CerebrasClient implements LLMProvider {
    readonly id = 'cerebras';
    private apiKey: string;
    private baseUrl = 'https://api.cerebras.ai/v1/chat/completions';

    constructor(apiKey: string) {
        if (!apiKey) {
            throw new Error('Cerebras API key is required');
        }
        this.apiKey = apiKey;
    }

    private get headers() {
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
        };
    }

    async generate(
        modelId: string,
        prompt: string,
        options?: GenerateOptions
    ): Promise<string> {
        try {
            const body = {
                model: modelId,
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
                temperature: options?.temperature ?? 0.2,
                response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
                max_tokens: options?.maxTokens || 4096, // Increase default to 4096 to prevent truncation
                stream: false
            };

            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Cerebras API error: ${response.status} ${error}`);
            }

            const data = await response.json();
            return data.choices[0]?.message?.content || '';
        } catch (error) {
            console.error('Cerebras generate error:', error);
            throw error;
        }
    }

    async *generateStream(
        modelId: string,
        prompt: string,
        options?: GenerateOptions
    ): AsyncGenerator<StreamChunk, void, unknown> {
        try {
            const body = {
                model: modelId,
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
                temperature: options?.temperature ?? 0.2,
                // Cerebras might not support json_object in stream mode fully, but we'll try
                response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
                max_tokens: options?.maxTokens || 4096, // Increase default to 4096 to prevent truncation
                stream: true
            };

            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Cerebras stream error: ${response.status} ${error}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('Response body is not readable');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.trim() === 'data: [DONE]') return;
                    if (!line.startsWith('data: ')) continue;

                    try {
                        const data = JSON.parse(line.slice(6));
                        const content = data.choices[0]?.delta?.content;
                        if (content) {
                            yield { text: content };
                        }
                    } catch (e) {
                        console.warn('Error parsing Cerebras SSE chunk:', e);
                    }
                }
            }
        } catch (error) {
            console.error('Cerebras stream error:', error);
            throw error;
        }
    }
}
