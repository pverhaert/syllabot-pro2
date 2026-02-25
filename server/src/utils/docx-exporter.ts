import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    BorderStyle,
    ShadingType,
    convertInchesToTwip,
} from 'docx';
import type { CourseOutline, Chapter, Exercise, QuizQuestion } from '../types.js';

// ── Markdown-to-DOCX conversion ──

/** Simple inline parser: splits text into TextRun[] honouring **bold**, *italic*, `code` */
function parseInlineMarkdown(text: string): TextRun[] {
    const runs: TextRun[] = [];
    // Regex matches: **bold**, *italic*, `code`, or plain text
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        if (match[2]) {
            // **bold**
            runs.push(new TextRun({ text: match[2], bold: true }));
        } else if (match[3]) {
            // *italic*
            runs.push(new TextRun({ text: match[3], italics: true }));
        } else if (match[4]) {
            // `code`
            runs.push(new TextRun({ text: match[4], font: 'Consolas', size: 20, shading: { type: ShadingType.CLEAR, fill: 'E8E8E8' } }));
        } else if (match[5]) {
            // plain text
            runs.push(new TextRun(match[5]));
        }
    }

    return runs.length > 0 ? runs : [new TextRun(text)];
}

/** Convert a single line of markdown into a Paragraph */
function lineToElement(line: string): Paragraph | null {
    const trimmed = line.trim();

    if (trimmed === '' || trimmed === '---') return null;

    // Headings
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
        const level = headingMatch[1].length;
        const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
            1: HeadingLevel.HEADING_1,
            2: HeadingLevel.HEADING_2,
            3: HeadingLevel.HEADING_3,
            4: HeadingLevel.HEADING_4,
        };
        return new Paragraph({
            heading: headingMap[level] || HeadingLevel.HEADING_4,
            children: parseInlineMarkdown(headingMatch[2]),
            spacing: { before: 240, after: 120 },
        });
    }

    // Bullet list items
    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)/);
    if (bulletMatch) {
        return new Paragraph({
            bullet: { level: 0 },
            children: parseInlineMarkdown(bulletMatch[1]),
        });
    }

    // Numbered list items
    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (numberedMatch) {
        return new Paragraph({
            bullet: { level: 0 },
            children: parseInlineMarkdown(numberedMatch[1]),
        });
    }

    // Blockquote
    const quoteMatch = trimmed.match(/^>\s*(.*)/);
    if (quoteMatch) {
        return new Paragraph({
            indent: { left: convertInchesToTwip(0.5) },
            children: [new TextRun({ text: quoteMatch[1], italics: true, color: '666666' })],
            spacing: { before: 80, after: 80 },
        });
    }

    // Regular paragraph
    return new Paragraph({
        children: parseInlineMarkdown(trimmed),
        spacing: { after: 120 },
    });
}

/** Parse markdown content (multi-line) into an array of Paragraphs, handling code blocks */
function markdownToParagraphs(markdown: string): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    const lines = markdown.split('\n');
    let inCodeBlock = false;
    let codeLines: string[] = [];

    for (const line of lines) {
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                // End of code block — flush collected lines
                for (const codeLine of codeLines) {
                    paragraphs.push(new Paragraph({
                        children: [new TextRun({ text: codeLine || ' ', font: 'Consolas', size: 18 })],
                        indent: { left: convertInchesToTwip(0.3) },
                        shading: { type: ShadingType.CLEAR, fill: 'F4F4F4' },
                        spacing: { before: 0, after: 0 },
                    }));
                }
                codeLines = [];
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(line);
            continue;
        }

        const para = lineToElement(line);
        if (para) paragraphs.push(para);
    }

    return paragraphs;
}

/** Build exercise section paragraphs */
function exercisesToParagraphs(exercises: Exercise[]): Paragraph[] {
    const result: Paragraph[] = [
        new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: '📝 Exercises', bold: true })],
            spacing: { before: 300, after: 120 },
        }),
    ];

    exercises.forEach((ex, i) => {
        result.push(new Paragraph({
            children: [new TextRun({ text: `Exercise ${i + 1}: `, bold: true }), ...parseInlineMarkdown(ex.question)],
            spacing: { before: 120, after: 60 },
        }));
        if (ex.difficulty) {
            result.push(new Paragraph({
                children: [new TextRun({ text: `Difficulty: ${ex.difficulty}`, italics: true, color: '888888', size: 20 })],
            }));
        }
        if (ex.solution) {
            result.push(new Paragraph({
                children: [new TextRun({ text: 'Solution: ', bold: true, size: 20 }), new TextRun({ text: ex.solution, size: 20 })],
                indent: { left: convertInchesToTwip(0.3) },
                spacing: { after: 100 },
            }));
        }
    });

    return result;
}

/** Build quiz section paragraphs */
function quizToParagraphs(quiz: QuizQuestion[]): Paragraph[] {
    const result: Paragraph[] = [
        new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: '❓ Quiz', bold: true })],
            spacing: { before: 300, after: 120 },
        }),
    ];

    quiz.forEach((q, i) => {
        result.push(new Paragraph({
            children: [new TextRun({ text: `${i + 1}. `, bold: true }), ...parseInlineMarkdown(q.question)],
            spacing: { before: 120, after: 40 },
        }));

        q.options.forEach((opt, j) => {
            const isCorrect = j === q.correctAnswerIndex;
            result.push(new Paragraph({
                indent: { left: convertInchesToTwip(0.4) },
                children: [
                    new TextRun({
                        text: `${String.fromCharCode(65 + j)}) ${opt}`,
                        bold: isCorrect,
                        color: isCorrect ? '2E7D32' : undefined,
                    }),
                ],
            }));
        });

        if (q.explanation) {
            result.push(new Paragraph({
                indent: { left: convertInchesToTwip(0.4) },
                children: [new TextRun({ text: q.explanation, italics: true, color: '666666', size: 20 })],
                spacing: { after: 80 },
            }));
        }
    });

    return result;
}

/** Build chapter paragraphs */
function chapterToParagraphs(chapter: Chapter): Paragraph[] {
    const paras: Paragraph[] = [];

    // Chapter heading
    paras.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: `Chapter ${chapter.order}: ${chapter.title}` })],
        spacing: { before: 400, after: 160 },
    }));

    // Chapter description
    if (chapter.description) {
        paras.push(new Paragraph({
            children: [new TextRun({ text: chapter.description, italics: true, color: '555555' })],
            spacing: { after: 200 },
        }));
    }

    // Chapter content (markdown)
    if (chapter.content) {
        paras.push(...markdownToParagraphs(chapter.content));
    }

    // Exercises
    if (chapter.exercises && chapter.exercises.length > 0) {
        paras.push(...exercisesToParagraphs(chapter.exercises));
    }

    // Quiz
    if (chapter.quiz && chapter.quiz.length > 0) {
        paras.push(...quizToParagraphs(chapter.quiz));
    }

    // Chapter separator
    paras.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
        spacing: { before: 300, after: 300 },
    }));

    return paras;
}

// ── Public API ──

export async function generateDocxBuffer(outline: CourseOutline, courseName?: string): Promise<Buffer> {
    const title = courseName || outline.title || 'Course';

    const children: Paragraph[] = [];

    // Title page
    children.push(new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: title, bold: true, size: 56 })],
        spacing: { after: 200 },
    }));

    if (outline.description) {
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: outline.description, italics: true, color: '666666', size: 24 })],
            spacing: { after: 400 },
        }));
    }

    // Separator
    children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA' } },
        spacing: { after: 400 },
    }));

    // Chapters
    for (const chapter of outline.chapters) {
        if (chapter.status === 'completed' || chapter.content) {
            children.push(...chapterToParagraphs(chapter));
        }
    }

    const doc = new Document({
        creator: 'SyllaBot Pro',
        title: title,
        description: outline.description || '',
        styles: {
            default: {
                heading1: {
                    run: {
                        font: "Arial",
                        size: 56,
                        bold: true,
                        color: "2E74B5",
                    },
                    paragraph: {
                        spacing: {
                            before: 240,
                            after: 120,
                        },
                    },
                },
                heading2: {
                    run: {
                        font: "Arial",
                        size: 42,
                        bold: true,
                        color: "2E74B5",
                    },
                    paragraph: {
                        spacing: {
                            before: 240,
                            after: 120,
                        },
                    },
                },
                heading3: {
                    run: {
                        font: "Arial",
                        size: 28,
                        bold: true,
                        color: "1F4D78",
                    },
                    paragraph: {
                        spacing: {
                            before: 240,
                            after: 120,
                        },
                    },
                },
                heading4: {
                    run: {
                        font: "Arial",
                        size: 24,
                        bold: true,
                        color: "2E74B5",
                    },
                    paragraph: {
                        spacing: {
                            before: 240,
                            after: 120,
                        },
                    },
                },
                listParagraph: {
                    run: {
                        font: "Arial",
                    },
                },
                document: {
                    run: {
                        font: "Arial",
                        size: 24,
                    },
                },
            },
        },
        sections: [{
            properties: {},
            children: children,
        }],
    });

    return Buffer.from(await Packer.toBuffer(doc));
}
