// content/shared.js
// Shared helpers injected before publisher-specific content scripts.

function sendExtractionResult(data) {
  chrome.runtime.sendMessage({ type: 'extractionResult', data });
}

function sendExtractionError(message) {
  chrome.runtime.sendMessage({ type: 'extractionResult', error: message });
}

function fetchAndConvertToPng(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        // Canvas tainted by CORS — fall back to raw fetch with cookies
        fetchAsDataUrl(url).then(resolve).catch(reject);
      }
    };
    img.onerror = () => {
      // Image element failed (CORS rejection) — fall back to fetch with cookies
      fetchAsDataUrl(url).then(resolve).catch(reject);
    };
    img.src = url;
  });
}

function fetchAsDataUrl(url) {
  return fetch(url, { credentials: 'include' })
    .then(r => r.blob())
    .then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }));
}
