import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WritingStyle {
    id: string;
    name: string;
    description: string;
}

export function getStyles(): WritingStyle[] {
    const stylesPath = path.join(__dirname, 'writing-styles.json');
    return JSON.parse(readFileSync(stylesPath, 'utf-8'));
}
