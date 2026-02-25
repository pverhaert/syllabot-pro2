import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../../data'); // root/data
const COURSES_DIR = path.join(DATA_DIR, 'courses');
const HISTORY_DIR = path.join(DATA_DIR, 'history');

// Ensure directories exist
[DATA_DIR, COURSES_DIR, HISTORY_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Helper to format timestamp YYYYMMDD_HHMMSS
const formatTimestamp = (date: Date | string) => {
    // If it's already in the target format YYYYMMDD_HHMMSS, return it as is
    if (typeof date === 'string' && /^\d{8}_\d{6}$/.test(date)) {
        return date;
    }

    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear().toString()
        + String(d.getMonth() + 1).padStart(2, '0')
        + String(d.getDate()).padStart(2, '0')
        + '_'
        + String(d.getHours()).padStart(2, '0')
        + String(d.getMinutes()).padStart(2, '0')
        + String(d.getSeconds()).padStart(2, '0');
};

export const FileStore = {
    async migrate() {
        try {
            const files = await fs.promises.readdir(DATA_DIR);
            for (const file of files) {
                // Move JSON files from root data to courses dir
                if (file.endsWith('.json')) {
                    const oldPath = path.join(DATA_DIR, file);
                    const newPath = path.join(COURSES_DIR, file);
                    // Check if it's a file
                    const stat = await fs.promises.stat(oldPath);
                    if (stat.isFile()) {
                        await fs.promises.rename(oldPath, newPath);
                        console.log(`[FileStore] Migrated ${file} to courses/`);
                    }
                }
            }
        } catch (e) {
            console.error('[FileStore] Migration error:', e);
        }
    },

    async saveCourse(courseId: string, data: any) {
        // Ensure directory exists
        if (!fs.existsSync(COURSES_DIR)) {
            try {
                fs.mkdirSync(COURSES_DIR, { recursive: true });
            } catch (e) {
                // Ignore if created in parallel
            }
        }

        // 1. Ensure created timestamp exists/persists
        if (!data.createdAt) {
            data.createdAt = new Date().toISOString();
        }
        if (!data.id) {
            data.id = courseId;
        }

        const tsString = formatTimestamp(data.createdAt);
        // Fallback if timestamp invalid, use current
        const filePrefix = tsString || formatTimestamp(new Date())!;

        const safeName = (data.courseName || data.config?.topic || 'Untitled')
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 60);

        const targetFilename = `${filePrefix}_${safeName}.json`;
        const targetFilePath = path.join(COURSES_DIR, targetFilename);

        // 2. Find existing file to handle renaming
        // We look for a file that matches the timestamp prefix OR the legacy UUID
        let existingFilePath: string | null = null;

        try {
            const files = await fs.promises.readdir(COURSES_DIR);
            // Search order:
            // 1. Exact match (fastest)
            // 2. Same timestamp prefix (rename case)
            // 3. Legacy UUID in filename (migration case)

            if (files.includes(targetFilename)) {
                existingFilePath = path.join(COURSES_DIR, targetFilename);
            } else {
                const sameTimestampFile = files.find(f => f.startsWith(`${filePrefix}_`) && f.endsWith('.json'));
                if (sameTimestampFile) {
                    existingFilePath = path.join(COURSES_DIR, sameTimestampFile);
                } else {
                    const legacyFile = files.find(f => f.includes(courseId) && f.endsWith('.json'));
                    if (legacyFile) {
                        existingFilePath = path.join(COURSES_DIR, legacyFile);
                    }
                }
            }
        } catch (e) {
            // ignore readdir error
        }

        // 3. Rename/Delete old file if it differs from target
        if (existingFilePath && path.basename(existingFilePath) !== targetFilename) {
            try {
                await fs.promises.unlink(existingFilePath);
                console.log(`[FileStore] Removed old file: ${path.basename(existingFilePath)}`);
            } catch (e) {
                console.error('[FileStore] Failed to delete old file:', e);
            }
        }

        // 4. Write new file
        await fs.promises.writeFile(targetFilePath, JSON.stringify(data, null, 2));

        // Return object with path and new ID (filename without ext)
        const newId = path.basename(targetFilename, '.json');
        return { filePath: targetFilePath, id: newId };
    },

    async loadCourse(id: string) {
        // ID could be the filename (stem) OR a UUID
        // Try direct file load first (assuming id is filename stem)
        let filePath = path.join(COURSES_DIR, `${id}.json`);
        console.log(`[FileStore] loadCourse attempting to load: ${filePath}`);

        if (fs.existsSync(filePath)) {
            try {
                const data = await fs.promises.readFile(filePath, 'utf-8');
                return JSON.parse(data);
            } catch (e) {
                console.error(`[FileStore] Error reading file: ${e}`);
                return null;
            }
        } else {
            console.log(`[FileStore] File not found at: ${filePath}, trying fallback search...`);
        }

        // Fallback: Search by UUID (slow but necessary for legacy links or if only UUID is known)

        try {
            const files = await fs.promises.readdir(COURSES_DIR);

            // Check for legacy UUID filename
            const legacyFile = files.find(f => f.includes(id) && f.endsWith('.json'));
            if (legacyFile) {
                return JSON.parse(await fs.promises.readFile(path.join(COURSES_DIR, legacyFile), 'utf-8'));
            }

            // Deep scan: Read all JSONs to find `id` property?
            // This is expensive. Ideally we avoid this by ensuring `listCourses` provides the filename as ID.
            // If the frontend sends a pure UUID that isn't in the filename, we might fail here.
            // But let's assume `saveCourse` ensures we use timestamp names now.

            return null;
        } catch (error) {
            return null;
        }
    },

    async saveMarkdown(courseName: string, outline: any, timestamp?: string, manualFilename?: string) {
        // Allow passing a specific filename root (e.g. "20240213_120000_MyCourse")
        // If provided, we append .md and use strict

        let filename: string;
        let md: string;

        if (manualFilename) {
            filename = manualFilename.endsWith('.md') ? manualFilename : `${manualFilename}.md`;
        } else {
            // Legacy/Fallback logic
            let ts = timestamp;
            if (!ts) {
                ts = formatTimestamp(new Date())!;
            }
            const safeName = courseName
                .replace(/[<>:"/\\|?*]/g, '')
                .replace(/\s+/g, '_')
                .substring(0, 60);
            filename = `${ts}_${safeName}.md`;
        }

        const filePath = path.join(HISTORY_DIR, filename);

        // Build markdown content
        md = `# ${outline.title || courseName}\n\n`;
        if (outline.description) {
            md += `> ${outline.description}\n\n`;
        }
        md += `---\n\n`;

        for (const chapter of outline.chapters) {
            md += `# ${chapter.order}. ${chapter.title}\n\n`;
            if (chapter.description) {
                md += `*${chapter.description}*\n\n`;
            }
            if (chapter.content) {
                md += `${chapter.content}\n\n`;
            }
            md += `---\n\n`;
        }

        await fs.promises.writeFile(filePath, md, 'utf-8');
        console.log(`[FileStore] Saved markdown history: ${filePath}`);
        // Return just the filename so it can be stored in JSON
        return { filePath, filename };
    },

    async listCourses() {
        await this.migrate();

        try {
            const files = await fs.promises.readdir(COURSES_DIR);
            const courses = [];
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = path.join(COURSES_DIR, file);
                        const data = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));

                        // Use the FILENAME (without ext) as the ID for the UI
                        // This allows loadCourse to work efficiently
                        const fileId = file.replace('.json', '');

                        let mdStatus = 'missing';
                        // Ideally markdown file has same name (but .md)
                        const expectedMd = file.replace('.json', '.md');
                        if (fs.existsSync(path.join(HISTORY_DIR, expectedMd))) {
                            mdStatus = 'exists';
                        } else if (data.markdownFile && fs.existsSync(path.join(HISTORY_DIR, data.markdownFile))) {
                            mdStatus = 'exists'; // Legacy link
                        }

                        let timestamp = fs.statSync(filePath).mtime; // Default to file modify time

                        // Try to extract timestamp from filename (YYYYMMDD_HHMMSS)
                        // This allows the course to stay in its original position even if updated
                        const match = fileId.match(/^(\d{8}_\d{6})/);
                        if (match) {
                            // Parse "20260214_183837" -> Date object
                            const tsStr = match[1];
                            const year = parseInt(tsStr.substring(0, 4));
                            const month = parseInt(tsStr.substring(4, 6)) - 1; // JS months are 0-based
                            const day = parseInt(tsStr.substring(6, 8));
                            const hour = parseInt(tsStr.substring(9, 11));
                            const minute = parseInt(tsStr.substring(11, 13));
                            const second = parseInt(tsStr.substring(13, 15));

                            const dateFromId = new Date(year, month, day, hour, minute, second);
                            if (!isNaN(dateFromId.getTime())) {
                                timestamp = dateFromId;
                            }
                        }

                        courses.push({
                            id: fileId, // UI uses this to call loadCourse/regenerate
                            uuid: data.id, // Keep the real UUID available if needed
                            topic: data.config?.topic || 'Untitled',
                            courseName: data.courseName,
                            markdownFile: mdStatus === 'exists' ? expectedMd : null, // Prefer matching name
                            mdStatus,
                            timestamp: timestamp
                        });
                    } catch (err) {
                        console.warn(`Failed to parse course file ${file}`, err);
                    }
                }
            }
            return courses.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        } catch (e) {
            console.error('[FileStore] List courses error:', e);
            return [];
        }
    },

    async deleteCourse(courseId: string) {
        // courseId is likely the filename stem now
        const jsonPath = path.join(COURSES_DIR, `${courseId}.json`);

        let deleted = false;

        if (fs.existsSync(jsonPath)) {
            await fs.promises.unlink(jsonPath);
            deleted = true;
        }

        // Delete all related history files (.md, .docx, _TM.docx, etc.)
        try {
            const historyFiles = await fs.promises.readdir(HISTORY_DIR);
            for (const file of historyFiles) {
                // Match files that start with the courseId stem
                if (file.startsWith(courseId)) {
                    const filePath = path.join(HISTORY_DIR, file);
                    await fs.promises.unlink(filePath);
                    console.log(`[FileStore] Deleted history file: ${file}`);
                }
            }
        } catch (e) {
            console.warn('[FileStore] Error cleaning up history files:', e);
        }

        if (!deleted) {
            return false;
        }

        return true;
    }
};
