export function toMarkdown(data) {
  const { metadata, sections, figures } = data;
  let md = '';

  // YAML frontmatter
  md += '---\n';
  md += `title: "${metadata.title || 'Untitled'}"\n`;
  if (metadata.authors?.length) md += `authors: [${metadata.authors.join(', ')}]\n`;
  if (metadata.doi) md += `doi: "${metadata.doi}"\n`;
  if (metadata.date) md += `date: ${metadata.date}\n`;
  if (metadata.venue) md += `venue: "${metadata.venue}"\n`;
  if (metadata.keywords?.length) md += `keywords: [${metadata.keywords.join(', ')}]\n`;
  md += '---\n\n';

  // Sections
  for (const section of sections) {
    md += `## ${section.heading}\n`;
    for (const block of section.content) {
      if (block.type === 'paragraph') {
        md += `${block.text}\n\n`;
      } else if (block.type === 'figure') {
        const fig = figures.find(f => f.id === block.figureId);
        if (fig) {
          if (fig.failed) {
            md += `![[fig_missing.png]]\n`;
            md += `<!-- Image download failed for: ${fig.filename} -->\n`;
          } else {
            md += `![[${fig.filename}]]\n`;
          }
          if (fig.caption) {
            md += `*${fig.caption}*\n\n`;
          }
        }
      }
    }
  }

  return md;
}
