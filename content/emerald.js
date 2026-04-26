// content/emerald.js
// Emerald Publishing extraction. Injected after content/shared.js.

(async function extractPaper() {
  try {
    var metadata = extractMetadata();
    var sections = extractSections();
    extractTables(sections);
    var figures = await extractFigures();
    sendExtractionResult({ metadata: metadata, sections: sections, figures: figures });
  } catch (err) {
    sendExtractionError(err.message);
  }
})();

function extractMetadata() {
  var title = document.querySelector('h1')?.textContent?.trim()
    || document.querySelector('meta[name="citation_title"]')?.content || 'Untitled';
  // Strip "Open Access" badge text that may appear inside the h1
  title = title.replace(/Open Access$/i, '').trim();

  var authorMetas = document.querySelectorAll('meta[name="citation_author"]');
  var authors = [...authorMetas].map(function(el) { return el.content.trim(); }).filter(Boolean);
  if (authors.length === 0) {
    var authorLinks = document.querySelectorAll('a[href*="f_AllAuthors="]');
    authors = [...authorLinks].map(function(el) { return el.textContent.trim(); }).filter(Boolean);
  }

  var abstractEl = document.querySelector('.abstract');
  var abstract = abstractEl ? abstractEl.textContent.trim() : '';

  var doi = document.querySelector('meta[name="citation_doi"]')?.content?.trim() || '';
  var date = document.querySelector('meta[name="citation_publication_date"]')?.content?.trim()
    || document.querySelector('meta[name="citation_online_date"]')?.content?.trim() || '';
  var venue = document.querySelector('meta[name="citation_journal_title"]')?.content?.trim() || '';

  var keywordEls = document.querySelectorAll('.intent_text a[href*="Keywords"]');
  var keywords = [...keywordEls].map(function(el) { return el.textContent.trim(); }).filter(Boolean);
  if (keywords.length === 0) {
    keywordEls = document.querySelectorAll('meta[name="citation_keywords"]');
    keywords = [...keywordEls].map(function(el) { return el.content.trim(); }).filter(Boolean);
  }

  return { title: title, authors: authors, doi: doi, date: date, venue: venue, keywords: keywords, abstract: abstract };
}

function extractSections() {
  var sections = [];

  var abstractEl = document.querySelector('.abstract');
  if (abstractEl) {
    var abstractParagraphs = abstractEl.querySelectorAll('p');
    var abstractContent = [];
    if (abstractParagraphs.length > 0) {
      abstractParagraphs.forEach(function(p) {
        var text = p.textContent.trim();
        if (text) abstractContent.push({ type: 'paragraph', text: text });
      });
    } else {
      var text = abstractEl.textContent.trim();
      if (text) abstractContent.push({ type: 'paragraph', text: text });
    }
    if (abstractContent.length > 0) {
      sections.push({ heading: 'Abstract', content: abstractContent });
    }
  }

  // Walk through body sections by headings
  var headings = document.querySelectorAll('h2, h3');
  headings.forEach(function(headingEl) {
    var heading = headingEl.textContent.trim();
    if (!heading) return;

    var content = [];
    var sibling = headingEl.nextElementSibling;

    while (sibling && !sibling.matches('h2, h3')) {
      if (sibling.matches('p')) {
        var pText = sibling.textContent.trim();
        if (pText) content.push({ type: 'paragraph', text: pText });
      } else if (sibling.matches('.table-wrap')) {
        var table = sibling.querySelector('.table-overflow table');
        if (table) {
          var tableText = extractTableAsText(table);
          if (tableText) content.push({ type: 'paragraph', text: tableText });
        }
      } else if (sibling.matches('div, section')) {
        sibling.querySelectorAll('p').forEach(function(p) {
          var pText = p.textContent.trim();
          if (pText) content.push({ type: 'paragraph', text: pText });
        });
        sibling.querySelectorAll('img.content-image').forEach(function(img) {
          var src = img.getAttribute('data-src') || img.src;
          if (src) content.push({ type: 'figure', figureId: normalizeUrl(src) });
        });
        sibling.querySelectorAll('.table-wrap .table-overflow table').forEach(function(table) {
          var tableText = extractTableAsText(table);
          if (tableText) content.push({ type: 'paragraph', text: tableText });
        });
      }

      sibling = sibling.nextElementSibling;
    }

    if (content.length > 0) sections.push({ heading: heading, content: content });
  });

  // References
  var refEls = document.querySelectorAll('.references li, .ref-list li, ol.bibliography li');
  if (refEls.length > 0) {
    var refContent = [...refEls].map(function(ref, i) {
      return { type: 'paragraph', text: (i + 1) + '. ' + ref.textContent.trim() };
    });
    sections.push({ heading: 'References', content: refContent });
  }

  return sections;
}

function extractTables(sections) {
  var tableWraps = document.querySelectorAll('.table-wrap');
  tableWraps.forEach(function(wrap) {
    var table = wrap.querySelector('.table-overflow table');
    if (!table) return;

    var titleEl = wrap.querySelector('.table-wrap-title');
    var title = titleEl ? titleEl.textContent.trim() : '';
    var tableText = extractTableAsText(table);
    if (!tableText) return;

    var text = title ? title + '\n' + tableText : tableText;

    // Find the nearest preceding heading by walking up and back
    var heading = '';
    var node = wrap;
    while (node && !heading) {
      var prev = node.previousElementSibling;
      while (prev) {
        var h = prev.querySelector ? prev.querySelector('h2, h3') : null;
        if (prev.matches && prev.matches('h2, h3')) { heading = prev.textContent.trim(); break; }
        if (h) { heading = h.textContent.trim(); break; }
        prev = prev.previousElementSibling;
      }
      node = node.parentElement;
    }

    var existing = heading ? sections.find(function(s) { return s.heading === heading; }) : null;
    if (existing) {
      existing.content.push({ type: 'paragraph', text: text });
    } else {
      sections.push({ heading: heading || 'Tables', content: [{ type: 'paragraph', text: text }] });
    }
  });
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

async function extractFigures() {
  var figures = [];
  var seen = new Set();
  var allImgs = document.querySelectorAll('img.content-image');

  for (var i = 0; i < allImgs.length; i++) {
    var img = allImgs[i];
    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(function(r) { setTimeout(r, 300); });

    var src = img.src || img.getAttribute('data-src') || '';
    if (!src) continue;

    var url = normalizeUrl(src);
    if (seen.has(url)) continue;
    seen.add(url);

    var caption = img.alt || '';
    var figLink = img.closest('.fig-link');
    if (figLink) {
      var captionEl = figLink.parentElement?.querySelector('.figcaption, .fig-caption, [class*="caption"]');
      if (captionEl) caption = captionEl.textContent.trim();
    }

    var index = figures.length + 1;
    figures.push({ id: url, url: url, filename: 'fig' + index + '.png', caption: caption });
  }

  window.scrollTo(0, 0);
  return figures;
}

function normalizeUrl(src) {
  if (src.startsWith('//')) return 'https:' + src;
  if (src.startsWith('http')) return src;
  return new URL(src, location.href).href;
}
