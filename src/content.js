console.log('WhatsApp catalog content script ready');

let sessionDateTime = null;
let overlayElement = null;
let overlayTimer = null;
let uploadedCount = 0;

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'startExecution') {
    sessionDateTime = message.sessionDateTime;
    uploadedCount = 0;
    runScraper(message.contact_list).catch((error) => {
      console.error('Failed to execute scraper:', error);
      chrome.runtime.sendMessage({ action: 'scrapingFailed', error: error.message });
      hideOverlay();
    });
  }
});

async function runScraper(contactList) {
  if (!Array.isArray(contactList) || contactList.length === 0) {
    throw new Error('Contact list is empty.');
  }

  ensureOverlay();
  showOverlayStatus('Starting scrape...');

  const aggregatedContacts = [];

  for (const contactName of contactList) {
    showOverlayStatus(`Scraping ${contactName}`);
    const items = await scrapeContactCatalog(contactName);
    aggregatedContacts.push({ contact: contactName, items });
  }

  chrome.runtime.sendMessage({
    action: 'scrapingCompleted',
    results: aggregatedContacts,
    summary: {
      totalContacts: aggregatedContacts.length,
      totalItems: aggregatedContacts.reduce((acc, entry) => acc + (entry.items?.length || 0), 0)
    }
  });

  showOverlayStatus('Scraping finished');
  setTimeout(hideOverlay, 2500);
}

async function scrapeContactCatalog(contactName) {
  try {
    await wait(800);

    const searchInput = document.querySelector('div[contenteditable="true"][aria-label="Search input textbox"]');
    if (!searchInput) {
      throw new Error('Unable to locate WhatsApp search input.');
    }

    searchInput.focus();
    searchInput.click();

    await navigator.clipboard.writeText(contactName);
    await wait(80);
    const cancelButton = document.querySelector('button[aria-label="Cancel search"]');
    if (cancelButton) {
      cancelButton.click();
      await wait(250);
    }

    document.execCommand('insertText', false, contactName);
    searchInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await wait(800);

    const searchResults = document.querySelector('div[aria-label="Search results."]');
    if (!searchResults) {
      console.warn('No search results container for contact:', contactName);
      return [];
    }

    const resultItems = searchResults.querySelectorAll('div[role="listitem"]');
    const targetContact = resultItems.length > 1 ? resultItems[1] : null;
    if (!targetContact) {
      console.warn('Contact not found in search results:', contactName);
      return [];
    }

    clickElement(targetContact);
    await wait(900);

    const catalogButton = document.querySelector('button[title="Catalog"]');
    if (!catalogButton) {
      console.warn('Catalog button missing for contact:', contactName);
      return [];
    }

    catalogButton.click();
    await wait(1500);

    const items = [];
    await collectCatalogItems(contactName, items);

    const backButton = document.querySelector('div[aria-label="Back"]');
    if (backButton) {
      backButton.click();
      await wait(400);
    }

    return items;
  } catch (error) {
    console.error(`Error while scraping contact ${contactName}:`, error);
    return [];
  }
}

async function collectCatalogItems(contactName, accumulator) {
  let catalogCards = Array.from(document.querySelectorAll('div[role="listitem"]'));
  if (catalogCards.length <= 1) {
    console.warn('No catalog cards found for', contactName);
    return;
  }

  for (let index = 0; index < catalogCards.length - 1; index++) {
    const card = catalogCards[index];
    const spans = card.querySelectorAll('span[dir="auto"]');
    if (spans.length < 3) {
      continue;
    }

    const name = spans[0].innerText;
    const desc = spans[1].innerText;
    const price = spans[2].innerText;

    if (accumulator.some((item) => item.name === name && item.desc === desc && item.price === price)) {
      continue;
    }

    clickElement(card);
    await wait(1200);

    const details = await scrapeCatalogDetails();
    const catalogItem = { name, desc, price, ...details };
    accumulator.push(catalogItem);

    uploadedCount += 1;
    updateOverlayProgress(uploadedCount);

    chrome.runtime.sendMessage({
      action: 'catalogItemScraped',
      contact: contactName,
      item: catalogItem,
      totalItems: Math.max(accumulator.length, catalogCards.length - 1)
    });

    catalogCards = Array.from(document.querySelectorAll('div[role="listitem"]'));
  }

  const loader = catalogCards[catalogCards.length - 1];
  if (loader) {
    loader.scrollIntoView();
    await wait(800);
    const refreshed = Array.from(document.querySelectorAll('div[role="listitem"]'));
    if (refreshed.length > catalogCards.length) {
      await collectCatalogItems(contactName, accumulator);
    }
  }
}

async function scrapeCatalogDetails() {
  const messageBusiness = document.querySelector('div[title="Message business"]');
  let description = '';

  if (messageBusiness) {
    messageBusiness.scrollIntoView();
    await wait(200);
    const prev = messageBusiness.previousElementSibling;
    if (prev) {
      description = prev.textContent || '';
    }

    const readMore = Array.from(document.querySelectorAll('span')).find((span) => span.textContent.trim() === 'Read more');
    if (readMore) {
      readMore.click();
      await wait(400);
      const refreshedMessage = document.querySelector('div[title="Message business"]');
      if (refreshedMessage) {
        const refreshedPrev = refreshedMessage.previousElementSibling;
        if (refreshedPrev) {
          description = refreshedPrev.textContent || description;
        }
      }
      const back = document.querySelector('div[aria-label="Back"]');
      if (back) {
        back.click();
        await wait(350);
      }
    }
  }

  const backButton = document.querySelector('div[aria-label="Back"]');
  if (backButton) {
    backButton.click();
    await wait(350);
  }

  return {
    description: description.replace('https', ' https')
  };
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clickElement(element) {
  if (!element) {
    return;
  }

  let target = element;
  for (let depth = 0; depth < 3; depth++) {
    const nested = target.querySelector('button, div, span');
    if (!nested) {
      break;
    }
    target = nested;
  }

  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function ensureOverlay() {
  if (overlayElement) {
    return overlayElement;
  }

  overlayElement = document.createElement('div');
  overlayElement.id = 'whatsapp-scraper-overlay';
  overlayElement.innerHTML = `
    <div class="overlay-inner">
      <div class="overlay-title">WhatsApp catalog scraper</div>
      <div class="overlay-status" id="overlayStatus">Preparing...</div>
      <div class="overlay-progress">
        <span id="overlayCount">0 items</span>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #whatsapp-scraper-overlay {
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(17, 25, 40, 0.92);
      color: #f8fafc;
      padding: 16px 20px;
      border-radius: 14px;
      font-family: 'Segoe UI', sans-serif;
      font-size: 14px;
      z-index: 2147483647;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
      min-width: 220px;
    }
    #whatsapp-scraper-overlay .overlay-title {
      font-weight: 600;
      margin-bottom: 6px;
      font-size: 14px;
    }
    #whatsapp-scraper-overlay .overlay-status {
      font-size: 13px;
      color: rgba(226, 232, 240, 0.85);
      margin-bottom: 8px;
    }
    #whatsapp-scraper-overlay .overlay-progress {
      font-size: 12px;
      color: rgba(148, 163, 184, 0.8);
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(overlayElement);

  return overlayElement;
}

function showOverlayStatus(text) {
  ensureOverlay();
  const statusEl = document.getElementById('overlayStatus');
  if (statusEl) {
    statusEl.textContent = text;
  }

  if (overlayTimer) {
    clearTimeout(overlayTimer);
    overlayTimer = null;
  }
}

function updateOverlayProgress(count) {
  const countEl = document.getElementById('overlayCount');
  if (countEl) {
    countEl.textContent = `${count} item${count === 1 ? '' : 's'} uploaded`;
  }
}

function hideOverlay() {
  if (overlayTimer) {
    clearTimeout(overlayTimer);
    overlayTimer = null;
  }

  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
}