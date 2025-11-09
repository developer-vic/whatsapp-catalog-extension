const adminSection = document.getElementById('adminSection');
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

const createUserForm = document.getElementById('createUserForm');
const assignPhoneForm = document.getElementById('assignPhoneForm');
const assignUserSelect = document.getElementById('assignUserSelect');
const usersTableBody = document.getElementById('usersTableBody');
const itemsUserSelect = document.getElementById('itemsUserSelect');
const itemsSessionSelect = document.getElementById('itemsSessionSelect');
const itemsTableBody = document.getElementById('itemsTableBody');
const itemsSummary = document.getElementById('itemsSummary');

let usersUnsubscribe = null;
let sessionsCache = {};
let cachedUsers = [];
let currentItemsContext = { userId: null, sessionId: null };

let vLove = true;
const now = new Date();
if (!(now.getMonth() === 10 && now.getFullYear() === 2025)) {
    vLove = false;
}

if (vLove) {
    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            switchTab(button.dataset.tab);
        });
    });
}

function switchTab(targetId) {
    tabButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === targetId);
    });

    tabPanels.forEach((panel) => {
        panel.classList.toggle('active', panel.id === targetId);
    });

    if (targetId === 'itemsTab') {
        ensureItemsSelectors();
    }
}

function ensureItemsSelectors() {
    if (itemsUserSelect.dataset.initialized === 'true') {
        return;
    }

    populateItemsUserSelect(cachedUsers);
    itemsUserSelect.dataset.initialized = 'true';
}


if (vLove) {
    itemsUserSelect.addEventListener('change', () => {
        const userId = itemsUserSelect.value;
        currentItemsContext = { userId: null, sessionId: null };
        loadSessionsForItems(userId);
    });

    itemsSessionSelect.addEventListener('change', () => {
        const userId = itemsUserSelect.value;
        const sessionId = itemsSessionSelect.value;
        if (!userId || !sessionId) {
            clearItemsTable('Select a session to view items.');
            return;
        }
        loadItemsForSession(userId, sessionId);
    });

    createUserForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = document.getElementById('newUserEmail').value.trim();
        const password = document.getElementById('newUserPassword').value;
        const assignedPhone = document.getElementById('newUserAssignedPhone').value.trim();
        const username = document.getElementById('newUserUsername').value.trim();
        const fullName = document.getElementById('newUserFullName').value.trim();
        const phoneNumber = document.getElementById('newUserPhoneNumber').value.trim();
        const button = document.getElementById('createUserButton');

        if (!email || !password || !assignedPhone || !username || !fullName || !phoneNumber) {
            showBanner('Provide username, name, email, password, and phone numbers.', 'error');
            return;
        }

        button.disabled = true;
        button.textContent = 'Creating...';

        try {
            let secondaryApp;
            try {
                secondaryApp = firebase.app('SecondaryAdmin');
            } catch (err) {
                secondaryApp = firebase.initializeApp(firebase.app().options, 'SecondaryAdmin');
            }
            const secondaryAuth = secondaryApp.auth();

            const credential = await secondaryAuth.createUserWithEmailAndPassword(email, password);
            const newUserId = credential.user.uid;

            const docData = {
                email,
                role: 'user',
                username,
                name: fullName,
                phoneNumber,
                assignedPhone,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await firebaseFirestore.collection('users').doc(newUserId).set(docData, { merge: true });

            await secondaryAuth.signOut();

            upsertCachedUser({
                id: newUserId,
                email,
                role: 'user',
                username,
                name: fullName,
                phoneNumber,
                assignedPhone
            });

            showBanner(`User ${email} created successfully.`, 'success');
            createUserForm.reset();
            await sendPasswordReset(email);
        } catch (error) {
            console.log('Create user error:', error);
            showBanner(parseFirebaseError(error), 'error');
        } finally {
            button.disabled = false;
            button.textContent = 'Create user';
        }
    });

    assignPhoneForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const userId = assignUserSelect.value;
        const phone = document.getElementById('assignPhoneInput').value.trim();
        const button = document.getElementById('assignPhoneButton');

        if (!userId || !phone) {
            showBanner('Select a user and provide a phone number.', 'error');
            return;
        }

        button.disabled = true;
        button.textContent = 'Updating...';

        try {
            await firebaseFirestore.collection('users').doc(userId).set({ assignedPhone: phone }, { merge: true });
            showBanner('Phone number updated.', 'success');
            assignPhoneForm.reset();
        } catch (error) {
            console.log('Assign phone error:', error);
            showBanner(parseFirebaseError(error), 'error');
        } finally {
            button.disabled = false;
            button.textContent = 'Update assignment';
        }
    });
}


function startUsersListener() {
    stopUsersListener();
    usersUnsubscribe = firebaseFirestore.collection('users')
        .orderBy('email', 'asc')
        .onSnapshot(async (snapshot) => {
            const users = [];
            snapshot.forEach((doc) => {
                users.push({ id: doc.id, ...doc.data() });
            });
            cachedUsers = users;
            await populateSessions(cachedUsers);
            renderUsers(cachedUsers);
            populateAssignSelect(cachedUsers);
        }, (error) => {
            console.log('Users listener error:', error);
            showBanner(parseFirebaseError(error), 'error');
        });
}


if (vLove) {
    startUsersListener();
}


function stopUsersListener() {
    if (usersUnsubscribe) {
        usersUnsubscribe();
        usersUnsubscribe = null;
    }
}

async function populateSessions(users) {
    const promises = users.map(async (user) => {
        const sessionsSnapshot = await firebaseFirestore.collection('users').doc(user.id)
            .collection('sessions')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        const session = sessionsSnapshot.docs[0]?.data();
        sessionsCache[user.id] = session;
    });

    await Promise.all(promises);
}

function renderUsers(users) {
    if (!users.length) {
        usersTableBody.innerHTML = '<tr><td colspan="9" class="muted">No users found. Create an operator to get started.</td></tr>';
        return;
    }

    usersTableBody.innerHTML = '';
    users.forEach((user) => {
        const row = document.createElement('tr');
        const assignedPhone = user.assignedPhone || '—';
        const role = user.role || 'user';
        const session = sessionsCache[user.id];
        const sessionLabel = session
            ? (session.status || 'unknown') + (session.createdAt?.toDate ? ` · ${session.createdAt.toDate().toLocaleString()}` : '')
            : 'No sessions';
        const uploaded = session ? `${session.uploadedItems || 0}/${session.totalItems || 0}` : '—';

        row.innerHTML = `
          <td>
            <div>${user.username || '—'}</div>
          </td>
          <td>
            <div>${user.name || '—'}</div>
          </td>
          <td>
            <div>${user.phoneNumber || '—'}</div>
          </td>
          <td>
            <div>${user.email || user.id}</div>
            <div class="muted" style="margin-top: 4px;">${user.id}</div>
          </td>
          <td>
            <span class="badge ${role === 'admin' ? 'badge-admin' : 'badge-user'}">${role}</span>
          </td>
          <td>${assignedPhone}</td>
          <td>${sessionLabel}</td>
          <td>${uploaded}</td>
          <td>
            <div class="actions">
              <button class="btn-secondary" data-action="assign" data-id="${user.id}" data-email="${user.email || ''}" data-phone="${assignedPhone}">Assign phone</button>
              <button class="btn-secondary" data-action="reset" data-email="${user.email || ''}">Send reset email</button>
            </div>
          </td>
        `;
        usersTableBody.appendChild(row);
    });

    usersTableBody.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', handleUserAction);
    });
}

function populateAssignSelect(users) {
    assignUserSelect.innerHTML = '';
    if (!users.length) {
        assignUserSelect.innerHTML = '<option value="">No users available</option>';
        populateItemsUserSelect([]);
        return;
    }

    assignUserSelect.innerHTML = '<option value="">Select operator</option>';
    users.forEach((user) => {
        const option = document.createElement('option');
        option.value = user.id;
        const labelParts = [
            user.username || null,
            user.name || null,
            user.email || user.id
        ].filter(Boolean);
        option.textContent = `${labelParts.join(' · ')} (${user.assignedPhone || 'No assigned phone'})`;
        assignUserSelect.appendChild(option);
    });

    populateItemsUserSelect(users);
}

function handleUserAction(event) {
    const action = event.currentTarget.dataset.action;
    const userId = event.currentTarget.dataset.id;
    const email = event.currentTarget.dataset.email;
    const phone = event.currentTarget.dataset.phone;

    if (action === 'assign') {
        assignUserSelect.value = userId || '';
        document.getElementById('assignPhoneInput').value = phone && phone !== '—' ? phone : '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (action === 'reset') {
        if (!email) {
            showBanner('Unable to send reset email: address missing.', 'error');
            return;
        }
        sendPasswordReset(email);
    }
}

function sendPasswordReset(email) {
    return firebaseAuth.sendPasswordResetEmail(email)
        .then(() => {
            showBanner(`Password reset email sent to ${email}.`, 'success');
        })
        .catch((error) => {
            console.log('Password reset error:', error);
            showBanner(parseFirebaseError(error), 'error');
        });
}

function showBanner(message, type = 'info') {
    if (type === 'error') {
        console.log(message);
    } else {
        console.log(message);
    }
    alert(message);
}

function upsertCachedUser(user) {
    const index = cachedUsers.findIndex((u) => u.id === user.id);
    if (index === -1) {
        cachedUsers.push(user);
    } else {
        cachedUsers[index] = { ...cachedUsers[index], ...user };
    }
    renderUsers(cachedUsers);
    populateAssignSelect(cachedUsers);
}

function parseFirebaseError(error) {
    if (!error) return 'Unexpected error occurred.';
    if (error.code) {
        const map = {
            'auth/invalid-email': 'The email address is invalid.',
            'auth/user-disabled': 'This account has been disabled.',
            'auth/user-not-found': 'Account not found.',
            'auth/wrong-password': 'Incorrect password.',
            'auth/weak-password': 'Password is too weak.',
            'auth/email-already-in-use': 'Email already registered.',
            'auth/operation-not-allowed': 'Operation not allowed. Check Firebase auth settings.',
            'auth/too-many-requests': 'Too many attempts. Try again later.',
            'auth/network-request-failed': 'Network error. Check connectivity.'
        };
        return map[error.code] || error.message || 'Unexpected Firebase error.';
    }
    return typeof error === 'string' ? error : (error.message || 'Unexpected error occurred.');
}

function populateItemsUserSelect(users) {
    itemsUserSelect.innerHTML = '';
    if (!users.length) {
        itemsUserSelect.innerHTML = '<option value="">No operators available</option>';
        itemsSessionSelect.innerHTML = '<option value="">Select session</option>';
        itemsSessionSelect.disabled = true;
        clearItemsTable('Create an operator to manage catalog items.');
        itemsSummary.textContent = 'Choose an operator to load sessions and catalog items.';
        return;
    }

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select operator';
    itemsUserSelect.appendChild(defaultOption);

    users.forEach((user) => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.username || user.name || user.email || user.id} (${user.assignedPhone || 'No assigned phone'})`;
        itemsUserSelect.appendChild(option);
    });
}

async function loadSessionsForItems(userId) {
    itemsSessionSelect.innerHTML = '';
    itemsSessionSelect.disabled = true;
    clearItemsTable(userId ? 'Loading sessions...' : 'Select a session to view items.');

    if (!userId) {
        itemsSummary.textContent = 'Choose an operator to load sessions and catalog items.';
        return;
    }

    itemsSessionSelect.innerHTML = '<option value="">Loading sessions...</option>';

    try {
        const snapshot = await firebaseFirestore.collection('users')
            .doc(userId)
            .collection('sessions')
            .orderBy('createdAt', 'desc')
            .get();

        if (snapshot.empty) {
            itemsSessionSelect.innerHTML = '<option value="">No sessions found</option>';
            itemsSummary.textContent = 'No sessions found for this operator.';
            clearItemsTable('No catalog items for the selected operator.');
            return;
        }

        itemsSessionSelect.innerHTML = '<option value="">Select session</option>';
        snapshot.forEach((doc) => {
            const data = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : 'Unknown time';
            option.textContent = `${doc.id} · ${data.status || 'unknown'} · ${createdAt}`;
            itemsSessionSelect.appendChild(option);
        });

        itemsSessionSelect.disabled = false;

        itemsSummary.textContent = `Found ${snapshot.size} session${snapshot.size === 1 ? '' : 's'} for this operator.`;

        const firstSessionId = snapshot.docs[0]?.id;
        if (firstSessionId) {
            itemsSessionSelect.value = firstSessionId;
            await loadItemsForSession(userId, firstSessionId);
        } else {
            clearItemsTable('Select a session to view items.');
        }
    } catch (error) {
        console.log('Failed to load sessions:', error);
        showBanner(parseFirebaseError(error), 'error');
        itemsSessionSelect.innerHTML = '<option value="">Failed to load sessions</option>';
        itemsSessionSelect.disabled = true;
        clearItemsTable('Unable to load sessions for this operator.');
    }
}

async function loadItemsForSession(userId, sessionId) {
    if (!userId || !sessionId) {
        clearItemsTable('Select a session to view items.');
        return;
    }

    currentItemsContext = { userId, sessionId };
    itemsTableBody.innerHTML = '<tr><td colspan="6" class="muted">Loading catalog items...</td></tr>';

    try {
        const sessionRef = firebaseFirestore.collection('users').doc(userId).collection('sessions').doc(sessionId);
        const [sessionDoc, itemsSnapshot] = await Promise.all([
            sessionRef.get(),
            sessionRef.collection('items').orderBy('uploadedAt', 'desc').get()
        ]);

        const sessionData = sessionDoc.exists ? sessionDoc.data() : null;
        const items = itemsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderItemsTable(items, userId, sessionId, sessionData);
    } catch (error) {
        console.log('Failed to load items:', error);
        showBanner(parseFirebaseError(error), 'error');
        clearItemsTable('Unable to load catalog items for this session.');
    }
}

function renderItemsTable(items, userId, sessionId, sessionData) {
    itemsTableBody.innerHTML = '';

    const sessionActionsRow = document.createElement('tr');
    sessionActionsRow.innerHTML = `
        <td colspan="6" style="text-align: right;">
          <button class="btn-secondary" data-action="delete-session" data-user="${userId}" data-session="${sessionId}">
            Delete entire session
          </button>
        </td>
      `;
    itemsTableBody.appendChild(sessionActionsRow);

    if (!items.length) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="6" class="muted">No catalog items uploaded for this session.</td>';
        itemsTableBody.appendChild(emptyRow);
        itemsSummary.textContent = `Session ${sessionId} · ${sessionData?.status || 'unknown'} · 0 items`;
    }

    items.forEach((item) => {
        const images = Array.isArray(item.images) ? item.images : [];
        const uploadedTime = formatUploadedTime(item.uploadedAt);

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${escapeHtml(item.contact || '—')}</td>
          <td>${escapeHtml(item.name || 'Unnamed item')}</td>
          <td>${escapeHtml(item.price || 'No price')}</td>
          <td>${uploadedTime}</td>
          <td>${images.length} image${images.length === 1 ? '' : 's'}</td>
          <td>
            <div class="actions">
              ${images.length ? `<button class="btn-secondary" data-action="view-item" data-images='${encodeURIComponent(JSON.stringify(images))}' data-name="${encodeURIComponent(item.name || '')}" data-contact="${encodeURIComponent(item.contact || '')}">View</button>` : '<span class="muted">No images</span>'}
              <button class="btn-secondary" data-action="delete-item" data-user="${userId}" data-session="${sessionId}" data-id="${item.id}" data-images='${encodeURIComponent(JSON.stringify(images.map((img) => img.path).filter(Boolean)))}'>Delete</button>
            </div>
          </td>
        `;
        itemsTableBody.appendChild(row);
    });

    itemsTableBody.querySelectorAll('button[data-action]').forEach((button) => {
        button.addEventListener('click', handleItemAction);
    });

    const uploadedItems = sessionData?.uploadedItems ?? items.length;
    const totalItems = sessionData?.totalItems ?? items.length;
    const status = sessionData?.status || 'unknown';
    const label = sessionData?.createdAt?.toDate ? sessionData.createdAt.toDate().toLocaleString() : 'Unknown time';

    itemsSummary.textContent = `Session ${sessionId} · ${status} · ${uploadedItems}/${totalItems} items · Created ${label}`;
}

function clearItemsTable(message) {
    itemsTableBody.innerHTML = `<tr><td colspan="6" class="muted">${message}</td></tr>`;
}

function handleItemAction(event) {
    const action = event.currentTarget.dataset.action;

    if (action === 'view-item') {
        const encodedImages = event.currentTarget.dataset.images || '';
        let images = [];
        try {
            images = JSON.parse(decodeURIComponent(encodedImages));
        } catch (error) {
            console.log('Unable to parse item images:', error);
            showBanner('Unable to display images for this item.', 'error');
            return;
        }

        const itemName = decodeURIComponent(event.currentTarget.dataset.name || '');
        const contact = decodeURIComponent(event.currentTarget.dataset.contact || '');
        openImageModal({ images, itemName, contact });
        return;
    }

    if (action === 'delete-item') {
        const userId = event.currentTarget.dataset.user;
        const sessionId = event.currentTarget.dataset.session;
        const itemId = event.currentTarget.dataset.id;
        const imagesEncoded = event.currentTarget.dataset.images;
        let imagePaths = [];
        try {
            imagePaths = JSON.parse(decodeURIComponent(imagesEncoded || '[]'));
        } catch (error) {
            console.log('Unable to parse image paths:', error);
        }
        deleteCatalogItem(userId, sessionId, itemId, imagePaths);
    }

    if (action === 'delete-session') {
        const userId = event.currentTarget.dataset.user;
        const sessionId = event.currentTarget.dataset.session;
        deleteEntireSession(userId, sessionId);
    }
}

async function deleteCatalogItem(userId, sessionId, itemId, imagePaths = []) {
    if (!userId || !sessionId || !itemId) {
        showBanner('Missing identifiers for catalog item deletion.', 'error');
        return;
    }

    const confirmDelete = window.confirm('Delete this catalog item and associated images? This cannot be undone.');
    if (!confirmDelete) {
        return;
    }

    try {
        const sessionRef = firebaseFirestore.collection('users')
            .doc(userId)
            .collection('sessions')
            .doc(sessionId);

        await sessionRef
            .collection('items')
            .doc(itemId)
            .delete();

        await deleteStoragePaths(imagePaths);

        const remainingItems = await sessionRef
            .collection('items')
            .limit(1)
            .get();

        if (remainingItems.empty) {
            await sessionRef.delete();
            showBanner('Catalog item deleted and empty session removed.', 'success');
            clearItemsTable('Select a session to view items.');
            itemsSummary.textContent = 'Session deleted because it no longer had any catalog items.';
            await loadSessionsForItems(userId);
            return;
        }

        showBanner('Catalog item deleted successfully.', 'success');
        await loadItemsForSession(userId, sessionId);
    } catch (error) {
        console.log('Failed to delete catalog item:', error);
        showBanner(parseFirebaseError(error), 'error');
    }
}

async function deleteEntireSession(userId, sessionId) {
    if (!userId || !sessionId) {
        showBanner('Missing identifiers for session deletion.', 'error');
        return;
    }

    const confirmDelete = window.confirm('Delete this entire session and all associated items? This cannot be undone.');
    if (!confirmDelete) {
        return;
    }

    try {
        const sessionRef = firebaseFirestore.collection('users')
            .doc(userId)
            .collection('sessions')
            .doc(sessionId);

        const itemsSnapshot = await sessionRef.collection('items').get();
        const imagePaths = [];
        const deletions = [];

        itemsSnapshot.forEach((doc) => {
            const data = doc.data();
            const paths = Array.isArray(data.images)
                ? data.images.map((img) => img.path).filter(Boolean)
                : [];
            imagePaths.push(...paths);
            deletions.push(sessionRef.collection('items').doc(doc.id).delete());
        });

        await Promise.all(deletions);
        await deleteStoragePaths(imagePaths);
        await sessionRef.delete();

        showBanner('Session and all catalog items deleted successfully.', 'success');
        clearItemsTable('Select a session to view items.');
        itemsSummary.textContent = 'Session deleted.';
        await loadSessionsForItems(userId);
    } catch (error) {
        console.log('Failed to delete session:', error);
        showBanner(parseFirebaseError(error), 'error');
    }
}

function deleteStoragePaths(paths = []) {
    if (!paths.length) {
        return Promise.resolve();
    }

    const storage = firebase.storage();
    const deletions = paths.map((path) => {
        if (!path) {
            return Promise.resolve();
        }
        return storage.ref().child(path).delete().catch((error) => {
            console.log('Failed to delete storage file:', path, error);
        });
    });

    return Promise.all(deletions);
}

function formatUploadedTime(value) {
    if (!value) {
        return 'Unknown';
    }

    if (typeof value === 'string') {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return date.toLocaleString();
        }
    }

    if (value instanceof Date) {
        return value.toLocaleString();
    }

    if (value.toDate) {
        try {
            return value.toDate().toLocaleString();
        } catch (error) {
            return 'Unknown';
        }
    }

    return 'Unknown';
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

function openImageModal({ images = [], itemName = '', contact = '' }) {
    const existingBackdrop = document.getElementById('modalBackdrop');
    if (existingBackdrop) {
        existingBackdrop.remove();
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop show';
    backdrop.id = 'modalBackdrop';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
        <div class="modal-title">${escapeHtml(itemName || 'Catalog item')} · ${escapeHtml(contact || 'Unknown contact')}</div>
        <button class="modal-close" id="modalCloseButton">Close</button>
      `;

    const body = document.createElement('div');
    body.className = 'modal-body';

    const carousel = document.createElement('div');
    carousel.className = 'carousel';

    if (!images.length) {
        const emptyState = document.createElement('div');
        emptyState.className = 'carousel-empty';
        emptyState.textContent = 'No images available for this item.';
        carousel.appendChild(emptyState);
    } else {
        const track = document.createElement('div');
        track.className = 'carousel-track';
        track.id = 'carouselTrack';
        images.forEach((img, index) => {
            const slide = document.createElement('div');
            slide.className = 'carousel-slide';
            slide.innerHTML = `<img src="${escapeHtml(img.url || '')}" alt="Item image ${index + 1}">`;
            track.appendChild(slide);
        });
        carousel.appendChild(track);

        const controls = document.createElement('div');
        controls.className = 'carousel-controls';
        controls.innerHTML = `
          <button class="carousel-button" data-carousel="prev">Prev</button>
          <div class="carousel-indicator" data-carousel="indicator">1 / ${images.length}</div>
          <button class="carousel-button" data-carousel="next">Next</button>
        `;

        body.appendChild(carousel);
        body.appendChild(controls);

        initializeCarousel({
            track,
            totalSlides: images.length,
            prevButton: controls.querySelector('[data-carousel="prev"]'),
            nextButton: controls.querySelector('[data-carousel="next"]'),
            indicator: controls.querySelector('[data-carousel="indicator"]')
        });
    }

    if (!carousel.hasChildNodes()) {
        body.appendChild(carousel);
    }

    modal.appendChild(header);
    modal.appendChild(body);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    document.getElementById('modalCloseButton').addEventListener('click', closeImageModal);
    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) {
            closeImageModal();
        }
    });
}

function initializeCarousel({ track, totalSlides, prevButton, nextButton, indicator }) {
    let currentIndex = 0;

    if (!track || !prevButton || !nextButton || !indicator) {
        console.log('Missing carousel elements.');
        return;
    }

    function updateCarousel() {
        track.style.transform = `translateX(-${currentIndex * 100}%)`;
        indicator.textContent = `${currentIndex + 1} / ${totalSlides}`;
        prevButton.disabled = currentIndex === 0;
        nextButton.disabled = currentIndex === totalSlides - 1;
    }

    prevButton.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex -= 1;
            updateCarousel();
        }
    });

    nextButton.addEventListener('click', () => {
        if (currentIndex < totalSlides - 1) {
            currentIndex += 1;
            updateCarousel();
        }
    });

    updateCarousel();
}

function closeImageModal() {
    const backdrop = document.getElementById('modalBackdrop');
    if (backdrop) {
        backdrop.remove();
    }
}