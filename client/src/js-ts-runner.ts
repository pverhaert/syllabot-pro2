export interface CodeExecutionResult {
    stdout: string;
    stderr: string;
    error: string | null;
}

// Ensure TypeScript declaration for global window.ts
declare global {
    interface Window {
        ts: any;
    }
}

let tsLoadPromise: Promise<void> | null = null;

/**
 * Lazy-loads the TypeScript compiler from a CDN when needed.
 */
export async function loadTypeScriptIfNeeded(): Promise<void> {
    if (window.ts) return;

    if (!tsLoadPromise) {
        tsLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/typescript/5.3.3/typescript.min.js';
            script.onload = () => resolve();
            script.onerror = (e) => {
                tsLoadPromise = null;
                reject(new Error('Failed to load TypeScript compiler'));
            };
            document.head.appendChild(script);
        });
    }

    return tsLoadPromise;
}

/**
 * Executes JavaScript code by wrapping it in an async function.
 * Temporarily intercepts console.log, console.error, etc. to capture output.
 */
export async function runJavaScriptCode(code: string): Promise<CodeExecutionResult> {
    let stdout = '';
    let stderr = '';

    // Store original console methods
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    const formatOutput = (args: any[]) => {
        return args.map(a => {
            if (a === undefined) return 'undefined';
            if (a === null) return 'null';
            if (typeof a === 'object') {
                try {
                    return JSON.stringify(a, null, 2);
                } catch {
                    return String(a);
                }
            }
            return String(a);
        }).join(' ') + '\n';
    };

    // Override them to capture output
    console.log = (...args) => { stdout += formatOutput(args); };
    console.error = (...args) => { stderr += formatOutput(args); };
    console.warn = (...args) => { stderr += formatOutput(args); };
    console.info = (...args) => { stdout += formatOutput(args); };

    let error: string | null = null;

    try {
        // Wrap in an async IIFE so users can use top-level await if they want to
        const wrappedCode = `return (async function() {\n${code}\n})();`;
        const runner = new Function(wrappedCode);
        await runner();
    } catch (err: any) {
        error = err.toString();
    } finally {
        // Restore console methods immediately after execution completes
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
        console.info = originalInfo;
    }

    return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error
    };
}

/**
 * Transpiles TypeScript code to JavaScript on the fly, then executes it.
 */
export async function runTypeScriptCode(code: string): Promise<CodeExecutionResult> {
    try {
        await loadTypeScriptIfNeeded();

        // Use the global ts object loaded from the CDN to transpile
        // We set module: CommonJS (or ESNext) and target: ES2022
        const result = window.ts.transpileModule(code, {
            compilerOptions: {
                target: window.ts.ScriptTarget.ES2022,
                module: window.ts.ModuleKind.ESNext,
            }
        });

        const jsCode = result.outputText;
        return await runJavaScriptCode(jsCode);
    } catch (err: any) {
        return {
            stdout: '',
            stderr: '',
            error: err.toString()
        };
    }
}
