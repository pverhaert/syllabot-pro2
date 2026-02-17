import './styles.css';
import { getSocket } from './utils/socket';
import { UI } from './ui';

import { renderIcons } from './icons';

// ── Types ──
interface ModelEntry {
    id: string;
    name: string;
    default?: boolean;
}

interface StyleEntry {
    id: string;
    name: string;
    description: string;
}

interface AppConfig {
    models: {
        gemini: ModelEntry[];
        openrouter: ModelEntry[];
        groq: ModelEntry[];
        cerebras?: ModelEntry[];
    };
    styles: StyleEntry[];
    defaults: {
        language: string;
        minChapters: number;
        wordsPerChapter: number;
        exercisesPerChapter: number;
        quizQuestionsPerChapter: number;
        writingStyle: string;
        writingStyles?: StyleEntry[]; // Added for convenience
        demoMode: boolean;
        demoModeChapters: number;
    };
    hasTavilyKey?: boolean;
}

// ── DOM Elements ──
const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const languageSelect = $('#language') as HTMLSelectElement;
const styleSelect = $('#style') as HTMLSelectElement;
const modelSelect = $('#model') as HTMLSelectElement;
const demoToggle = $('#demo-mode') as HTMLButtonElement;
const searchToggle = $('#enable-search') as HTMLInputElement;
const mermaidToggle = $('#mermaid-mode') as HTMLButtonElement;
const courseForm = $('#course-form') as HTMLFormElement;
const btnHistory = $('#btn-history') as HTMLButtonElement;
const btnCloseHistory = $('#btn-close-history') as HTMLButtonElement;
const historyDrawer = $('#history-drawer') as HTMLElement;
const historyOverlay = $('#history-overlay') as HTMLElement;
const btnTheme = $('#btn-theme') as HTMLButtonElement;
const styleExplanationContainer = $('#style-explanation-container');
const styleNameLabel = $('#style-name-label');
const styleExplanationText = $('#style-explanation-text');
const toggleExplanationContainer = $('#toggle-explanation-container');
const mermaidExplanationRow = $('#mermaid-explanation-row');
const demoExplanationRow = $('#demo-explanation-row');
const searchExplanationRow = $('#search-explanation-row');

// ── Shared Helpers ──
const updateToggleExplanations = () => {
    const isMermaid = mermaidToggle.dataset.active === 'true';
    const isDemo = demoToggle.dataset.active === 'true';
    const isSearch = searchToggle && searchToggle.checked && !searchToggle.closest('div')?.classList.contains('hidden');

    if (isMermaid) mermaidExplanationRow.classList.remove('hidden');
    else mermaidExplanationRow.classList.add('hidden');

    if (isDemo) demoExplanationRow.classList.remove('hidden');
    else demoExplanationRow.classList.add('hidden');

    if (isSearch && searchExplanationRow) searchExplanationRow.classList.remove('hidden');
    else if (searchExplanationRow) searchExplanationRow.classList.add('hidden');

    if (isMermaid || isDemo || isSearch) {
        toggleExplanationContainer.classList.remove('hidden');
        renderIcons(toggleExplanationContainer); // Render new icons if dynamic
    } else {
        toggleExplanationContainer.classList.add('hidden');
    }
};

// ── Instances ──
const ui = new UI();
let appConfig: AppConfig | null = null;

// ── Initialize ──
async function init() {
    // Initialize icons
    renderIcons();

    // Load config from server
    try {
        const res = await fetch('/api/config');
        appConfig = await res.json();
        if (appConfig) populateForm(appConfig);

        // Load settings from local storage after population
        loadSettings();

        // Setup persistence
        setupSettingsPersistence();

        // Setup reset buttons
        setupResetButtons();

    } catch (err) {
        console.error('Failed to load config:', err);
    }

    // Connect Socket.IO
    const socket = getSocket();

    // Socket Events
    socket.on('progress:update', (data) => {
        console.log('[Socket] Progress:', data);
        if (data.step === 'chapter') {
            ui.updateChapterStatus(data.chapterId, data.status);
        } else if (data.step === 'outline') {
            ui.updateGlobalStatus(data.status === 'completed' ? 'Outline Ready!' : `Generating Outline... (${data.status})`);
            if (data.message) ui.showThinking(data.message);
        }
    });

    socket.on('agent:thinking', (data) => {
        console.log('[Socket] Thinking:', data);
        ui.showThinking(`[${data.agent || 'System'}] ${data.message}`);
    });

    socket.on('stream:chunk', (data) => {
        // data = { chapterId, chunk }
        ui.appendChapterContent(data.chapterId, data.chunk);
    });

    socket.on('chapter:completed', (data) => {
        ui.updateChapterStatus(data.chapter.id, 'completed');
    });

    socket.on('outline:ready', (data) => {
        console.log('Outline ready!', data);
        const btn = courseForm.querySelector('button[type="submit"]') as HTMLButtonElement;
        btn.disabled = false;
        btn.innerHTML = `
            <i data-lucide="wand-2" class="w-4 h-4"></i>
            Generate Course
        `;
        renderIcons();

        ui.showOutline(data.outline, data.courseId, data.courseName);
    });

    // Helper to generate a single chapter
    const generateChapter = async (courseId: string, chapterId: string) => {
        ui.updateChapterStatus(chapterId, 'generating');

        try {
            const res = await fetch('/api/chapter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    socketId: socket.id,
                    courseId,
                    chapterId
                })
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.error);

            // Wait for completion or error
            await new Promise<void>((resolve, reject) => {
                const successHandler = (data: any) => {
                    if (data.chapter.id === chapterId) {
                        cleanup();
                        resolve();
                    }
                };
                const errorHandler = (data: any) => {
                    if (data.chapterId === chapterId) {
                        cleanup();
                        reject(new Error(data.message));
                    }
                };
                const cleanup = () => {
                    socket.off('chapter:completed', successHandler);
                    socket.off('error', errorHandler);
                };

                socket.on('chapter:completed', successHandler);
                socket.on('error', errorHandler);
            });

        } catch (error) {
            console.error(`Chapter ${chapterId} generation failed:`, error);
            ui.updateChapterStatus(chapterId, 'failed');
            throw error; // Re-throw to handle in caller
        }
    };

    // Handle course start (triggered from UI)
    document.addEventListener('course:start', async (e: any) => {
        const { courseId, outline } = e.detail;

        // 1. Switch UI to generation mode
        ui.startGenerationMode(outline);

        // 2. Save the updated outline to the server
        try {
            await fetch(`/api/course/${courseId}/outline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ outline })
            });
            console.log('Outline updated on server.');
        } catch (err) {
            console.error('Failed to update outline:', err);
            ui.updateGlobalStatus('Error saving outline!', 'error');
            return;
        }

        const isDemoMode = demoToggle.dataset.active === 'true';
        const demoLimit = appConfig?.defaults.demoModeChapters || 3;
        const chaptersToGenerate = isDemoMode ? outline.chapters.slice(0, demoLimit) : outline.chapters;
        console.log(`Starting generation for: ${courseId} (${isDemoMode ? `DEMO — ${demoLimit} chapters` : `full — ${chaptersToGenerate.length} chapters`})`);

        // Iterate chapters and trigger generation
        for (const chapter of chaptersToGenerate) {
            try {
                await generateChapter(courseId, chapter.id);
            } catch (error) {
                // Continue to next chapter even if one fails
                console.warn('Continuing to next chapter...');
            }
        }

        // All chapters done — save markdown history
        try {
            await fetch('/api/save-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId })
            });
            console.log('Markdown history saved.');
        } catch (err) {
            console.error('Failed to save markdown history:', err);
        }

        // Show completion actions with DOCX download
        ui.showCompletionActions(courseId);
    });

    // Handle single chapter retry
    document.addEventListener('course:retry', async (e: any) => {
        const { chapterId, courseId } = e.detail;
        if (!courseId || !chapterId) return;

        console.log(`Retrying chapter: ${chapterId}`);
        try {
            await generateChapter(courseId, chapterId);

            // Note: global history save is triggered by orchestrator per chapter now, 
            // so we don't strictly need to call /api/save-history here, but it doesn't hurt.
        } catch (error) {
            // UI update handled in generateChapter
        }
    });

    // Event listeners
    setupEventListeners();

    // Theme
    initTheme();
}

// ── Populate form from server config ──
function populateForm(config: AppConfig) {
    // Languages
    const languages = [
        'English', 'Dutch', 'French', 'German', 'Spanish', 'Italian',
        'Portuguese', 'Chinese', 'Japanese', 'Korean', 'Arabic', 'Russian',
        'Hindi', 'Turkish', 'Polish', 'Swedish', 'Norwegian', 'Danish',
        'Finnish', 'Czech',
    ];
    languageSelect.innerHTML = languages
        .map((lang) => `<option value="${lang}" ${lang === config.defaults.language ? 'selected' : ''}>${lang}</option>`)
        .join('');

    // Writing styles
    styleSelect.innerHTML = config.styles
        .map((s) => `<option value="${s.id}" ${s.id === config.defaults.writingStyle ? 'selected' : ''} title="${s.description}">${s.name}</option>`)
        .join('');

    // Models (grouped by provider)
    let modelOptions = '';
    
    if (config.models.gemini && config.models.gemini.length > 0) {
        modelOptions += '<optgroup label="── Gemini ──">';
        for (const m of config.models.gemini) {
            modelOptions += `<option value="gemini:${m.id}" ${m.default ? 'selected' : ''}>${m.name}</option>`;
        }
        modelOptions += '</optgroup>';
    }

    if (config.models.openrouter && config.models.openrouter.length > 0) {
        modelOptions += '<optgroup label="── OpenRouter ──">';
        for (const m of config.models.openrouter) {
            modelOptions += `<option value="openrouter:${m.id}">${m.name}</option>`;
        }
        modelOptions += '</optgroup>';
    }

    if (config.models.groq && config.models.groq.length > 0) {
        modelOptions += '<optgroup label="── Groq ──">';
        for (const m of config.models.groq) {
            modelOptions += `<option value="groq:${m.id}">${m.name}</option>`;
        }
        modelOptions += '</optgroup>';
    }

    if (config.models.cerebras && config.models.cerebras.length > 0) {
        modelOptions += '<optgroup label="── Cerebras ──">';
        for (const m of config.models.cerebras) {
            modelOptions += `<option value="cerebras:${m.id}">${m.name}</option>`;
        }
        modelOptions += '</optgroup>';
    }
    
    if (modelOptions === '') {
        modelOptions = '<option value="" disabled selected>No models available. Check API keys.</option>';
    }
    
    modelSelect.innerHTML = modelOptions;

    // Search Grounding Visibility Logic
    const updateSearchGrounding = () => {
        const selectedModel = modelSelect.value.toLowerCase();
        const searchContainer = document.getElementById('search-grounding-container');
        const tavilyContainer = document.getElementById('tavily-search-container');

        // Reset validities
        if (searchContainer) searchContainer.classList.add('hidden');
        if (tavilyContainer) tavilyContainer.classList.add('hidden');

        if (selectedModel.includes('gemini')) {
            // Native Gemini Search
            searchContainer?.classList.remove('hidden');
            // Uncheck Tavily if it was checked to avoid confusion (though server handles precedence)
            if (searchToggle) searchToggle.checked = false;
        } else {
            // Non-Gemini: Show Tavily Toggle IF server has key
            if (config.hasTavilyKey) {
                tavilyContainer?.classList.remove('hidden');
            }
            // Uncheck Gemini search
            const geminiSearch = document.getElementById('search-grounding') as HTMLInputElement;
            if (geminiSearch) geminiSearch.checked = false;
        }

        // Update explanations in case search was toggled off/hidden
        updateToggleExplanations();
    };

    modelSelect.addEventListener('change', updateSearchGrounding);
    // Initial check
    setTimeout(updateSearchGrounding, 100);

    // Defaults
    const setVal = (id: string, val: any) => {
        const el = document.getElementById(id) as HTMLInputElement;
        if (el) {
            el.value = String(val);
            // Default attribute is used for reset logic
            // We set it here if it's dynamic, else HTML default is used
            // But since HTML is static, we might want to override data-default if config provides it
            // However, config defaults match HTML defaults mostly.
        }
    };

    setVal('min-chapters', config.defaults.minChapters);
    setVal('words-per-chapter', config.defaults.wordsPerChapter);
    setVal('exercises', config.defaults.exercisesPerChapter);
    setVal('quiz-questions', config.defaults.quizQuestionsPerChapter);

    // Initial style explanation
    const updateStyleExplanation = () => {
        const selectedId = styleSelect.value;
        const style = config.styles.find(s => s.id === selectedId);
        if (style && style.description) {
            if (styleNameLabel) styleNameLabel.innerText = `${style.name}:`;
            if (styleExplanationText) styleExplanationText.innerText = ` ${style.description}`;
            styleExplanationContainer.classList.remove('hidden');
        } else {
            styleExplanationContainer.classList.add('hidden');
        }
    };

    styleSelect.addEventListener('change', updateStyleExplanation);
    updateStyleExplanation();

    // Set demo chapters count in explanation text
    const demoCountEl = document.getElementById('demo-chapters-count');
    if (demoCountEl) {
        demoCountEl.innerText = String(config.defaults.demoModeChapters || 3);
    }
}

// ── Local Storage & Reset ──

function loadSettings() {
    try {
        const saved = localStorage.getItem('syllabot_settings');
        if (saved) {
            const data = JSON.parse(saved);
            for (const [id, val] of Object.entries(data)) {
                // skip if value is empty/null unless it's intended
                if (val === undefined || val === null) continue;

                // Handle Buttons (Toggles)
                if (id === 'demo-mode' || id === 'mermaid-mode') {
                    const btn = document.getElementById(id) as HTMLButtonElement;
                    if (btn) {
                        const isActive = val === true;
                        btn.dataset.active = String(isActive);
                        btn.setAttribute('aria-checked', String(isActive));
                        const knob = btn.querySelector('span');
                        if (isActive) {
                            btn.classList.add('bg-primary');
                            btn.classList.remove('bg-surface-hover');
                            if (knob) {
                                knob.classList.add('translate-x-5');
                                knob.classList.remove('translate-x-0');
                            }
                        } else {
                            btn.classList.remove('bg-primary');
                            btn.classList.add('bg-surface-hover');
                            if (knob) {
                                knob.classList.remove('translate-x-5');
                                knob.classList.add('translate-x-0');
                            }
                        }
                    }
                    continue;
                }

                // Handle Checkboxes
                if (id === 'enable-search' || id === 'search-grounding') {
                    const el = document.getElementById(id) as HTMLInputElement;
                    if (el) {
                        el.checked = val === true;
                        el.dispatchEvent(new Event('change'));
                    }
                    continue;
                }

                const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
                if (el) {
                    el.value = String(val);
                    // Trigger change event to update any dependent UI (like style explanations)
                    el.dispatchEvent(new Event('change'));
                }
            }
        }
    } catch (e) {
        console.error('Error loading settings:', e);
    }
}

function setupSettingsPersistence() {
    const inputs = [
        'language', 'subject', 'audience', 'style',
        'min-chapters', 'words-per-chapter', 'exercises', 'quiz-questions',
        'topics', 'special-needs', 'model'
    ];

    const save = () => {
        const data: Record<string, any> = {};
        inputs.forEach(id => {
            const el = document.getElementById(id) as HTMLInputElement;
            if (el) data[id] = el.value;
        });

        // Toggles
        const demoBtn = document.getElementById('demo-mode');
        if (demoBtn) data['demo-mode'] = demoBtn.dataset.active === 'true';

        const mermaidBtn = document.getElementById('mermaid-mode');
        if (mermaidBtn) data['mermaid-mode'] = mermaidBtn.dataset.active === 'true';

        const searchCheck = document.getElementById('enable-search') as HTMLInputElement;
        if (searchCheck) data['enable-search'] = searchCheck.checked;

        const geminiSearchCheck = document.getElementById('search-grounding') as HTMLInputElement;
        if (geminiSearchCheck) data['search-grounding'] = geminiSearchCheck.checked;

        localStorage.setItem('syllabot_settings', JSON.stringify(data));
    };

    const debounce = (func: Function, wait: number) => {
        let timeout: any;
        return (...args: any[]) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    };

    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', save);
            el.addEventListener('input', debounce(save, 500));
        }
    });

    // Listeners for toggles
    ['demo-mode', 'mermaid-mode'].forEach(id => {
        const el = document.getElementById(id);
        // Wait for toggle logic to finish (click event handler in setupEventListeners)
        if (el) el.addEventListener('click', () => setTimeout(save, 50));
    });

    ['enable-search', 'search-grounding'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', save);
    });
}

function setupResetButtons() {
    document.querySelectorAll('[data-reset-for]').forEach(btn => {
        const targetId = (btn as HTMLElement).dataset.resetFor;
        if (!targetId) return;

        const input = document.getElementById(targetId) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

        // Visibility toggle function
        const updateVisibility = () => {
            if (input.value && input.value.trim().length > 0) {
                btn.classList.remove('opacity-0', 'invisible');
                btn.classList.add('opacity-50', 'hover:opacity-100'); // Ensure hover effect works
            } else {
                btn.classList.add('opacity-0', 'invisible');
                btn.classList.remove('opacity-50', 'hover:opacity-100');
            }
        };

        if (input) {
            // Initial check
            updateVisibility();

            // Listeners
            input.addEventListener('input', updateVisibility);
            input.addEventListener('change', updateVisibility);
        }

        btn.addEventListener('click', () => {
            if (input) {
                const defaultVal = input.dataset.default || input.getAttribute('value') || '';
                input.value = defaultVal;
                // trigger change for persistence
                input.dispatchEvent(new Event('change'));
                input.dispatchEvent(new Event('input')); // visual update if needed
            }
        });
    });
}

// ── Event listeners ──
function setupEventListeners() {
    // Generic toggle handler
    const setupToggle = (btn: HTMLButtonElement) => {
        btn.addEventListener('click', () => {
            const isActive = btn.dataset.active === 'true';
            const newState = !isActive;
            btn.dataset.active = String(newState);
            btn.setAttribute('aria-checked', String(newState));
            const knob = btn.querySelector('span')!;
            if (newState) {
                btn.classList.add('bg-primary');
                btn.classList.remove('bg-surface-hover');
                knob.classList.add('translate-x-5');
                knob.classList.remove('translate-x-0');
            } else {
                btn.classList.remove('bg-primary');
                btn.classList.add('bg-surface-hover');
                knob.classList.remove('translate-x-5');
                knob.classList.add('translate-x-0');
            }
            updateToggleExplanations();
        });
    };

    // Remove the locally defined updateToggleExplanations from here to avoid shadowing/duplication
    // (It was previously here in the code I replaced)

    // Demo mode toggle
    setupToggle(demoToggle);

    // Mermaid diagrams toggle
    setupToggle(mermaidToggle);

    // Search Toggle Listener
    if (searchToggle) {
        searchToggle.addEventListener('change', updateToggleExplanations);
    }

    // Auto-grow Textareas
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(el => {
        const resize = () => {
            el.style.height = 'auto';
            el.style.height = (el.scrollHeight) + 'px';
        };
        el.addEventListener('input', resize);
        // Initial resize
        requestAnimationFrame(resize);
    });

    // Scroll to Top Logic
    const scrollContainer = document.getElementById('scroll-container');
    const scrollBtn = document.getElementById('btn-scroll-top');

    if (scrollContainer && scrollBtn) {
        scrollContainer.addEventListener('scroll', () => {
            if (scrollContainer.scrollTop > 300) {
                scrollBtn.classList.remove('opacity-0', 'invisible', 'translate-y-4');
            } else {
                scrollBtn.classList.add('opacity-0', 'invisible', 'translate-y-4');
            }
        });

        scrollBtn.addEventListener('click', () => {
            scrollContainer.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // Form submit
    courseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = courseForm.querySelector('button[type="submit"]') as HTMLButtonElement;
        const originalText = btn.innerHTML; // Save HTML with icon

        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="animate-spin inline-block mr-2">⟳</span> Generating...';

            const formData = getFormData();
            // Add search grounding if available
            const searchGroundingEl = document.getElementById('search-grounding') as HTMLInputElement;
            if (searchGroundingEl && searchGroundingEl.checked && !document.getElementById('search-grounding-container')?.classList.contains('hidden')) {
                (formData as any).searchGrounding = true;
            }

            // Add Tavily Search (enableSearch)
            if (searchToggle && searchToggle.checked && !searchToggle.closest('div')?.classList.contains('hidden')) {
                (formData as any).enableSearch = true;
            }

            const socket = getSocket();

            ui.showThinking('Initializing outline generation...');
            ui.updateGlobalStatus('Requesting outline...');

            console.log('Sending generation request...', formData);

            const res = await fetch('/api/outline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    socketId: socket.id
                })
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            console.log('Generation started:', data);

        } catch (error: any) {
            console.error('Failed to start generation:', error);
            alert('Failed to start generation: ' + error.message);
            btn.disabled = false;
            btn.innerHTML = originalText;
            renderIcons(btn);
        }
    });

    // History functions
    const fetchHistory = async () => {
        const historyList = document.getElementById('history-list');
        if (historyList) {
            historyList.innerHTML = '<p class="text-sm text-text-muted">Loading...</p>';
            try {
                const res = await fetch('/api/history');
                const courses = await res.json();

                if (!courses || courses.length === 0) {
                    historyList.innerHTML = '<p class="text-sm text-text-muted">No courses generated yet.</p>';
                } else {
                    // Group by date
                    const grouped: Record<string, any[]> = {};
                    courses.forEach((c: any) => {
                        const date = new Date(c.timestamp);
                        // Format: "Thu 12 Feb 2026"
                        const dateKey = date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).replace(/,/g, '');
                        if (!grouped[dateKey]) grouped[dateKey] = [];
                        grouped[dateKey].push(c);
                    });

                    let html = '';
                    for (const [dateKey, items] of Object.entries(grouped)) {
                        html += `
                            <div class="mb-6">
                                <h3 class="sticky top-0 z-10 bg-surface/0 backdrop-blur-md py-2 mb-3 text-xs font-bold text-primary uppercase tracking-wider">
                                    ${dateKey}
                                </h3>
                                <div class="space-y-2">
                                    ${items.map((c: any) => {
                            const time = new Date(c.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                            const name = c.courseName || c.topic || 'Untitled';

                            const downloadBtn = `
                                            <button onclick="window.open('/api/export-docx/${c.id}', '_blank')" title="Download DOCX"
                                                class="shrink-0 p-2.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg border border-primary/20 transition-colors cursor-pointer">
                                                <i data-lucide="file-down" class="w-4 h-4"></i>
                                            </button>
                                        `;

                            const deleteBtn = `
                                            <button data-id="${c.id}" title="Delete Course"
                                                class="btn-delete-course shrink-0 p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg border border-red-500/20 transition-colors cursor-pointer">
                                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                                            </button>
                                        `;

                            const viewLink = c.markdownFile
                                ? `/viewer.html?file=${encodeURIComponent(c.markdownFile)}`
                                : null;

                            const downloadLink = c.markdownFile
                                ? `/history-files/${encodeURIComponent(c.markdownFile)}`
                                : null;

                            return `
                                        <div class="flex items-center gap-2 group/row relative">
                                            ${viewLink ? `
                                            <a href="${viewLink}" target="_blank"
                                                class="flex-1 block p-3 bg-surface/60 rounded-lg border border-border hover:border-primary/40 transition-colors cursor-pointer no-underline group/item">
                                                <p class="font-medium text-sm text-text group-hover/item:text-primary transition-colors">${name}</p>
                                                <p class="text-xs text-text-muted mt-1 opacity-70">${c.topic} · ${time}</p>
                                            </a>
                                            ` : `
                                            <div class="flex-1 p-3 bg-surface/60 rounded-lg border border-border opacity-60 flex items-center justify-between">
                                                <div>
                                                    <p class="font-medium text-sm text-text">${name}</p>
                                                    <p class="text-xs text-text-muted mt-1 opacity-70">${c.topic} · ${time} · <em>no .md file</em></p>
                                                </div>
                                                <button data-id="${c.id}"
                                                    title="Regenerate Markdown from Data"
                                                    class="btn-regenerate-course p-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors cursor-pointer">
                                                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
                                                </button>
                                            </div>
                                            `}
                                            
                                            <!-- Dropdown Container -->
                                            <div class="relative">
                                                <button onclick="document.getElementById('dd-${c.id}').classList.toggle('hidden'); setTimeout(() => { const close = (e) => { if(!document.getElementById('dd-${c.id}').contains(e.target) && e.target !== this) { document.getElementById('dd-${c.id}').classList.add('hidden'); document.removeEventListener('click', close); } }; document.addEventListener('click', close); }, 0);"
                                                    class="p-2.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg border border-primary/20 transition-colors cursor-pointer flex items-center gap-1"
                                                    title="Download Options">
                                                    <i data-lucide="download" class="w-4 h-4"></i>
                                                    <i data-lucide="chevron-down" class="w-3 h-3"></i>
                                                </button>

                                                <!-- Dropdown Menu -->
                                                <div id="dd-${c.id}" class="hidden absolute right-0 mt-2 w-48 bg-surface border border-border rounded-lg shadow-xl z-50 flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                    ${downloadLink ? `
                                                    <a href="${downloadLink}" target="_blank" download class="block w-full text-left px-4 py-2.5 text-sm text-text hover:bg-surface-hover hover:text-primary flex items-center gap-2 transition-colors">
                                                        <i data-lucide="file-code" class="w-4 h-4 opacity-70"></i> Markdown (Raw)
                                                    </a>
                                                    ` : ''}
                                                    <button onclick="window.open('/api/export-pandoc/${c.id}', '_blank')" class="w-full text-left px-4 py-2.5 text-sm text-text hover:bg-surface-hover hover:text-blue-500 flex items-center gap-2 transition-colors">
                                                        <i data-lucide="file-text" class="w-4 h-4 opacity-70"></i> DOCX (Default)
                                                    </button>
                                                    <button onclick="window.open('/api/export-pandoc/${c.id}?style=thomasmore', '_blank')" class="w-full text-left px-4 py-2.5 text-sm text-text hover:bg-surface-hover hover:text-teal-500 flex items-center gap-2 transition-colors">
                                                        <i data-lucide="file-badge" class="w-4 h-4 opacity-70"></i> DOCX (Thomas More)
                                                    </button>
                                                </div>
                                            </div>

                                            ${deleteBtn}
                                        </div>
                                        `;
                        }).join('')}
                                </div>
                            </div>
                        `;
                    }

                    historyList.innerHTML = html;

                    // Render icons in dynamically inserted history entries
                    renderIcons(historyList);
                }
            } catch (err) {
                historyList.innerHTML = '<p class="text-sm text-red-400">Failed to load history.</p>';
                console.error(err);
            }
        }
    };

    // History drawer
    btnHistory.addEventListener('click', async () => {
        historyDrawer.classList.remove('translate-x-full');
        historyOverlay.classList.remove('hidden');
        await fetchHistory();
    });

    // Delete Modal Logic
    const deleteModal = document.getElementById('delete-modal') as HTMLElement;
    const btnCancelDelete = document.getElementById('btn-cancel-delete') as HTMLButtonElement;
    const btnConfirmDelete = document.getElementById('btn-confirm-delete') as HTMLButtonElement;
    let courseToDelete: string | null = null;

    const closeDeleteModal = () => {
        deleteModal.classList.add('hidden');
        deleteModal.classList.remove('flex');
        courseToDelete = null;
    };

    btnCancelDelete.addEventListener('click', closeDeleteModal);

    // Close on backdrop click
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModal();
    });

    btnConfirmDelete.addEventListener('click', async () => {
        if (courseToDelete) {
            const originalText = btnConfirmDelete.innerText;
            btnConfirmDelete.innerText = 'Deleting...';
            btnConfirmDelete.disabled = true;

            try {
                const res = await fetch(`/api/history/${courseToDelete}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                    closeDeleteModal();
                    await fetchHistory(); // Reload list
                } else {
                    alert('Failed to delete course');
                }
            } catch (err) {
                console.error('Delete error:', err);
                alert('Error deleting course');
            } finally {
                btnConfirmDelete.innerText = originalText;
                btnConfirmDelete.disabled = false;
            }
        }
    });

    // Delegated listeners (delete & regenerate)
    document.getElementById('history-list')?.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;

        // Delete
        const deleteBtn = target.closest('.btn-delete-course') as HTMLElement;
        if (deleteBtn) {
            e.stopPropagation();
            courseToDelete = deleteBtn.dataset.id || null;
            if (courseToDelete) {
                deleteModal.classList.remove('hidden');
                deleteModal.classList.add('flex');
            }
            return;
        }

        // Regenerate
        const regenBtn = target.closest('.btn-regenerate-course') as HTMLElement;
        if (regenBtn) {
            e.stopPropagation();
            const courseId = regenBtn.dataset.id;
            const originalHtml = regenBtn.innerHTML;
            regenBtn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i>';
            renderIcons(regenBtn); // re-render loader icon

            try {
                const res = await fetch(`/api/history/${courseId}/regenerate`, { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    await fetchHistory();
                } else {
                    alert('Failed to regenerate markdown: ' + data.error);
                    regenBtn.innerHTML = originalHtml;
                }
            } catch (err) {
                console.error(err);
                alert('Error regenerating markdown');
                regenBtn.innerHTML = originalHtml;
            }
        }
    });

    const closeHistory = () => {
        historyDrawer.classList.add('translate-x-full');
        historyOverlay.classList.add('hidden');
    };
    btnCloseHistory.addEventListener('click', closeHistory);
    historyOverlay.addEventListener('click', closeHistory);

    // Theme toggle
    btnTheme.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('syllabot-theme', newTheme);
    });
}

// ── Get form data ──
function getFormData() {
    const [provider, modelId] = (modelSelect.value).split(':');
    return {
        language: languageSelect.value,
        topic: (document.getElementById('subject') as HTMLInputElement).value, // mapped subject -> topic
        audience: (document.getElementById('audience') as HTMLInputElement).value,
        writingStyle: styleSelect.value,
        minChapters: Number((document.getElementById('min-chapters') as HTMLInputElement).value),
        wordsPerChapter: Number((document.getElementById('words-per-chapter') as HTMLInputElement).value),
        exercisesPerChapter: Number((document.getElementById('exercises') as HTMLInputElement).value),
        quizQuestionsPerChapter: Number((document.getElementById('quiz-questions') as HTMLInputElement).value),
        generatedTopics: (document.getElementById('topics') as HTMLTextAreaElement).value, // mapped
        specialNeeds: (document.getElementById('special-needs') as HTMLTextAreaElement).value,
        demoMode: demoToggle.dataset.active === 'true',
        mermaidDiagrams: mermaidToggle.dataset.active === 'true',
        provider,
        modelId,
    };
}

// ── Theme ──
function initTheme() {
    const saved = localStorage.getItem('syllabot-theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        // Default to light
        document.documentElement.setAttribute('data-theme', 'light');
    }
}

// ── Boot ──
init();
