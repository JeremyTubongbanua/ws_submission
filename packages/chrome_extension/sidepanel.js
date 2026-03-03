const API_BASE_URL = 'https://api.thecopilotmarketer.ca';
const API_KEY_STORAGE = 'wsDbApiKey';
const READY_QUEUE_STORAGE = 'wsReadyQueue';
const ACTIVE_TASK_STORAGE = 'wsActiveTask';

const apiKeyInput = document.getElementById('apiKey');
const saveApiKeyButton = document.getElementById('saveApiKeyButton');
const loadQueueButton = document.getElementById('loadQueueButton');
const queueList = document.getElementById('queueList');
const statusNode = document.getElementById('status');

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.style.color = isError ? '#b42318' : '#44514d';
}

async function getFromStorage(key) {
  const saved = await chrome.storage.local.get(key);
  return saved[key];
}

async function setInStorage(values) {
  await chrome.storage.local.set(values);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function loadApiKey() {
  const apiKey = await getFromStorage(API_KEY_STORAGE);
  if (typeof apiKey === 'string') {
    apiKeyInput.value = apiKey;
  }
}

async function saveApiKey() {
  const apiKey = apiKeyInput.value.trim();
  await setInStorage({ [API_KEY_STORAGE]: apiKey });
  setStatus(apiKey ? 'Password saved.' : 'Saved empty password.', !apiKey);
}

function queueItemComment(item) {
  return item?.selected_comment?.draft_text || '';
}

async function loadLocalQueue() {
  const queue = await getFromStorage(READY_QUEUE_STORAGE);
  renderQueue(Array.isArray(queue) ? queue : []);
}

async function fetchReadyQueue() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus('Save the password first.', true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/v1/queues/ready-to-publish?limit=5&offset=0`, {
      headers: {
        'X-API-Key': apiKey,
      },
      cache: 'no-store',
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || `Failed (${response.status})`);
    }
    const items = Array.isArray(payload.items) ? payload.items : [];
    await setInStorage({ [READY_QUEUE_STORAGE]: items });
    renderQueue(items);
    setStatus(`Loaded ${items.length} ready item${items.length === 1 ? '' : 's'}.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to load ready queue.', true);
  }
}

async function clearQueue() {
  await setInStorage({ [READY_QUEUE_STORAGE]: [], [ACTIVE_TASK_STORAGE]: null });
  renderQueue([]);
  setStatus('Cleared local queue.');
}

async function deleteQueueItem(contentId) {
  const current = await getFromStorage(READY_QUEUE_STORAGE);
  const items = Array.isArray(current) ? current : [];
  const next = items.filter((item) => item.id !== contentId);
  await setInStorage({ [READY_QUEUE_STORAGE]: next });
  const activeTask = await getFromStorage(ACTIVE_TASK_STORAGE);
  if (activeTask?.id === contentId) {
    await setInStorage({ [ACTIVE_TASK_STORAGE]: null });
  }
  renderQueue(next);
  setStatus('Removed item from local queue.');
}

async function reportItemStatus(item, status) {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus('Save the password first.', true);
    return;
  }

  if (!item?.id) {
    setStatus('Queue item is missing a content id.', true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/v1/extension/tasks/${item.id}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        status,
        generated_comment_id: item?.selected_comment?.id || null,
        actor: 'user',
        actor_label: 'chrome-extension',
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || `Failed (${response.status})`);
    }
    await deleteQueueItem(item.id);
    setStatus(status === 'submitted' ? 'Marked item finished.' : 'Marked item skipped.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to update API status.', true);
  }
}

async function openAndPrepare(item) {
  if (!item?.source_url || !queueItemComment(item)) {
    setStatus('This queue item is missing a source URL or selected comment.', true);
    return;
  }

  await setInStorage({ [ACTIVE_TASK_STORAGE]: item });
  const tab = await chrome.tabs.create({ url: item.source_url, active: true });
  if (typeof tab.id !== 'number') {
    setStatus('Failed to open source tab.', true);
    return;
  }

  setStatus('Opened source tab. The extension will prepare the comment box on page load.');
}

async function autofillOnActiveTab(item) {
  const tab = await getActiveTab();
  if (!tab || typeof tab.id !== 'number') {
    setStatus('No active tab found.', true);
    return;
  }

  await setInStorage({ [ACTIVE_TASK_STORAGE]: item });

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'WS_PREPARE_COMMENT',
      payload: {
        text: queueItemComment(item),
        contentId: item.id,
        generatedCommentId: item.selected_comment?.id || null,
        sourceUrl: item.source_url,
      },
    });
    if (!response?.ok) {
      throw new Error(response?.error || 'Failed to prepare the active tab.');
    }
    setStatus('Scrolled to the comment area and inserted the draft.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not reach the page.', true);
  }
}

function renderQueue(items) {
  if (!Array.isArray(items) || items.length === 0) {
    queueList.innerHTML = '<div class="queue-card"><p class="queue-meta">No local ready items. Fetch the queue from the API.</p></div>';
    return;
  }

  queueList.innerHTML = '';

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'queue-card';

    const title = document.createElement('p');
    title.className = 'queue-title';
    title.textContent = item.title || 'Untitled post';
    card.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'queue-meta';
    meta.textContent = [item.source, item.source_author, item.state].filter(Boolean).join(' • ');
    card.appendChild(meta);

    if (item.source_url) {
      const link = document.createElement('a');
      link.className = 'queue-meta';
      link.href = item.source_url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = item.source_url;
      card.appendChild(link);
    }

    const comment = document.createElement('p');
    comment.className = 'queue-comment';
    comment.textContent = queueItemComment(item) || '(No selected draft text found)';
    card.appendChild(comment);

    const actions = document.createElement('div');
    actions.className = 'queue-actions three-up';

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.textContent = 'Open';
    openButton.addEventListener('click', () => {
      void openAndPrepare(item);
    });
    actions.appendChild(openButton);

    const finishedButton = document.createElement('button');
    finishedButton.type = 'button';
    finishedButton.className = 'secondary';
    finishedButton.textContent = 'Set Finished';
    finishedButton.addEventListener('click', () => {
      void reportItemStatus(item, 'submitted');
    });
    actions.appendChild(finishedButton);

    const skippedButton = document.createElement('button');
    skippedButton.type = 'button';
    skippedButton.className = 'ghost';
    skippedButton.textContent = 'Set Skipped';
    skippedButton.addEventListener('click', () => {
      void reportItemStatus(item, 'deleted');
    });
    actions.appendChild(skippedButton);

    card.appendChild(actions);
    queueList.appendChild(card);
  }
}

saveApiKeyButton.addEventListener('click', () => {
  void saveApiKey();
});

loadQueueButton.addEventListener('click', () => {
  void fetchReadyQueue();
});

void loadApiKey();
void loadLocalQueue();
