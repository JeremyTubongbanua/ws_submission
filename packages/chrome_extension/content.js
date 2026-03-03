const ACTIVE_TASK_STORAGE = 'wsActiveTask';
const TOAST_ID = 'ws-comment-filler-toast';
const MANUAL_FILLED_ATTR = 'data-ws-manual-filled';

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

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return String(url || '').replace(/[#?].*$/, '').replace(/\/+$/, '');
  }
}

function urlsMatch(currentUrl, sourceUrl) {
  const current = normalizeUrl(currentUrl);
  const source = normalizeUrl(sourceUrl);
  return current === source || current.startsWith(source) || source.startsWith(current);
}

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

function readTextHints(element) {
  return [
    element.getAttribute('aria-label') || '',
    element.getAttribute('placeholder') || '',
    element.getAttribute('name') || '',
    element.id || '',
    typeof element.className === 'string' ? element.className : '',
    element.textContent || ''
  ]
    .join(' ')
    .toLowerCase();
}

function scoreEditable(element) {
  if (!isEditable(element) || !isVisible(element)) return -1;

  let score = 0;
  const hints = readTextHints(element);

  for (const hint of COMMENT_HINTS) {
    if (hints.includes(hint)) {
      score += 4;
    }
  }

  if (document.activeElement === element) score += 8;
  if (element instanceof HTMLTextAreaElement) score += 3;
  if (element.isContentEditable) score += 3;
  return score;
}

function findBestEditableTarget() {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && scoreEditable(activeElement) >= 0) {
    return activeElement;
  }

  const candidates = Array.from(document.querySelectorAll(EDITABLE_SELECTORS.join(',')));
  let best = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const score = scoreEditable(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function scrollElementIntoView(element) {
  element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}

function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  if (descriptor?.set) {
    descriptor.set.call(element, value);
    return;
  }

  element.value = value;
}

function moveCursorToEnd(element, text) {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const length = text.length;
    element.setSelectionRange(length, length);
    return;
  }

  if (element instanceof HTMLElement && (element.isContentEditable || element.getAttribute('role') === 'textbox')) {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function fillElement(element, text) {
  element.focus();

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    setNativeValue(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    moveCursorToEnd(element, text);
    return;
  }

  if (element instanceof HTMLElement && (element.isContentEditable || element.getAttribute('role') === 'textbox')) {
    element.textContent = text;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    moveCursorToEnd(element, text);
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

function showToast(message, isError = false) {
  let toast = document.getElementById(TOAST_ID);

  if (!toast) {
    toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.style.position = 'fixed';
    toast.style.top = '16px';
    toast.style.right = '16px';
    toast.style.zIndex = '2147483647';
    toast.style.maxWidth = '320px';
    toast.style.padding = '10px 12px';
    toast.style.borderRadius = '12px';
    toast.style.fontSize = '13px';
    toast.style.lineHeight = '1.35';
    toast.style.boxShadow = '0 14px 34px rgba(0,0,0,0.18)';
    toast.style.border = '1px solid rgba(17,24,39,0.08)';
    toast.style.transition = 'opacity 160ms ease';
    toast.style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
    document.documentElement.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.background = isError ? '#fef2f2' : '#fff8dc';
  toast.style.color = isError ? '#991b1b' : '#5f4300';
  toast.style.opacity = '1';

  window.clearTimeout(showToast.dismissTimer);
  showToast.dismissTimer = window.setTimeout(() => {
    const currentToast = document.getElementById(TOAST_ID);
    if (currentToast) {
      currentToast.style.opacity = '0';
    }
  }, 2600);
}

showToast.dismissTimer = 0;

function prepareComment(task, targetOverride) {
  if (!task?.id || !task?.source_url) {
    throw new Error('No active queue item is available for this page.');
  }

  if (!urlsMatch(window.location.href, task.source_url)) {
    throw new Error('The current page does not match the active queue item URL.');
  }

  const text = task?.selected_comment?.draft_text?.trim();
  if (!text) {
    throw new Error('This queue item does not have selected comment text.');
  }

  const target = targetOverride || findBestEditableTarget();
  if (!target) {
    throw new Error('No editable comment box was found on this page.');
  }

  scrollElementIntoView(target);
  fillElement(target, text);
  target.focus();
  return { reused: false };
}

async function getActiveTask() {
  const saved = await chrome.storage.local.get(ACTIVE_TASK_STORAGE);
  return saved[ACTIVE_TASK_STORAGE] || null;
}

async function maybeFillClickedTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (!isEditable(target) || !isVisible(target)) {
    return;
  }

  const task = await getActiveTask();
  if (!task || !task.source_url || !urlsMatch(window.location.href, task.source_url)) {
    return;
  }

  const text = task?.selected_comment?.draft_text?.trim();
  if (!text) {
    return;
  }

  if (target.getAttribute(MANUAL_FILLED_ATTR) === task.id) {
    return;
  }

  if (!isEmptyEditable(target)) {
    return;
  }

  prepareComment(task, target);
  target.setAttribute(MANUAL_FILLED_ATTR, task.id);
  showToast('Comment inserted. Review it before posting.');
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'WS_PREPARE_COMMENT') {
    return;
  }

  const task = message.payload || {};
  void Promise.resolve().then(() => prepareComment({
    id: task.contentId,
    source_url: task.sourceUrl,
    selected_comment: {
      draft_text: task.text || ''
    }
  }))
    .then(() => {
      showToast('Comment inserted. Review it before posting.');
      sendResponse({ ok: true });
    })
    .catch((error) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to prepare the comment box.';
      showToast(errorMessage, true);
      sendResponse({ ok: false, error: errorMessage });
    });

  return true;
});

document.addEventListener('focusin', (event) => {
  void maybeFillClickedTarget(event.target);
});

document.addEventListener('click', (event) => {
  void maybeFillClickedTarget(event.target);
});
