export interface P5PreviewResult {
    element: HTMLElement;
    error: string | null;
}

/**
 * Executes p5.js code by rendering it inside a sandboxed iframe.
 * The code is wrapped in a basic HTML structure that loads p5.js from a CDN.
 */
export async function runP5Code(code: string): Promise<P5PreviewResult> {
    try {
        const iframe = document.createElement('iframe');
        // Sandbox for security
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.style.width = '100%';
        iframe.style.height = '400px';
        iframe.style.border = 'none';
        iframe.style.backgroundColor = '#f8f9fa';
        iframe.style.borderRadius = '0.375rem';

        // Check if the code has setup/draw. If not, we might want to wrap it or 
        // just let p5.js handle it (p5.js can run in "global" mode even without setup/draw for some simple things, 
        // but setup/draw is standard).

        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <script src="https://cdn.jsdelivr.net/npm/p5@1.9.0/lib/p5.js"></script>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f8f9fa; }
        canvas { max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border-radius: 4px; }
    </style>
</head>
<body>
    <script>
        // Catch errors and report them to parent
        window.onerror = function(msg, url, lineNo, columnNo, error) {
            window.parent.postMessage({ type: 'p5-error', message: msg, line: lineNo }, '*');
            return false;
        };

        // Inject user code
        try {
            ${code}
        } catch (err) {
            window.parent.postMessage({ type: 'p5-error', message: err.toString() }, '*');
        }

        // Add a helper for auto-resizing canvas if they used static values
        function windowResized() {
            if (typeof resizeCanvas === 'function') {
                // Only resize if we are in a drawing loop and they want it
                // Most simple sketches won't need this but it's good practice
            }
        }
    </script>
</body>
</html>`;

        iframe.srcdoc = htmlContent;

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
