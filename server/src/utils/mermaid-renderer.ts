import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve path to mmdc binary
// In development/prod, it should be in node_modules/.bin/mmdc
// SERVER_ROOT is where package.json for server is (d:/Sites_git/SyllaBot_pro_js/server)
const SERVER_ROOT = path.resolve(__dirname, '../../');
// DATA_DIR is at the project root (d:/Sites_git/SyllaBot_pro_js/data)
// SERVER_ROOT is one level deep.
const DATA_DIR = path.resolve(SERVER_ROOT, '../data');

const MMDC_PATH = path.join(SERVER_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'mmdc.cmd' : 'mmdc');

export class MermaidRenderer {
    /**
     * Processes markdown content, replacing mermaid code blocks with generated PNG images.
     * Returns the modified markdown and a cleanup function to delete temporary files.
     */
    static async process(markdown: string): Promise<{ markdown: string, cleanup: () => Promise<void> }> {
        const tempFiles: string[] = [];
        const matches: { start: number, end: number, content: string, fullBlock: string, replacement?: string }[] = [];

        // Regex to find mermaid blocks
        // Matches ```mermaid ... ```
        const regex = /```mermaid\s*([\s\S]*?)```/g;
        let match;

        // 1. Find all blocks
        while ((match = regex.exec(markdown)) !== null) {
            matches.push({
                start: match.index,
                end: match.index + match[0].length,
                content: match[1].trim(),
                fullBlock: match[0]
            });
        }

        console.log(`[MermaidRenderer] Found ${matches.length} mermaid blocks.`);

        // 2. Render each block to PNG
        // Process sequentially to avoid Puppeteer concurrency issues
        for (let i = 0; i < matches.length; i++) {
            const m = matches[i];
            const id = Math.random().toString(36).substring(2, 10);
            const inputPath = path.join(DATA_DIR, `temp_mermaid_${id}.mmd`);
            const outputPath = path.join(DATA_DIR, `temp_mermaid_${id}.png`);

            tempFiles.push(inputPath, outputPath);

            try {
                // Write .mmd file
                await fs.promises.writeFile(inputPath, m.content, 'utf8');

                // Generate output config for high quality
                const cmd = `"${MMDC_PATH}" -i "${inputPath}" -o "${outputPath}" -b transparent`;
                // console.log(`[MermaidRenderer] Rendering block ${i}: ${cmd}`);

                // Increase buffer and timeout just in case
                await execAsync(cmd, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 5, timeout: 30000 });

                // Check if output exists
                if (fs.existsSync(outputPath)) {
                    console.log(`[MermaidRenderer] Generated: ${outputPath}`);
                    // Success replacement: Markdown image
                    // Use absolute path for Pandoc to find it easily. 
                    // IMPORTANT: Escape backslashes for usage in regex replacement strings if needed, 
                    // but here we are doing string concatenation so it is fine.
                    // However, for markdown format, use forward slashes.
                    m.replacement = `![Diagram](${outputPath.replace(/\\/g, '/')})`;
                } else {
                    console.error(`[MermaidRenderer] Failed to generate image: ${outputPath} not found`);
                    m.replacement = m.fullBlock;
                }
            } catch (error: any) {
                console.error(`[MermaidRenderer] Rendering failed for block ${i}:`, error.message);
                if (error.stderr) console.error(`[MermaidRenderer] Stderr:`, error.stderr);
                if (error.stdout) console.error(`[MermaidRenderer] Stdout:`, error.stdout);
                m.replacement = `> **Error rendering diagram**\n\n${m.fullBlock}`;
            }
        }

        // 3. Reconstruct markdown
        // We need to replace from last to first to handle strings if we were modifying in place,
        // but here we can just join parts.
        // Actually, matching indices are from original string.

        let newMarkdown = markdown;
        // Sort matches by start index descending to replace safely
        matches.sort((a, b) => b.start - a.start);

        for (const m of matches) {
            if (m.replacement) {
                newMarkdown = newMarkdown.substring(0, m.start) + m.replacement + newMarkdown.substring(m.end);
            }
        }

        // 4. Return result and cleanup
        const cleanup = async () => {
            for (const file of tempFiles) {
                try {
                    await fs.promises.unlink(file);
                } catch (e) {
                    // ignore generic unlink errors (file not found etc)
                }
            }
        };

        return { markdown: newMarkdown, cleanup };
    }
}
