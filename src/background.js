importScripts(
  '/lib/firebase/firebase-app-compat.js',
  '/lib/firebase/firebase-auth-compat.js',
  '/lib/firebase/firebase-firestore-compat.js',
  '/src/firebase-init.js'
);

const {
  FIRESTORE_BASE_URL,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET
} = self.firebaseConstants || {};

if (!FIRESTORE_BASE_URL || !FIREBASE_PROJECT_ID || !FIREBASE_STORAGE_BUCKET) {
  throw new Error('Firebase constants unavailable. Ensure firebase-init.js exports expected values.');
}

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
    assignedPhone: payload.assignedPhone,
    sessionDateTime: payload.sessionId
  }, () => {
    if (chrome.runtime.lastError) {
      console.log('Failed to start execution:', chrome.runtime.lastError);
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ ok: true });
    }
  });
}

async function handleScrapingCompleted(message) {
  if (!activeSessionContext) {
    console.warn('Scraping completed without active session context.');
    return;
  }

  const { userId, sessionId } = activeSessionContext;
  const results = Array.isArray(message?.results) ? message.results : [];
  const summary = message?.summary || {};

  const flattenedItems = [];
  results.forEach((entry) => {
    const contact = entry?.contact;
    const items = Array.isArray(entry?.items) ? entry.items : [];
    items.forEach((item) => {
      flattenedItems.push({
        contact: contact || '',
        name: item?.name || '',
        desc: item?.desc || '',
        price: item?.price || '',
        description: item?.description || '',
        images: Array.isArray(item?.images) ? item.images : []
      });
    });
  });

  const totalItems = typeof summary.totalItems === 'number' ? summary.totalItems : flattenedItems.length;
  const totalContacts = typeof summary.totalContacts === 'number' ? summary.totalContacts : results.length;
  const timestamp = new Date().toISOString();

  if (totalItems === 0) {
    console.warn('Scraping completed with no catalog items. Skipping upload.');

    try {
      await firestoreDeleteDocument(`users/${userId}/sessions/${sessionId}`);
    } catch (error) {
      console.error('Failed to delete empty session document:', error);
    }

    chrome.runtime.sendMessage({
      action: 'sessionEmpty',
      sessionId,
      userId
    });

    activeSessionContext = null;
    return;
  }

  try {
    for (let index = 0; index < flattenedItems.length; index += 1) {
      const item = flattenedItems[index];
      const uploadedImages = await uploadItemImages(userId, sessionId, item, index);

      await firestoreAddDocument(
        `users/${userId}/sessions/${sessionId}/items`,
        {
          contact: item.contact,
          name: item.name,
          desc: item.desc,
          price: item.price,
          description: item.description,
          images: uploadedImages,
          uploadedAt: timestamp
        }
      );
    }

    activeSessionContext.uploaded = totalItems;
    activeSessionContext.total = totalItems;

    await updateSessionStatus('completed', {
      completedAt: timestamp,
      lastUploadedAt: timestamp,
      totalItems,
      uploadedItems: totalItems,
      totalContacts
    });

    chrome.runtime.sendMessage({
      action: 'sessionCompleted',
      sessionId,
      userId,
      totalItems
    });
  } catch (error) {
    console.log('Failed to finalize scraping results:', error);
    await updateSessionStatus('failed', { errorMessage: error.message });
  } finally {
    activeSessionContext = null;
  }
}

async function uploadItemImages(userId, sessionId, item, itemIndex) {
  const sourceImages = Array.isArray(item.images) ? item.images : [];
  const images = sourceImages.slice(2); // Skip the first two images

  if (images.length === 0) {
    return [];
  }

  const sanitizedContact = sanitizeStorageSegment(item.contact || 'contact');
  const storageBasePath = `users/${userId}/sessions/${sessionId}/${sanitizedContact}/item-${String(itemIndex).padStart(3, '0')}`;
  const uploadedImages = [];

  for (let i = 0; i < images.length; i += 1) {
    const dataUrl = images[i];
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      continue;
    }

    const originalIndex = i + 2; // Account for skipped images
    const path = `${storageBasePath}/image-${String(originalIndex).padStart(2, '0')}.jpg`;
    const url = await uploadImageDataUrl(path, dataUrl);
    if (url) {
      uploadedImages.push({
        path,
        url
      });
    }
  }

  return uploadedImages;
}

function sanitizeStorageSegment(value) {
  return (value || 'unknown')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-._]/g, '_')
    .slice(0, 80);
}

async function firestoreDeleteDocument(documentPath) {
  await authenticatedFetch(
    `${FIRESTORE_BASE_URL}/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${documentPath}`,
    'DELETE'
  );
}

async function uploadImageDataUrl(path, dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return null;
  }

  const { contentType, buffer } = parsed;

  const url = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${activeSessionContext.idToken}`,
        'Content-Type': contentType || 'application/octet-stream'
      },
      body: buffer
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Storage upload failed (${response.status}): ${errorText}`);
    }

    const metadata = await response.json();
    return buildDownloadUrl(metadata);
  } catch (error) {
    console.error('Unable to upload image to Firebase Storage:', error);
    return null;
  }
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') {
    return null;
  }

  const match = dataUrl.match(/^data:(.*?);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const contentType = match[1] || 'application/octet-stream';
  const base64Data = match[2];

  try {
    const binary = atob(base64Data);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { contentType, buffer: bytes };
  } catch (error) {
    console.error('Failed to decode base64 image data:', error);
    return null;
  }
}

function buildDownloadUrl(metadata) {
  if (!metadata || !metadata.name) {
    return null;
  }

  if (metadata.mediaLink) {
    return metadata.mediaLink;
  }

  if (metadata.downloadTokens) {
    const encodedName = encodeURIComponent(metadata.name);
    return `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodedName}?alt=media&token=${metadata.downloadTokens}`;
  }

  return null;
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