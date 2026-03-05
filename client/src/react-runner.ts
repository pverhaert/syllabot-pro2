export interface ReactPreviewResult {
    element: HTMLElement;
    error: string | null;
}

// Global declarations for CDN libraries
declare global {
    interface Window {
        Babel: any;
        React: any;
        ReactDOMClient: any;
        ReactDOM: any;
    }
}

let babelLoadPromise: Promise<void> | null = null;
let reactLoadPromise: Promise<void> | null = null;

async function loadScript(src: string, checkGlobal: string): Promise<void> {
    if ((window as any)[checkGlobal]) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

export async function loadBabelIfNeeded(): Promise<void> {
    if (!babelLoadPromise) {
        babelLoadPromise = loadScript('https://unpkg.com/@babel/standalone/babel.min.js', 'Babel').catch(e => {
            babelLoadPromise = null;
            throw e;
        });
    }
    return babelLoadPromise;
}

export async function loadReactIfNeeded(): Promise<void> {
    if (!reactLoadPromise) {
        reactLoadPromise = (async () => {
            try {
                // Load React core
                await loadScript('https://unpkg.com/react@18/umd/react.development.js', 'React');
                // Load ReactDOM
                await loadScript('https://unpkg.com/react-dom@18/umd/react-dom.development.js', 'ReactDOM');
            } catch (e) {
                reactLoadPromise = null;
                throw e;
            }
        })();
    }
    return reactLoadPromise;
}

/**
 * Executes a React/JSX snippet and renders it into a returned container.
 */
export async function runReactCode(code: string): Promise<ReactPreviewResult> {
    const container = document.createElement('div');
    container.className = 'react-preview-container p-4 bg-white rounded-md text-black';

    try {
        await Promise.all([loadBabelIfNeeded(), loadReactIfNeeded()]);

        // Transform JSX to JS using Babel standalone
        const transformed = window.Babel.transform(code, {
            presets: ['react', 'env']
        });

        let jsCode = transformed.code;

        // Determine how to render. 
        // We look for a component to render. Often examples just define 'export default function App() {}'
        // or 'function App() {}' and we need to automatically render it.

        // A simple heuristic: if they use export default, we extract it.
        // For simplicity, let's wrap their code so that any 'export default' is assigned to a variable.
        let mountCode = `
            const exports = {};
            const module = { exports };
            
            ${jsCode}
            
            let ComponentToRender = null;
            if (exports.default) {
                ComponentToRender = exports.default;
            } else if (typeof App !== 'undefined') {
                ComponentToRender = App;
            } else if (typeof DefaultComponent !== 'undefined') {
                ComponentToRender = DefaultComponent;
            }
            
            if (ComponentToRender) {
                const root = window.ReactDOM.createRoot(container);
                root.render(window.React.createElement(ComponentToRender));
            } else {
                container.innerHTML = '<div class="text-red-500">Could not find a component to render. Please "export default function App() { ... }"</div>';
            }
        `;

        // Create a function we can execute. Note: we pass context objects to it so it doesn't pollute global scope.
        const runner = new Function('container', 'window', 'document', mountCode);

        // Execute the code
        runner(container, window, document);

        return {
            element: container,
            error: null
        };
    } catch (err: any) {
        return {
            element: container,
            error: err.toString()
        };
    }
}
