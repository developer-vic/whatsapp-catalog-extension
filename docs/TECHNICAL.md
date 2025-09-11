# Technical Documentation

## Architecture Overview

The WhatsApp Catalog Scraper Extension follows Chrome Extension Manifest V3 architecture with three main components:

### Components

1. **Background Script** (`src/background.js`)
   - Service worker for extension lifecycle management
   - Handles Excel processing and file downloads
   - Manages communication between components

2. **Content Script** (`src/content.js`) 
   - Injected into WhatsApp Web pages
   - Performs DOM manipulation and data extraction
   - Handles catalog scraping and image processing

3. **Popup Interface** (`src/popup.html`, `src/popup.js`)
   - User interface for file upload and control
   - Excel file validation and parsing
   - Progress monitoring and result download

### Data Flow

```
Excel Upload → Popup → Background → Content Script → WhatsApp DOM
     ↓                                      ↓
Results Download ← Background ← Content Script ← Scraped Data
```

## Key Technologies

- **Chrome Extension API** (Manifest V3)
- **XLSX.js** - Excel file processing
- **JSZip** - Archive creation (if needed)
- **Chrome Downloads API** - File management
- **DOM Manipulation** - WhatsApp Web interaction

## File Structure Details

```
src/
├── background.js       # Service worker, Excel processing
├── content.js          # WhatsApp Web automation
├── popup.html          # UI interface
└── popup.js           # UI logic and Excel handling

assets/icons/
├── icon16.png         # Toolbar icon
├── icon32.png         # Extension management
├── icon48.png         # Extension details
└── icon128.png        # Chrome Web Store

lib/
├── xlsx.full.min.js   # Excel processing library
└── jszip.min.js       # ZIP functionality (future use)
```

## Development Notes

### Content Security Policy
- All scripts loaded locally to comply with CSP
- No external CDN dependencies in production

### Permission Requirements
- `activeTab` - Access to current WhatsApp Web tab
- `scripting` - Content script injection
- `downloads` - File download management
- `clipboardWrite/Read` - Text manipulation (legacy)

### Error Handling
- Comprehensive try-catch blocks
- User-friendly error messages
- Console logging for debugging

## Performance Considerations

- Asynchronous operations with proper await handling
- Rate limiting with wait() functions
- Memory management for large image processing
- Progressive loading for large contact lists

## Security Features

- Local file processing only
- No data transmission to external servers
- Sandbox execution environment
- User consent for all operations

---

For implementation details, see individual source files with inline documentation.
