/**
 * Preprocesses markdown to normalize LaTeX math delimiters before
 * passing through the marked + KaTeX pipeline.
 *
 * The marked-katex-extension block rule expects:
 *   $$\n content \n$$
 * But LLMs typically output:
 *   $$content$$
 *
 * This preprocessor converts single-line $$...$$ into the
 * multi-line block format so the block tokenizer can match them.
 */
export function preprocessMath(md: string): string {
    // Match $$...$$ blocks (non-greedy, may span lines) and
    // reformat into the block structure that KaTeX expects:
    //   \n\n$$\n content \n$$\n\n
    return md.replace(/\$\$([\s\S]+?)\$\$/g, (_match, content: string) => {
        const trimmed = content.trim();
        return `\n\n$$\n${trimmed}\n$$\n\n`;
    });
}
