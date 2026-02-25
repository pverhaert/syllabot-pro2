import { LLMProvider, GenerateOptions, StreamChunk } from './provider.js';

export class OpenRouterClient implements LLMProvider {
    readonly id = 'openrouter';
    private apiKey: string;
    private baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

    constructor(apiKey: string) {
        if (!apiKey) {
            throw new Error('OpenRouter API key is required');
        }
        this.apiKey = apiKey;
    }

    private get headers() {
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000', // TODO: Update with actual site URL
            'X-Title': 'SyllaBot Pro',
        };
    }

    async generate(
        modelId: string,
        prompt: string,
        options?: GenerateOptions
    ): Promise<string> {
        const body = {
            model: modelId,
            messages: [
                ...(options?.systemInstruction ? [{ role: 'system', content: options.systemInstruction }] : []),
                { role: 'user', content: prompt }
            ],
            temperature: options?.temperature,
            response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        };

        console.log(`[OpenRouter] Sending request to ${modelId}...`);

        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(body),
            });

            console.log(`[OpenRouter] Response status: ${response.status}`);

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OpenRouter API error: ${response.status} ${error}`);
            }

            const data = await response.json();
            return data.choices[0]?.message?.content || '';
        } catch (error) {
            console.error('OpenRouter generate error:', error);
            throw error;
        }
    }

    async *generateStream(
        modelId: string,
        prompt: string,
        options?: GenerateOptions
    ): AsyncGenerator<StreamChunk, void, unknown> {
        const body = {
            model: modelId,
            messages: [
                ...(options?.systemInstruction ? [{ role: 'system', content: options.systemInstruction }] : []),
                { role: 'user', content: prompt }
            ],
            temperature: options?.temperature,
            stream: true,
            response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
        };

        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OpenRouter stream error: ${response.status} ${error}`);
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
                        console.warn('Error parsing SSE chunk:', e);
                    }
                }
            }
        } catch (error) {
            console.error('OpenRouter stream error:', error);
            throw error;
        }
    }
}
