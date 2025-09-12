let excelData = null;
let contactList = [];
let scheduledTimeout = null;
let countdownInterval = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', function () {
    initializeUI();
    setupEventListeners();
    setMinDateTime(); 
    setupRuntimeMessageListener();
});

// Listen for runtime messages (e.g., when schedule is cancelled from background)
function setupRuntimeMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "scheduleCancelled" || message.action === "taskCompleted") {
            // Reset UI when schedule is cancelled or task completes
            clearSchedule();
            resetScheduleUI();

            if (message.action === "taskCompleted") {
                showStatus('Task completed successfully!', 'success');
            } else {
                showStatus('Schedule was cancelled', 'info');
            }
        }
    });
}

function initializeUI() {
    // Setup drag and drop
    const uploadArea = document.getElementById('uploadArea');

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            document.getElementById('excelFile').files = files;
            handleFileUpload({ target: { files: files } });
        }
    });
}

function setupEventListeners() {
    document.getElementById('excelFile').addEventListener('change', handleFileUpload);
    document.getElementById('startBtn').addEventListener('click', handleStartButton);
    document.getElementById('resetBtn').addEventListener('click', resetForm);

    // Schedule option handlers
    document.querySelectorAll('.schedule-option').forEach(option => {
        option.addEventListener('click', function () {
            document.querySelectorAll('.schedule-option').forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');

            const type = this.dataset.type;
            const datetimeInput = document.getElementById('datetimeInput');
            const btnText = document.getElementById('btnText');
            const startBtn = document.getElementById('startBtn');

            if (type === 'scheduled') {
                datetimeInput.classList.add('active');
                btnText.textContent = 'Schedule Task';
            } else {
                datetimeInput.classList.remove('active');
                btnText.textContent = 'Start Scraping';
                clearSchedule();
            }

            // Reset button state when switching modes
            startBtn.classList.remove('btn-secondary', 'loading');
            startBtn.classList.add('btn-primary');

            // Enable/disable button based on data availability
            if (excelData && contactList.length > 0) {
                if (type === 'scheduled') {
                    validateDateTime(); // This will enable/disable based on valid datetime
                }
            }
        });
    });

    // Date/time input handlers
    document.getElementById('scheduleDate').addEventListener('change', validateDateTime);
    document.getElementById('scheduleTime').addEventListener('change', validateDateTime);
}

function setMinDateTime() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5);

    document.getElementById('scheduleDate').min = today;
    document.getElementById('scheduleDate').value = today;
    document.getElementById('scheduleTime').value = currentTime;
}
 
function resetToInitialState() {
    // Reset button to initial state
    const startBtn = document.getElementById('startBtn');
    const activeScheduleType = document.querySelector('.schedule-option.active')?.dataset.type || 'now';

    startBtn.classList.remove('btn-secondary', 'loading');
    startBtn.classList.add('btn-primary');

    if (activeScheduleType === 'scheduled') {
        startBtn.innerHTML = '<span id="btnText">Schedule Task</span>';
    } else {
        startBtn.innerHTML = '<span id="btnText">Start Scraping</span>';
    }

    // Ensure schedule options are in default state
    document.querySelectorAll('.schedule-option').forEach(opt => opt.classList.remove('active'));
    document.querySelector('.schedule-option[data-type="now"]').classList.add('active');
    document.getElementById('datetimeInput').classList.remove('active');

    // Clear any countdowns
    clearSchedule();
}

function validateDateTime() {
    const dateInput = document.getElementById('scheduleDate');
    const timeInput = document.getElementById('scheduleTime');
    const startBtn = document.getElementById('startBtn');

    if (!dateInput.value || !timeInput.value) return;

    const scheduledDateTime = new Date(`${dateInput.value}T${timeInput.value}`);
    const now = new Date();

    if (scheduledDateTime <= now) {
        showStatus('Scheduled time must be in the future', 'error');
    } else {
        const timeDiff = scheduledDateTime - now;
        const hours = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

        showStatus(`Task will execute in ${hours}h ${minutes}m`, 'info');
    }
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Show loading state
    const uploadArea = document.getElementById('uploadArea');
    uploadArea.style.opacity = '0.7';

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Check if required sheets exist
            const requiredSheets = ['Dealer List', 'Dealer Output', 'Dealer Image Output'];
            const availableSheets = workbook.SheetNames;

            const missingSheets = requiredSheets.filter(sheet => !availableSheets.includes(sheet));
            if (missingSheets.length > 0) {
                showStatus(`Missing required sheets: ${missingSheets.join(', ')}`, 'error');
                uploadArea.style.opacity = '1';
                return;
            }

            // Parse Dealer List sheet
            const dealerListSheet = workbook.Sheets['Dealer List'];
            const dealerListData = XLSX.utils.sheet_to_json(dealerListSheet);

            // Extract contact list (prefer Dealer Name, fallback to Phone Number)
            contactList = dealerListData.map(row => {
                return row['Dealer Name'] || row['Phone Number'] || '';
            }).filter(contact => contact.trim() !== '');

            // Store the complete Excel data for later use
            excelData = {
                workbook: workbook,
                dealerList: dealerListData,
                dealerOutput: XLSX.utils.sheet_to_json(workbook.Sheets['Dealer Output']),
                dealerImageOutput: XLSX.utils.sheet_to_json(workbook.Sheets['Dealer Image Output'])
            };

            // Update UI
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('dealerCount').textContent = contactList.length;
            document.getElementById('fileInfo').style.display = 'block';

            // Enable start button
            const activeScheduleType = document.querySelector('.schedule-option.active').dataset.type;
            if (activeScheduleType === 'now') {
                document.getElementById('startBtn').disabled = false;
            } else {
                validateDateTime();
            }

            uploadArea.style.opacity = '1';
            showStatus(`File loaded successfully! Found ${contactList.length} dealers.`, 'success');

        } catch (error) {
            showStatus('Error reading Excel file. Please check the format.', 'error');
            console.error('Excel parsing error:', error);
            uploadArea.style.opacity = '1';
        }
    };
    reader.readAsArrayBuffer(file);
}

function handleStartButton() { 
    if (!excelData || contactList.length === 0) {
        console.log('No excel data or contact list');
        showStatus('Please upload a valid Excel file first.', 'error');
        return;
    }

    const activeScheduleOption = document.querySelector('.schedule-option.active');
    const activeScheduleType = activeScheduleOption ? activeScheduleOption.dataset.type : 'now';

    console.log('Active schedule type:', activeScheduleType);
    console.log('Button onclick handler:', document.getElementById('startBtn').onclick);

    if (activeScheduleType === 'scheduled') {
        console.log('Calling scheduleTask');
        scheduleTask();
    } else {
        console.log('Calling startScraping');
        startScraping();
    }
}

function scheduleTask() {
    const dateInput = document.getElementById('scheduleDate');
    const timeInput = document.getElementById('scheduleTime');

    if (!dateInput.value || !timeInput.value) {
        showStatus('Please select date and time for scheduling', 'error');
        return;
    }

    const scheduledDateTime = new Date(`${dateInput.value}T${timeInput.value}`);
    const now = new Date();

    if (scheduledDateTime <= now) {
        showStatus('Scheduled time must be in the future', 'error');
        return;
    }

    // Send schedule message to background script
    chrome.runtime.sendMessage({
        action: "scheduleScript",
        scheduledTime: scheduledDateTime.toISOString(),
        contact_list: contactList,
        excelData: excelData
    });

    // Start local countdown in popup (if popup stays open)
    startCountdown(scheduledDateTime);

    showStatus(`Task scheduled for ${scheduledDateTime.toLocaleString()}. You can close this popup - the task will run automatically.`, 'info');
}

function startCountdown(targetDateTime) {
    const countdownDiv = document.getElementById('countdown');
    const countdownTime = document.getElementById('countdownTime');

    countdownDiv.classList.add('active');

    countdownInterval = setInterval(() => {
        const now = new Date();
        const timeDiff = targetDateTime - now;

        if (timeDiff <= 0) {
            clearInterval(countdownInterval);
            countdownDiv.classList.remove('active');
            window.close(); // Close popup when countdown ends
            return;
        }

        const hours = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

        countdownTime.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

function clearSchedule() {
    if (scheduledTimeout) {
        clearTimeout(scheduledTimeout);
        scheduledTimeout = null;
    }

    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }

    document.getElementById('countdown').classList.remove('active');
}

function resetScheduleUI() {
    const startBtn = document.getElementById('startBtn');
    const activeScheduleType = document.querySelector('.schedule-option.active')?.dataset.type || 'now';

    // Reset button text based on active schedule type
    if (activeScheduleType === 'scheduled') {
        startBtn.innerHTML = '<span id="btnText">Schedule Task</span>';
    } else {
        startBtn.innerHTML = '<span id="btnText">Start Scraping</span>';
    }

    // Reset button classes and handler
    startBtn.classList.remove('btn-secondary', 'loading');
    startBtn.classList.add('btn-primary');
}

function startScraping() {
    // Clear any scheduled countdown
    clearSchedule();

    // Show loading state
    const startBtn = document.getElementById('startBtn');
    startBtn.classList.add('loading');
    startBtn.innerHTML = '<span>Starting...</span>';

    // Send message to background script with contact list
    chrome.runtime.sendMessage({
        action: "executeScript",
        contact_list: contactList,
        excelData: excelData
    });
    window.close();
}

function resetForm() {
    // Clear storage first
    chrome.storage.local.remove('scheduledTask');
    chrome.runtime.sendMessage({ action: "cancelSchedule" });

    // Clear file input
    document.getElementById('excelFile').value = '';
    document.getElementById('fileInfo').style.display = 'none';

    // Clear data
    excelData = null;
    contactList = [];

    // Clear schedule
    clearSchedule();

    // Reset UI
    document.getElementById('startBtn').disabled = true;
    document.getElementById('startBtn').innerHTML = '<span id="btnText">Start Scraping</span>';
    document.getElementById('startBtn').classList.remove('loading', 'btn-secondary');
    document.getElementById('startBtn').classList.add('btn-primary'); 

    // Reset schedule options
    document.querySelectorAll('.schedule-option').forEach(opt => opt.classList.remove('active'));
    document.querySelector('.schedule-option[data-type="now"]').classList.add('active');
    document.getElementById('datetimeInput').classList.remove('active');

    // Set current date/time
    setMinDateTime();

    // Clear status
    document.getElementById('status').style.display = 'none';

    showStatus('Form reset successfully', 'info');
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';

    // Hide after 5 seconds for success/info messages
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}