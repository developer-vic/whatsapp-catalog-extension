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
    case 'catalogItemScraped':
      handleCatalogItemUpload(message, sendResponse);
      return true;
    case 'scrapingCompleted':
      handleScrapingCompleted(message, sendResponse);
      return true;
    case 'scrapingFailed':
      updateSessionStatus('failed', { errorMessage: message.error || 'Unknown scraping error.' })
        .catch((error) => {
          console.log('Failed to update session status after scraping failure:', error);
        })
        .finally(() => {
          activeSessionContext = null;
        });
      if (typeof sendResponse === 'function') {
        sendResponse({ ok: true });
      }
      return false;
    default:
      break;
  }
});

function handleStartScraping(payload, sender, sendResponse) {
  const limitValue = payload.itemLimit && Number.isFinite(payload.itemLimit) && payload.itemLimit > 0
    ? Math.floor(payload.itemLimit)
    : null;

  activeSessionContext = {
    userId: payload.userId,
    sessionId: payload.sessionId,
    assignedPhone: payload.assignedPhone,
    idToken: payload.idToken,
    uploaded: 0,
    total: limitValue || 0,
    success: 0,
    failure: 0,
    itemLimit: limitValue
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
    sessionDateTime: payload.sessionId,
    itemLimit: activeSessionContext?.itemLimit || null
  }, () => {
    if (chrome.runtime.lastError) {
      console.log('Failed to start execution:', chrome.runtime.lastError);
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ ok: true });
    }
  });
}

async function handleCatalogItemUpload(message, sendResponse) {
  if (!activeSessionContext) {
    sendResponse({ ok: false, error: 'No active session context.' });
    return;
  }

  const { userId, sessionId } = activeSessionContext;
  const contact = message?.contact || activeSessionContext.assignedPhone || '';
  const item = message?.item || {};
  const totalItemsHint = typeof message?.totalItems === 'number'
    ? message.totalItems
    : (activeSessionContext.itemLimit || null);
  const itemIndex = activeSessionContext.success + activeSessionContext.failure;
  const timestamp = new Date().toISOString();

  const preparedItem = {
    contact,
    name: item?.name || '',
    desc: item?.desc || '',
    price: item?.price || '',
    description: item?.description || '',
    images: Array.isArray(item?.images) ? item.images : []
  };

  const attemptedImages = Math.min(Math.max(preparedItem.images.length - 2, 0), 5);
  let uploadedImages = [];

  try {
    uploadedImages = await uploadItemImages(userId, sessionId, preparedItem, itemIndex);

    await firestoreAddDocument(
      `users/${userId}/sessions/${sessionId}/items`,
      {
        contact: preparedItem.contact,
        name: preparedItem.name,
        desc: preparedItem.desc,
        price: preparedItem.price,
        description: preparedItem.description,
        images: uploadedImages,
        uploadedAt: timestamp
      }
    );

    activeSessionContext.uploaded += 1;
    activeSessionContext.success += 1;
    if (typeof totalItemsHint === 'number' && totalItemsHint >= 0) {
      activeSessionContext.total = Math.max(activeSessionContext.total, totalItemsHint);
    }

    try {
      await updateSessionProgress({ lastUploadedAt: timestamp });
    } catch (progressError) {
      console.log('Failed to update session progress:', progressError);
    }

    sendResponse({
      ok: true,
      summary: {
        success: activeSessionContext.success,
        failure: activeSessionContext.failure
      },
      imagesUploaded: uploadedImages.length,
      imagesAttempted: attemptedImages
    });
  } catch (error) {
    console.error('Failed to upload catalog item:', error);
    activeSessionContext.failure += 1;
    if (typeof totalItemsHint === 'number' && totalItemsHint >= 0) {
      activeSessionContext.total = Math.max(activeSessionContext.total, totalItemsHint);
    }

    try {
      await updateSessionProgress();
    } catch (progressError) {
      console.log('Failed to update session progress after error:', progressError);
    }

    sendResponse({
      ok: false,
      error: error.message,
      summary: {
        success: activeSessionContext.success,
        failure: activeSessionContext.failure
      },
      imagesUploaded: uploadedImages.length,
      imagesAttempted: attemptedImages
    });
  }
}

async function handleScrapingCompleted(message, sendResponse) {
  if (!activeSessionContext) {
    sendResponse({ ok: false, error: 'No active session context.' });
    return;
  }

  const { userId, sessionId } = activeSessionContext;
  const incomingSummary = message?.summary || {};
  const success = activeSessionContext.success;
  const failure = activeSessionContext.failure;
  const timestamp = new Date().toISOString();

  const processedTotal = Math.max(success + failure, incomingSummary.totalItems || 0);
  const totalItems = processedTotal;
  const totalContacts = Math.max(
    incomingSummary.totalContacts || (processedTotal > 0 ? 1 : 0),
    0
  );

  if (totalItems === 0 && failure === 0) {
    try {
      await firestoreDeleteDocument(`users/${userId}/sessions/${sessionId}`);
    } catch (error) {
      console.error('Failed to delete empty session document:', error);
    }

    notifyRuntime({ action: 'sessionEmpty', userId });
    sendResponse({
      ok: true,
      summary: {
        success: 0,
        failure: 0,
        totalItems: 0,
        totalContacts
      }
    });

    activeSessionContext = null;
    return;
  }

  activeSessionContext.uploaded = success;
  activeSessionContext.total = totalItems;

  const finalSummary = {
    success,
    failure,
    totalItems,
    totalContacts
  };

  let finalizeError = null;

  try {
    await updateSessionStatus('completed', {
      completedAt: timestamp,
      lastUploadedAt: timestamp,
      totalItems,
      uploadedItems: success,
      failedItems: failure,
      totalContacts
    });

    notifyRuntime({
      action: 'sessionCompleted',
      sessionId,
      userId,
      summary: finalSummary
    });
  } catch (error) {
    console.log('Failed to finalize scraping results:', error);
    finalizeError = error;
    await updateSessionStatus('failed', {
      errorMessage: error.message,
      uploadedItems: success,
      failedItems: failure,
      totalItems
    });
  } finally {
    sendResponse({
      ok: !finalizeError,
      error: finalizeError?.message,
      summary: finalSummary
    });
    activeSessionContext = null;
  }
}

async function uploadItemImages(userId, sessionId, item, itemIndex) {
  const sourceImages = Array.isArray(item.images) ? item.images : [];
  const images = sourceImages.slice(2, 7); // Skip the first two images and keep up to five

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

function notifyRuntime(payload) {
  try {
    const message = filterRuntimePayload(payload);

    chrome.runtime.sendMessage(message, () => {
      const error = chrome.runtime.lastError;
      if (error && !error.message?.includes('Receiving end does not exist')) {
        console.log('Runtime message error:', error);
      }
    });
  } catch (error) {
    console.log('Failed to send runtime message:', error);
  }
}

function filterRuntimePayload(payload = {}) {
  switch (payload.action) {
    case 'sessionCompleted':
      return {
        action: 'sessionCompleted',
        sessionId: payload.sessionId,
        userId: payload.userId,
        summary: {
          success: payload.summary?.success || 0,
          failure: payload.summary?.failure || 0,
          totalItems: payload.summary?.totalItems || 0
        }
      };
    case 'sessionEmpty':
      return {
        action: 'sessionEmpty',
        userId: payload.userId
      };
    default:
      return { action: payload.action };
  }
}

async function updateSessionProgress(extraFields = {}) {
  if (!activeSessionContext) {
    return;
  }

  const { userId, sessionId } = activeSessionContext;
  const total = Math.max(
    activeSessionContext.total || 0,
    activeSessionContext.success + activeSessionContext.failure
  );

  activeSessionContext.total = total;

  const payload = {
    uploadedItems: activeSessionContext.success,
    failedItems: activeSessionContext.failure,
    totalItems: total,
    ...extraFields
  };

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  await firestorePatchDocument(
    `users/${userId}/sessions/${sessionId}`,
    payload
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