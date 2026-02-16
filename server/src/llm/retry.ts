export interface RetryOptions {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
}

const defaultOptions: Required<RetryOptions> = {
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 60000,
    backoffFactor: 2,
};

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const opts = { ...defaultOptions, ...options };
    let lastError: unknown;
    let delay = opts.initialDelay;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            const errorMsg = error?.message || '';
            const isRateLimit = errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED');

            if (isRateLimit) {
                // For rate limits, use a longer initial delay if it was short
                if (delay < 5000) delay = 5000;
                // Increase max retries effectively for rate limits by not counting them as "attempts" 
                // or just allow more retries in options.
                // For now, let's just log specifically.
                console.warn(`[Retry] Rate limit hit (attempt ${attempt + 1}/${opts.maxRetries}). Waiting ${delay}ms...`);
            } else {
                console.warn(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, errorMsg);
            }

            if (attempt === opts.maxRetries) break;

            await new Promise(resolve => setTimeout(resolve, delay));

            // Exponential backoff
            delay = Math.min(delay * opts.backoffFactor, 60000); // Allow up to 60s delay
        }
    }

    throw lastError;
}
