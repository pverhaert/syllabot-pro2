import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getStyles } from '../config/styles.js';
import { getDefaults } from '../config/defaults.js';
import { CourseOrchestrator } from '../pipeline/orchestrator.js';
import { FileStore } from '../utils/file-store.js';
import { generateDocxBuffer } from '../utils/docx-exporter.js';
import { PandocExporter } from '../utils/pandoc-exporter.js';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load JSON models safely
const loadJson = (relativePath: string) => {
    try {
        const filePath = path.join(__dirname, relativePath);
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        console.error(`Failed to load JSON from ${relativePath}`, e);
        return [];
    }
};

const geminiModels = loadJson('../config/gemini-models.json');
const openrouterModels = loadJson('../config/openrouter-models.json');
const groqModels = loadJson('../config/groq-models.json');
const cerebrasModels = loadJson('../config/cerebras-models.json');

const router = Router();

// Config endpoint
router.get('/config', async (_req: Request, res: Response) => {
    try {
        const styles = await getStyles();
        const defaults = getDefaults();

        // Filter models based on API keys
        const models: any = {};

        const isValidKey = (key?: string) => key && key.trim().length > 0 && !key.startsWith('your_');

        if (isValidKey(process.env.GEMINI_API_KEY)) {
            models.gemini = geminiModels;
        }
        if (isValidKey(process.env.OPENROUTER_API_KEY)) {
            models.openrouter = openrouterModels;
        }
        if (isValidKey(process.env.GROQ_API_KEY)) {
            models.groq = groqModels;
        }
        if (isValidKey(process.env.CEREBRAS_API_KEY)) {
            models.cerebras = cerebrasModels;
        }

        res.json({
            models,
            styles,
            defaults,
            hasTavilyKey: isValidKey(process.env.TAVILY_API_KEY)
        });
    } catch (error) {
        console.error('Config error:', error);
        res.status(500).json({ error: 'Failed to load config' });
    }
});

// Start outline generation
router.post('/outline', async (req: Request, res: Response) => {
    try {
        console.log('[API] /outline request received:', req.body);
        const { socketId, searchGrounding, tavilyApiKey, ...config } = req.body;

        // Map searchGrounding to enableSearch in config
        if (searchGrounding) {
            (config as any).enableSearch = true;
        }

        // Use server-side key if available and search is requested (or if we want to force it? No, let's stick to explicit enable)
        // Actually, if TAVILY_API_KEY is present, we allow the client to request search via 'enableSearch' (or 'searchGrounding')
        // regardless of model.
        if (process.env.TAVILY_API_KEY) {
            (config as any).tavilyApiKey = process.env.TAVILY_API_KEY;
        }

        // Fallback: Client provided key (deprecated but keep for backward compat/testing if needed)
        if (tavilyApiKey) {
            (config as any).tavilyApiKey = tavilyApiKey;
            (config as any).enableSearch = true;
        }

        if (!socketId) {
            return res.status(400).json({ error: 'Socket ID is required' });
        }

        const io = req.app.get('io') as Server;
        const socket = io.sockets.sockets.get(socketId);

        if (!socket) {
            return res.status(404).json({ error: 'Socket not found' });
        }

        const orchestrator = new CourseOrchestrator(socket);
        // Fire and forget - progress updates via socket
        orchestrator.startOutlineGeneration(config).catch(err => {
            console.error('Async outline generation error:', err);
        });

        res.json({ success: true, message: 'Outline generation started' });
    } catch (error: any) {
        console.error('Outline error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate chapter
router.post('/chapter', async (req: Request, res: Response) => {
    try {
        const { socketId, courseId, chapterId } = req.body;

        if (!socketId || !courseId || !chapterId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const io = req.app.get('io') as Server;
        const socket = io.sockets.sockets.get(socketId);

        if (!socket) {
            return res.status(404).json({ error: 'Socket not found' });
        }

        const orchestrator = new CourseOrchestrator(socket, courseId);
        orchestrator.generateChapter(chapterId).catch(err => {
            console.error('Async chapter generation error:', err);
        });

        res.json({ success: true, message: 'Chapter generation started' });
    } catch (error: any) {
        console.error('Chapter error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update outline
router.post('/course/:id/outline', async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const { outline } = req.body;

        if (!outline) {
            return res.status(400).json({ error: 'Outline is required' });
        }

        const courseData = await FileStore.loadCourse(id);
        if (!courseData) {
            return res.status(404).json({ error: 'Course not found' });
        }

        courseData.outline = outline;
        await FileStore.saveCourse(id, courseData);

        res.json({ success: true, message: 'Outline updated' });
    } catch (error: any) {
        console.error('Outline update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// History
router.get('/history', async (_req: Request, res: Response) => {
    try {
        const courses = await FileStore.listCourses();
        res.json(courses);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Load specific course
router.get('/history/:id', async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const course = await FileStore.loadCourse(id);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        res.json(course);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete course
router.delete('/history/:id', async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const success = await FileStore.deleteCourse(id);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: 'Failed to delete course' });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Save course as markdown history file
router.post('/save-history', async (req: Request, res: Response) => {
    try {
        const { courseId } = req.body;
        if (!courseId) {
            return res.status(400).json({ error: 'Course ID is required' });
        }

        // Load the course data
        const courseData = await FileStore.loadCourse(courseId);
        if (!courseData || !courseData.outline) {
            return res.status(404).json({ error: 'Course not found or incomplete' });
        }

        const courseName = courseData.courseName || courseData.config?.topic || 'course';

        // Use the courseId (which is the filename stem now, e.g. "20240213_Title") 
        // as the manual filename for markdown to ensure they match.
        // If courseId is a UUID (legacy), FileStore.saveMarkdown will fallback to generating a timestamp,
        // which matches the new behavior of FileStore.saveCourse (generates timestamp).
        // But ideally we want them to match.

        let manualFilename = undefined;
        // Check if courseId looks like a timestamped filename (YYYYMMDD_HHMMSS_...)
        // Simple regex or just check length > 15
        if (courseId.length > 15 && !courseId.includes('-')) {
            manualFilename = courseId;
        }

        const { filePath, filename } = await FileStore.saveMarkdown(courseName, courseData.outline, undefined, manualFilename);

        // Store the markdown filename back in the JSON for history listing
        courseData.markdownFile = filename;
        await FileStore.saveCourse(courseId, courseData);

        res.json({ success: true, message: 'Markdown history saved', filename });
    } catch (error: any) {
        console.error('Save history error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Regenerate markdown for a course
router.post('/history/:id/regenerate', async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        console.log(`[API] /history/${id}/regenerate request received`);

        // Load course
        const courseData = await FileStore.loadCourse(id);
        if (!courseData) {
            console.error(`[API] Course not found for ID: ${id}`);
            return res.status(404).json({ error: 'Course not found' });
        }
        if (!courseData.outline) {
            console.error(`[API] Course found but outline is missing for ID: ${id}`);
            return res.status(404).json({ error: 'Course outline not found' });
        }

        const courseName = courseData.courseName || courseData.config?.topic || 'course';

        // Generate new markdown file
        // We pass the original creation time if available to try to preserve the timeline, 
        // OR we can just generate a new one. User probably wants a fresh file if they click regenerate.
        // Let's generate a NEW timestamp to avoid overwriting strict history if we want to keep it,
        // BUT the user request implies "fixing" the current state.
        // If we use the original timestamp, we might overwrite the existing file if it exists. 
        // If it doesn't exist, we restore it.

        // Let's use a new timestamp to be safe and ensure it shows up as "latest".
        // Use the ID as the manual filename to keep it synced
        const { filename } = await FileStore.saveMarkdown(courseName, courseData.outline, undefined, id);

        // Update course record
        courseData.markdownFile = filename;
        await FileStore.saveCourse(id, courseData);

        res.json({ success: true, filename });
    } catch (error: any) {
        console.error('Regenerate error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Export course via Pandoc
router.get('/export-pandoc/:courseId', async (req, res) => {
    try {
        const { style } = req.query;
        let templateName: string | undefined;

        if (style === 'thomasmore') {
            templateName = 'ThomasMore.docx';
        }

        const { filePath, filename } = await PandocExporter.exportToDocx(req.params.courseId, templateName);
        res.download(filePath, filename);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Export course as DOCX
router.get('/export-docx/:id', async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const courseData = await FileStore.loadCourse(id);
        if (!courseData || !courseData.outline) {
            return res.status(404).json({ error: 'Course not found or has no outline' });
        }

        const courseName = courseData.courseName || courseData.config?.topic || 'course';
        const buffer = await generateDocxBuffer(courseData.outline, courseName);

        // Sanitize filename
        const safeFilename = courseName
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 60);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.docx"`);
        res.send(buffer);
    } catch (error: any) {
        console.error('DOCX export error:', error);
        res.status(500).json({ error: error.message });
    }
});

export { router as apiRouter };
