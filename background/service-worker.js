// background/service-worker.js
import { toMarkdown } from '../lib/markdown.js';
import { createZip } from '../lib/zip.js';

const PUBLISHERS = [
  { name: 'IEEE Xplore',    pattern: /ieeexplore\.ieee\.org/,    script: 'content/ieee.js' },
  { name: 'arXiv',          pattern: /arxiv\.org\/html\//,        script: 'content/arxiv.js' },
  { name: 'Springer',       pattern: /link\.springer\.com/,       script: 'content/springer.js' },
  { name: 'ScienceDirect',  pattern: /sciencedirect\.com/,        script: 'content/sciencedirect.js' },
  { name: 'MDPI',           pattern: /mdpi\.com/,                 script: 'content/mdpi.js' },
  { name: 'Wiley',          pattern: /onlinelibrary\.wiley\.com/, script: 'content/wiley.js' },
  { name: 'T&F Online',    pattern: /tandfonline\.com/,           script: 'content/tandfonline.js' },
  { name: 'ASCE Library',  pattern: /ascelibrary\.org/,           script: 'content/asce.js' },
  { name: 'Emerald',       pattern: /emerald\.com/,               script: 'content/emerald.js' },
  { name: 'SAGE Journals', pattern: /journals\.sagepub\.com/,     script: 'content/sagepub.js' },
];

// Listen for clip requests from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'clip') {
    handleClip(message.savePath, message.useSaveAs);
  }
});

async function handleClip(savePath, useSaveAs) {
  try {
    sendProgress('extracting');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const publisher = PUBLISHERS.find(p => p.pattern.test(tab?.url || ''));
    if (!publisher) {
      sendProgress('error', 'Not on a supported publisher page');
      return;
    }

    const extractionData = await injectAndWaitForResult(tab.id, publisher.script);

    if (extractionData.error) {
      sendProgress('error', extractionData.error);
      return;
    }

    const { metadata, sections, figures } = extractionData;

    sendProgress('downloading');

    // Fetch images in the service worker (host_permissions bypass CORS)
    const zipFiles = [];
    let imageCount = 0;
    const failedFigures = [];

    for (const fig of figures) {
      let binary = null;
      // Prefer bytes fetched by the content script (needed for Cloudflare-fronted
      // CDNs like SAGE that block cross-origin reads via cross-origin-resource-policy).
      if (fig.dataBase64) {
        try { binary = base64ToUint8Array(fig.dataBase64); }
        catch (err) { console.warn(`Bad base64 for ${fig.filename}:`, err); }
      }
      if (!binary && fig.url) {
        try { binary = await fetchImageAsUint8Array(fig.url); }
        catch (err) { console.warn(`Failed to fetch ${fig.filename}:`, err); }
      }
      if (binary) {
        zipFiles.push({ name: `images/${fig.filename}`, data: binary });
        imageCount++;
      } else {
        failedFigures.push(fig.id);
      }
    }

    // Mark failed figures for markdown placeholders
    const figuresWithStatus = figures.map(f => ({
      ...f,
      failed: failedFigures.includes(f.id)
    }));

    // Convert to markdown
    const markdown = toMarkdown({ metadata, sections, figures: figuresWithStatus });

    // Add markdown to zip
    const safeName = sanitizeFilename(metadata.title);
    zipFiles.unshift({
      name: `${safeName}.md`,
      data: new TextEncoder().encode(markdown)
    });

    // Create zip
    const zipBytes = createZip(zipFiles);

    // Download zip as a single file
    const base64 = uint8ArrayToBase64(zipBytes);
    const zipDataUrl = `data:application/zip;base64,${base64}`;

    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
    const zipFilename = savePath
      ? `${savePath}/${safeName}_${timestamp}.zip`
      : `${safeName}_${timestamp}.zip`;

    await downloadFile(zipDataUrl, zipFilename, useSaveAs);

    sendProgress('done', `Clipped "${metadata.title}" with ${imageCount} images`);

    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);

  } catch (err) {
    sendProgress('error', err.message);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
  }
}

function injectAndWaitForResult(tabId, scriptPath) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(new Error('Extraction timed out after 30s'));
    }, 30000);

    function listener(message, sender) {
      if (message.type === 'extractionResult' && sender.tab?.id === tabId) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        resolve(message.data || { error: message.error });
      }
    }

    chrome.runtime.onMessage.addListener(listener);

    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/shared.js', scriptPath]
    }).catch(err => {
      clearTimeout(timeout);
      chrome.runtime.onMessage.removeListener(listener);
      reject(err);
    });
  });
}

function downloadFile(url, filename, saveAs = false) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs }, (downloadId) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      function onChange(delta) {
        if (delta.id !== downloadId) return;
        if (delta.state?.current === 'complete') {
          chrome.downloads.onChanged.removeListener(onChange);
          resolve(downloadId);
        } else if (delta.state?.current === 'interrupted' || delta.error) {
          chrome.downloads.onChanged.removeListener(onChange);
          reject(new Error(delta.error?.current || 'Download failed'));
        }
      }
      chrome.downloads.onChanged.addListener(onChange);
    });
  });
}

async function fetchImageAsUint8Array(url) {
  // credentials: 'include' sends the user's publisher cookies (cf_clearance, session, etc.).
  // Without them, Cloudflare-fronted CDNs (SAGE, ASCE, Wiley) return a 403 challenge page.
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

function base64ToUint8Array(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function sendProgress(stage, detail) {
  chrome.runtime.sendMessage({ type: 'progress', stage, detail }).catch(() => {});
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100);
}
