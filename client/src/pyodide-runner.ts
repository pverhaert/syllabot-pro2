import { loadPyodide, type PyodideInterface } from 'pyodide';

// Store the singleton instance and its initialization promise
let pyodideInstance: PyodideInterface | null = null;
let pyodideInitPromise: Promise<PyodideInterface> | null = null;

export interface CodeExecutionResult {
    stdout: string;
    stderr: string;
    error: string | null;
    image?: string | null; // Optional base64 image output from matplotlib
}

/**
 * Initializes Pyodide if it hasn't been initialized yet.
 * Uses a singleton pattern to ensure it only loads once.
 */
export async function initPyodideIfNeeded(): Promise<PyodideInterface> {
    if (pyodideInstance) {
        return pyodideInstance;
    }

    if (!pyodideInitPromise) {
        // We load Pyodide from CDN to avoid bundling the massive WASM files
        // and only do this when the user clicks 'Run' for the first time
        pyodideInitPromise = loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/'
        }).then(async (pyodide) => {
            pyodideInstance = pyodide;
            // Pre-load common math libraries that students might use
            console.log('Pyodide loaded. Loading micropip and matplotlib...');
            await pyodide.loadPackage('micropip');
            const micropip = pyodide.runPython('import micropip; micropip') as any;
            await micropip.install('matplotlib').catch(console.error);
            console.log('Libraries loaded.');
            return pyodideInstance;
        }).catch((err) => {
            console.error('Failed to load Pyodide:', err);
            pyodideInitPromise = null;
            throw err;
        });
    }

    return pyodideInitPromise;
}

/**
 * Executes Python code using Pyodide and captures the output.
 */
export async function runPythonCode(code: string): Promise<CodeExecutionResult> {
    try {
        const pyodide = await initPyodideIfNeeded();

        let stdout = '';
        let stderr = '';

        pyodide.setStdout({ batched: (output: string) => { stdout += output + '\n'; } });
        pyodide.setStderr({ batched: (output: string) => { stderr += output + '\n'; } });

        let cleanCode = code;
        const lines = code.split('\n');
        // Check if it's a REPL-like block
        if (lines.some(line => line.trim().startsWith('>>> '))) {
            cleanCode = lines
                .filter(line => line.trim().startsWith('>>> ') || line.trim().startsWith('... '))
                .map(line => line.trim().substring(4))
                .join('\n');
        }

        // Reset matplotlib figures to avoid overlap between runs
        // Also override builtins.input so Javascript's prompt() gets the user's prompt message
        await pyodide.runPythonAsync(`
import sys
import builtins
import js

def custom_input(prompt_text=""):
    return js.prompt(prompt_text)

builtins.input = custom_input

if 'matplotlib.pyplot' in sys.modules:
    import matplotlib.pyplot as plt
    plt.close('all')
`);

        const result = await pyodide.runPythonAsync(cleanCode);

        // If the code evaluated to a value, print it like a REPL would
        if (result !== undefined) {
            const strRes = result.toString();
            if (strRes !== 'None') {
                stdout += strRes + '\n';
            }
        }

        // Check for output images safely
        const imageBase64 = await pyodide.runPythonAsync(`
import sys
import io
import base64
_output_image = None
if 'matplotlib.pyplot' in sys.modules:
    import matplotlib.pyplot as plt
    if plt.get_fignums():
        _buf = io.BytesIO()
        plt.savefig(_buf, format='png', bbox_inches='tight')
        plt.close('all')
        _output_image = base64.b64encode(_buf.getvalue()).decode('utf-8')
_output_image
`);

        return {
            stdout: stdout.trim().replace(/\\n/g, '\n'),
            stderr: stderr.trim().replace(/\\n/g, '\n'),
            error: null,
            image: typeof imageBase64 === 'string' && imageBase64.length > 0 ? imageBase64 : null
        };
    } catch (err: any) {
        // If there's an error in the Python code itself, or loading Pyodide
        return {
            stdout: '',
            stderr: '',
            error: err.toString()
        };
    }
}
