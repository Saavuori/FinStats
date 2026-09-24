const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, '../CHANGELOG.md');
const templatePath = path.join(__dirname, 'changelog-template.html');
const outDir = path.join(__dirname, '../dist-changelog');
const outPath = path.join(outDir, 'index.html');

if (!fs.existsSync(mdPath)) {
  console.error('CHANGELOG.md not found');
  process.exit(1);
}
if (!fs.existsSync(templatePath)) {
  console.error('changelog-template.html not found');
  process.exit(1);
}

const markdown = fs.readFileSync(mdPath, 'utf8');
const template = fs.readFileSync(templatePath, 'utf8');

function parseMarkdown(md) {
  // Convert basic HTML entities to avoid layout rendering issues
  let escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = escaped.split('\n');
  const result = [];
  let inList = false;
  // The list item or paragraph being collected. Markdown wraps both over
  // several source lines; they are joined before inline formatting, so a
  // **bold** or `code` span may cross a line break.
  let block = null;

  const flush = () => {
    if (!block) return;
    const content = parseInline(block.text);
    result.push(block.type === 'li' ? `  <li>${content}</li>` : `<p>${content}</p>`);
    block = null;
  };
  const closeList = () => {
    flush();
    if (inList) { result.push('</ul>'); inList = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // Horizontal Rule
    if (line === '---') {
      closeList();
      result.push('<hr />');
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      // Skip the main H1 header as it is already provided by the template <header>
      continue;
    }
    if (line.startsWith('## ')) {
      closeList();
      const headingText = line.substring(3);
      // Match versions like [v1.0.0] - 2026-06-16 to wrap version in a styled tag
      const versionMatch = headingText.match(/\[(.*?)\]\s*-\s*(.*)/);
      if (versionMatch) {
        result.push(`<div class="version-header"><h2><span class="version-tag">${versionMatch[1]}</span> <span class="version-date">${versionMatch[2]}</span></h2></div>`);
      } else {
        result.push(`<h2>${headingText}</h2>`);
      }
      continue;
    }
    if (line.startsWith('### ')) {
      closeList();
      const subHeadingText = line.substring(4);
      // Give semantic category styling (Added / Fixed / Changed / etc.)
      const catClass = subHeadingText.toLowerCase();
      result.push(`<h3 class="category-${catClass}">${subHeadingText}</h3>`);
      continue;
    }

    // List Items
    if (line.startsWith('- ') || line.startsWith('* ')) {
      flush();
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      block = { type: 'li', text: line.substring(2) };
      continue;
    }

    // Blank line closes lists and paragraphs
    if (line === '') {
      closeList();
      continue;
    }

    // An indented line continues the list item above it; an unindented one
    // continues a paragraph, or ends the list and starts a paragraph.
    if (block && (block.type === 'p' || /^\s/.test(raw))) {
      block.text += ' ' + line;
      continue;
    }
    closeList();
    block = { type: 'p', text: line };
  }

  closeList();

  return result.join('\n');
}

function parseInline(text) {
  return text
    // Bold: **text**
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Inline Code: `code`
    .replace(/`(.*?)`/g, '<code>$1</code>')
    // Markdown Links: [label](url)
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

const parsedContent = parseMarkdown(markdown);
const buildDate = new Date().toISOString().split('T')[0];
// Replacer functions, so a `$&` or `$'` in the changelog is inserted verbatim
// instead of being expanded as a replacement pattern.
const finalHtml = template
  .replace('{{CONTENT}}', () => parsedContent)
  .replace('{{BUILD_DATE}}', () => buildDate);

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(outPath, finalHtml, 'utf8');
console.log('Changelog generated successfully at:', outPath);
