// content/asce.js
// ASCE Library extraction. Injected after content/shared.js.

(async function extractPaper() {
  try {
    var metadata = extractMetadata();
    var sections = extractSections();
    var figures = await extractFigures();
    sendExtractionResult({ metadata: metadata, sections: sections, figures: figures });
  } catch (err) {
    sendExtractionError(err.message);
  }
})();

function extractMetadata() {
  var title =
    document.querySelector('h1.citation__title, h1.article__title')?.textContent?.trim() ||
    document.querySelector('meta[name="citation_title"]')?.content || 'Untitled';

  var authorEls = document.querySelectorAll('.author-name span, .loa__author-name, .contrib-author a');
  var authors = [...authorEls].map(function(el) { return el.textContent.trim(); }).filter(Boolean);
  if (authors.length === 0) {
    authors = [...document.querySelectorAll('meta[name="citation_author"]')]
      .map(function(el) { return el.content.trim(); }).filter(Boolean);
  }

  var abstractEl =
    document.querySelector('.article__abstract p, .abstractSection p, #abstract p');
  var abstract = abstractEl?.textContent?.trim() || '';

  var doi = document.querySelector('meta[name="citation_doi"]')?.content || '';
  var date = document.querySelector('meta[name="citation_publication_date"]')?.content || '';
  var venue = document.querySelector('meta[name="citation_journal_title"]')?.content || '';

  var keywords = [];
  document.querySelectorAll('.article__keyword, .abstractKeywords a, .kwd-group .kwd').forEach(function(el) {
    var kw = el.textContent.trim();
    if (kw && !keywords.includes(kw)) keywords.push(kw);
  });

  return { title: title, authors: authors, doi: doi, date: date, venue: venue, keywords: keywords, abstract: abstract };
}

function extractSections() {
  var sections = [];

  var abstractEl =
    document.querySelector('.article__abstract p, .abstractSection p, #abstract p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  // ASCE uses .article__section or .NLM_sec patterns (Atypon platform)
  document.querySelectorAll('.article__section, .NLM_sec_level_1, .hlFld-Fulltext > div[class*="sec"]').forEach(function(sectionEl) {
    if (sectionEl.closest('.abstractSection') || sectionEl.classList.contains('abstractSection')) return;

    var headingEl = sectionEl.querySelector('h2, h3, .section__title, .NLM_title');
    var heading = headingEl?.textContent?.trim() || 'Untitled Section';

    if (/acknowledgment|data availability|author contribution/i.test(heading)) return;

    var content = [];
    sectionEl.querySelectorAll('p, .NLM_p').forEach(function(p) {
      if (p.closest('.abstractSection')) return;
      var text = p.textContent.trim();
      if (text && text.length > 10) content.push({ type: 'paragraph', text: text });
    });

    sectionEl.querySelectorAll('figure').forEach(function(fig) {
      var img = fig.querySelector('img');
      if (img && img.src) {
        content.push({ type: 'figure', figureId: img.src });
      }
    });

    // Tables
    sectionEl.querySelectorAll('.tableWrapper table, .NLM_table-wrap table, table').forEach(function(table) {
      if (table.closest('figure')) return;
      var wrap = table.closest('.tableWrapper, .NLM_table-wrap');
      var captionEl = wrap?.querySelector('.NLM_caption, caption, .table-caption');
      var caption = captionEl?.textContent?.trim() || '';
      var tableText = extractTableAsText(table);
      if (caption) tableText = caption + '\n' + tableText;
      if (tableText) content.push({ type: 'paragraph', text: tableText });
    });

    if (content.length > 0) sections.push({ heading: heading, content: content });
  });

  // References
  var refEls = document.querySelectorAll('.references__item, .references li, #references-section li, .article__references li');
  if (refEls.length > 0) {
    var refContent = [...refEls].map(function(ref, i) {
      return { type: 'paragraph', text: (i + 1) + '. ' + ref.textContent.trim() };
    });
    sections.push({ heading: 'References', content: refContent });
  }

  return sections;
}

async function extractFigures() {
  var figures = [];
  var seen = new Set();
  var figEls = document.querySelectorAll('figure img, .figure img');

  for (var img of figEls) {
    var src = img.getAttribute('data-src') || img.src;
    if (!src) continue;

    var url = src.startsWith('http') ? src : new URL(src, location.href).href;
    if (seen.has(url)) continue;
    if (/icon|logo|spinner/i.test(url)) continue;
    seen.add(url);

    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(function(r) { setTimeout(r, 300); });

    var actualSrc = img.src || img.getAttribute('data-src');
    var actualUrl = actualSrc ? (actualSrc.startsWith('http') ? actualSrc : new URL(actualSrc, location.href).href) : url;

    var container = img.closest('figure');
    var captionEl = container?.querySelector('figcaption');
    var caption = captionEl?.textContent?.trim() || '';

    var index = figures.length + 1;
    figures.push({ id: url, url: actualUrl, filename: 'fig' + index + '.png', caption: caption });
  }

  window.scrollTo(0, 0);
  return figures;
}

function extractTableAsText(table) {
  var rows = [];
  table.querySelectorAll('tr').forEach(function(tr) {
    var cells = [];
    tr.querySelectorAll('th, td').forEach(function(cell) {
      cells.push(cell.textContent.trim());
    });
    rows.push(cells.join(' | '));
  });
  return rows.join('\n');
}
