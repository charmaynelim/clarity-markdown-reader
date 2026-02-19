// reader.js — Markdown rendering, outline generation, scroll spy, file handling, PDF export

let currentDocName = 'document';

// DOM references (resolved on init)
let app, outlineContent, fileInput, dropZone, welcomeState,
    markdownContent, documentTitle, exportPdfBtn;

// Demo content
const demoContent = `# Welcome to Clarity

A beautiful, minimal markdown reader inspired by the clean aesthetics of Typora.

## Getting Started

Simply drag and drop any markdown file onto this page, or click the **Open File** button to browse your files.

### Features

Clarity offers a distraction-free reading experience with:

- **Clean Typography** — Carefully chosen fonts for optimal readability
- **Outline Panel** — Navigate your document structure with ease
- **Keyboard Shortcuts** — Quick access to common actions
- **Responsive Design** — Works beautifully on any device

### Supported Syntax

Clarity supports all standard markdown syntax:

#### Text Formatting

You can use **bold**, *italic*, and \`inline code\`. You can also use ~~strikethrough~~ text.

#### Code Blocks

\`\`\`javascript
function greet(name) {
    console.log(\`Hello, \${name}!\`);
}

greet('World');
\`\`\`

#### Blockquotes

> "The best interface is no interface."
> — Golden Krishna

#### Lists

1. First ordered item
2. Second ordered item
   - Nested unordered item
   - Another nested item
3. Third ordered item

#### Tables

| Feature | Status |
|---------|--------|
| Markdown Parsing | ✓ |
| Outline Panel | ✓ |
| Scroll Spy | ✓ |
| Responsive | ✓ |

---

## Keyboard Shortcuts

- \`⌘ + /\` — Toggle the outline panel
- \`⌘ + O\` — Open a file

## About

Clarity is designed to help you focus on what matters most: reading and understanding your content.

---

*Drop your own markdown file to get started.*
`;

/**
 * Render markdown content into the reader view.
 * Exported so other modules (e.g. GitHub file loading) can call it.
 */
export function renderMarkdown(content, filename) {
    const nameWithoutExt = filename.replace(/\.(md|markdown|txt)$/i, '');
    documentTitle.textContent = nameWithoutExt;
    document.title = `${nameWithoutExt} — Clarity`;
    currentDocName = nameWithoutExt;

    const html = marked.parse(content);
    markdownContent.innerHTML = html;

    welcomeState.style.display = 'none';
    markdownContent.style.display = 'block';
    exportPdfBtn.style.display = 'flex';

    generateOutline();

    if (window.innerWidth > 768) {
        app.classList.remove('outline-collapsed');
    }

    addHeadingIds();
    setupScrollSpy();
}

function loadFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        renderMarkdown(e.target.result, file.name);
    };
    reader.readAsText(file);
}

function addHeadingIds() {
    const headings = markdownContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading, index) => {
        if (!heading.id) {
            const text = heading.textContent.toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-')
                .trim();
            heading.id = text || `heading-${index}`;
        }
    });
}

function generateOutline() {
    const headings = markdownContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
    outlineContent.innerHTML = '';

    if (headings.length === 0) {
        outlineContent.innerHTML = '<p style="padding: 24px; color: var(--text-tertiary); font-size: 14px;">No headings found</p>';
        return;
    }

    headings.forEach((heading, index) => {
        const level = heading.tagName.toLowerCase();
        const link = document.createElement('a');
        link.className = `outline-item ${level}`;
        link.textContent = heading.textContent;
        link.href = `#${heading.id}`;
        link.dataset.index = index;

        link.addEventListener('click', (e) => {
            e.preventDefault();
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' });

            document.querySelectorAll('.outline-item').forEach(item => item.classList.remove('active'));
            link.classList.add('active');

            if (window.innerWidth <= 768) {
                app.classList.add('outline-collapsed');
            }
        });

        outlineContent.appendChild(link);
    });

    const firstItem = outlineContent.querySelector('.outline-item');
    if (firstItem) firstItem.classList.add('active');
}

function setupScrollSpy() {
    const headings = markdownContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const outlineItems = outlineContent.querySelectorAll('.outline-item');

    if (headings.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                outlineItems.forEach((item) => {
                    item.classList.remove('active');
                    if (item.getAttribute('href') === `#${id}`) {
                        item.classList.add('active');
                        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                });
            }
        });
    }, {
        rootMargin: '-80px 0px -80% 0px',
        threshold: 0
    });

    headings.forEach((heading) => observer.observe(heading));
}

function exportToPdf() {
    const printWindow = window.open('', '_blank');
    const contentHtml = markdownContent.innerHTML;

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${currentDocName}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    font-size: 12pt;
                    line-height: 1.6;
                    color: #1c1917;
                    padding: 0;
                    max-width: 100%;
                }

                @page {
                    margin: 2cm;
                    size: A4;
                }

                @media print {
                    body {
                        padding: 0;
                    }
                }

                h1, h2, h3, h4, h5, h6 {
                    font-weight: 600;
                    margin-top: 1.5em;
                    margin-bottom: 0.5em;
                    line-height: 1.3;
                    page-break-after: avoid;
                }

                h1 {
                    font-size: 24pt;
                    margin-top: 0;
                    padding-bottom: 0.3em;
                    border-bottom: 1px solid #e7e5e4;
                }

                h2 { font-size: 18pt; }
                h3 { font-size: 14pt; }
                h4 { font-size: 12pt; }
                h5 { font-size: 11pt; }
                h6 { font-size: 10pt; color: #57534e; }

                p {
                    margin-bottom: 1em;
                    orphans: 3;
                    widows: 3;
                }

                a {
                    color: #b45309;
                    text-decoration: underline;
                }

                strong { font-weight: 600; }
                em { font-style: italic; }

                ul, ol {
                    margin-bottom: 1em;
                    padding-left: 1.5em;
                }

                li {
                    margin-bottom: 0.3em;
                }

                blockquote {
                    margin: 1em 0;
                    padding: 0.75em 1em;
                    border-left: 3px solid #b45309;
                    background: #f5f5f4;
                    font-style: italic;
                    color: #57534e;
                    page-break-inside: avoid;
                }

                blockquote p:last-child {
                    margin-bottom: 0;
                }

                code {
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.9em;
                    background: #f5f5f4;
                    padding: 0.2em 0.4em;
                    border-radius: 3px;
                }

                pre {
                    margin: 1em 0;
                    padding: 1em;
                    background: #292524;
                    border-radius: 6px;
                    overflow-x: auto;
                    page-break-inside: avoid;
                }

                pre code {
                    background: none;
                    padding: 0;
                    color: #fafaf9;
                    font-size: 9pt;
                    line-height: 1.5;
                }

                hr {
                    border: none;
                    height: 1px;
                    background: #e7e5e4;
                    margin: 2em 0;
                }

                img {
                    max-width: 100%;
                    height: auto;
                    page-break-inside: avoid;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 1em 0;
                    font-size: 10pt;
                    page-break-inside: avoid;
                }

                th, td {
                    padding: 8px 12px;
                    text-align: left;
                    border-bottom: 1px solid #e7e5e4;
                }

                th {
                    font-weight: 600;
                    background: #f5f5f4;
                }

                input[type="checkbox"] {
                    margin-right: 6px;
                }
            </style>
        </head>
        <body>
            ${contentHtml}
        </body>
        </html>
    `);

    printWindow.document.close();

    printWindow.onload = () => {
        setTimeout(() => {
            printWindow.print();
        }, 250);
    };
}

/**
 * Initialize the reader — wire up all event handlers.
 * Call once from app.js after DOM is ready.
 */
export function initReader() {
    // Resolve DOM references
    app = document.getElementById('app');
    outlineContent = document.getElementById('outlineContent');
    fileInput = document.getElementById('fileInput');
    dropZone = document.getElementById('dropZone');
    welcomeState = document.getElementById('welcomeState');
    markdownContent = document.getElementById('markdownContent');
    documentTitle = document.getElementById('documentTitle');
    exportPdfBtn = document.getElementById('exportPdfBtn');

    // Configure marked
    marked.setOptions({
        gfm: true,
        breaks: true,
        headerIds: true
    });

    // File input
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) loadFile(file);
    });

    // Drop zone (in-app welcome state)
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) loadFile(file);
    });

    // Export PDF
    exportPdfBtn.addEventListener('click', () => {
        exportToPdf();
    });

    // Demo content on double-click
    dropZone.addEventListener('dblclick', () => {
        renderMarkdown(demoContent, 'Welcome.md');
    });
}
