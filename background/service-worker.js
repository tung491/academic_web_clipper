// background/service-worker.js
import { toMarkdown } from '../lib/markdown.js';

// Listen for clip requests from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'clip') {
    handleClip(message.savePath);
  }
  if (message.type === 'extractionResult') {
    // Handled via pendingExtraction promise
  }
});

let pendingExtraction = null;

async function handleClip(savePath) {
  try {
    // Notify popup: extracting
    sendProgress('extracting');

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url.includes('ieeexplore.ieee.org')) {
      sendProgress('error', 'Not on an IEEE Xplore page');
      return;
    }

    // Set up listener for extraction result before injecting
    const extractionData = await injectAndWaitForResult(tab.id);

    if (extractionData.error) {
      sendProgress('error', extractionData.error);
      return;
    }

    const { metadata, sections, figures, paywalled } = extractionData;

    if (paywalled) {
      sendProgress('downloading', 'Paywall detected — clipping abstract only');
    }

    // Build folder name with timestamp
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
    const safeName = sanitizeFilename(metadata.title);
    const folderName = `${safeName}_${timestamp}`;
    const basePath = savePath ? `${savePath}/${folderName}` : folderName;

    // Notify popup: downloading
    sendProgress('downloading');

    // Download images, tracking failures
    let imageCount = 0;
    const failedFigures = [];
    for (const fig of figures) {
      try {
        await downloadFile(fig.url, `${basePath}/images/${fig.filename}`);
        imageCount++;
      } catch (err) {
        console.warn(`Failed to download ${fig.filename}:`, err);
        failedFigures.push(fig.id);
      }
    }

    // Mark failed figures so markdown converter can add placeholders
    const figuresWithStatus = figures.map(f => ({
      ...f,
      failed: failedFigures.includes(f.id)
    }));

    // Convert to markdown
    const markdown = toMarkdown({ metadata, sections, figures: figuresWithStatus });

    // Save markdown file
    const mdBlob = new Blob([markdown], { type: 'text/markdown' });
    const mdUrl = URL.createObjectURL(mdBlob);
    await downloadFile(mdUrl, `${basePath}/${safeName}.md`);
    URL.revokeObjectURL(mdUrl);

    // Notify popup: done
    sendProgress('done', `Clipped "${metadata.title}" with ${imageCount} images`);

    // Badge
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

function injectAndWaitForResult(tabId) {
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
      files: ['content/ieee.js']
    }).catch(err => {
      clearTimeout(timeout);
      chrome.runtime.onMessage.removeListener(listener);
      reject(err);
    });
  });
}

function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      // Wait for download to actually complete or fail
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

function sendProgress(stage, detail) {
  chrome.runtime.sendMessage({ type: 'progress', stage, detail }).catch(() => {
    // Popup may be closed, ignore
  });
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100);
}
