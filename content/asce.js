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

  // Abstract — ASCE uses a section with h2 "Abstract" and a div child
  var abstract = '';
  document.querySelectorAll('section').forEach(function(sec) {
    var h = sec.querySelector('h2');
    if (h && /^abstract$/i.test(h.textContent.trim())) {
      var div = sec.querySelector('div');
      if (div) abstract = div.textContent.trim();
    }
  });

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

  // ASCE uses bare <section> elements inside div.core-container
  // Each section has an <h2> heading and <div> children for content
  var container = document.querySelector('div.core-container');
  if (!container) return sections;

  container.querySelectorAll('section').forEach(function(sec) {
    var h2 = sec.querySelector('h2');
    if (!h2) return;

    var heading = h2.textContent.trim();

    // Skip non-content sections
    if (/data availability|acknowledgment|author contribution|supplemental/i.test(heading)) return;

    var content = [];

    // Walk children of the section, skipping the h2
    [...sec.children].forEach(function(child) {
      if (child.tagName === 'H2' || child.tagName === 'H3') return;

      if (child.tagName === 'FIGURE' || child.querySelector?.('figure')) {
        var img = child.tagName === 'FIGURE' ? child.querySelector('img') : child.querySelector('figure img');
        if (img && img.src) {
          content.push({ type: 'figure', figureId: img.src });
        }
        var captionText = (child.tagName === 'FIGURE' ? child : child.querySelector('figure'))?.querySelector('figcaption')?.textContent?.trim();
        if (captionText) {
          content.push({ type: 'paragraph', text: captionText });
        }
        return;
      }

      if (child.tagName === 'TABLE' || child.querySelector?.('table')) {
        var table = child.tagName === 'TABLE' ? child : child.querySelector('table');
        if (table && table.querySelectorAll('tr').length >= 2) {
          var tableText = extractTableAsText(table);
          if (tableText) content.push({ type: 'paragraph', text: tableText });
        }
        return;
      }

      // Text content — divs, p, or other elements
      var text = child.textContent.trim();
      if (text && text.length > 10) {
        content.push({ type: 'paragraph', text: text });
      }
    });

    if (content.length > 0) {
      sections.push({ heading: heading, content: content });
    }
  });

  return sections;
}

async function extractFigures() {
  var figures = [];
  var seen = new Set();
  var figEls = document.querySelectorAll('figure img');

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
