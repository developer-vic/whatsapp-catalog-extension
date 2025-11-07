let currentUser = null;
let assignedPhoneNumber = null;
let activeSessionId = null;
let isStartingSession = false;

document.addEventListener('DOMContentLoaded', () => {
  bindEventListeners();
  firebaseAuth.onAuthStateChanged(handleAuthStateChanged);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'sessionCompleted') {
    handleSessionCompleted(message).catch((error) => {
      console.error('Unable to handle completed session notification:', error);
    });
  }
});

function bindEventListeners() {
  document.getElementById('loginForm').addEventListener('submit', handleLoginSubmit);
  document.getElementById('resetPasswordButton').addEventListener('click', handlePasswordReset);
  document.getElementById('logoutButton').addEventListener('click', handleLogout);
  document.getElementById('startScrapeButton').addEventListener('click', handleStartScrape);
}

function handleLoginSubmit(event) {
  event.preventDefault();

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const loginButton = document.getElementById('loginButton');

  if (!email || !password) {
    showBanner('Please enter both email and password.', 'error');
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = 'Signing in...';

  firebaseAuth
    .signInWithEmailAndPassword(email, password)
    .then(() => {
      showBanner('Successfully signed in.', 'success');
    })
    .catch((error) => {
      console.error('Login error:', error);
      showBanner(parseFirebaseError(error), 'error');
    })
    .finally(() => {
      loginButton.disabled = false;
      loginButton.textContent = 'Sign in';
    });
}

function handlePasswordReset() {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) {
    showBanner('Enter your email first to receive a reset link.', 'error');
    return;
  }

  firebaseAuth
    .sendPasswordResetEmail(email)
    .then(() => {
      showBanner('Password reset email sent. Check your inbox.', 'success');
    })
    .catch((error) => {
      console.error('Password reset error:', error);
      showBanner(parseFirebaseError(error), 'error');
    });
}

function handleLogout() {
  firebaseAuth
    .signOut()
    .then(() => {
      showBanner('Signed out successfully.', 'success');
      resetDashboardState();
    })
    .catch((error) => {
      console.error('Logout error:', error);
      showBanner(parseFirebaseError(error), 'error');
    });
}

async function handleStartScrape() {
  if (!currentUser || !assignedPhoneNumber) {
    showBanner('Missing user or assigned phone number.', 'error');
    return;
  }

  if (isStartingSession) {
    return;
  }

  isStartingSession = true;
  const startButton = document.getElementById('startScrapeButton');
  startButton.disabled = true;
  startButton.textContent = 'Preparing session...';

  try {
    const sessionId = generateSessionId();
    const userId = currentUser.uid;
    const idToken = await currentUser.getIdToken(true);

    await createSessionDocument(userId, sessionId);

    chrome.runtime.sendMessage({
      action: 'executeScript',
      userId,
      userEmail: currentUser.email || '',
      sessionId,
      assignedPhone: assignedPhoneNumber,
      idToken
    }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error('Failed to dispatch executeScript:', error);
        showBanner('Unable to start scraping. Keep the dashboard open and try again.', 'error');
      } else {
        showBanner('Session started. Keep WhatsApp Web open until completion.', 'success');
      }
    });

    activeSessionId = sessionId;
    updateSessionLabel(sessionId);
    updateProgressUI({ uploadedItems: 0, totalItems: 0 });
    window.close();

  } catch (error) {
    console.error('Start scraping error:', error);
    showBanner(parseFirebaseError(error), 'error');
  } finally {
    isStartingSession = false;
    startButton.disabled = false;
    startButton.textContent = 'Start scraping';
  }
}

async function handleSessionCompleted(message) {
  if (!currentUser || currentUser.uid !== message.userId) {
    return;
  }

  const { sessionId } = message;
  if (!sessionId) {
    return;
  }

  activeSessionId = sessionId;
  updateSessionLabel(sessionId);
  await updateSessionData(sessionId);
}

function handleAuthStateChanged(user) {
  currentUser = user;
  if (user) {
    showDashboardView();
    document.getElementById('userEmail').textContent = user.email || user.uid;
    fetchAssignedPhone(user.uid)
      .then(() => {
        refreshLatestSession();
      })
      .catch((error) => {
        console.error('Failed to fetch user profile:', error);
        showBanner(parseFirebaseError(error), 'error');
      });
  } else {
    showAuthView();
    document.getElementById('userEmail').textContent = '-';
    assignedPhoneNumber = null;
    resetDashboardState();
  }
}

function showAuthView() {
  document.getElementById('authView').classList.add('active');
  document.getElementById('dashboardView').classList.remove('active');
}

function showDashboardView() {
  document.getElementById('authView').classList.remove('active');
  document.getElementById('dashboardView').classList.add('active');
}

async function fetchAssignedPhone(userId) {
  const userDocRef = firebaseFirestore.collection('users').doc(userId);
  const doc = await userDocRef.get();

  if (!doc.exists) {
    assignedPhoneNumber = null;
    document.getElementById('assignedPhone').textContent = 'Unavailable';
    document.getElementById('startScrapeButton').disabled = true;
    throw new Error('No user profile found in Firestore.');
  }

  const data = doc.data();
  assignedPhoneNumber = data.assignedPhone || data.phoneNumber || data.contact || null;

  if (!assignedPhoneNumber) {
    document.getElementById('assignedPhone').textContent = 'Not assigned';
    document.getElementById('startScrapeButton').disabled = true;
    throw new Error('No assigned phone number found in profile.');
  }

  document.getElementById('assignedPhone').textContent = assignedPhoneNumber;
  document.getElementById('startScrapeButton').disabled = false;
}

async function createSessionDocument(userId, sessionId) {
  const sessionRef = firebaseFirestore
    .collection('users')
    .doc(userId)
    .collection('sessions')
    .doc(sessionId);

  await sessionRef.set({
    assignedPhone: assignedPhoneNumber,
    status: 'running',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    uploadedItems: 0,
    totalItems: 0
  });
}

function refreshLatestSession() {
  updateSessionLabel('No session');
  updateProgressUI({ uploadedItems: 0, totalItems: 0, status: 'idle' });
  clearItemsList();

  firebaseFirestore
    .collection('users')
    .doc(currentUser.uid)
    .collection('sessions')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        return;
      }
      const doc = snapshot.docs[0];
      activeSessionId = doc.id;
      updateSessionLabel(activeSessionId);
      updateSessionData(activeSessionId, doc.data());
    })
    .catch((error) => {
      console.error('Unable to fetch latest session:', error);
    });
}

async function updateSessionData(sessionId, initialData) {
  if (!currentUser) {
    return;
  }

  let data = initialData || null;
  const previousStatus = initialData?.status;

  if (!data) {
    data = await fetchSessionDocument(sessionId);
  }

  if (!data) {
    return;
  }

  updateProgressUI({
    uploadedItems: data.uploadedItems || 0,
    totalItems: data.totalItems || 0,
    status: data.status || 'running'
  });

  if (data.status === 'completed') {
    if (previousStatus !== 'completed') {
      showBanner('Scraping completed successfully.', 'success');
    }
    await loadSessionItems(sessionId);
  } else if (data.status === 'failed') {
    showBanner(data.errorMessage || 'Scraping failed.', 'error');
    clearItemsList();
  } else {
    clearItemsList();
  }
}

async function fetchSessionDocument(sessionId) {
  try {
    const sessionRef = firebaseFirestore
      .collection('users')
      .doc(currentUser.uid)
      .collection('sessions')
      .doc(sessionId);

    const snapshot = await sessionRef.get();
    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data();
  } catch (error) {
    console.error('Unable to fetch session details:', error);
    return null;
  }
}

async function loadSessionItems(sessionId) {
  if (!currentUser) {
    return;
  }

  try {
    const itemsRef = firebaseFirestore
      .collection('users')
      .doc(currentUser.uid)
      .collection('sessions')
      .doc(sessionId)
      .collection('items')
      .orderBy('uploadedAt', 'desc');

    const snapshot = await itemsRef.get();
    const itemsContainer = document.getElementById('itemsList');
    itemsContainer.innerHTML = '';

    snapshot.forEach((doc) => {
      const item = doc.data();
      const div = document.createElement('div');
      div.className = 'item-card';
      div.innerHTML = `
        <div class="item-title">${escapeHtml(item.name || 'Unnamed item')}</div>
        <div class="item-meta">${escapeHtml(item.price || 'No price')}</div>
        <div class="item-meta">${escapeHtml(item.desc || '')}</div>
      `;
      itemsContainer.appendChild(div);
    });
  } catch (error) {
    console.error('Unable to load session items:', error);
    clearItemsList();
  }
}

function clearItemsList() {
  const itemsContainer = document.getElementById('itemsList');
  if (itemsContainer) {
    itemsContainer.innerHTML = '';
  }
}

function updateProgressUI({ uploadedItems, totalItems, status }) {
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');
  const total = totalItems || 0;
  const uploaded = uploadedItems || 0;
  const percentage = total > 0 ? Math.min(100, Math.round((uploaded / total) * 100)) : 0;

  progressFill.style.width = `${percentage}%`;

  let labelText = `Uploaded ${uploaded} item${uploaded === 1 ? '' : 's'}`;
  if (total > 0) {
    labelText += ` of ${total} (${percentage}%)`;
  }

  if (status === 'completed') {
    labelText = `Completed · ${uploaded} item${uploaded === 1 ? '' : 's'} uploaded.`;
  }

  if (status === 'failed') {
    labelText = `Upload halted after ${uploaded} item${uploaded === 1 ? '' : 's'}.`;
  }

  progressLabel.textContent = labelText;
}

function updateSessionLabel(value) {
  document.getElementById('sessionLabel').textContent = value;
}

function resetDashboardState() {
  activeSessionId = null;
  updateSessionLabel('No session');
  updateProgressUI({ uploadedItems: 0, totalItems: 0, status: 'idle' });
  document.getElementById('assignedPhone').textContent = assignedPhoneNumber || '-';
  clearItemsList();
  document.getElementById('startScrapeButton').disabled = !assignedPhoneNumber;
}

function showBanner(message, type = 'info') {
  const banner = document.getElementById('statusBanner');
  banner.textContent = message;
  banner.classList.remove('error', 'success');
  if (type === 'error') {
    banner.classList.add('error');
  }
  if (type === 'success') {
    banner.classList.add('success');
  }
  banner.classList.add('show');

  if (type !== 'error') {
    setTimeout(() => {
      banner.classList.remove('show');
      banner.classList.remove('success');
    }, 5000);
  }
}

function parseFirebaseError(error) {
  if (!error || !error.code) {
    return error?.message || 'Unexpected error occurred.';
  }

  const map = {
    'auth/invalid-email': 'The email address is not valid.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No user found with these credentials.',
    'auth/wrong-password': 'Incorrect password. Try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'auth/network-request-failed': 'Network error. Check your connection and retry.'
  };

  return map[error.code] || error.message || 'Unexpected Firebase error.';
}

function generateSessionId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function escapeHtml(text) {
  if (text === undefined || text === null) {
    return '';
  }
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}