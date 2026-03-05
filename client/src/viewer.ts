import './styles.css';
import 'katex/dist/katex.min.css';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import mermaid from 'mermaid';
import { renderIcons } from './icons';
import { preprocessMath } from './math-utils';
import { runPythonCode } from './pyodide-runner';
import { runJavaScriptCode, runTypeScriptCode } from './js-ts-runner';
import { runHtmlCode } from './html-runner';
import { runReactCode } from './react-runner';
import { runP5Code } from './p5-runner';

// ── Initialize Mermaid (same config as ui.ts) ──
mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
});

// ── Configure Marked with KaTeX math support ──
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

// ── Configure Marked with Mermaid support (same as ui.ts) ──
marked.use({
    async: true,
    walkTokens: async (token) => {
        if (token.type === 'code' && token.lang === 'mermaid') {
            const id = 'mermaid-' + Math.random().toString(36).substring(2, 9);
            try {
                const { svg } = await mermaid.render(id, token.text);
                // @ts-ignore
                token.type = 'html';
                token.text = `<div class="mermaid-container">${svg}</div>`;
            } catch (error) {
                console.warn('Mermaid render error:', error);
                // @ts-ignore
                token.type = 'html';
                token.text = `<div class="p-4 border border-red-500/20 bg-red-500/5 rounded text-red-500 text-xs font-mono whitespace-pre-wrap">Mermaid Error:\n${(error as any).message}\n\nCode:\n${token.text}</div>`;
            }
        }
    }
});

// ── DOM Refs ──
const loadingEl = document.getElementById('loading')!;
const errorEl = document.getElementById('error')!;
const errorMessageEl = document.getElementById('error-message')!;
const layoutEl = document.getElementById('viewer-layout')!;
const courseTitleEl = document.getElementById('course-title')!;
const courseBodyEl = document.getElementById('course-body')!;
const tocListEl = document.getElementById('toc-list')!;
const tocListMobileEl = document.getElementById('toc-list-mobile')!;

// ── Main ──
async function init() {
    const params = new URLSearchParams(window.location.search);
    const file = params.get('file');

    if (!file) {
        showError('No file specified in the URL.');
        return;
    }

    try {
        const response = await fetch(`/history-files/${file}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const markdown = await response.text();

        // Normalize block math ($$...$$) to be on own lines for KaTeX
        const processedMarkdown = preprocessMath(markdown);

        // Parse with marked (async for mermaid support)
        const html = await marked.parse(processedMarkdown, { async: true });

        // Inject rendered HTML
        courseBodyEl.innerHTML = html;

        // Give the browser a moment to paint the DOM before querying it
        setTimeout(() => {
            // Post-process: render Lucide icons if any
            renderIcons(courseBodyEl);

            // Setup interactive code runners for Python, JS, TS
            setupCodeRunners();

            // Extract first H1 for the header
            const firstH1 = courseBodyEl.querySelector('h1');
            if (firstH1) {
                courseTitleEl.textContent = firstH1.textContent;
                document.title = `${firstH1.textContent} - SyllaBot Pro`;
                firstH1.remove();
            } else {
                const name = file.replace(/\.md$/, '').replace(/_/g, ' ');
                courseTitleEl.textContent = name;
                document.title = `${name} - SyllaBot Pro`;
            }

            // Build TOC from headings
            buildTOC();

            // Show content layout
            loadingEl.classList.add('hidden');
            layoutEl.classList.remove('hidden');

            // Activate scroll-spy
            setupScrollSpy();
        }, 50);

    } catch (err: any) {
        console.error('Failed to load course:', err);
        showError(err.message || 'Unknown error');
    }
}

function showError(msg: string) {
    loadingEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
    errorMessageEl.textContent = msg;
}

/**
 * Build a hierarchical, collapsible Table of Contents from h1/h2/h3 headings.
 * h1 and h2 entries are collapsible, revealing their child entries on click.
 */
function buildTOC() {
    console.log("BUILDING TOC")
    const headings = courseBodyEl.querySelectorAll('h1, h2, h3');
    if (headings.length === 0) return;

    // Assign IDs to all headings
    const items: { tag: string; text: string; id: string }[] = [];
    headings.forEach((heading, index) => {
        const text = heading.textContent?.trim() || `section-${index}`;
        const id = `toc-${index}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
        heading.id = id;
        items.push({ tag: heading.tagName, text, id });
    });

    function escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Build nested HTML: h1 > h2 > h3
    function renderTOC(itemList: typeof items): string {
        let html = '';
        let i = 0;

        while (i < itemList.length) {
            const item = itemList[i];

            if (item.tag === 'H1') {
                // Collect children (h2, h3) until next h1
                const children: typeof items = [];
                let j = i + 1;
                while (j < itemList.length && itemList[j].tag !== 'H1') {
                    children.push(itemList[j]);
                    j++;
                }
                const groupId = `toc-group-${i}`;
                const hasChildren = children.length > 0;
                html += `
                    <li>
                        <div class="flex items-center gap-1">
                            ${hasChildren ? `<button class="toc-toggle shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 transition-colors cursor-pointer" data-group="${groupId}" aria-label="Toggle">
                                <svg class="w-3.5 h-3.5 text-primary/60 transition-transform duration-200 toc-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>` : '<span class="w-5"></span>'}
                            <a href="#${item.id}"
                               class="toc-link flex-1 font-semibold flex items-center gap-1 py-1.5 px-2 rounded-md text-text hover:text-primary hover:bg-primary/5 transition-all duration-200 no-underline text-[13px]"
                               data-target="${item.id}">
                                <span class="leading-snug">${escapeHtml(item.text)}</span>
                            </a>
                        </div>
                        ${hasChildren ? `<ul id="${groupId}" class="toc-children space-y-0.5 ml-3 mt-0.5 border-l border-border/50 pl-2">${renderH2Group(children)}</ul>` : ''}
                    </li>
                `;
                i = j;
            } else if (item.tag === 'H2') {
                // Top-level h2 (no parent h1) — treat as collapsible
                const children: typeof items = [];
                let j = i + 1;
                while (j < itemList.length && itemList[j].tag === 'H3') {
                    children.push(itemList[j]);
                    j++;
                }
                const groupId = `toc-group-${i}`;
                const hasChildren = children.length > 0;
                html += `
                    <li>
                        <div class="flex items-center gap-1">
                            ${hasChildren ? `<button class="toc-toggle shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 transition-colors cursor-pointer" data-group="${groupId}" aria-label="Toggle">
                                <svg class="w-3 h-3 text-primary/50 transition-transform duration-200 toc-chevron -rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>` : '<span class="w-5"></span>'}
                            <a href="#${item.id}"
                               class="toc-link flex-1 font-medium flex items-center gap-1 py-1 px-2 rounded-md text-text-muted hover:text-primary hover:bg-primary/5 transition-all duration-200 no-underline text-[12.5px]"
                               data-target="${item.id}">
                                <span class="leading-snug">${escapeHtml(item.text)}</span>
                            </a>
                        </div>
                        ${hasChildren ? `<ul id="${groupId}" class="toc-children space-y-0.5 ml-5 mt-0.5 hidden">${children.map(c => renderH3(c)).join('')}</ul>` : ''}
                    </li>
                `;
                i = j;
            } else {
                // Standalone h3
                html += renderH3(item);
                i++;
            }
        }
        return html;
    }

    // Render h2 items nested under an h1
    function renderH2Group(children: typeof items): string {
        let html = '';
        let i = 0;
        while (i < children.length) {
            const child = children[i];
            if (child.tag === 'H2') {
                // Collect h3 children
                const h3s: typeof items = [];
                let j = i + 1;
                while (j < children.length && children[j].tag === 'H3') {
                    h3s.push(children[j]);
                    j++;
                }
                const groupId = `toc-group-${child.id}`;
                const hasH3 = h3s.length > 0;
                html += `
                    <li>
                        <div class="flex items-center gap-1">
                            ${hasH3 ? `<button class="toc-toggle shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 transition-colors cursor-pointer" data-group="${groupId}" aria-label="Toggle">
                                <svg class="w-3 h-3 text-primary/50 transition-transform duration-200 toc-chevron -rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>` : '<span class="w-5"></span>'}
                            <a href="#${child.id}"
                               class="toc-link flex-1 font-medium flex items-center gap-1 py-1 px-2 rounded-md text-text-muted hover:text-primary hover:bg-primary/5 transition-all duration-200 no-underline text-[12.5px]"
                               data-target="${child.id}">
                                <span class="leading-snug">${escapeHtml(child.text)}</span>
                            </a>
                        </div>
                        ${hasH3 ? `<ul id="${groupId}" class="toc-children space-y-0.5 ml-5 mt-0.5 hidden">${h3s.map(h => renderH3(h)).join('')}</ul>` : ''}
                    </li>
                `;
                i = j;
            } else {
                html += renderH3(child);
                i++;
            }
        }
        return html;
    }

    function renderH3(item: { tag: string; text: string; id: string }): string {
        return `
            <li>
                <a href="#${item.id}"
                   class="toc-link font-normal flex items-start gap-1 py-0.5 px-2 rounded-md text-text-muted/80 hover:text-primary hover:bg-primary/5 transition-all duration-200 no-underline text-[12px]"
                   data-target="${item.id}">
                    <span class="inline-block w-1.5 h-1.5 rounded-full bg-primary/40 mr-1 shrink-0 mt-[5px]"></span>
                    <span class="leading-snug">${escapeHtml(item.text)}</span>
                </a>
            </li>
        `;
    }

    const tocHTML = renderTOC(items);
    tocListEl.innerHTML = tocHTML;
    tocListMobileEl.innerHTML = tocHTML;

    // Toggle collapse/expand on chevron click
    document.querySelectorAll('.toc-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const groupId = (btn as HTMLElement).dataset.group;
            if (!groupId) return;
            const group = document.querySelectorAll(`#${groupId}`);
            const chevrons = btn.querySelectorAll('.toc-chevron');

            group.forEach(el => {
                el.classList.toggle('hidden');
            });
            chevrons.forEach(svg => {
                svg.classList.toggle('-rotate-90');
            });
        });
    });

    // Smooth-scroll click handler for TOC links
    document.querySelectorAll('.toc-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = (link as HTMLElement).dataset.target;
            if (!targetId) return;
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                history.replaceState(null, '', `#${targetId}`);
            }
            // Close mobile TOC
            const mobileToc = document.getElementById('mobile-toc') as HTMLDetailsElement;
            if (mobileToc) mobileToc.open = false;
        });
    });

    // Global listener for p5.js errors from sandboxed iframes
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'p5-error') {
            const error = event.data.message || 'Unknown p5.js error';
            // Find the active/loading code runner and show the error
            // As a simple fallback, we just log it, but ideally we'd show it in the output area.
            // Since we can't easily find WHICH runner it came from here without more state,
            // we'll at least console and could eventually optimize this.
            console.error('p5.js sandbox error:', error);
        }
    });
}

/**
 * Scroll-spy: highlights the TOC link closest to the viewport top.
 */
function setupScrollSpy() {
    const headings = Array.from(courseBodyEl.querySelectorAll('[id^="toc-"]')) as HTMLElement[];
    if (headings.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Remove active from all
                document.querySelectorAll('.toc-link').forEach(link => {
                    link.classList.remove('!text-primary', '!bg-primary/10', '!font-semibold');
                });
                // Activate matching links
                document.querySelectorAll(`.toc-link[data-target="${entry.target.id}"]`).forEach(link => {
                    link.classList.add('!text-primary', '!bg-primary/10', '!font-semibold');
                });
            }
        });
    }, {
        rootMargin: '-10% 0px -80% 0px',
        threshold: 0.1,
    });

    headings.forEach(h => observer.observe(h));
}

/**
 * Finds all code blocks for supported languages and injects a "Run" button and output area.
 */
function setupCodeRunners() {
    // Select all code blocks
    const codeBlocks = courseBodyEl.querySelectorAll('pre code');
    if (codeBlocks.length === 0) return;

    let currentHtmlContext = '';

    codeBlocks.forEach((codeEl) => {
        const preEl = codeEl.parentElement;
        if (!preEl || preEl.tagName !== 'PRE') return;

        // Prevent double initialization
        if (preEl.parentElement?.classList.contains('code-runner')) return;

        // Determine language
        const languageClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
        const isPython = codeEl.classList.contains('language-python') || codeEl.classList.contains('language-py');
        const isJS = codeEl.classList.contains('language-javascript') || codeEl.classList.contains('language-js');
        const isTS = codeEl.classList.contains('language-typescript') || codeEl.classList.contains('language-ts');
        const isHTML = codeEl.classList.contains('language-html') || codeEl.classList.contains('language-css');
        const isReact = codeEl.classList.contains('language-jsx') || codeEl.classList.contains('language-tsx') || codeEl.classList.contains('language-react');
        let isP5 = codeEl.classList.contains('language-p5js') || codeEl.classList.contains('language-p5');

        // Fallback: If it's labeled as JS but contains p5.js patterns (setup/draw + createCanvas), treat it as p5js
        if (isJS && !isP5) {
            const codeText = codeEl.textContent || '';
            if (codeText.includes('setup()') && (codeText.includes('createCanvas') || codeText.includes('draw()'))) {
                isP5 = true;
            }
        }

        const isExecutable = isPython || isJS || isTS || isHTML || isReact || isP5;

        let langName = 'Code';
        let langColor = 'text-gray-400';

        if (isPython) { langName = 'Python'; langColor = 'text-[#3776AB]'; }
        else if (isTS) { langName = 'TypeScript'; langColor = 'text-[#3178C6]'; }
        else if (isJS) { langName = 'JavaScript'; langColor = 'text-[#F7DF1E]'; }
        else if (isHTML) { langName = 'Web Preview'; langColor = 'text-[#E34F26]'; }
        else if (isReact) { langName = 'React'; langColor = 'text-[#61DAFB]'; }
        else if (isP5) { langName = 'p5.js'; langColor = 'text-[#ED225D]'; }
        else if (languageClass) {
            langName = languageClass.replace('language-', '');
            langName = langName.charAt(0).toUpperCase() + langName.slice(1);
        }

        // Icon logic
        let langIcon = '';
        if (isPython) {
            langIcon = `<svg class="w-4 h-4 ${langColor}" viewBox="0 0 24 24" fill="currentColor"><path d="M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21V15.36l.01.24.04.24.06.24.09.24.12.24.14.24.17.23.2.22.21.21.23.21.24.2.26.19.27.18.28.16.29.15.3.13.3.11.3.1.32.09.32.07.33.05.34.04.34.02h.67l.35-.02.35-.04.34-.05.35-.08.34-.1.33-.11.32-.14.32-.16.3-.18.29-.2.28-.22.25-.24.23-.26.2-.28.17-.3.14-.3.11-.3.08-.3V20v-.3l-.01-.2-.04-.26-.06-.3-.1-.33-.14-.34-.18-.34-.23-.33-.28-.31-.32-.28-.38-.25-.42-.2-.48-.15-.53-.1-.58-.04h-4.6l-.63-.04-.57-.13-.5-.22-.42-.3-.32-.38-.21-.46-.1-.53-.02-.58v-4.6l.04-.63.13-.57.22-.5.3-.42.38-.32.46-.21.53-.1.58-.02h1.69l.54.02.5.06.44.11.38.16.32.2.24.25.16.3.08.35.02.4v1.68l-.02.54-.06.5-.11.44-.16.38-.2.32-.25.24-.3.16-.35.08-.4.02h-4.32l-.46-.03-.43-.1-.37-.15-.31-.22-.24-.26-.18-.32-.1-.36-.05-.4-.01-.43V14.33l.01-.4.05-.36.1-.31.14-.26.19-.2.24-.14.28-.08.31-.03h4.62l.52.02.5.07.45.14.4.2.33.27.26.35.17.43.08.5.02.58v4.6l-.02.58-.08.5-.17.43-.26.35-.33.27-.4.2-.45.14-.5.07-.52.02h-4.6l-.63-.05-.55-.13-.48-.22-.4-.32-.32-.4-.24-.5-.15-.57-.06-.65-.01-.73V13.8l.02-.73.07-.65.13-.57.19-.5.26-.4.32-.32.39-.22.46-.13.52-.05zM5.31 23.4l-.87-.2-.72-.25-.56-.3-.42-.32-.3-.33-.2-.34-.12-.32-.05-.3-.02-.27V15.5l.05-.63.14-.55.22-.46.3-.38.36-.31.42-.25.46-.19.5-.14.52-.1.52-.07.5-.04.47-.02h4.52l.69-.05.59-.14.5-.22.41-.27.33-.32.27-.35.2-.36.15-.37.1-.35.07-.32.04-.27.02-.21V8.64l-.01-.24-.04-.24-.06-.24-.09-.24-.12-.24-.14-.24-.17-.23-.2-.22-.21-.21-.23-.21-.24-.2-.26-.19-.27-.18-.28-.16-.29-.15-.3-.13-.3-.11-.3-.1-.32-.09-.32-.07-.33-.05-.34-.04-.34-.02h-.67l-.35.02-.35.04-.34.05-.35.08-.34.1-.33.11-.32.14-.32.16-.3.18-.29.2-.28.22-.25.24-.23.26-.2.28-.17.3-.14.3-.11.3-.08.3V4v.3l.01.2.04.26.06.3.1.33.14.34.18.34.23.33.28.31.32.28.38.25.42.2.48.15.53.1.58.04h4.6l.63.04.57.13.5.22.42.3.32.38.21.46.1.53.02.58v4.6l-.04.63-.13.57-.22.5-.3.42-.38.32-.46.21-.53.1-.58.02h-1.69l-.54-.02-.5-.06-.44-.11-.38-.16-.32-.2-.24-.25-.16-.3-.08-.35-.02-.4V7.92l.02-.54.06-.5.11-.44.16-.38.2-.32.25-.24.3-.16.35-.08.4-.02h4.32l.46.03.43.1.37.15.31.22.24.26.18.32.1.36.05.4.01.43v4.32l-.01.4-.05.36-.1.31-.14.26-.19.2-.24.14-.28.08-.31.03h-4.62l-.52-.02-.5-.07-.45-.14-.4-.2-.33-.27-.26-.35-.17-.43-.08-.5-.02-.58V4.8l.02-.58.08-.5.17-.43.26-.35.33-.27.4-.2.45-.14.5-.07.52-.02h4.6l.63.05.55.13.48.22.4.32.32.4.24.5.15.57.06.65.01.73v4.6l-.02.73-.07.65-.13.57-.19.5-.26.4-.32.32-.39-.22-.46-.13-.52-.05zM15.42 2.62a1.05 1.05 0 100 2.1 1.05 1.05 0 000-2.1zm-6.84 16.66a1.05 1.05 0 100 2.1 1.05 1.05 0 000-2.1z"/></svg>`;
        } else if (isTS) {
            langIcon = `<svg class="w-4 h-4 ${langColor}" viewBox="0 0 24 24" fill="currentColor"><path d="M1.125 0C.502 0 0 .502 0 1.125v21.75C0 23.498.502 24 1.125 24h21.75c.623 0 1.125-.502 1.125-1.125V1.125C24 .502 23.498 0 22.875 0H1.125zM14.372 13.922c-.672.417-1.637.77-2.652.77-1.928 0-3.155-1.127-3.155-3.078 0-2.176 1.488-3.237 3.284-3.237 1.01 0 1.761.272 2.275.602l-.634 1.576c-.464-.26-1.09-.5-1.666-.5-1.042 0-1.571.603-1.571 1.411 0 .978.718 1.348 1.83 1.348h.126c.72 0 1.436.19 2.053.483l.11.832v.293zm8.345 5.922c-.792.518-2.02.898-3.32.898-2.435 0-4.008-1.393-4.008-3.784 0-2.647 1.868-3.951 4.14-3.951 1.25 0 2.215.344 2.842.76l-.75 1.94c-.588-.344-1.355-.65-2.09-.65-1.305 0-1.97.772-1.97 1.79 0 1.25.925 1.714 2.308 1.714h.158c.883 0 1.802.247 2.569.605l.128.986v.355zM6.91 10.42v10.322H4.492V10.42H1.67V8.406h8.04v2.014H6.91z"/></svg>`;
        } else if (isHTML) {
            langIcon = `<svg class="w-4 h-4 ${langColor}" viewBox="0 0 24 24" fill="currentColor"><path d="M1.5 0h21l-1.91 21.563L11.977 24l-8.564-2.438L1.5 0zm7.031 9.75l-.232-2.718 10.059.003.23-2.622L5.412 4.41l.698 8.01h9.126l-.325 3.426-2.91.804-2.955-.81-.212-2.272H6.182l.407 4.606 5.4 1.488 5.372-1.484.792-8.43H8.53z"/></svg>`;
        } else if (isReact) {
            langIcon = `<svg class="w-4 h-4 ${langColor}" viewBox="-11.5 -10.23174 23 20.46348" fill="currentColor"><circle cx="0" cy="0" r="2.05" fill="currentColor"/><g stroke="currentColor" stroke-width="1" fill="none"><ellipse rx="11" ry="4.2"/><ellipse rx="11" ry="4.2" transform="rotate(60)"/><ellipse rx="11" ry="4.2" transform="rotate(120)"/></g></svg>`;
        } else if (isP5) {
            langIcon = `<svg class="w-4 h-4 ${langColor}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line><line x1="7.05" y1="7.05" x2="16.95" y2="16.95"></line><line x1="7.05" y1="16.95" x2="16.95" y2="7.05"></line></svg>`;
        } else {
            langIcon = `<svg class="w-4 h-4 ${langColor} bg-black rounded-sm" viewBox="0 0 24 24" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12.2 16.66c.22.14.53.28.88.28.7 0 1-.36 1-.87v-.04c0-.62-.5-1-1.38-1.37-1.25-.5-2.08-1.28-2.08-2.5 0-1.52 1.15-2.62 2.92-2.62.9 0 1.58.2 1.96.38l-.4 1.35c-.24-.12-.66-.27-1.12-.27-.64 0-1 .34-1 .8v.04c0 .54.43.9 1.34 1.27 1.36.56 2.13 1.27 2.13 2.58 0 1.7-1.22 2.68-3.1 2.68-1.02 0-1.84-.25-2.32-.48l.45-1.42zM7.5 15.68c0 1.27.75 2.12 2.05 2.12.87 0 1.34-.23 1.63-.42l.33 1.33c-.4.27-1.18.5-2.13.5-2.18 0-3.66-1.35-3.66-3.65v-5.83h1.78v5.95z"/></svg>`;
        }

        // Wrap the <pre> in a container
        const container = document.createElement('div');
        container.className = 'code-runner my-6 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden shadow-sm bg-transparent';
        preEl.parentNode?.insertBefore(container, preEl);

        // Create Toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'code-runner-toolbar flex items-center justify-between px-3 py-2.5 bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-300 dark:border-gray-600 text-xs';

        const langLabel = document.createElement('div');
        langLabel.className = 'flex items-center gap-2';
        langLabel.innerHTML = `
            ${langIcon}
            <span class="font-mono text-[11px] uppercase tracking-wider font-semibold opacity-80">${langName}</span>
        `;

        const btnGroup = document.createElement('div');
        btnGroup.className = 'flex items-center gap-2';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn flex items-center gap-1.5 px-3 py-1.5 text-text-muted hover:text-text hover:bg-surface-alt rounded-md transition-all cursor-pointer font-medium text-xs';
        copyBtn.title = 'Copy code';
        copyBtn.innerHTML = `
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>
            <span class="sr-only sm:not-sr-only">Copy</span>
        `;
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(codeEl.textContent || '');
                const origHtml = copyBtn.innerHTML;
                copyBtn.innerHTML = `
                    <svg class="w-3.5 h-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span class="text-green-500 sr-only sm:not-sr-only">Copied</span>
                `;
                setTimeout(() => {
                    copyBtn.innerHTML = origHtml;
                }, 2000);
            } catch (err) {
                console.error('Failed to copy: ', err);
            }
        });
        btnGroup.appendChild(copyBtn);

        let runBtn: HTMLButtonElement | null = null;
        let outputWrapper: HTMLDivElement | null = null;
        let outputArea: HTMLDivElement | null = null;
        let actionWord = 'Run';

        if (isExecutable) {
            runBtn = document.createElement('button');
            runBtn.className = 'code-run-btn flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-500 border border-green-500/20 hover:border-green-500/40 rounded-md transition-all cursor-pointer font-medium shadow-sm';
            actionWord = isHTML ? 'Preview' : (isReact || isP5 ? 'Render' : 'Run');
            runBtn.innerHTML = `
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <span>${actionWord}</span>
            `;
            btnGroup.appendChild(runBtn);

            outputWrapper = document.createElement('div');
            outputWrapper.className = 'code-output-wrapper hidden border-t border-border/50 bg-[#0d1117]';

            const outputHeader = document.createElement('div');
            outputHeader.className = 'px-3 py-1.5 bg-[#161b22] border-b border-[#30363d] text-[10px] uppercase font-bold tracking-wider text-gray-400 flex items-center gap-2';
            outputHeader.innerHTML = `
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                Output
            `;

            outputArea = document.createElement('div');
            outputArea.className = 'code-output p-3 text-gray-300 font-mono text-[13px] whitespace-pre-wrap max-h-[300px] overflow-y-auto leading-relaxed';

            outputWrapper.appendChild(outputHeader);
            outputWrapper.appendChild(outputArea);
        }

        toolbar.appendChild(langLabel);
        toolbar.appendChild(btnGroup);

        // Store original code text
        const codeText = codeEl.textContent || '';

        if (isHTML) {
            // Keep track of the last HTML block seen to use as context for JS blocks
            currentHtmlContext = codeText;
        }

        const blockHtmlContext = currentHtmlContext;

        // Adjust existing pre styles
        preEl.style.margin = '0';
        preEl.style.border = 'none';
        preEl.style.borderRadius = '0';

        // Form container
        container.appendChild(toolbar);
        container.appendChild(preEl);
        if (outputWrapper) {
            container.appendChild(outputWrapper);
        }

        // Run Click Handler
        if (runBtn && outputWrapper && outputArea) {
            runBtn.addEventListener('click', async () => {
                // Set loading state
                runBtn.disabled = true;
                runBtn.className = 'code-run-btn flex items-center gap-1.5 px-3 py-1.5 bg-surface-alt text-text-muted border border-border rounded-md transition-all cursor-not-allowed font-medium shadow-sm opacity-70';
                runBtn.innerHTML = `
                <svg class="w-3.5 h-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>${actionWord}ning...</span>
            `;

                outputWrapper.classList.remove('hidden');

                const loadingMsg = isPython
                    ? 'Initializing Pyodide (first run takes a few seconds)...'
                    : isTS
                        ? 'Loading TypeScript Compiler (first run takes a moment)...'
                        : isReact
                            ? 'Loading Babel & React (first run takes a moment)...'
                            : 'Running...';

                outputArea.innerHTML = `<span class="text-gray-500 italic flex items-center gap-2"><svg class="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> ${loadingMsg}</span>`;
                outputArea.className = 'code-output p-3 text-gray-300 font-mono text-[13px] whitespace-pre-wrap max-h-[500px] overflow-y-auto leading-relaxed';

                try {
                    outputArea.innerHTML = '';

                    if (isHTML) {
                        const { element, error } = await runHtmlCode(codeText);
                        if (error) {
                            outputArea.className = 'code-output p-3 text-red-400 font-mono text-[13px] whitespace-pre-wrap max-h-[500px] overflow-y-auto leading-relaxed bg-[#2a0e0e] border-l-2 border-red-500';
                            outputArea.textContent = error;
                        } else {
                            outputArea.className = 'code-output max-h-[500px] overflow-y-auto p-0';
                            outputArea.appendChild(element);
                        }
                    } else if (isReact) {
                        const { element, error } = await runReactCode(codeText);
                        if (error) {
                            outputArea.className = 'code-output p-3 text-red-400 font-mono text-[13px] whitespace-pre-wrap max-h-[500px] overflow-y-auto leading-relaxed bg-[#2a0e0e] border-l-2 border-red-500';
                            outputArea.textContent = error;
                        }
                    } else if (isP5) {
                        const { element, error } = await runP5Code(codeText);
                        if (error) {
                            outputArea.className = 'code-output p-3 text-red-400 font-mono text-[13px] whitespace-pre-wrap max-h-[500px] overflow-y-auto leading-relaxed bg-[#2a0e0e] border-l-2 border-red-500';
                            outputArea.textContent = error;
                        } else {
                            outputArea.className = 'code-output max-h-[500px] overflow-y-auto p-0';
                            outputArea.appendChild(element);
                        }
                    } else if ((isJS || isTS) && codeText.includes('document.') && blockHtmlContext) {
                        // This is a JS snippet manipulating the DOM! Render an interactive web preview.
                        let jsCode = codeText;
                        if (isTS) {
                            if ((window as any).ts) {
                                const tsResult = (window as any).ts.transpileModule(codeText, { compilerOptions: { target: (window as any).ts.ScriptTarget.ES2022 } });
                                jsCode = tsResult.outputText;
                            }
                        }
                        const combinedCode = `
                        ${blockHtmlContext}
                        <script>
                            try {
                                ${jsCode}
                            } catch(e) {
                                console.error(e);
                            }
                        </script>
                    `;
                        const { element, error } = await runHtmlCode(combinedCode);
                        if (error) {
                            outputArea.className = 'code-output p-3 text-red-400 font-mono text-[13px] whitespace-pre-wrap max-h-[500px] overflow-y-auto leading-relaxed bg-[#2a0e0e] border-l-2 border-red-500';
                            outputArea.textContent = error;
                        } else {
                            outputArea.className = 'code-output max-h-[500px] overflow-y-auto p-0';
                            outputArea.appendChild(element);
                        }
                    } else {
                        let executionResult;

                        if (isPython) {
                            executionResult = await runPythonCode(codeText);
                        } else if (isTS) {
                            executionResult = await runTypeScriptCode(codeText);
                        } else {
                            executionResult = await runJavaScriptCode(codeText);
                        }

                        const { stdout, stderr, error, image } = executionResult as any;

                        if (error) {
                            outputArea.className = 'code-output p-3 text-red-400 font-mono text-[13px] whitespace-pre-wrap max-h-[500px] overflow-y-auto leading-relaxed bg-[#2a0e0e] border-l-2 border-red-500';
                            outputArea.textContent = error;
                        } else if (stderr) {
                            outputArea.className = 'code-output p-3 text-yellow-300 font-mono text-[13px] whitespace-pre-wrap max-h-[500px] overflow-y-auto leading-relaxed';
                            outputArea.textContent = stderr + (stdout ? '\n\n' + stdout : '');
                        } else {
                            outputArea.className = 'code-output p-3 text-gray-300 font-mono text-[13px] whitespace-pre-wrap max-h-[500px] overflow-y-auto leading-relaxed';
                            outputArea.textContent = stdout || (image ? '' : '(No output)');
                        }

                        if (image) {
                            const imgEl = document.createElement('img');
                            imgEl.src = 'data:image/png;base64,' + image;
                            imgEl.className = 'mt-3 rounded shadow-sm max-w-full block bg-white';
                            outputArea.appendChild(imgEl);
                        }
                    }
                } catch (err: any) {
                    outputArea.className = 'code-output p-3 text-red-400 font-mono text-[13px] whitespace-pre-wrap max-h-[500px] overflow-y-auto leading-relaxed bg-[#2a0e0e] border-l-2 border-red-500';
                    outputArea.textContent = 'Execution failed: ' + err.toString();
                } finally {
                    // Reset button
                    runBtn.disabled = false;
                    runBtn.className = 'code-run-btn flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-500 border border-green-500/20 hover:border-green-500/40 rounded-md transition-all cursor-pointer font-medium shadow-sm';
                    runBtn.innerHTML = `
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    <span>${actionWord}</span>
                `;
                }
            });
        }
    });
}

init();
