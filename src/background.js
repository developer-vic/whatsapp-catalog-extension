importScripts(
  '/lib/firebase/firebase-app-compat.js',
  '/lib/firebase/firebase-auth-compat.js',
  '/lib/firebase/firebase-firestore-compat.js',
  '/lib/firebase/firebase-storage-compat.js',
  '/src/firebase-init.js'
);

const FIRESTORE_BASE_URL = 'https://firestore.googleapis.com/v1';
const FIREBASE_PROJECT_ID = 'developervicc';

let activeSessionContext = null;

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: 'https://programmergwin.com'
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'executeScript':
      handleStartScraping(message, sender, sendResponse);
      return true;
    case 'catalogItemScraped':
      handleCatalogItem(message).catch((error) => {
        console.error('Failed to upload catalog item:', error);
        updateSessionStatus('failed', { errorMessage: error.message });
      });
      break;
    case 'scrapingCompleted':
      handleScrapingCompleted(message);
      break;
    case 'scrapingFailed':
      updateSessionStatus('failed', { errorMessage: message.error || 'Unknown scraping error.' });
      break;
    default:
      break;
  }
});

function handleStartScraping(payload, sender, sendResponse) {
  activeSessionContext = {
    userId: payload.userId,
    sessionId: payload.sessionId,
    assignedPhone: payload.assignedPhone,
    idToken: payload.idToken,
    uploaded: 0,
    total: 0
  };

  chrome.tabs.query({ url: '*://web.whatsapp.com/*' }, (tabs) => {
    const targetTab = tabs.length > 0 ? tabs[0] : null;

    if (!targetTab) {
      chrome.tabs.create({ url: 'https://web.whatsapp.com', active: true }, (createdTab) => {
        if (!createdTab) {
          sendResponse({ ok: false, error: 'Unable to open WhatsApp Web tab.' });
          return;
        }

        setTimeout(() => {
          dispatchStartExecution(createdTab.id, payload, sendResponse);
        }, 5000);
      });
      return;
    }

    dispatchStartExecution(targetTab.id, payload, sendResponse);
  });
}

function dispatchStartExecution(tabId, payload, sendResponse) {
  chrome.tabs.sendMessage(tabId, {
    action: 'startExecution',
    contact_list: payload.contact_list,
    sessionDateTime: payload.sessionId
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to start execution:', chrome.runtime.lastError);
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ ok: true });
    }
  });
}

async function handleCatalogItem(message) {
  if (!activeSessionContext) {
    console.warn('Received catalog item without active session.');
    return;
  }

  const { userId, sessionId } = activeSessionContext;
  const { contact, item, totalItems } = message;

  activeSessionContext.uploaded += 1;
  if (typeof totalItems === 'number') {
    activeSessionContext.total = totalItems;
  } else if (activeSessionContext.uploaded > activeSessionContext.total) {
    activeSessionContext.total = activeSessionContext.uploaded;
  }

  await firestoreAddDocument(
    `users/${userId}/sessions/${sessionId}/items`,
    {
      contact,
      name: item.name,
      desc: item.desc,
      price: item.price,
      description: item.description,
      uploadedAt: new Date().toISOString()
    }
  );

  await firestorePatchDocument(
    `users/${userId}/sessions/${sessionId}`,
    {
      uploadedItems: activeSessionContext.uploaded,
      totalItems: activeSessionContext.total,
      lastUploadedAt: new Date().toISOString()
    }
  );
}

function handleScrapingCompleted(message) {
  if (activeSessionContext && message?.summary) {
    activeSessionContext.total = message.summary.totalItems || activeSessionContext.total;
    activeSessionContext.uploaded = message.summary.totalItems || activeSessionContext.uploaded;
  }

  updateSessionStatus('completed', {
    completedAt: new Date().toISOString(),
    totalItems: activeSessionContext ? activeSessionContext.total : undefined,
    uploadedItems: activeSessionContext ? activeSessionContext.uploaded : undefined
  });

  activeSessionContext = null;
}

async function updateSessionStatus(status, extraFields = {}) {
  if (!activeSessionContext) {
    return;
  }

  const payload = { status, ...extraFields };
  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  await firestorePatchDocument(
    `users/${activeSessionContext.userId}/sessions/${activeSessionContext.sessionId}`,
    payload
  );
}

async function firestoreAddDocument(collectionPath, data) {
  await authenticatedFetch(
    `${FIRESTORE_BASE_URL}/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionPath}`,
    'POST',
    {
      fields: toFirestoreFields(data)
    }
  );
}

async function firestorePatchDocument(documentPath, data) {
  const keys = Object.keys(data);
  if (keys.length === 0) {
    return;
  }

  const fieldPaths = Object.keys(data)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join('&');

  await authenticatedFetch(
    `${FIRESTORE_BASE_URL}/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${documentPath}?${fieldPaths}&currentDocument.exists=true`,
    'PATCH',
    {
      fields: toFirestoreFields(data)
    }
  );
}

async function authenticatedFetch(url, method, body) {
  if (!activeSessionContext || !activeSessionContext.idToken) {
    throw new Error('Missing authentication token for Firestore request.');
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${activeSessionContext.idToken}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firestore request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

function toFirestoreFields(data) {
  const fields = {};
  Object.entries(data).forEach(([key, value]) => {
    fields[key] = toFirestoreValue(value);
  });
  return fields;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item))
      }
    };
  }

  const type = typeof value;

  if (type === 'string') {
    return { stringValue: value };
  }

  if (type === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: value.toString() };
    }
    return { doubleValue: value };
  }

  if (type === 'boolean') {
    return { booleanValue: value };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (type === 'object') {
    return {
      mapValue: {
        fields: toFirestoreFields(value)
      }
    };
  }

  return { stringValue: String(value) };
}