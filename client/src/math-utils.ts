/**
 * Preprocesses markdown to normalize LaTeX math delimiters before
 * passing through the marked + KaTeX pipeline.
 *
 * Fixes:
 * - $$...$$ block math placed inline within text → moved to own paragraph
 */
export function preprocessMath(md: string): string {
    // Ensure $$...$$ block math is on its own line (not inline with text).
    // Match $$ that is NOT at the start of a line (has preceding non-whitespace on the same line).
    // Also match $$ that has trailing non-whitespace text after the closing $$.
    // We use a single regex pass to find $$...$$ and ensure surrounding newlines.
    return md.replace(/([^\n])(\$\$)/g, '$1\n$2')     // newline before opening $$
        .replace(/(\$\$)([^\n$])/g, '$1\n$2');    // newline after closing $$
}
