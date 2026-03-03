const commentInput = document.getElementById('commentText');
const apiKeyInput = document.getElementById('apiKey');
const saveApiKeyButton = document.getElementById('saveApiKeyButton');
const loadQueueButton = document.getElementById('loadQueueButton');
const queueList = document.getElementById('queueList');
const saveButton = document.getElementById('saveButton');
const fillButton = document.getElementById('fillButton');
const statusNode = document.getElementById('status');
const presetBanner = document.getElementById('presetBanner');
const presetList = document.getElementById('presetList');
const STORAGE_KEY = 'wsDraftComment';
const API_KEY_STORAGE = 'wsDbApiKey';
const PRESETS_PATH = 'presets.json';
const API_BASE_URL = 'https://api.thecopilotmarketer.ca';

async function loadPresets() {
  const url = chrome.runtime.getURL(PRESETS_PATH);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load presets (${response.status})`);
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

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.style.color = isError ? '#b42318' : '#44514d';
}

async function loadSavedDraft() {
  const saved = await chrome.storage.local.get(STORAGE_KEY);
  if (typeof saved[STORAGE_KEY] === 'string' && saved[STORAGE_KEY]) {
    commentInput.value = saved[STORAGE_KEY];
  }
}

async function loadSavedApiKey() {
  const saved = await chrome.storage.local.get(API_KEY_STORAGE);
  if (typeof saved[API_KEY_STORAGE] === 'string') {
    apiKeyInput.value = saved[API_KEY_STORAGE];
  }
}

async function loadPresetForActiveTab() {
  const tab = await getActiveTab();
  if (!tab || typeof tab.url !== 'string') {
    return;
  }

  const presets = await loadPresets();
  const preset = getPresetCommentForUrl(presets, tab.url);
  if (!preset) {
    presetBanner.hidden = true;
    return;
  }

  presetBanner.hidden = false;
  presetBanner.textContent = 'This page has a URL-specific preset comment. Auto-fill will use it.';
  commentInput.value = preset.text;
}

function renderPresetList(presets, activeUrl) {
  if (!presetList) {
    return;
  }

  if (!Array.isArray(presets) || presets.length === 0) {
    presetList.innerHTML = '<div class="preset-card"><p class="preset-comment">No URL presets configured.</p></div>';
    return;
  }

  presetList.innerHTML = '';

  for (const preset of presets) {
    const card = document.createElement('article');
    const isActive =
      typeof activeUrl === 'string' &&
      Array.isArray(preset.urlPrefixes) &&
      preset.urlPrefixes.some((prefix) => activeUrl.startsWith(prefix));

    card.className = `preset-card${isActive ? ' is-active' : ''}`;

    const title = document.createElement('h3');
    title.className = 'preset-name';
    title.textContent = preset.label || preset.id || 'Preset';
    card.appendChild(title);

    if (isActive) {
      const chip = document.createElement('span');
      chip.className = 'preset-chip';
      chip.textContent = 'Matches current tab';
      card.appendChild(chip);
    }

    for (const prefix of preset.urlPrefixes) {
      const link = document.createElement('a');
      link.className = 'preset-link';
      link.href = prefix;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = prefix;
      card.appendChild(link);
    }

    const comment = document.createElement('p');
    comment.className = 'preset-comment';
    comment.textContent = preset.text;
    card.appendChild(comment);

    presetList.appendChild(card);
  }
}

async function saveDraft() {
  const text = commentInput.value.trim();
  await chrome.storage.local.set({ [STORAGE_KEY]: text });
  setStatus(text ? 'Draft saved for auto-fill.' : 'Saved empty draft. Auto-fill disabled until text is added.');
}

async function saveApiKey() {
  const apiKey = apiKeyInput.value.trim();
  await chrome.storage.local.set({ [API_KEY_STORAGE]: apiKey });
  setStatus(apiKey ? 'API key saved.' : 'Saved empty API key.', !apiKey);
}

function renderQueue(items) {
  if (!queueList) return;
  if (!Array.isArray(items) || items.length === 0) {
    queueList.innerHTML = '<div class="queue-card"><p class="queue-meta">No ready-to-publish items found.</p></div>';
    return;
  }

  queueList.innerHTML = '';
  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'queue-card';

    const title = document.createElement('p');
    title.className = 'queue-title';
    title.textContent = item.title || item.source_url || item.id || 'Untitled item';
    card.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'queue-meta';
    meta.textContent = [item.source, item.source_author, item.source_url].filter(Boolean).join(' • ');
    card.appendChild(meta);

    const useButton = document.createElement('button');
    useButton.type = 'button';
    useButton.textContent = 'Use Source URL';
    useButton.addEventListener('click', () => {
      if (typeof item.source_url === 'string') {
        commentInput.value = commentInput.value || '';
        window.open(item.source_url, '_blank', 'noopener,noreferrer');
      }
    });
    card.appendChild(useButton);

    queueList.appendChild(card);
  }
}

async function loadReadyQueue() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus('Save the DB API key first.', true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/v1/queues/ready-to-publish?limit=10&offset=0`, {
      headers: {
        'X-API-Key': apiKey,
      },
      cache: 'no-store',
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || `Failed (${response.status})`);
    }
    renderQueue(payload.items || []);
    setStatus('Loaded ready-to-publish queue.');
  } catch (error) {
    renderQueue([]);
    setStatus(error instanceof Error ? error.message : 'Failed to load queue.', true);
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function fillCommentBox() {
  const text = commentInput.value.trim();
  if (!text) {
    setStatus('Enter comment text first.', true);
    return;
  }

  const tab = await getActiveTab();
  if (!tab || typeof tab.id !== 'number') {
    setStatus('No active tab found.', true);
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'WS_FILL_COMMENT',
      payload: { text }
    });

    if (!response || !response.ok) {
      setStatus(response?.error || 'No editable comment box found.', true);
      return;
    }

    setStatus('Comment text inserted.');
  } catch (error) {
    setStatus('Could not contact the page. Reload the tab and try again.', true);
  }
}

async function initializePopup() {
  try {
    await loadSavedDraft();
    await loadSavedApiKey();
    const tab = await getActiveTab();
    const presets = await loadPresets();
    renderPresetList(presets, tab?.url);
    await loadPresetForActiveTab();
  } catch (error) {
    setStatus('Failed to load URL presets.', true);
  }
}

fillButton.addEventListener('click', () => {
  void fillCommentBox();
});

saveButton.addEventListener('click', () => {
  void saveDraft();
});

saveApiKeyButton.addEventListener('click', () => {
  void saveApiKey();
});

loadQueueButton.addEventListener('click', () => {
  void loadReadyQueue();
});

void initializePopup();
