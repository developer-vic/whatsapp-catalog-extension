# WhatsApp Catalog Scraper Extension

Chrome extension that automates WhatsApp Web catalog collection and uploads finished results to Firebase in a single batch.

## Key Features

- **Single-contact scraping** driven by the phone number assigned to the signed-in operator.
- **Automated WhatsApp navigation** with an in-page overlay that shows progress while products are captured.
- **Single-shot upload**: product data is sent to Firestore only after scraping completes, avoiding partially synced sessions.
- **Firebase-integrated dashboard**: operators authenticate with Firebase Auth and see completion status in the popup once the batch upload is done.

## Usage

1. **Install**  
   - Clone or download the repo.  
   - In Chrome, open `chrome://extensions`, enable *Developer mode*, choose **Load unpacked**, and select this project directory.
   - Copy `src/firebase-init.example.js` to `src/firebase-init.js` and update it with your Firebase project credentials (the real file is ignored by git).

2. **Sign in**  
   - Open the extension popup.  
   - Sign in with your Firebase Auth credentials.  
   - The popup shows the phone number assigned to your account.

3. **Start scraping**  
   - Make sure you are logged in to [web.whatsapp.com](https://web.whatsapp.com) in a browser tab.  
   - Click **Start scraping** in the popup. The popup closes automatically.  
   - The content script opens the assigned contact’s catalog and scrapes every product.

4. **Wait for completion**  
   - Watch the overlay inside WhatsApp Web for progress.  
   - When the process finishes, the extension uploads items to `users/{uid}/sessions/{sessionId}` and then notifies the background script.  
   - Reopen the popup to view updated totals and the list of scraped items.

## Data Flow

```
popup.js        -> creates session document, triggers scraping
background.js   -> tracks active session and uploads data after completion
content.js      -> scrapes WhatsApp catalog, returns aggregated results once, no streaming updates
Firestore       -> stores session metadata and scraped items
```

## Requirements

- Chrome (Manifest V3)
- Firebase project with Auth and Firestore
- WhatsApp Web account with catalog access for the assigned contact

## Repository Layout

```
whatsapp-catalog-extension/
├── src/
│   ├── background.js     # background worker handling Firebase writes
│   ├── content.js        # WhatsApp Web scraper and overlay
│   ├── popup.js          # popup UI and Firebase Auth integration
│   └── firebase-init.js  # Firebase configuration (not checked in)
├── lib/                  # Firebase compat SDK bundles
├── manifest.json         # extension manifest
├── admin.html            # optional admin UI
└── README.md
```

## Support

Report issues or feature requests via the project tracker, or contact the engineering team managing the Firebase project.
