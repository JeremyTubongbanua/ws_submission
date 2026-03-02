const EDITABLE_SELECTORS = [
  'textarea',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  'div[role="textbox"]',
  'input[type="text"]'
];

const COMMENT_HINTS = [
  'comment',
  'reply',
  'respond',
  'add a comment',
  'write a comment',
  'join the conversation'
];
const STORAGE_KEY = 'wsDraftComment';
const AUTO_FILLED_ATTR = 'data-ws-autofilled';
const PRESETS_PATH = 'presets.json';

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function isEditable(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement && element.type === 'text') return true;
  if (element.isContentEditable) return true;
  return element.getAttribute('role') === 'textbox';
}

function textHintsFor(element) {
  return [
    element.getAttribute('aria-label') || '',
    element.getAttribute('placeholder') || '',
    element.getAttribute('name') || '',
    element.id || '',
    element.className || ''
  ].join(' ').toLowerCase();
}

function scoreElement(element) {
  if (!isEditable(element) || !isVisible(element)) return -1;

  let score = 0;
  const hints = textHintsFor(element);
  for (const hint of COMMENT_HINTS) {
    if (hints.includes(hint)) score += 3;
  }

  if (document.activeElement === element) score += 10;
  if (element instanceof HTMLTextAreaElement) score += 2;
  if (element.isContentEditable) score += 2;
  return score;
}

function findBestEditableTarget() {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && isEditable(activeElement) && isVisible(activeElement)) {
    return activeElement;
  }

  const candidates = Array.from(document.querySelectorAll(EDITABLE_SELECTORS.join(',')));
  let best = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const score = scoreElement(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor && descriptor.set) {
    descriptor.set.call(element, value);
    return true;
  }

  element.value = value;
  return true;
}

function fillElement(element, text) {
  element.focus();

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    setNativeValue(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (element instanceof HTMLElement && (element.isContentEditable || element.getAttribute('role') === 'textbox')) {
    element.textContent = text;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    return;
  }

  throw new Error('Unsupported editable element.');
}

function isEmptyEditable(element) {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value.trim() === '';
  }

  if (element instanceof HTMLElement && (element.isContentEditable || element.getAttribute('role') === 'textbox')) {
    return (element.textContent || '').trim() === '';
  }

  return false;
}

async function loadDraftText() {
  const presets = await loadPresets();
  const preset = getPresetCommentForUrl(presets, window.location.href);
  if (preset?.text) {
    return preset.text.trim();
  }

  const saved = await chrome.storage.local.get(STORAGE_KEY);
  const text = saved[STORAGE_KEY];
  return typeof text === 'string' ? text.trim() : '';
}

async function loadPresets() {
  const url = chrome.runtime.getURL(PRESETS_PATH);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

function getPresetCommentForUrl(presets, url) {
  return (
    presets.find((preset) =>
      Array.isArray(preset.urlPrefixes) &&
      preset.urlPrefixes.some((prefix) => typeof prefix === 'string' && url.startsWith(prefix))
    ) || null
  );
}

async function maybeAutoFill(target) {
  if (!(target instanceof HTMLElement)) return;
  if (!isEditable(target) || !isVisible(target)) return;

  const score = scoreElement(target);
  if (score < 3) return;
  if (target.getAttribute(AUTO_FILLED_ATTR) === 'true') return;
  if (!isEmptyEditable(target)) return;

  const draftText = await loadDraftText();
  if (!draftText) return;

  fillElement(target, draftText);
  target.setAttribute(AUTO_FILLED_ATTR, 'true');
}

document.addEventListener('focusin', (event) => {
  void maybeAutoFill(event.target);
});

document.addEventListener('click', (event) => {
  void maybeAutoFill(event.target);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'WS_FILL_COMMENT') {
    return;
  }

  try {
    const target = findBestEditableTarget();
    if (!target) {
      sendResponse({ ok: false, error: 'No editable comment box found on this page.' });
      return;
    }

    fillElement(target, message.payload?.text || '');
    sendResponse({ ok: true });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to fill the comment box.'
    });
  }
});
