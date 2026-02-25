import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { FileStore } from './file-store.js';

import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../../data');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const TEMPLATES_DIR = path.join(DATA_DIR, 'templates');

import { MermaidRenderer } from './mermaid-renderer.js';

export const PandocExporter = {
    async exportToDocx(courseId: string, templateName?: string) {
        // 1. Locate the course markdown file
        const course = await FileStore.loadCourse(courseId);
        if (!course) {
            throw new Error('Course not found');
        }

        // Let's regenerate it temporarily to ensure it matches current stated
        const { outline, courseName, createdAt } = course;
        const topic = course.config?.topic || 'Untitled';
        const finalName = courseName || topic;

        // Use the common filename generation logic
        let basename = finalName.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');

        // Try to match the markdown filename if available to keep timestamps in sync
        if (course.markdownFile) {
            basename = course.markdownFile.replace(/\.md$/, '');
        } else {
            // Fallback: Generate generic timestamp if no markdown file link found (shouldn't happen for completed courses)
            const now = new Date();
            const ts = now.getFullYear().toString()
                + String(now.getMonth() + 1).padStart(2, '0')
                + String(now.getDate()).padStart(2, '0')
                + '_'
                + String(now.getHours()).padStart(2, '0')
                + String(now.getMinutes()).padStart(2, '0')
                + String(now.getSeconds()).padStart(2, '0');
            basename = `${ts}_${basename}`;
        }

        // Output filename: YYYYMMDD_HHMMSS_Name[_TM].docx
        const suffix = templateName === 'ThomasMore.docx' ? '_TM' : '';
        const outputFilename = `${basename}${suffix}.docx`;
        const outputDocxPath = path.join(HISTORY_DIR, outputFilename);
        const tempMdPath = path.join(DATA_DIR, `temp_${courseId}.md`);

        // 2. Build markdown content
        let md = `# ${outline.title || finalName}\n\n`;
        if (outline.description) md += `> ${outline.description}\n\n`;
        md += `---\n\n`;

        for (const chapter of outline.chapters) {
            md += `# ${chapter.title}\n\n`;
            if (chapter.description) md += `*${chapter.description}*\n\n`;
            if (chapter.content) md += `${chapter.content}\n\n`;
            md += `---\n\n`;
        }

        // 3. Process Mermaid Diagrams
        console.log('Processing Mermaid diagrams...');
        const { markdown: processedMd, cleanup: mermaidCleanup } = await MermaidRenderer.process(md);

        // 4. Write temp markdown
        await fs.promises.writeFile(tempMdPath, processedMd, 'utf-8');

        // 5. Check for reference doc
        let cmd = `pandoc "${tempMdPath}" -o "${outputDocxPath}" --from markdown-yaml_metadata_block`;

        if (templateName) {
            const referenceDocPath = path.join(TEMPLATES_DIR, templateName);
            if (fs.existsSync(referenceDocPath)) {
                cmd += ` --reference-doc="${referenceDocPath}"`;
            } else {
                console.warn(`Template ${templateName} not found, using default.`);
            }
        }

        // 6. Run Pandoc
        try {
            console.log(`Executing: ${cmd}`);
            await execAsync(cmd);

            // Clean up temp mermaid files (images)
            await mermaidCleanup();

            // Clean up temp markdown
            await fs.promises.unlink(tempMdPath).catch(() => { });

            return {
                filePath: outputDocxPath,
                filename: outputFilename
            };
        } catch (error: any) {
            console.error('Pandoc execution failed:', error);

            // Cleanup on error too
            await mermaidCleanup();
            await fs.promises.unlink(tempMdPath).catch(() => { });

            throw new Error(`Pandoc failed: ${error.message}`);
        }
    }
};
