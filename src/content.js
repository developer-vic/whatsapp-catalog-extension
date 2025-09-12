// Content script that waits for message from background
console.log("Content script loaded");
let sessionDateTime = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Received message in content script:", message);
    if (message.action === "startExecution") {
        try {
            sessionDateTime = message.sessionDateTime;
            executeOtobixScript(message.contact_list);
        } catch (error) {
            console.log('Error starting execution:', error);
        }
    }

    if (message.action === "taskScheduled") {
        // Show scheduled task countdown in overlay (avoid duplicates)
    }

    if (message.action === "scheduleCancelled") {
        // Hide countdown overlay
    }
});

// Check for existing scheduled tasks on page load
function checkForScheduledTasks() {
    // Ask background script to check for scheduled tasks
    chrome.runtime.sendMessage({ action: "checkScheduledTasks" });
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

    for (let i = 0; i < contact_list.length; i++) {
        const contact_name = contact_list[i];

        const allCatalogItems = await executeContact(contact_name);
        //const fileLocations = DownloadContactCatalog(contact_name, allCatalogItems);
        allContactsCatalog.push({ contact: contact_name, items: allCatalogItems /*, files: fileLocations*/ });

        const backButton = document.querySelector('div[aria-label="Back"]');
        if (backButton) {
            backButton.click();
            await wait(500);
        }
    }

    // Send completion message to background script with results
    chrome.runtime.sendMessage({
        action: "scrapingCompleted",
        results: allContactsCatalog
    });
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
            return [];
        }

        const firstContact = searchResults.querySelectorAll('div[role="listitem"]')[1];
        if (!firstContact) {
            console.log("No contacts found in search results"); 
            return [];
        }
        clickElement(firstContact);
        await wait(1000);

        const catalogButton = document.querySelector('button[title="Catalog"]');
        if (!catalogButton) {
            console.log("Catalog button not found"); 
            return [];
        }
        catalogButton.click();
        await wait(2000);

        allCatalogItems = [];
        await ScrapeCatalogItems();

        console.log("All catalog items for", contact_name, ":", allCatalogItems);
        return allCatalogItems;

    } catch (error) {
        console.log(`Error processing contact ${contact_name}:`, error); 
        return [];
    }
}

async function ScrapeCatalogItems() {
    //div role="listitem"
    let catalogItemElements = document.querySelectorAll('div[role="listitem"]');
    if (catalogItemElements.length === 0 || catalogItemElements.length < 3) {
        console.log("No catalog items found"); 
        return;
    }

    //foreach catalog item click  
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

        clickElement(item);
        await wait(2000);

        const data = await ScrapeCatalogDetails();
        await wait(2000);

        allCatalogItems.push({ name, desc, price, ...data });
        catalogItemElements = document.querySelectorAll('div[role="listitem"]');
    }

    // Scroll to the last item to potentially load more content
    const lastItem = catalogItemElements[catalogItemElements.length - 1];
    if (lastItem) {
        lastItem.scrollIntoView();
        await wait(1000);
    }

    // Check if more items have loaded after scrolling
    const newCatalogItemElements = document.querySelectorAll('div[role="listitem"]');
    if (newCatalogItemElements.length > catalogItemElements.length) {
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
            console.log("Canvas method failed, trying fetch for image:", img.src);
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