export interface HTMLPreviewResult {
    element: HTMLElement;
    error: string | null;
}

/**
 * Executes raw HTML/CSS/JS by rendering it inside a sandboxed iframe.
 */
export async function runHtmlCode(code: string): Promise<HTMLPreviewResult> {
    try {
        const iframe = document.createElement('iframe');
        // Sandbox for security, allowing scripts but isolating the origin
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.style.width = '100%';
        iframe.style.height = '350px';
        iframe.style.border = 'none';
        iframe.style.backgroundColor = 'white'; // Usually web content assumes a white background
        iframe.style.borderRadius = '0.375rem'; // Tailwind rounded-md

        // Use srcdoc if supported (modern browsers), otherwise blob url
        if ('srcdoc' in iframe) {
            iframe.srcdoc = code;
        } else {
            const blob = new Blob([code], { type: 'text/html' });
            (iframe as HTMLIFrameElement).src = URL.createObjectURL(blob);
        }

        return {
            element: iframe,
            error: null
        };
    } catch (err: any) {
        return {
            element: document.createElement('div'),
            error: err.toString()
        };
    }
}
