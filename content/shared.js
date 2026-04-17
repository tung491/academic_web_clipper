// content/shared.js
// Shared helpers injected before publisher-specific content scripts.
// Image fetching is handled by the service worker (bypasses CORS via host_permissions).

function sendExtractionResult(data) {
  chrome.runtime.sendMessage({ type: 'extractionResult', data });
}

function sendExtractionError(message) {
  chrome.runtime.sendMessage({ type: 'extractionResult', error: message });
}
