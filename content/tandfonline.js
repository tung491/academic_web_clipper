// content/tandfonline.js
// Taylor & Francis Online extraction. Injected after content/shared.js.

(async function extractPaper() {
  try {
    // Click all "Display Table" buttons and wait for tables to load
    await expandAllTables();

    var metadata = extractMetadata();
    var sections = extractSections();
    var figures = await extractFigures();
    sendExtractionResult({ metadata: metadata, sections: sections, figures: figures });
  } catch (err) {
    sendExtractionError(err.message);
  }
})();

async function expandAllTables() {
  var buttons = document.querySelectorAll('.tableView a, .show-table, a[href*="showTable"], .tableDownloadOption a');
  var displayLinks = [];

  // Find links/buttons that say "Display Table"
  document.querySelectorAll('.tableView a, .tableView button').forEach(function(el) {
    if (/display\s*table/i.test(el.textContent)) {
      displayLinks.push(el);
    }
  });

  if (displayLinks.length === 0) return;

  // Click each "Display Table" link
  displayLinks.forEach(function(link) {
    link.click();
  });

  // Wait for tables to load into the DOM
  await new Promise(function(resolve) {
    var attempts = 0;
    var interval = setInterval(function() {
      attempts++;
      var tables = document.querySelectorAll('table');
      if (tables.length >= displayLinks.length || attempts > 20) {
        clearInterval(interval);
        resolve();
      }
    }, 500);
  });
}

function extractMetadata() {
  var title =
    document.querySelector('.NLM_article-title')?.textContent?.trim() ||
    document.querySelector('.article-title')?.textContent?.trim() ||
    document.querySelector('h1')?.textContent?.trim() || 'Untitled';

  var authorEls = document.querySelectorAll('.entryAuthor a, .author, .contrib-author, .NLM_contrib-group a');
  var authors = [...authorEls].map(function(el) { return el.textContent.trim(); }).filter(Boolean);
  if (authors.length === 0) {
    authors = [...document.querySelectorAll('meta[name="citation_author"]')]
      .map(function(el) { return el.content.trim(); }).filter(Boolean);
  }

  var abstractEl =
    document.querySelector('.abstractSection p, .abstract p, #abstract p') ||
    document.querySelector('.hlFld-Abstract p');
  var abstract = abstractEl?.textContent?.trim() || '';

  var doi = document.querySelector('meta[name="citation_doi"]')?.content || '';
  var date = document.querySelector('meta[name="citation_publication_date"]')?.content ||
    document.querySelector('meta[name="dc.Date"]')?.content || '';
  var venue = document.querySelector('meta[name="citation_journal_title"]')?.content || '';

  var keywords = [];
  document.querySelectorAll('.abstractKeywords a, .keyword, .hlFld-KeywordText a').forEach(function(el) {
    var kw = el.textContent.trim().replace(/,+$/, '');
    if (kw && !keywords.includes(kw)) keywords.push(kw);
  });

  return { title: title, authors: authors, doi: doi, date: date, venue: venue, keywords: keywords, abstract: abstract };
}

function extractSections() {
  var sections = [];

  var abstractEl =
    document.querySelector('.abstractSection p, .abstract p, #abstract p') ||
    document.querySelector('.hlFld-Abstract p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  // Walk the full-text body in document order — more robust than matching nested sections
  var bodyEl = document.querySelector('.hlFld-Fulltext') || document.querySelector('.article__body');
  if (bodyEl) {
    var currentHeading = 'Introduction';
    var currentContent = [];

    var flush = function() {
      if (currentContent.length > 0) {
        sections.push({ heading: currentHeading, content: currentContent });
      }
      currentContent = [];
    };

    // Include table in the walk
    bodyEl.querySelectorAll('h2, h3, p, .NLM_p, table, img[src*="cms/asset"]').forEach(function(el) {
      if (el.closest('.abstractSection')) return;

      var tag = el.tagName;

      // Skip <p> inside tables to avoid double-counting
      if ((tag === 'P' || el.classList.contains('NLM_p')) && el.closest('table')) return;

      if (tag === 'H2' || tag === 'H3') {
        flush();
        currentHeading = el.textContent.trim() || 'Untitled Section';
      } else if (tag === 'TABLE') {
        if (el.querySelectorAll('tr').length >= 2) {
          var tableText = extractTableAsText(el);
          if (tableText) {
            currentContent.push({ type: 'paragraph', text: tableText });
          }
        }
      } else if (tag === 'P' || el.classList.contains('NLM_p')) {
        var text = el.textContent.trim();
        if (text && text.length > 10) {
          currentContent.push({ type: 'paragraph', text: text });
        }
      } else if (tag === 'IMG' && el.src && el.src.includes('cms/asset')) {
        currentContent.push({ type: 'figure', figureId: el.src });
      }
    });

    flush();
  }

  // Also check .tableView containers (tables rendered outside main flow)
  document.querySelectorAll('.tableView table').forEach(function(table) {
    if (table.closest('.hlFld-Fulltext')) return;
    if (table.querySelectorAll('tr').length < 2) return;
    var tableText = extractTableAsText(table);
    if (tableText) {
      sections.push({ heading: 'Tables', content: [{ type: 'paragraph', text: tableText }] });
    }
  });

  // References
  var refEls = document.querySelectorAll('.references li, .citedByEntry, #references-section li');
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

  // T&F has no <figure> tags — images are in .figureView or directly as img with cms/asset URLs
  var imgEls = document.querySelectorAll('.figureView img, img[src*="cms/asset"]');

  for (var img of imgEls) {
    var src = img.src;
    if (!src || !src.includes('cms/asset')) continue;
    if (seen.has(src)) continue;
    seen.add(src);

    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(function(r) { setTimeout(r, 300); });

    // Caption from nearby elements
    var container = img.closest('.figureView') || img.closest('div');
    var captionEl = container?.querySelector('.caption, figcaption, .NLM_caption');
    if (!captionEl) {
      var nextEl = container?.nextElementSibling;
      if (nextEl && nextEl.textContent.trim().length < 300) {
        captionEl = nextEl;
      }
    }
    var caption = captionEl?.textContent?.trim() || '';

    var index = figures.length + 1;
    figures.push({ id: src, url: src, filename: 'fig' + index + '.png', caption: caption });
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
