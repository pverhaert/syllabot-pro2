import './styles.css';
import { marked } from 'marked';
import mermaid from 'mermaid';
import { renderIcons } from './icons';

// ── Initialize Mermaid (same config as ui.ts) ──
mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
});

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

        // Parse with marked (async for mermaid support)
        const html = await marked.parse(markdown, { async: true });

        // Inject rendered HTML
        courseBodyEl.innerHTML = html;

        // Post-process: render Lucide icons if any
        renderIcons(courseBodyEl);

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

init();
