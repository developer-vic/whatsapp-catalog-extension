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

        // Notify content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "scheduleCancelled"
            });
        });
    }

    if (message.action === "downloadImage") {
        // Convert base64 to blob URL for download
        chrome.downloads.download({
            url: message.imageData,
            filename: message.filename,
            saveAs: false // Don't show save dialog, use default download folder
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error("Download failed:", chrome.runtime.lastError);
            } else {
                console.log("Download started with ID:", downloadId);
            }
        });
    }

    if (message.action === "scrapingCompleted") {
        // Store scraping results
        scrapingResults = message.results;
        generateExcelOutput();
        downloadExcelFile();

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
                            console.error('Failed to send startExecution message:', error);
                        });
                    } else {
                        console.error('No WhatsApp tabs found for scheduled execution');
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
                                    console.error('Failed to send startExecution message to new tab:', error);
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

function generateExcelOutput() {
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
        const dealerImageOutputData = [];
        scrapingResults.forEach(contactResult => {
            if (contactResult.items && contactResult.items.length > 0) {
                contactResult.items.forEach(item => {
                    if (item.imgData && item.imgData.length > 0) {
                        item.imgData.forEach((imgData, index) => {
                            const sanitizedContactName = contactResult.contact.replace(/\s+/g, '_');
                            const sanitizedItemName = item.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
                            // New folder structure: datetime/contact_name/catalog_name/img1.jpg
                            const imagePath = `${sessionDateTime}/${sanitizedContactName}/${sanitizedItemName}/img${index + 1}.jpg`;

                            dealerImageOutputData.push({
                                'Dealer Name': contactResult.contact,
                                'Car Detail': `${item.name} - ${item.desc}`,
                                'ImagePathName': imagePath
                            });
                        });
                    }
                });
            }
        });
        const dealerImageOutputSheet = XLSX.utils.json_to_sheet(dealerImageOutputData);
        autoFitColumns(dealerImageOutputSheet, dealerImageOutputData);
        XLSX.utils.book_append_sheet(wb, dealerImageOutputSheet, "Dealer Image Output");

        // Store the generated workbook
        currentExcelData.outputWorkbook = wb;

        console.log("Excel output generated successfully");
    } catch (error) {
        console.error("Error generating Excel output:", error);
    }
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
        console.error("No Excel data to download");
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
                console.error("Excel download failed:", chrome.runtime.lastError);
            } else {
                console.log("Excel download started with ID:", downloadId);
            }
        });

    } catch (error) {
        console.error("Error downloading Excel file:", error);
    }
}
