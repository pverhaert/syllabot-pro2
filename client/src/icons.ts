import {
    createIcons,
    GraduationCap,
    History,
    Settings2,
    ChevronDown,
    RotateCcw,
    Wand2,
    Sun,
    Moon,
    Play,
    X,
    Book,
    Clock,
    Loader2,
    CheckCircle2,
    AlertCircle,
    RefreshCw,
    FileDown,
    Trash2,
    ArrowUp,
    Search,
    Info,
    AlertTriangle,
    Check,
    FileText,
    FileBadge,
    Download,
    FileCode,
    Globe,
    LayoutTemplate,
    ExternalLink,
    Zap,
    BookOpen
    // @ts-ignore
} from 'lucide/dist/cjs/lucide.js';

// Define the icon set we use
const icons = {
    GraduationCap,
    History,
    Settings2,
    ChevronDown,
    RotateCcw,
    Wand2,
    Sun,
    Moon,
    Play,
    X,
    Book,
    Clock,
    Loader2,
    CheckCircle2,
    AlertCircle,
    RefreshCw,
    FileDown,
    Trash2,
    ArrowUp,
    Search,
    Info,
    AlertTriangle,
    Check,
    FileText,
    FileBadge,
    Download,
    FileCode,
    Globe,
    LayoutTemplate,
    ExternalLink,
    Zap,
    BookOpen
};

/**
 * Renders Lucide icons in the DOM.
 * @param root Optional element to search within. Defaults to document.
 */
export function renderIcons(root?: HTMLElement) {
    createIcons({
        icons,
        root,
        nameAttr: 'data-lucide',
        attrs: {
            class: "lucide" // optional, adds a class to SVGs
        }
    });
}
