import { CourseOutline, Chapter } from './types';
import { marked } from 'marked';
import mermaid from 'mermaid';

import { renderIcons } from './icons';

export class UI {
    private app = document.querySelector('#app') as HTMLElement;
    private configPanel = document.querySelector('#config-panel') as HTMLElement;
    private outlinePanel = document.querySelector('#outline-panel') as HTMLElement;
    private chapterViewer = document.querySelector('#chapter-viewer') as HTMLElement;
    private thinkingPanel = document.querySelector('#thinking-panel') as HTMLElement;
    private currentCourseId: string | null = null;
    private activeChapterId: string | null = null;

    constructor() {
        // Initialize Mermaid
        mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose',
        });

        // Configure Marked for Async Mermaid Rendering via walkTokens
        marked.use({
            async: true,
            walkTokens: async (token) => {
                if (token.type === 'code' && token.lang === 'mermaid') {
                    const id = 'mermaid-' + Math.random().toString(36).substring(2, 9);
                    try {
                        // Render SVG
                        // mermaid.render returns { svg: string } in v10+
                        // Note: render might throw if syntax is bad
                        const { svg } = await mermaid.render(id, token.text);

                        // Transform token to HTML
                        // @ts-ignore
                        token.type = 'html';
                        token.text = `<div class="mermaid-container">${svg}</div>`;
                    } catch (error) {
                        console.warn('Mermaid render error:', error);
                        // Fallback to code block on error
                        // @ts-ignore
                        token.type = 'html';
                        token.text = `<div class="p-4 border border-red-500/20 bg-red-500/5 rounded text-red-500 text-xs font-mono whitespace-pre-wrap">Mermaid Error:\n${(error as any).message}\n\nCode:\n${token.text}</div>`;
                    }
                }
            }
        });
    }

    showOutline(outline: CourseOutline, courseId: string, courseName?: string) {
        this.currentCourseId = courseId;
        const displayTitle = courseName || outline.title || 'Untitled Course';
        this.configPanel.classList.add('hidden');
        this.chapterViewer.classList.remove('hidden');

        // 1. Render Sidebar List
        this.outlinePanel.innerHTML = `
            <div class="px-2 pb-4">
                <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3 px-2">Course Chapters</h2>
                <div class="space-y-1">
                    ${outline.chapters.map(chapter => this.renderSidebarItem(chapter)).join('')}
                </div>
            </div>
            
            <div class="px-4 pb-6 mt-4">
                 <button id="btn-start-generation" data-course-id="${courseId}"
                    class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-lg shadow-md hover:shadow-lg transition-all active:scale-[0.98]">
                    <i data-lucide="play" class="w-4 h-4 fill-current"></i>
                    Start Generation
                </button>
            </div>
        `;

        // 2. Render Content Containers (Editable Inputs)
        this.chapterViewer.innerHTML = `
            <div class="max-w-3xl mx-auto pb-20">
                <div class="mb-10 text-center border-b border-border pb-10">
                    <h1 class="text-3xl md:text-4xl font-bold text-primary mb-4">${displayTitle}</h1>
                    <p class="text-text-muted text-lg max-w-2xl mx-auto">${outline.description || ''}</p>
                </div>
                
                <div id="content-container">
                    <!-- EDITABLE OUTLINE MODE -->
                    <div id="outline-editor" class="space-y-8">
                         <div class="bg-blue-500/10 border border-blue-500/20 text-blue-500 p-4 rounded-lg flex items-center gap-3">
                            <i data-lucide="info" class="w-5 h-5 shrink-0"></i>
                            <p class="text-sm">Review and edit the chapter details below. You can change titles, descriptions, and subtopics before generating the content.</p>
                        </div>

                        ${outline.chapters.map(chapter => this.renderEditableChapter(chapter)).join('')}
                    </div>

                    <!-- GENERATED CONTENT MODE (Placeholder) -->
                    <p id="generation-placeholder" class="hidden text-center text-text-muted mt-20">Generation in progress...</p>
                </div>
                
                <div id="completion-area"></div>
            </div>
        `;

        // Render icons
        renderIcons(this.outlinePanel);
        renderIcons(this.chapterViewer);

        // Setup Sidebar Clicks
        this.setupSidebarListeners();

        // Add event listener to start button
        document.getElementById('btn-start-generation')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-start-generation') as HTMLButtonElement;

            // Gather edited data
            const editedOutline = JSON.parse(JSON.stringify(outline)); // Deep copy
            editedOutline.chapters.forEach((ch: any) => {
                const elTitle = document.getElementById(`edit-title-${ch.id}`) as HTMLInputElement;
                const elDesc = document.getElementById(`edit-desc-${ch.id}`) as HTMLTextAreaElement;
                const elSub = document.getElementById(`edit-sub-${ch.id}`) as HTMLTextAreaElement;

                if (elTitle) ch.title = elTitle.value;
                if (elDesc) ch.description = elDesc.value;
                if (elSub) {
                    // Split by newlines, remove bullets/hyphens
                    ch.subtopics = elSub.value
                        .split('\n')
                        .map(line => line.replace(/^[-*•]\s*/, '').trim())
                        .filter(line => line.length > 0);
                }
            });

            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving & Starting...`;
                renderIcons(btn);
            }

            // Dispatch event so main.ts can handle it
            const event = new CustomEvent('course:start', { detail: { courseId, outline: editedOutline } });
            document.dispatchEvent(event);
        });
    }

    startGenerationMode(outline: CourseOutline) {
        // Hide editor
        const editor = document.getElementById('outline-editor');
        if (editor) editor.classList.add('hidden');

        // Hide generation placeholder
        const placeholder = document.getElementById('generation-placeholder');
        if (placeholder) placeholder.classList.add('hidden');

        // Hide start button
        const startBtn = document.getElementById('btn-start-generation');
        if (startBtn) startBtn.style.display = 'none';

        // Render actual content containers
        const container = document.getElementById('content-container');
        if (container) {
            // clear editor
            container.innerHTML = outline.chapters.map(chapter => this.renderContentContainer(chapter)).join('');
            renderIcons(container);
        }
    }

    private renderSidebarItem(chapter: Chapter) {
        return `
            <button id="sidebar-item-${chapter.id}" data-chapter-id="${chapter.id}"
                class="sidebar-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm text-text-muted hover:text-text hover:bg-surface transition-colors group">
                <span id="status-icon-${chapter.id}" class="shrink-0 w-5 h-5 flex items-center justify-center rounded-md bg-surface border border-border text-text-muted/50">
                    <span class="text-[10px] font-mono">${chapter.order}</span>
                </span>
                <div class="min-w-0">
                    <span class="block truncate font-medium">${chapter.title}</span>
                </div>
            </button>
        `;
    }

    private renderEditableChapter(chapter: Chapter) {
        const subtopicsText = chapter.subtopics
            ? chapter.subtopics.map(s => `- ${s}`).join('\n')
            : '';

        return `
            <div id="chapter-edit-${chapter.id}" class="chapter-edit-view bg-surface border border-border rounded-xl p-6 shadow-sm">
                <div class="flex items-center gap-2 text-text-muted font-mono text-xs uppercase tracking-wider mb-4">
                    <span class="bg-surface-alt px-2 py-1 rounded">Chapter ${chapter.order}</span>
                </div>

                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold text-text-muted uppercase mb-1">Title</label>
                        <input id="edit-title-${chapter.id}" type="text" value="${chapter.title.replace(/"/g, '&quot;')}" 
                            class="w-full bg-surface-alt border border-border rounded-lg px-3 py-2 text-text font-semibold focus:ring-2 focus:ring-primary/50 outline-none transition-all">
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-text-muted uppercase mb-1">Description (One line)</label>
                        <textarea id="edit-desc-${chapter.id}" rows="2"
                            class="w-full bg-surface-alt border border-border rounded-lg px-3 py-2 text-text text-sm focus:ring-2 focus:ring-primary/50 outline-none transition-all resize-y">${chapter.description}</textarea>
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-text-muted uppercase mb-1">Subtopics (Markdown list)</label>
                        <textarea id="edit-sub-${chapter.id}" rows="5"
                            class="w-full bg-surface-alt border border-border rounded-lg px-3 py-2 text-text font-mono text-sm focus:ring-2 focus:ring-primary/50 outline-none transition-all resize-y"
                            placeholder="- Subtopic 1\n- Subtopic 2">${subtopicsText}</textarea>
                        <p class="text-[10px] text-text-muted mt-1">Each topic on a new line. Start with - or *.</p>
                    </div>
                </div>
            </div>
        `;
    }

    private renderContentContainer(chapter: Chapter) {
        return `
            <div id="chapter-view-${chapter.id}" class="chapter-view hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div class="flex items-center gap-2 text-primary font-mono text-sm uppercase tracking-wider mb-2">
                    <i data-lucide="book" class="w-4 h-4"></i>
                    Chapter ${chapter.order}
                     <span id="status-badge-${chapter.id}" class="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-alt border border-border text-xs text-text-muted normal-case tracking-normal opacity-70">
                        <i data-lucide="clock" class="w-3 h-3"></i>
                        Pending
                    </span>
                </div>
                <h2 class="text-2xl font-bold text-text mb-6 pb-4 border-b border-border/50">${chapter.title}</h2>
                <div id="content-${chapter.id}" class="chapter-prose prose prose-invert max-w-none text-text leading-relaxed" data-raw=""></div>
            </div>
        `;
    }

    private setupSidebarListeners() {
        document.querySelectorAll('.sidebar-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const chapterId = (btn as HTMLElement).dataset.chapterId;
                if (chapterId) this.switchChapter(chapterId);
            });
        });
    }

    private switchChapter(chapterId: string) {
        // Update Sidebar Active State
        document.querySelectorAll('.sidebar-item').forEach(el => {
            el.classList.remove('bg-surface', 'text-text', 'shadow-sm');
            el.classList.add('text-text-muted');
        });
        const activeItem = document.getElementById(`sidebar-item-${chapterId}`);
        if (activeItem) {
            activeItem.classList.remove('text-text-muted');
            activeItem.classList.add('bg-surface', 'text-text', 'shadow-sm');
        }

        // Show Content (handles both Editor and Generation views)
        document.querySelectorAll('.chapter-view, .chapter-edit-view').forEach(el => el.classList.add('hidden'));

        const content = document.getElementById(`chapter-view-${chapterId}`);
        if (content) content.classList.remove('hidden');

        // Initial scroll to the editable card if in editor mode
        const editContent = document.getElementById(`chapter-edit-${chapterId}`);
        if (editContent) {
            editContent.classList.remove('hidden');
            editContent.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Scroll main container to top
        const scrollContainer = document.getElementById('scroll-container');
        if (scrollContainer) {
            scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }


        this.activeChapterId = chapterId;
    }

    private renderChapterCard(chapter: Chapter) {
        // Status indicators
        const statusColors = {
            pending: 'border-border bg-surface/50',
            generating: 'border-blue-500/50 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]',
            completed: 'border-success/50 bg-success/5',
            failed: 'border-error/50 bg-error/5'
        };

        return `
            <div id="card-${chapter.id}" class="group relative border rounded-xl p-5 transition-all duration-300 ${statusColors[chapter.status]}">
                <div class="flex items-start justify-between gap-4">
                    <div class="flex-1">
                        <div class="flex items-center gap-3 mb-1">
                            <span class="flex items-center gap-1.5 text-xs font-mono text-text-muted/70 uppercase tracking-wider">
                                <i data-lucide="book" class="w-3 h-3"></i>
                                Chapter ${chapter.order}
                            </span>
                            <span id="status-${chapter.id}" class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-surface-alt border border-border uppercase tracking-wide opacity-70">
                                <i data-lucide="clock" class="w-3 h-3"></i>
                                ${chapter.status}
                            </span>
                        </div>
                        <h3 class="text-lg font-semibold text-text group-hover:text-primary transition-colors">${chapter.title || 'Untitled'}</h3>
                        <p class="text-sm text-text-muted mt-1 leading-relaxed">${chapter.description || ''}</p>
                    </div>
                    <button class="chapter-toggle p-1.5 text-text-muted hover:text-text rounded-lg hover:bg-surface-hover transition-all cursor-pointer" data-target="content-${chapter.id}" aria-label="Toggle chapter content" aria-expanded="false">
                        <i data-lucide="chevron-down" class="w-5 h-5 transition-transform duration-200"></i>
                    </button>
                </div>
                
                <!-- Content area (hidden/collapsed by default) -->
                <div id="content-${chapter.id}" class="chapter-content hidden mt-4 pt-4 border-t border-border/50" data-raw="">
                    <!-- Streamed content goes here -->
                </div>
            </div>
        `;
    }

    updateChapterStatus(chapterId: string, status: Chapter['status']) {
        const item = document.getElementById(`sidebar-item-${chapterId}`);
        const iconContainer = document.getElementById(`status-icon-${chapterId}`);
        const badge = document.getElementById(`status-badge-${chapterId}`);

        if (item && iconContainer) {
            let iconName = 'circle';
            let iconClass = 'text-text-muted/30';

            if (status === 'generating') {
                iconName = 'loader-2';
                iconClass = 'text-blue-500 animate-spin';
                this.switchChapter(chapterId); // Auto-switch to generating chapter
            } else if (status === 'completed') {
                iconName = 'check-circle-2';
                iconClass = 'text-success';

                // Render markdown
                const contentArea = document.getElementById(`content-${chapterId}`);
                if (contentArea) {
                    const rawMd = contentArea.getAttribute('data-raw') || contentArea.textContent || '';
                    try {
                        // Use async parsing for Mermaid
                        (async () => {
                            const html = await marked.parse(rawMd, { async: true });
                            contentArea.innerHTML = html;
                            // Re-render icons for new content
                            renderIcons(contentArea);
                        })();
                    } catch (e) {
                        console.warn('Markdown parse error:', e);
                    }
                }
            } else if (status === 'failed') {
                iconName = 'alert-circle';
                iconClass = 'text-red-500';

                // Add retry button in content area
                const contentArea = document.getElementById(`content-${chapterId}`);
                if (contentArea && !contentArea.querySelector('.btn-retry')) {
                    contentArea.innerHTML += `
                        <div class="mt-4 p-4 border border-red-500/20 bg-red-500/5 rounded-lg flex items-center gap-3">
                            <i data-lucide="alert-triangle" class="w-5 h-5 text-red-500"></i>
                            <span class="text-sm text-red-500 flex-1">Generation failed.</span>
                            <button class="btn-retry px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded hover:bg-red-600 transition-colors"
                                onclick="this.closest('div').remove(); document.dispatchEvent(new CustomEvent('course:retry', { detail: { chapterId: '${chapterId}', courseId: '${this.currentCourseId}' } }))">
                                Retry
                            </button>
                        </div>
                     `;
                    renderIcons(contentArea);
                }
            } else {
                iconName = 'circle';
                iconClass = 'text-text-muted/30';
            }

            // Update Icon
            iconContainer.innerHTML = `<i data-lucide="${iconName}" class="w-3.5 h-3.5 ${status === 'generating' ? 'animate-spin' : ''}"></i>`;
            iconContainer.className = `shrink-0 w-5 h-5 flex items-center justify-center rounded-md bg-surface border border-border ${iconClass}`;

            renderIcons(iconContainer);
        }

        // Update Badge
        if (badge) {
            if (status === 'generating') {
                badge.className = 'ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-xs normal-case tracking-normal';
                badge.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Generating...`;
            } else if (status === 'completed') {
                badge.className = 'ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-xs normal-case tracking-normal';
                badge.innerHTML = `<i data-lucide="check-circle-2" class="w-3 h-3"></i> Completed`;
            } else if (status === 'failed') {
                badge.className = 'ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-xs normal-case tracking-normal';
                badge.innerHTML = `<i data-lucide="alert-circle" class="w-3 h-3"></i> Failed`;
            }
            renderIcons(badge);
        }
    }

    appendChapterContent(chapterId: string, text: string) {
        const contentArea = document.getElementById(`content-${chapterId}`);
        if (contentArea) {
            // Accumulate raw markdown in data attribute
            const existing = contentArea.getAttribute('data-raw') || '';
            contentArea.setAttribute('data-raw', existing + text);

            // Also show raw text as preview while streaming
            const span = document.createElement('span');
            span.textContent = text;
            contentArea.appendChild(span);
        }
    }

    showThinking(message: string) {
        this.thinkingPanel.classList.remove('hidden');

        // Determine status type based on message content
        const lowerMsg = message.toLowerCase();
        const isError = lowerMsg.includes('error') || lowerMsg.includes('fail') || lowerMsg.includes('failed');

        // Styles
        const bgClass = isError
            ? 'bg-red-500/5 border-red-500/20 text-red-500'
            : 'bg-green-500/5 border-green-500/20 text-green-600';

        const iconName = isError ? 'alert-circle' : 'loader-2';
        const iconAnim = (isError || message.includes('Completed')) ? '' : 'animate-spin';
        const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        this.thinkingPanel.innerHTML = `
            <div class="animate-in slide-in-from-bottom-2 fade-in duration-300">
                <div class="p-3 border rounded-xl text-xs ${bgClass} shadow-sm">
                    <div class="flex items-center gap-2 mb-1.5 opacity-70">
                         <i data-lucide="${iconName}" class="w-3 h-3 ${iconAnim}"></i>
                         <span class="font-mono text-[10px] uppercase tracking-wider">${timestamp}</span>
                    </div>
                    <p class="leading-relaxed font-medium">${message}</p>
                </div>
            </div>
        `;

        renderIcons(this.thinkingPanel);
    }

    updateGlobalStatus(message: string, type: 'info' | 'success' | 'error' = 'info') {
        const btn = document.querySelector('#course-form button[type="submit"]') as HTMLButtonElement;
        if (btn && !btn.disabled) {
            this.showThinking(`[SYSTEM] ${message}`);
        } else if (btn) {
            btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin mr-2"></i> ${message}`;
            renderIcons(btn);
        }
    }

    showCompletionActions(courseId: string) {
        // Render in the dedicated completion area in sidebar
        const area = document.getElementById('completion-area');
        if (area) {
            // Hide thinking panel
            this.thinkingPanel.classList.add('hidden');

            area.classList.remove('hidden');
            area.innerHTML = `
                <div class="p-4 text-center bg-surface border border-border rounded-xl animate-in fade-in slide-in-from-bottom-2">
                     <div class="w-10 h-10 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-2">
                        <i data-lucide="check" class="w-5 h-5"></i>
                     </div>
                     <h3 class="text-sm font-bold mb-1">Course Completed!</h3>
                     <p class="text-xs text-text-muted mb-4">All chapters generated.</p>
                     
                     <div class="flex flex-col gap-2">
                        <button id="btn-download-default" 
                            class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition-all active:scale-[0.97]">
                            <i data-lucide="file-text" class="w-4 h-4"></i>
                            Download DOCX
                        </button>
                        <button id="btn-download-tm" 
                             class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-all active:scale-[0.97]">
                            <i data-lucide="file-badge" class="w-4 h-4"></i>
                            Download TM DOCX
                        </button>
                        <button id="btn-start-new"
                            class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-text bg-surface hover:bg-surface-hover border border-border rounded-lg transition-all">
                            Start New
                        </button>
                     </div>
                </div>
            `;
            renderIcons(area);

            document.getElementById('btn-download-default')?.addEventListener('click', () => {
                window.open(`/api/export-pandoc/${courseId}`, '_blank');
            });
            document.getElementById('btn-download-tm')?.addEventListener('click', () => {
                window.open(`/api/export-pandoc/${courseId}?style=thomasmore`, '_blank');
            });
            document.getElementById('btn-start-new')?.addEventListener('click', () => {
                window.location.reload();
            });
        }
    }



}

