// Import XLSX library for Excel processing
importScripts('/lib/xlsx.full.min.js');

let currentExcelData = null;
let scrapingResults = [];
let sessionDateTime = null; // Store the session datetime

// Background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "executeScript") {
        // Store Excel data for later use and set session datetime
        currentExcelData = message.excelData;
        scrapingResults = [];
        sessionDateTime = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            // Send message to content script with the contact list and datetime
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "startExecution",
                contact_list: message.contact_list,
                sessionDateTime: sessionDateTime
            });
        });
    }

    if (message.action === "checkScheduledTasks") {
        // Check for existing scheduled tasks and respond to content script
        chrome.storage.local.get('scheduledTask', (result) => {
            console.log('Background checking for scheduled tasks:', result);
            if (result.scheduledTask && result.scheduledTask.scheduledTime) {
                const scheduledTime = new Date(result.scheduledTask.scheduledTime);
                const now = new Date();

                if (scheduledTime > now) {
                    // Send scheduled task info back to content script
                    chrome.tabs.sendMessage(sender.tab.id, {
                        action: "taskScheduled",
                        scheduledTime: result.scheduledTask.scheduledTime,
                        contact_list: result.scheduledTask.contact_list
                    });
                } else {
                    // Remove expired scheduled task
                    chrome.storage.local.remove('scheduledTask');
                }
            }
        });
        return true; // Keep message channel open for async response
    }

    if (message.action === "scheduleScript") {
        // Store scheduled task data
        const scheduleData = {
            scheduledTime: message.scheduledTime,
            contact_list: message.contact_list,
            excelData: message.excelData,
            sessionDateTime: new Date().toISOString().slice(0, 19).replace(/:/g, '-')
        };

        // Save to chrome storage
        chrome.storage.local.set({ scheduledTask: scheduleData });

        // Set alarm for scheduled execution
        chrome.alarms.create('scheduledScraping', {
            when: new Date(message.scheduledTime).getTime()
        });

        // Notify content script about scheduled task
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "taskScheduled",
                scheduledTime: message.scheduledTime,
                contact_list: message.contact_list
            });
        });
    }

    if (message.action === "cancelSchedule") {
        // Clear scheduled task
        chrome.alarms.clear('scheduledScraping');
        chrome.storage.local.remove('scheduledTask');

        // Notify all WhatsApp tabs about cancellation
        chrome.tabs.query({ url: "*://web.whatsapp.com/*" }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "scheduleCancelled"
                }).catch(() => {
                    // Ignore errors for tabs that don't have content script loaded
                });
            });
        });

        console.log("Scheduled task cancelled");
    }

    if (message.action === "downloadImage") {
        // Convert base64 to blob URL for download
        chrome.downloads.download({
            url: message.imageData,
            filename: message.filename,
            saveAs: false // Don't show save dialog, use default download folder
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.log("Download failed:", chrome.runtime.lastError);
            } else {
                console.log("Download started with ID:", downloadId);
            }
        });
    }

    if (message.action === "scrapingCompleted") {
        // Store scraping results
        scrapingResults = message.results;
        generateExcelOutput();

        // Clear scheduled task if it was scheduled
        chrome.alarms.clear('scheduledScraping');
        chrome.storage.local.remove('scheduledTask');
    }
});

// Handle scheduled alarms
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'scheduledScraping') {
        console.log('Scheduled scraping alarm triggered');
        // Execute scheduled scraping
        chrome.storage.local.get('scheduledTask', (result) => {
            if (result.scheduledTask) {
                const task = result.scheduledTask;
                currentExcelData = task.excelData;
                scrapingResults = [];
                sessionDateTime = task.sessionDateTime;

                console.log('Executing scheduled task for contact list:', task.contact_list);

                // Find WhatsApp tabs and execute on the first available one
                chrome.tabs.query({ url: "*://web.whatsapp.com/*" }, (tabs) => {
                    if (tabs.length > 0) {
                        console.log(`Found ${tabs.length} WhatsApp tabs, executing on first one`);
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "startExecution",
                            contact_list: task.contact_list,
                            sessionDateTime: sessionDateTime
                        }).catch((error) => {
                            console.log('Failed to send startExecution message:', error);
                        });
                    } else {
                        console.log('No WhatsApp tabs found for scheduled execution');
                        // Optionally, we could open a WhatsApp tab here
                        chrome.tabs.create({
                            url: 'https://web.whatsapp.com',
                            active: true
                        }, (tab) => {
                            // Wait a few seconds for WhatsApp to load, then retry
                            setTimeout(() => {
                                chrome.tabs.sendMessage(tab.id, {
                                    action: "startExecution",
                                    contact_list: task.contact_list,
                                    sessionDateTime: sessionDateTime
                                }).catch((error) => {
                                    console.log('Failed to send startExecution message to new tab:', error);
                                });
                            }, 5000);
                        });
                    }
                });
            } else {
                console.log('No scheduled task found when alarm triggered');
            }
        });
    }
});

// Periodically check for scheduled tasks and notify content scripts
function checkAndNotifyScheduledTasks() {
    chrome.storage.local.get('scheduledTask', (result) => {
        if (result.scheduledTask && result.scheduledTask.scheduledTime) {
            const scheduledTime = new Date(result.scheduledTask.scheduledTime);
            const now = new Date();

            if (scheduledTime > now) {
                // Notify all WhatsApp tabs about the scheduled task
                chrome.tabs.query({ url: "*://web.whatsapp.com/*" }, (tabs) => {
                    tabs.forEach(tab => {
                        chrome.tabs.sendMessage(tab.id, {
                            action: "taskScheduled",
                            scheduledTime: result.scheduledTask.scheduledTime,
                            contact_list: result.scheduledTask.contact_list
                        }).catch(() => {
                            // Ignore errors for tabs that don't have content script loaded
                        });
                    });
                });
            } else {
                // Remove expired scheduled task
                chrome.storage.local.remove('scheduledTask');
                chrome.alarms.clear('scheduledScraping');
            }
        }
    });
}

// Check for scheduled tasks every 30 seconds
setInterval(checkAndNotifyScheduledTasks, 30000);
// Also check immediately when service worker starts
checkAndNotifyScheduledTasks();

async function generateExcelOutput() {
    if (!currentExcelData || !scrapingResults || scrapingResults.length == 0) return;
    let firstScrape = scrapingResults[0];
    if (!firstScrape || !firstScrape.items || firstScrape.items.length == 0) return;

    try {
        const wb = XLSX.utils.book_new();

        // Sheet 1: Keep original Dealer List intact
        const dealerListSheet = XLSX.utils.json_to_sheet(currentExcelData.dealerList);
        autoFitColumns(dealerListSheet, currentExcelData.dealerList);
        XLSX.utils.book_append_sheet(wb, dealerListSheet, "Dealer List");

        // Sheet 2: Dealer Output - Add scraped data
        const dealerOutputData = [];
        scrapingResults.forEach(contactResult => {
            if (contactResult.items && contactResult.items.length > 0) {
                contactResult.items.forEach(item => {
                    dealerOutputData.push({
                        'Dealer Name': contactResult.contact,
                        'Car Detail': `${item.name} - ${item.desc}`,
                        'Car Price': item.price,
                        'Second Page Detail': item.description
                    });
                });
            }
        });
        const dealerOutputSheet = XLSX.utils.json_to_sheet(dealerOutputData);
        autoFitColumns(dealerOutputSheet, dealerOutputData);
        XLSX.utils.book_append_sheet(wb, dealerOutputSheet, "Dealer Output");

        // Sheet 3: Dealer Image Output - Add image paths with new folder structure
        const dealerImageOutputData = await GetDealerImageOutputData();
        const dealerImageOutputSheet = XLSX.utils.json_to_sheet(dealerImageOutputData);
        autoFitColumns(dealerImageOutputSheet, dealerImageOutputData);
        XLSX.utils.book_append_sheet(wb, dealerImageOutputSheet, "Dealer Image Output");

        // Store the generated workbook
        currentExcelData.outputWorkbook = wb;

        downloadExcelFile();
        sendToWebhook(scrapingResults);

        console.log("Excel output generated successfully");
    } catch (error) {
        console.log("Error generating Excel output:", error);
    }
}

async function sendToWebhook(data) {
    const webhookUrl = 'https://hook.us1.make.com/lqcm1la7nvdevcx0lnwh7i3478fi8s3s';

    try {
        const jsonData = {result: data};
        console.log("Sending data to webhook:", jsonData);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(jsonData)
        });

        if (!response.ok) {
            throw new Error(`Webhook request failed: ${JSON.stringify(response)}`);
        }

        console.log('Data successfully sent to webhook');
    } catch (error) {
        console.log('Error sending data to webhook:', error);
    }
}

async function GetDealerImageOutputData() {
    const dealerImageOutputData = [];

    // Create an array of promises for all async operations
    const promises = [];
    let completedUploads = 0;

    scrapingResults.forEach(contactResult => {
        if (contactResult.items && contactResult.items.length > 0) {
            contactResult.items.forEach(item => {
                if (item.imgData && item.imgData.length > 0) {
                    item.imgData.forEach((imgData, index) => {
                        const promise = (async () => {
                            // Convert base64 to Blob
                            const response = await fetch(imgData);
                            const blob = await response.blob();
                            const file = new File([blob], `img${index + 1}.jpg`, { type: blob.type });

                            // Upload to Cloudinary
                            const sanitizedContactName = contactResult.contact.replace(/\s+/g, '_');
                            const sanitizedItemName = item.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
                            const folder_name = `${sessionDateTime}/${sanitizedContactName}/${sanitizedItemName}`;
                            const result = await uploadToCloudinary(file, folder_name);

                            const imagePath = result.secure_url;

                            // Replace base64 data with secure URL in the original array
                            item.imgData[index] = imagePath;

                            // Update progress
                            completedUploads++;
                            sendUploadProgress(completedUploads, promises.length);

                            return {
                                'Dealer Name': contactResult.contact,
                                'Car Detail': `${item.name} - ${item.desc}`,
                                'ImagePathName': imagePath
                            };
                        })();
                        promises.push(promise);
                    });
                }
            });
        }
    });

    // Send initial progress
    if (promises.length > 0) {
        sendUploadProgress(0, promises.length);
    }

    // Wait for all promises to complete
    const results = await Promise.all(promises);
    results.forEach(dealerData => {
        dealerImageOutputData.push(dealerData);
    });

    // Send completion message
    sendUploadComplete();

    return dealerImageOutputData;
}

// Function to send upload progress to content script
function sendUploadProgress(completed, total) {
    chrome.tabs.query({ url: "*://web.whatsapp.com/*" }, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: "uploadProgress",
                progress: completed,
                total: total
            }).catch(() => {
                // Ignore errors for tabs that don't have content script loaded
            });
        });
    });
}

// Function to send upload completion to content script
function sendUploadComplete() {
    chrome.tabs.query({ url: "*://web.whatsapp.com/*" }, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: "uploadComplete"
            }).catch(() => {
                // Ignore errors for tabs that don't have content script loaded
            });
        });
    });
}

// Function to auto-fit column widths
function autoFitColumns(worksheet, data) {
    if (!data || data.length === 0) return;

    const colWidths = {};

    // Get headers and calculate their widths
    const headers = Object.keys(data[0]);
    headers.forEach(header => {
        colWidths[header] = header.length;
    });

    // Calculate maximum width for each column based on content
    data.forEach(row => {
        headers.forEach(header => {
            const cellValue = String(row[header] || '');
            colWidths[header] = Math.max(colWidths[header], cellValue.length);
        });
    });

    // Set column widths (with some padding and max limit)
    const cols = headers.map(header => ({
        wch: Math.min(Math.max(colWidths[header] + 2, 10), 50) // Min 10, max 50 characters
    }));

    worksheet['!cols'] = cols;
}

function downloadExcelFile() {
    if (!currentExcelData || !currentExcelData.outputWorkbook) {
        console.log("No Excel data to download");
        return;
    }

    try {
        // Generate Excel file as base64
        const excelBuffer = XLSX.write(currentExcelData.outputWorkbook, {
            bookType: 'xlsx',
            type: 'base64'
        });

        // Create data URL for download
        const dataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBuffer}`;

        // Download the file directly without save dialog, using session datetime
        chrome.downloads.download({
            url: dataUrl,
            filename: `${sessionDateTime}.xlsx`,
            saveAs: false // Direct download without save dialog
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.log("Excel download failed:", chrome.runtime.lastError);
            } else {
                console.log("Excel download started with ID:", downloadId);
            }
        });

    } catch (error) {
        console.log("Error downloading Excel file:", error);
    }
}



// Cloudinary configuration
const CLOUDINARY_CONFIG = {
    cloudName: 'dwunzqigc',
    apiKey: '681484459434256',
    apiSecret: 'U2EjlMiM0qDbAPj_hG2aYuEufNQ',
    folder: 'carimages/'
};

// Generate signature for signed upload
async function generateSignature(timestamp, folder) {
    const message = `folder=${folder}&timestamp=${timestamp}${CLOUDINARY_CONFIG.apiSecret}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Upload function
async function uploadToCloudinary(file, folder_name) {

    try {
        const timestamp = Math.round(Date.now() / 1000);
        const folder = CLOUDINARY_CONFIG.folder + folder_name;
        const signature = await generateSignature(timestamp, folder);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', folder);
        formData.append('timestamp', timestamp);
        formData.append('api_key', CLOUDINARY_CONFIG.apiKey);
        formData.append('signature', signature);

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );

        if (!response.ok) {
            throw new Error(`Upload failed: ${response}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.log('Upload error:', error);
        return { "secure_url": "" };
    }
}