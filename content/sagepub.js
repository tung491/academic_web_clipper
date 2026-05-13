// content/sagepub.js
// SAGE Journals (Atypon Literatum) extraction. Injected after content/shared.js.
//
// DOM shape (verified on journals.sagepub.com full-text pages):
//   <h1 property="name">…title…</h1>
//   <meta name="citation_author" content="Family, Given"> (one per author)
//   <section id="abstract"><h2>Abstract</h2><div role="paragraph">…</div></section>
//   <section id="bodymatter">
//     <div role="paragraph">…lead-in paragraphs (no enclosing section)…</div>
//     <section id="sec-1"><h2>…</h2><div role="paragraph">…</div>…</section>
//     <section id="sec-3">
//       <h2>…</h2>
//       <section id="sec-3-1"><h3>…</h3>…</section>
//       …
//     </section>
//   </section>
//   <section id="backmatter">
//     <section id="appendix-1" role="doc-appendix"><h2>Appendix A</h2><section><h3>…</h3>…</section></section>
//     <section id="bibliography" role="doc-bibliography"><h2>References</h2>
//       <div role="list"><div role="listitem"><div class="citations">…</div></div>…</div>
//     </section>
//   </section>
// Lists: <div role="list"><div role="listitem"><div class="label">1.</div><div class="content"><div role="paragraph">…</div></div></div></div>
// Figures: <figure id="fig1-…"><img src="/cms/10.1177/…/asset/…/…large.jpeg"><figcaption>…</figcaption></figure>
// Tables: <figure class="table"><figcaption>…</figcaption><div class="table-wrap"><table>…</table></div></figure>

var SKIP_SECTION_IDS = new Set(['conflict', 'funding', 'orcid', 'data-availability', 'notes']);

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
    document.querySelector('h1[property="name"]')?.textContent?.trim() ||
    document.querySelector('meta[name="dc.Title"]')?.content?.trim() ||
    document.querySelector('meta[name="citation_title"]')?.content?.trim() ||
    'Untitled';

  // Authors from citation_author meta (already in "Family, Given" form on SAGE);
  // convert to "Given Family" for downstream consistency with other extractors.
  var authors = [];
  var seen = new Set();
  document.querySelectorAll('meta[name="citation_author"]').forEach(function(el) {
    var raw = el.content.trim();
    if (!raw) return;
    var name = raw.includes(',')
      ? raw.split(',').map(function(s) { return s.trim(); }).reverse().join(' ')
      : raw;
    if (!seen.has(name)) { seen.add(name); authors.push(name); }
  });
  if (authors.length === 0) {
    document.querySelectorAll('meta[name="dc.Creator"]').forEach(function(el) {
      var name = el.content.trim();
      if (name && !seen.has(name)) { seen.add(name); authors.push(name); }
    });
  }
  if (authors.length === 0) {
    document.querySelectorAll('.core-authors a, .authors a').forEach(function(el) {
      var name = el.textContent.trim();
      if (name && !seen.has(name)) { seen.add(name); authors.push(name); }
    });
  }

  var abstract = '';
  var abstractSec = document.querySelector('section#abstract, section[property="abstract"]');
  if (abstractSec) {
    var aparas = abstractSec.querySelectorAll('div[role="paragraph"], p');
    if (aparas.length === 0) aparas = abstractSec.querySelectorAll(':scope > div');
    abstract = [...aparas].map(function(p) { return p.textContent.trim(); }).filter(Boolean).join('\n\n');
  }

  var doi =
    document.querySelector('meta[name="citation_doi"]')?.content?.trim() ||
    document.querySelector('meta[name="dc.Identifier"][scheme="doi"]')?.content?.trim() || '';
  var date =
    document.querySelector('meta[name="citation_publication_date"]')?.content?.trim() ||
    document.querySelector('meta[name="citation_online_date"]')?.content?.trim() ||
    document.querySelector('meta[name="dc.Date"]')?.content?.trim() || '';
  var venue =
    document.querySelector('meta[name="citation_journal_title"]')?.content?.trim() ||
    document.querySelector('meta[name="dc.Source"]')?.content?.trim() || '';

  var keywords = [];
  document.querySelectorAll('section[property="keywords"] a, .core-keywords a').forEach(function(el) {
    var kw = el.textContent.trim();
    if (kw && !keywords.includes(kw)) keywords.push(kw);
  });
  if (keywords.length === 0) {
    var kwMeta = document.querySelector('meta[name="keywords"]')?.content || '';
    kwMeta.split(/[,;]/).forEach(function(kw) {
      var t = kw.trim();
      if (t && !keywords.includes(t)) keywords.push(t);
    });
  }

  return { title: title, authors: authors, doi: doi, date: date, venue: venue, keywords: keywords, abstract: abstract };
}

function extractSections() {
  var sections = [];

  // 1) Abstract
  var abstractSec = document.querySelector('section#abstract, section[property="abstract"]');
  if (abstractSec) {
    var aparas = abstractSec.querySelectorAll('div[role="paragraph"], p');
    if (aparas.length === 0) aparas = abstractSec.querySelectorAll(':scope > div');
    var atext = [...aparas].map(function(p) { return p.textContent.trim(); }).filter(Boolean).join('\n\n');
    if (atext) sections.push({ heading: 'Abstract', content: [{ type: 'paragraph', text: atext }] });
  }

  // 2) Body — bodymatter may contain leading paragraphs that sit OUTSIDE any <section>.
  var body = document.querySelector('section#bodymatter');
  if (body) {
    var lead = [];
    [...body.children].forEach(function(child) {
      if (child.tagName === 'SECTION') return;
      // bodymatter is wrapped in a <div class="core-container"> on SAGE; descend into it.
      if (child.matches('div.core-container, div')) {
        [...child.children].forEach(function(grand) {
          if (grand.tagName === 'SECTION') return;
          processBlock(grand, lead);
        });
        return;
      }
      processBlock(child, lead);
    });
    if (lead.length > 0) {
      sections.push({ heading: 'Introduction', content: lead });
    }

    body.querySelectorAll('section').forEach(function(sec) {
      var s = sectionFrom(sec);
      if (s) sections.push(s);
    });
  }

  // 3) Backmatter — appendices come through as their own sections; bibliography is special-cased.
  var back = document.querySelector('section#backmatter');
  if (back) {
    [...back.querySelectorAll(':scope > section, :scope > div > section')].forEach(function(sec) {
      if (SKIP_SECTION_IDS.has(sec.id)) return;
      if (sec.id === 'bibliography') return; // handled below

      var heading = directHeading(sec);
      if (!heading) return;

      // Top-level appendix: collect its content AND any nested subsections inline.
      var content = [];
      collectAll(sec, content);
      if (content.length > 0) sections.push({ heading: heading, content: content });
    });
  }

  // 4) References — flatten <div class="citations"> entries into a numbered list.
  var bib = document.querySelector('section#bibliography, section[role="doc-bibliography"]');
  if (bib) {
    var items = bib.querySelectorAll('div.citations .citation-content, div[role="listitem"] .citation-content');
    if (items.length === 0) items = bib.querySelectorAll('div[role="listitem"]');
    if (items.length > 0) {
      var refContent = [...items].map(function(el, i) {
        var text = el.textContent.replace(/\s+/g, ' ').trim();
        return { type: 'paragraph', text: (i + 1) + '. ' + text };
      });
      sections.push({ heading: 'References', content: refContent });
    }
  }

  return sections;
}

function sectionFrom(sec) {
  if (SKIP_SECTION_IDS.has(sec.id)) return null;
  if (sec.id === 'bibliography') return null;
  if (sec.matches('section[role="doc-appendix"]')) return null; // handled by backmatter loop

  var heading = directHeading(sec);
  if (!heading) return null;

  var content = [];
  [...sec.children].forEach(function(child) {
    if (child.tagName === 'SECTION') return;
    if (child.tagName === 'H2' || child.tagName === 'H3' || child.tagName === 'H4') return;
    processBlock(child, content);
  });

  if (content.length === 0) return null;
  return { heading: heading, content: content };
}

function directHeading(sec) {
  for (var i = 0; i < sec.children.length; i++) {
    var c = sec.children[i];
    if (c.tagName === 'H2' || c.tagName === 'H3' || c.tagName === 'H4') {
      return c.textContent.trim();
    }
  }
  return '';
}

// Recursively collect all content under a section, treating nested sub-section
// headings as inline bold labels. Used for appendices, where nesting carries
// semantic value (e.g. Appendix A → Detailed Description …).
function collectAll(sec, content) {
  [...sec.children].forEach(function(child) {
    if (child.tagName === 'H2' || child.tagName === 'H3' || child.tagName === 'H4') return;
    if (child.tagName === 'SECTION') {
      var subHeading = directHeading(child);
      if (subHeading) content.push({ type: 'paragraph', text: '**' + subHeading + '**' });
      collectAll(child, content);
      return;
    }
    processBlock(child, content);
  });
}

function processBlock(el, content) {
  if (!el || el.nodeType !== 1) return;

  // Figure (image)
  var graphic = el.matches?.('figure') && el.querySelector('img')
    ? el
    : el.querySelector?.('figure:not(.table) img')?.closest('figure');
  if (graphic && !graphic.classList.contains('table')) {
    var img = graphic.querySelector('img');
    if (img) {
      var src = img.getAttribute('data-src') || img.getAttribute('src') || img.src;
      if (src && !/data:image/.test(src)) {
        var url = src.startsWith('http') ? src : new URL(src, location.href).href;
        content.push({ type: 'figure', figureId: url });
      }
    }
    return;
  }

  // Table figure
  var tableFig = el.matches?.('figure.table') ? el : el.querySelector?.('figure.table');
  if (tableFig) {
    var tcap = tableFig.querySelector('figcaption')?.textContent?.trim();
    if (tcap) content.push({ type: 'paragraph', text: tcap });
    var tableEl = tableFig.querySelector('table');
    if (tableEl) {
      var tt = extractTableAsText(tableEl);
      if (tt) content.push({ type: 'paragraph', text: tt });
    }
    return;
  }

  // Bare table
  if (el.matches?.('table')) {
    var bt = extractTableAsText(el);
    if (bt) content.push({ type: 'paragraph', text: bt });
    return;
  }

  // List (Atypon uses <div role="list">; items are <div role="listitem"> with .label + .content)
  if (el.matches?.('div[role="list"], ol, ul')) {
    var listText = renderList(el);
    if (listText) content.push({ type: 'paragraph', text: listText });
    return;
  }

  // Paragraph
  if (el.matches?.('div[role="paragraph"], p')) {
    var text = el.textContent.trim();
    if (text) content.push({ type: 'paragraph', text: text });
    return;
  }

  // Wrapper — recurse into structural children
  if (el.children && el.children.length > 0) {
    [...el.children].forEach(function(c) { processBlock(c, content); });
  }
}

function renderList(listEl) {
  var lines = [];
  listEl.querySelectorAll(':scope > div[role="listitem"], :scope > li').forEach(function(item) {
    var rawLabel = item.querySelector(':scope > div.label')?.textContent?.trim() || '';
    var bodyEl = item.querySelector(':scope > div.content') || item;
    var paras = bodyEl.querySelectorAll('div[role="paragraph"], p');
    var text = paras.length
      ? [...paras].map(function(p) { return p.textContent.trim(); }).filter(Boolean).join(' ')
      : bodyEl.textContent.trim();
    if (!text) return;
    // Numbered labels stay as "1." (markdown ordered list); bullets/dashes/none normalize to "-".
    var prefix = /^\d+\./.test(rawLabel) ? rawLabel : '-';
    lines.push(prefix + ' ' + text);
  });
  return lines.join('\n');
}

async function extractFigures() {
  var figures = [];
  var seen = new Set();
  var figEls = document.querySelectorAll('section#bodymatter figure:not(.table) img, section[property="articleBody"] figure:not(.table) img');

  for (var img of figEls) {
    var rawSrc = img.getAttribute('data-src') || img.getAttribute('src') || img.src;
    if (!rawSrc || /^data:image/.test(rawSrc)) continue;

    var url = rawSrc.startsWith('http') ? rawSrc : new URL(rawSrc, location.href).href;
    if (seen.has(url)) continue;
    if (/icon|logo|spinner|banner|button/i.test(url)) continue;
    seen.add(url);

    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(function(r) { setTimeout(r, 300); });

    var liveSrc = img.src || img.getAttribute('data-src');
    var actualUrl = liveSrc && !/^data:image/.test(liveSrc)
      ? (liveSrc.startsWith('http') ? liveSrc : new URL(liveSrc, location.href).href)
      : url;

    var caption = img.closest('figure')?.querySelector('figcaption')?.textContent?.trim() || '';
    var ext = extFromUrl(actualUrl);
    var index = figures.length + 1;

    // Fetch from the page's origin so the user's cf_clearance / session cookies
    // are sent and Cloudflare's CORP same-origin policy is satisfied. The service
    // worker can't read these responses from a chrome-extension:// origin.
    var dataBase64 = null;
    try {
      var resp = await fetch(actualUrl, { credentials: 'include' });
      if (resp.ok) {
        var buf = await resp.arrayBuffer();
        dataBase64 = arrayBufferToBase64(buf);
      }
    } catch (e) { /* leave null; service worker will retry */ }

    figures.push({ id: url, url: actualUrl, filename: 'fig' + index + '.' + ext, caption: caption, dataBase64: dataBase64 });
  }

  window.scrollTo(0, 0);
  return figures;
}

function arrayBufferToBase64(buffer) {
  var bytes = new Uint8Array(buffer);
  var binary = '';
  var chunk = 0x8000;
  for (var i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function extFromUrl(url) {
  var m = url.match(/\.(png|jpe?g|gif|svg|webp)(?:\?|$)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
}

function extractTableAsText(table) {
  // Build a rectangular grid honoring rowspan/colspan; the first row becomes the
  // header and a separator is inserted so Obsidian renders this as a real table.
  var rows = [...table.querySelectorAll('tr')];
  if (rows.length === 0) return '';

  var grid = [];
  var pending = {}; // col -> { text, remaining }

  rows.forEach(function(tr) {
    var cells = [...tr.querySelectorAll(':scope > th, :scope > td')];
    var out = [];
    var cellIdx = 0;
    var col = 0;
    while (cellIdx < cells.length || (pending[col] && pending[col].remaining > 0)) {
      if (pending[col] && pending[col].remaining > 0) {
        out.push(pending[col].text);
        pending[col].remaining -= 1;
        col++;
      } else if (cellIdx < cells.length) {
        var c = cells[cellIdx++];
        var text = c.textContent.trim().replace(/\s+/g, ' ').replace(/\|/g, '\\|');
        var rowspan = parseInt(c.getAttribute('rowspan') || '1', 10) || 1;
        var colspan = parseInt(c.getAttribute('colspan') || '1', 10) || 1;
        for (var k = 0; k < colspan; k++) {
          out.push(text);
          if (rowspan > 1) pending[col] = { text: text, remaining: rowspan - 1 };
          col++;
        }
      } else break;
    }
    grid.push(out);
  });

  var width = grid.reduce(function(m, r) { return Math.max(m, r.length); }, 0);
  if (width === 0) return '';
  grid.forEach(function(r) { while (r.length < width) r.push(''); });

  var lines = ['| ' + grid[0].join(' | ') + ' |', '|' + ' --- |'.repeat(width)];
  for (var i = 1; i < grid.length; i++) {
    lines.push('| ' + grid[i].join(' | ') + ' |');
  }
  return lines.join('\n');
}
