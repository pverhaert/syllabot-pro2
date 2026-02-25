import { withRetry } from '../llm/retry.js';

interface TavilySearchResult {
    title: string;
    url: string;
    content: string;
    score: number;
    raw_content?: string;
}

interface TavilyResponse {
    query: string;
    results: TavilySearchResult[];
    answer?: string;
}

export class TavilyClient {
    private apiKey: string;
    private baseUrl = 'https://api.tavily.com/search';

    constructor(apiKey: string) {
        if (!apiKey) {
            console.warn('TavilyClient initialized without API key');
        }
        this.apiKey = apiKey;
    }

    /**
     * Search Tavily for context
     * @param query The search query
     * @param maxResults Number of results to return (default 3)
     */
    async search(query: string, maxResults: number = 3): Promise<string> {
        if (!this.apiKey) return '';

        console.log(`[Tavily] Searching for: "${query}"`);

        try {
            const data = await withRetry(async () => {
                const response = await fetch(this.baseUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        api_key: this.apiKey,
                        query,
                        search_depth: 'basic', // 'advanced' is more expensive
                        include_answer: false,
                        include_images: false,
                        include_raw_content: false,
                        max_results: maxResults,
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Tavily API error: ${response.status} ${errorText}`);
                }

                return await response.json() as TavilyResponse;
            });

            if (!data.results || data.results.length === 0) {
                return '';
            }

            // Format results for LLM context
            const formatted = data.results.map((r, i) => {
                return `[Source ${i + 1}]: ${r.title} (${r.url})\n${r.content}`;
            }).join('\n\n');

            return `\nSEARCH RESULTS FOR "${query}":\n\n${formatted}\n`;

        } catch (error) {
            console.error('[Tavily] Search failed:', error);
            return ''; // Fail gracefully, don't crash generation
        }
    }
}
