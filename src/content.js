// Content script that waits for message from background
console.log("Content script loaded");
let sessionDateTime = null;
let statusOverlay = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Received message in content script:", message);
    if (message.action === "startExecution") {
        try {
            sessionDateTime = message.sessionDateTime;
            // Hide countdown overlay if it exists
            //hideStatusOverlay();
            // Create the full scraping status overlay
            createFullStatusOverlay();
            executeOtobixScript(message.contact_list);
        } catch (error) {
            console.error('Error starting execution:', error);
            updateOverlayStatus('error', 'Failed to start scraping process');
            addActivityLog(`Error: ${error.message}`);
        }
    }

    if (message.action === "taskScheduled") {
        // Show scheduled task countdown in overlay (avoid duplicates)
        if (!statusOverlay) {
            showScheduledTaskOverlay(message.scheduledTime, message.contact_list.length);
        }
    }

    if (message.action === "scheduleCancelled") {
        // Hide countdown overlay
        hideStatusOverlay();
    }
});

// Show scheduled task countdown overlay
function showScheduledTaskOverlay(scheduledTime, contactCount) {
    createSimpleCountdownOverlay();

    const scheduledDate = new Date(scheduledTime);
    const now = new Date();
    const timeUntil = scheduledDate.getTime() - now.getTime();

    if (timeUntil > 0) {
        updateCountdownDisplay(`Task scheduled for ${contactCount} contacts`);

        // Start countdown
        startScheduledCountdown(scheduledTime, contactCount);
    } else {
        updateCountdownDisplay('Scheduled time has already passed');
        setTimeout(() => {
            hideStatusOverlay();
        }, 3000);
    }
}// Countdown for scheduled tasks
let countdownInterval = null;

function startScheduledCountdown(scheduledTime, contactCount) {
    // Clear any existing countdown
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    countdownInterval = setInterval(() => {
        const now = new Date();
        const scheduled = new Date(scheduledTime);
        const timeLeft = scheduled.getTime() - now.getTime();

        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            updateCountdownDisplay('Starting scheduled scraping...');

            // Hide countdown overlay after a short delay
            setTimeout(() => {
                hideStatusOverlay();
            }, 2000);
            return;
        }

        const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

        let countdownText = 'Starting in ';
        if (days > 0) countdownText += `${days}d `;
        if (hours > 0) countdownText += `${hours}h `;
        if (minutes > 0) countdownText += `${minutes}m `;
        countdownText += `${seconds}s`;
        countdownText += ` (${contactCount} contacts)`;

        updateCountdownDisplay(countdownText);
    }, 1000);
}// Check for existing scheduled tasks on page load
function checkForScheduledTasks() {
    // Ask background script to check for scheduled tasks
    chrome.runtime.sendMessage({ action: "checkScheduledTasks" });
}

// Create simple countdown overlay
function createSimpleCountdownOverlay() {
    if (statusOverlay) return statusOverlay;

    const overlay = document.createElement('div');
    overlay.id = 'ws-countdown-overlay';
    overlay.innerHTML = `
        <div class="ws-countdown-backdrop"></div>
        <div class="ws-countdown-container">
            <div class="ws-countdown-header">
                <div class="ws-countdown-icon">⏰</div>
                <h3 class="ws-countdown-title">WhatsApp Scraper</h3>
            </div>
            
            <div class="ws-countdown-content">
                <div class="ws-countdown-message" id="ws-countdown-message">
                    Preparing scheduled task...
                </div>
            </div>
            
            <div class="ws-countdown-footer">
                <button class="ws-countdown-close" id="ws-countdown-close">×</button>
            </div>
        </div>
        
        <style>
            #ws-countdown-overlay {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                animation: slideInFromRight 0.3s ease-out;
            }
            
            .ws-countdown-container {
                width: 350px;
                background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.2);
            }
            
            .ws-countdown-header {
                background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
                color: white;
                padding: 15px 20px;
                text-align: center;
                display: flex;
                align-items: center;
                gap: 10px;
                justify-content: center;
            }
            
            .ws-countdown-icon {
                font-size: 24px;
            }
            
            .ws-countdown-title {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
            }
            
            .ws-countdown-content {
                padding: 20px;
                text-align: center;
            }
            
            .ws-countdown-message {
                font-size: 16px;
                color: #2c3e50;
                font-weight: 500;
                line-height: 1.4;
            }
            
            .ws-countdown-footer {
                position: absolute;
                top: 5px;
                right: 5px;
            }
            
            .ws-countdown-close {
                width: 25px;
                height: 25px;
                border-radius: 50%;
                border: none;
                background: rgba(255, 255, 255, 0.2);
                color: white;
                cursor: pointer;
                font-size: 16px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.3s ease;
            }
            
            .ws-countdown-close:hover {
                background: rgba(255, 255, 255, 0.3);
            }
            
            @keyframes slideInFromRight {
                from { 
                    transform: translateX(100%); 
                    opacity: 0; 
                }
                to { 
                    transform: translateX(0); 
                    opacity: 1; 
                }
            }
            
            @keyframes slideOutToRight {
                from { 
                    transform: translateX(0); 
                    opacity: 1; 
                }
                to { 
                    transform: translateX(100%); 
                    opacity: 0; 
                }
            }
        </style>
    `;

    statusOverlay = overlay;
    document.body.appendChild(overlay);

    // Setup close button
    document.getElementById('ws-countdown-close').addEventListener('click', () => {
        hideStatusOverlay();
    });

    return overlay;
}

// Update countdown display
function updateCountdownDisplay(message) {
    if (!statusOverlay) return;

    const messageElement = statusOverlay.querySelector('#ws-countdown-message');
    if (messageElement) {
        messageElement.textContent = message;
    }
}
// Create full status overlay for scraping process
function createFullStatusOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'ws-scraper-overlay';
    overlay.innerHTML = `
        <div class="ws-overlay-backdrop"></div>
        <div class="ws-overlay-container">
            <div class="ws-overlay-header">
                <div class="ws-overlay-logo">
                    <div class="ws-logo-icon">WS</div>
                </div>
                <h2 class="ws-overlay-title">WhatsApp Catalog Scraper</h2>
                <p class="ws-overlay-subtitle">Professional catalog extraction in progress</p>
            </div>
            
            <div class="ws-overlay-content">
                <div class="ws-progress-section">
                    <div class="ws-progress-bar">
                        <div class="ws-progress-fill" id="ws-progress-fill"></div>
                    </div>
                    <div class="ws-progress-text" id="ws-progress-text">Initializing...</div>
                </div>
                
                <div class="ws-status-section">
                    <div class="ws-current-task" id="ws-current-task">
                        <span class="ws-task-icon">🔄</span>
                        <span class="ws-task-text">Starting scraping process...</span>
                    </div>
                    
                    <div class="ws-stats-grid">
                        <div class="ws-stat-item">
                            <div class="ws-stat-value" id="ws-contacts-processed">0</div>
                            <div class="ws-stat-label">Contacts Processed</div>
                        </div>
                        <div class="ws-stat-item">
                            <div class="ws-stat-value" id="ws-items-found">0</div>
                            <div class="ws-stat-label">Items Found</div>
                        </div>
                        <div class="ws-stat-item">
                            <div class="ws-stat-value" id="ws-images-downloaded">0</div>
                            <div class="ws-stat-label">Images Downloaded</div>
                        </div>
                        <div class="ws-stat-item">
                            <div class="ws-stat-value" id="ws-elapsed-time">00:00</div>
                            <div class="ws-stat-label">Elapsed Time</div>
                        </div>
                    </div>
                </div>
                
                <div class="ws-log-section">
                    <div class="ws-log-header">Activity Log</div>
                    <div class="ws-log-container" id="ws-log-container">
                        <div class="ws-log-item">
                            <span class="ws-log-time">${new Date().toLocaleTimeString()}</span>
                            <span class="ws-log-message">Scraper initialized successfully</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="ws-overlay-footer">
                <button class="ws-minimize-btn" id="ws-minimize-btn">
                    <span>Minimize</span>
                </button>
                <div class="ws-session-info">
                    Session: <span id="ws-session-id">${sessionDateTime || 'Unknown'}</span>
                </div>
            </div>
        </div>
        
        <style>
            #ws-scraper-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                z-index: 10000;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                animation: wsOverlayFadeIn 0.5s ease-out;
            }
            
            .ws-overlay-backdrop {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(10px);
            }
            
            .ws-overlay-container {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 90%;
                max-width: 600px;
                background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.2);
                animation: wsOverlaySlideIn 0.6s ease-out;
            }
            
            .ws-overlay-header {
                background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
                color: white;
                padding: 25px;
                text-align: center;
            }
            
            .ws-overlay-logo {
                margin-bottom: 15px;
            }
            
            .ws-logo-icon {
                display: inline-block;
                width: 50px;
                height: 50px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 50%;
                line-height: 50px;
                font-size: 20px;
                font-weight: bold;
                border: 2px solid rgba(255, 255, 255, 0.3);
            }
            
            .ws-overlay-title {
                margin: 0 0 8px 0;
                font-size: 24px;
                font-weight: 600;
            }
            
            .ws-overlay-subtitle {
                margin: 0;
                font-size: 14px;
                opacity: 0.9;
            }
            
            .ws-overlay-content {
                padding: 30px;
            }
            
            .ws-progress-section {
                margin-bottom: 30px;
            }
            
            .ws-progress-bar {
                width: 100%;
                height: 8px;
                background: #e9ecef;
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 10px;
            }
            
            .ws-progress-fill {
                height: 100%;
                background: linear-gradient(45deg, #25d366, #128c7e);
                width: 0%;
                transition: width 0.3s ease;
                border-radius: 4px;
            }
            
            .ws-progress-text {
                text-align: center;
                color: #6c757d;
                font-size: 14px;
                font-weight: 500;
            }
            
            .ws-status-section {
                margin-bottom: 25px;
            }
            
            .ws-current-task {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 15px;
                background: linear-gradient(45deg, #f8f9fa, #e9ecef);
                border-radius: 10px;
                border-left: 4px solid #25d366;
                margin-bottom: 20px;
            }
            
            .ws-task-icon {
                font-size: 20px;
                animation: wsRotate 2s linear infinite;
            }
            
            .ws-task-text {
                font-weight: 500;
                color: #2c3e50;
            }
            
            .ws-stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: 15px;
            }
            
            .ws-stat-item {
                text-align: center;
                padding: 15px;
                background: white;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                border: 1px solid #e9ecef;
            }
            
            .ws-stat-value {
                font-size: 24px;
                font-weight: bold;
                color: #25d366;
                margin-bottom: 5px;
            }
            
            .ws-stat-label {
                font-size: 12px;
                color: #6c757d;
                font-weight: 500;
            }
            
            .ws-log-section {
                background: #f8f9fa;
                border-radius: 10px;
                overflow: hidden;
            }
            
            .ws-log-header {
                padding: 15px 20px;
                background: #e9ecef;
                font-weight: 600;
                color: #495057;
                font-size: 14px;
                border-bottom: 1px solid #dee2e6;
            }
            
            .ws-log-container {
                max-height: 120px;
                overflow-y: auto;
                padding: 10px 0;
            }
            
            .ws-log-item {
                display: flex;
                gap: 15px;
                padding: 8px 20px;
                font-size: 13px;
                border-bottom: 1px solid #e9ecef;
            }
            
            .ws-log-item:last-child {
                border-bottom: none;
            }
            
            .ws-log-time {
                color: #6c757d;
                font-weight: 500;
                min-width: 70px;
            }
            
            .ws-log-message {
                color: #495057;
                flex: 1;
            }
            
            .ws-overlay-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px 25px;
                background: #f8f9fa;
                border-top: 1px solid #e9ecef;
            }
            
            .ws-minimize-btn {
                padding: 8px 16px;
                background: #6c757d;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: background 0.3s ease;
            }
            
            .ws-minimize-btn:hover {
                background: #5a6268;
            }
            
            .ws-session-info {
                font-size: 12px;
                color: #6c757d;
            }
            
            .ws-overlay-minimized {
                transform: translate(-50%, -50%) scale(0.1);
                opacity: 0;
                pointer-events: none;
            }
            
            @keyframes wsOverlayFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes wsOverlaySlideIn {
                from { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
                to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }
            
            @keyframes wsRotate {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            
            /* Scrollbar styling */
            .ws-log-container::-webkit-scrollbar {
                width: 6px;
            }
            
            .ws-log-container::-webkit-scrollbar-track {
                background: #f1f1f1;
            }
            
            .ws-log-container::-webkit-scrollbar-thumb {
                background: #25d366;
                border-radius: 3px;
            }
        </style>
    `;

    return overlay;
}

function showStatusOverlay() {
    if (statusOverlay) return; // Already shown

    statusOverlay = createFullStatusOverlay();
    document.body.appendChild(statusOverlay);

    // Setup minimize functionality
    document.getElementById('ws-minimize-btn').addEventListener('click', () => {
        statusOverlay.querySelector('.ws-overlay-container').classList.add('ws-overlay-minimized');
        setTimeout(() => {
            statusOverlay.style.display = 'none';
        }, 300);
    });

    // Start elapsed time counter
    startElapsedTimeCounter();

    logActivity('Status overlay initialized');
}

function updateProgress(percentage, text) {
    if (!statusOverlay) return;

    const fillElement = statusOverlay.querySelector('#ws-progress-fill');
    const textElement = statusOverlay.querySelector('#ws-progress-text');

    if (fillElement) fillElement.style.width = `${percentage}%`;
    if (textElement) textElement.textContent = text;
}

function updateCurrentTask(icon, text) {
    if (!statusOverlay) return;

    const iconElement = statusOverlay.querySelector('.ws-task-icon');
    const textElement = statusOverlay.querySelector('.ws-task-text');

    if (iconElement) iconElement.textContent = icon;
    if (textElement) textElement.textContent = text;
}

function updateStats(processed, items, images) {
    if (!statusOverlay) return;

    const processedElement = statusOverlay.querySelector('#ws-contacts-processed');
    const itemsElement = statusOverlay.querySelector('#ws-items-found');
    const imagesElement = statusOverlay.querySelector('#ws-images-downloaded');

    if (processedElement) processedElement.textContent = processed;
    if (itemsElement) itemsElement.textContent = items;
    if (imagesElement) imagesElement.textContent = images;
}

function logActivity(message) {
    if (!statusOverlay) return;

    const logContainer = statusOverlay.querySelector('#ws-log-container');
    if (!logContainer) return;

    const logItem = document.createElement('div');
    logItem.className = 'ws-log-item';
    logItem.innerHTML = `
        <span class="ws-log-time">${new Date().toLocaleTimeString()}</span>
        <span class="ws-log-message">${message}</span>
    `;

    logContainer.appendChild(logItem);
    logContainer.scrollTop = logContainer.scrollHeight;

    // Keep only last 20 log items
    const logItems = logContainer.querySelectorAll('.ws-log-item');
    if (logItems.length > 20) {
        logItems[0].remove();
    }
}

function startElapsedTimeCounter() {
    const startTime = Date.now();

    setInterval(() => {
        if (!statusOverlay) return;

        const elapsed = Date.now() - startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);

        const timeElement = statusOverlay.querySelector('#ws-elapsed-time');
        if (timeElement) {
            timeElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
    }, 1000);
}

function hideStatusOverlay() {
    if (statusOverlay) {
        statusOverlay.style.animation = 'slideOutToRight 0.3s ease-out';
        setTimeout(() => {
            if (statusOverlay) {
                statusOverlay.remove();
                statusOverlay = null;
            }
        }, 300);
    }

    // Clear any active countdown
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

// Update overlay status with icon and message
function updateOverlayStatus(status, message) {
    if (!statusOverlay) return;

    const iconElement = statusOverlay.querySelector('.ws-task-icon');
    const textElement = statusOverlay.querySelector('.ws-task-text');

    // Set appropriate icon based on status
    const icons = {
        'initializing': '🔄',
        'processing': '⚙️',
        'scheduled': '⏰',
        'completed': '✅',
        'error': '❌'
    };

    if (iconElement) iconElement.textContent = icons[status] || '🔄';
    if (textElement) textElement.textContent = message;
}

// Update progress bar
function updateProgressBar(current, total) {
    if (!statusOverlay) return;

    const progressBar = statusOverlay.querySelector('.ws-progress-fill');
    const progressText = statusOverlay.querySelector('.ws-progress-text');

    if (total > 0) {
        const percentage = (current / total) * 100;
        if (progressBar) progressBar.style.width = `${percentage}%`;
        if (progressText) progressText.textContent = `${current}/${total} completed`;
    }
}

// Update stats display
function updateStatsDisplay(stats) {
    if (!statusOverlay) return;

    const processedElement = statusOverlay.querySelector('#ws-contacts-processed');
    const itemsElement = statusOverlay.querySelector('#ws-items-found');
    const imagesElement = statusOverlay.querySelector('#ws-images-downloaded');

    if (processedElement) processedElement.textContent = `${stats.processed}/${stats.totalContacts}`;
    if (itemsElement) itemsElement.textContent = stats.totalItems;
    if (imagesElement) imagesElement.textContent = stats.images;
}

// Add activity log entry
function addActivityLog(message) {
    if (!statusOverlay) return;

    const logContainer = statusOverlay.querySelector('.ws-log-entries');
    if (!logContainer) return;

    const logEntry = document.createElement('div');
    logEntry.className = 'ws-log-entry';

    const timestamp = new Date().toLocaleTimeString();
    logEntry.innerHTML = `
        <span class="ws-log-time">[${timestamp}]</span>
        <span class="ws-log-message">${message}</span>
    `;

    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;

    // Limit log entries to prevent memory issues
    while (logContainer.children.length > 100) {
        logContainer.removeChild(logContainer.firstChild);
    }
}

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function clickElement(element) {
    // Find deeply nested clickable element
    let clickableChild = element;
    for (let i = 0; i < 3; i++) {
        const nested = clickableChild?.querySelector('div, span, [role="button"]');
        if (nested) clickableChild = nested;
        else break;
    }

    if (clickableChild && clickableChild !== element) {
        clickableChild.focus();
        clickableChild.click();
        clickableChild.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        clickableChild.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        clickableChild.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
}

let allCatalogItems = [];
let allContactsCatalog = [];

async function executeOtobixScript(contact_list) {
    allContactsCatalog = [];

    // Status overlay should already be created by startExecution handler
    updateOverlayStatus('initializing', `Starting scraping process for ${contact_list.length} contacts...`);
    updateProgressBar(0, contact_list.length);
    updateStatsDisplay({ totalContacts: contact_list.length, processed: 0, totalItems: 0, images: 0 });

    for (let i = 0; i < contact_list.length; i++) {
        const contact_name = contact_list[i];

        updateOverlayStatus('processing', `Processing contact: ${contact_name} (${i + 1}/${contact_list.length})`);
        addActivityLog(`Started processing contact: ${contact_name}`);

        const allCatalogItems = await executeContact(contact_name);
        const fileLocations = DownloadContactCatalog(contact_name, allCatalogItems);
        allContactsCatalog.push({ contact: contact_name, items: allCatalogItems, files: fileLocations });

        // Update progress and stats
        updateProgressBar(i + 1, contact_list.length);
        const totalItems = allContactsCatalog.reduce((sum, contact) => sum + contact.items.length, 0);
        const totalImages = allContactsCatalog.reduce((sum, contact) =>
            sum + contact.items.reduce((itemSum, item) => itemSum + item.imgData.length, 0), 0);

        updateStatsDisplay({
            totalContacts: contact_list.length,
            processed: i + 1,
            totalItems: totalItems,
            images: totalImages
        });

        addActivityLog(`Completed ${contact_name}: ${allCatalogItems.length} items, ${allCatalogItems.reduce((sum, item) => sum + item.imgData.length, 0)} images`);

        const backButton = document.querySelector('div[aria-label="Back"]');
        if (backButton) {
            backButton.click();
            await wait(500);
        }
    }

    // Update final status
    updateOverlayStatus('completed', 'Scraping completed successfully!');
    addActivityLog('All contacts processed successfully');

    // Send completion message to background script with results
    chrome.runtime.sendMessage({
        action: "scrapingCompleted",
        results: allContactsCatalog
    });

    // Hide overlay after a delay
    setTimeout(() => {
        hideStatusOverlay();
    }, 3000);
}

async function executeContact(contact_name) {
    try {
        await wait(1000); // Wait for 1 second to ensure the page is fully loaded
        console.log("Executing script with contact name:", contact_name);

        const el = document.querySelector('div[contenteditable="true"][aria-label="Search input textbox"]');
        if (!el) {
            throw new Error('Search input not found');
        }

        el.focus();
        el.click();

        await navigator.clipboard.writeText(contact_name);
        await wait(100);
        const cancelButton = document.querySelector('button[aria-label="Cancel search"]');
        if (cancelButton) {
            cancelButton.click();
            await wait(500);
        }
        document.execCommand('insertText', false, contact_name);
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        await wait(1000);

        const searchResults = document.querySelector('div[aria-label="Search results."]');
        if (!searchResults) {
            console.log("Search results container not found");
            addActivityLog(`Warning: No search results found for ${contact_name}`);
            return [];
        }

        const firstContact = searchResults.querySelectorAll('div[role="listitem"]')[1];
        if (!firstContact) {
            console.log("No contacts found in search results");
            addActivityLog(`Warning: Contact not found: ${contact_name}`);
            return [];
        }
        clickElement(firstContact);
        await wait(1000);

        const catalogButton = document.querySelector('button[title="Catalog"]');
        if (!catalogButton) {
            console.log("Catalog button not found");
            addActivityLog(`Warning: No catalog available for ${contact_name}`);
            return [];
        }
        catalogButton.click();
        await wait(2000);

        allCatalogItems = [];
        await ScrapeCatalogItems();

        console.log("All catalog items for", contact_name, ":", allCatalogItems);
        return allCatalogItems;

    } catch (error) {
        console.error(`Error processing contact ${contact_name}:`, error);
        addActivityLog(`Error processing ${contact_name}: ${error.message}`);
        return [];
    }
}

async function ScrapeCatalogItems() {
    //div role="listitem"
    let catalogItemElements = document.querySelectorAll('div[role="listitem"]');
    if (catalogItemElements.length === 0 || catalogItemElements.length < 3) {
        console.log("No catalog items found");
        addActivityLog("No catalog items found for this contact");
        return;
    }

    //foreach catalog item click
    let totalCatalog = 0;
    const oldLength = catalogItemElements.length;

    for (let i = 0; i < catalogItemElements.length - 1; i++) {
        const item = catalogItemElements[i];
        //get first 3 span dir="auto" as name, desc, price
        const spans = item.querySelectorAll('span[dir="auto"]');
        if (spans.length < 3) {
            continue;
        }
        const name = spans[0].innerText;
        const desc = spans[1].innerText;
        const price = spans[2].innerText;

        if (allCatalogItems.find(c => c.name === name && c.desc === desc && c.price === price)) {
            continue; //duplicate
        }

        // Update status for current item
        updateOverlayStatus('processing', `Scraping item: ${name.substring(0, 30)}...`);
        addActivityLog(`Processing item: ${name}`);

        clickElement(item);
        await wait(2000);
        const data = await ScrapeCatalogDetails();

        allCatalogItems.push({ name, desc, price, ...data });
        totalCatalog++;

        addActivityLog(`Scraped ${name}: ${data.imgData ? data.imgData.length : 0} images`);
        await wait(2000);
        catalogItemElements = document.querySelectorAll('div[role="listitem"]');
    }

    // Scroll to the last item to potentially load more content
    const lastItem = catalogItemElements[catalogItemElements.length - 1];
    console.log("lastItem", lastItem);
    if (lastItem) {
        lastItem.scrollIntoView();
        await wait(1000);
    }

    // Check if more items have loaded after scrolling
    const newCatalogItemElements = document.querySelectorAll('div[role="listitem"]');
    if (newCatalogItemElements.length > catalogItemElements.length) {
        console.log(`Found ${newCatalogItemElements.length - catalogItemElements.length} more items, continuing...`);
        addActivityLog(`Found ${newCatalogItemElements.length - catalogItemElements.length} more items, loading...`);
        await ScrapeCatalogItems(); // Recursively scrape more items
    }
}

async function ScrapeCatalogDetails() {
    //take all src from img with draggable="false" and convert to base64 data
    const imgElements = document.querySelectorAll('img[draggable="false"]');
    const imgData = [];

    for (const img of imgElements) {
        try {
            // Try canvas method first (works for same-origin images)
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            ctx.drawImage(img, 0, 0);
            const base64Data = canvas.toDataURL('image/jpeg', 0.8);
            imgData.push(base64Data);
        } catch (canvasError) {
            ////THIS FOR PROFILE, CONTACT, AND CATALOG MAIN IMAGE 
            // try {
            //     // Fallback to fetch method for CORS images
            //     console.log('Canvas method failed, trying fetch method...');
            //     const response = await fetch(img.src);
            //     const blob = await response.blob();
            //     const reader = new FileReader();

            //     const base64Data = await new Promise((resolve) => {
            //         reader.onloadend = () => resolve(reader.result);
            //         reader.readAsDataURL(blob);
            //     });

            //     imgData.push(base64Data);
            // } catch (fetchError) {
            //     console.error('Both canvas and fetch methods failed:', fetchError);
            //     // Skip failed images completely
            // }
        }
    }

    //get element that comes before div title="Message business"
    let messageBusinessDiv = document.querySelector('div[title="Message business"]');
    messageBusinessDiv.scrollIntoView();
    await wait(300);
    let elementBefore = messageBusinessDiv ? messageBusinessDiv.previousElementSibling : null;
    let description = elementBefore.textContent;

    //find span by text Read more
    const readMoreSpan = Array.from(document.querySelectorAll('span')).find(span =>
        span.textContent.trim() === "Read more"
    );
    if (readMoreSpan) {
        readMoreSpan.click();
        await wait(500);
        messageBusinessDiv = document.querySelector('div[title="Message business"]');
        elementBefore = messageBusinessDiv ? messageBusinessDiv.previousElementSibling : null;
        if (elementBefore) description = elementBefore.textContent;

        const backButtonInner = document.querySelector('div[aria-label="Back"]');
        if (backButtonInner) {
            backButtonInner.click();
            await wait(500);
        }
    }
    description = description.replace("https", " https");

    const backButton = document.querySelector('div[aria-label="Back"]');
    if (backButton) {
        backButton.click();
        await wait(500);
    }

    return { imgData, description };
}


function DownloadContactCatalog(contact_name, allCatalogItems) {
    let fileLocations = [];
    //download all images in allCatalogItems to local and save to folder structure: datetime/contact_name/catalog_name/
    for (let i = 0; i < allCatalogItems.length; i++) {
        const item = allCatalogItems[i];
        for (let j = 0; j < item.imgData.length; j++) {
            const imgBase64 = item.imgData[j];
            // New folder structure: datetime/ContactName/CatalogName/img1.jpg
            const sanitizedContactName = contact_name.replace(/\s+/g, '_');
            const sanitizedItemName = item.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50); // Sanitize filename and limit length
            const filename = `${sessionDateTime}/${sanitizedContactName}/${sanitizedItemName}/img${j + 1}.jpg`;
            fileLocations.push(filename);

            // Use Chrome downloads API to create folder structure
            chrome.runtime.sendMessage({
                action: "downloadImage",
                imageData: imgBase64,
                filename: filename
            });
        }
    }

    return fileLocations;
}