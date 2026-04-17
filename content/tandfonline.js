// content/tandfonline.js
// Taylor & Francis Online extraction. Injected after content/shared.js.

(async function extractPaper() {
  try {
    // First, extract tables from popups (T&F loads them dynamically)
    var tableMap = await extractPopupTables();

    var metadata = extractMetadata();
    var sections = extractSections(tableMap);
    var figures = await extractFigures();
    sendExtractionResult({ metadata: metadata, sections: sections, figures: figures });
  } catch (err) {
    sendExtractionError(err.message);
  }
})();

async function extractPopupTables() {
  var tableMap = {};

  // Also capture any tables already in the DOM
  document.querySelectorAll('table').forEach(function(t) {
    if (t.querySelectorAll('tr').length < 2) return;
    var sec = t.closest('.NLM_sec, .NLM_sec_level_1');
    var captionEl = sec ? sec.querySelector('.tableCaption, .NLM_caption, caption') : null;
    var caption = captionEl ? captionEl.textContent.trim() : '';
    var match = caption.match(/table\s*(\d+)/i);
    var key = match ? match[1] : 'static_' + Object.keys(tableMap).length;
    tableMap[key] = { caption: caption, text: extractTableAsText(t) };
  });

  // Find all "Display Table" links and click them to load hidden tables
  var displayLinks = [];
  document.querySelectorAll('.tableView a, .tableView button').forEach(function(el) {
    if (/display\s*table/i.test(el.textContent)) {
      var view = el.closest('.tableView');
      var captionEl = view ? view.querySelector('.tableCaption, .NLM_caption') : null;
      var caption = captionEl ? captionEl.textContent.trim() : '';
      displayLinks.push({ el: el, caption: caption });
    }
  });

  for (var i = 0; i < displayLinks.length; i++) {
    var link = displayLinks[i];
    var match = link.caption.match(/table\s*(\d+)/i);
    var key = match ? match[1] : 'popup_' + i;

    // Skip if already captured from static DOM
    if (tableMap[key]) continue;

    var tablesBefore = document.querySelectorAll('table').length;

    link.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

    var newTable = await waitForNewTable(tablesBefore);
    if (newTable) {
      var tableText = extractTableAsText(newTable);
      if (tableText) {
        tableMap[key] = { caption: link.caption, text: tableText };
      }
    }

    var closeBtn = document.querySelector('button.modal-close') || document.querySelector('button.ref-close');
    if (closeBtn) {
      closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    } else {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    }
    await new Promise(function(r) { setTimeout(r, 800); });
  }

  return tableMap;
}

function waitForNewTable(countBefore) {
  return new Promise(function(resolve) {
    var attempts = 0;
    var interval = setInterval(function() {
      attempts++;
      var allTables = document.querySelectorAll('table');
      if (allTables.length > countBefore) {
        clearInterval(interval);
        resolve(allTables[allTables.length - 1]);
      } else if (attempts > 20) {
        clearInterval(interval);
        resolve(null);
      }
    }, 300);
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

function extractSections(tableMap) {
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

  // Walk the body in document order, inserting tables at .tableView positions
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

    bodyEl.querySelectorAll('h2, h3, p, .NLM_p, table, .tableView, img[src*="cms/asset"]').forEach(function(el) {
      if (el.closest('.abstractSection')) return;

      var tag = el.tagName;

      // Skip <p> inside tables
      if ((tag === 'P' || el.classList.contains('NLM_p')) && el.closest('table')) return;
      // Skip <p> inside .tableView (caption text)
      if ((tag === 'P' || el.classList.contains('NLM_p')) && el.closest('.tableView')) return;

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
      } else if (el.classList.contains('tableView')) {
        // Insert the popup-extracted table at this position
        var captionEl = el.querySelector('.tableCaption, .NLM_caption');
        var caption = captionEl ? captionEl.textContent.trim() : '';
        var match = caption.match(/table\s*(\d+)/i);
        var key = match ? match[1] : null;

        if (key && tableMap[key]) {
          var entry = tableMap[key];
          var fullText = entry.caption ? entry.caption + '\n' + entry.text : entry.text;
          currentContent.push({ type: 'paragraph', text: fullText });
        } else if (caption) {
          // Table not loaded — at least note it exists
          currentContent.push({ type: 'paragraph', text: caption + '\n(Table content not available)' });
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

  var imgEls = document.querySelectorAll('.figureView img, img[src*="cms/asset"]');

  for (var img of imgEls) {
    var src = img.src;
    if (!src || !src.includes('cms/asset')) continue;
    if (seen.has(src)) continue;
    seen.add(src);

    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(function(r) { setTimeout(r, 300); });

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
