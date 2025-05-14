// Config
const APP_VERSION = '1.0.4';
const CACHE_NAME = `ipa-cache-${APP_VERSION}`;
const OFFLINE_PAGE = '/offline.html';
const MAX_CACHE_AGE_DAYS = 30;

// Precached Assets (Critical)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/manifest.json',
  '/favicon.ico'
];

// Runtime Cached Assets
const RUNTIME_CACHE = [
  '/database.json',
  '/offline.html',
  '/img/default-guru.png',
  '/icons/icon-192x192.png'
];

// ===== INSTALL =====
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing version ${APP_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Precaching critical assets');
        return cache.addAll(PRECACHE_ASSETS)
          .then(() => cache.addAll(RUNTIME_CACHE))
          .catch(err => console.warn('[SW] Cache addAll error:', err))
          .then(() => self.skipWaiting()); // Pindahkan skipWaiting ke sini
      })
  );
});

// ===== ACTIVATE =====
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activated version ${APP_VERSION}`);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all([
        // Clean old caches
        ...cacheNames
          .filter(name => name.startsWith('ipa-cache-') && name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }),

        // Claim clients
        self.clients.claim(),

        // Clean expired cache
        cleanExpiredCache()
      ]);
    })
  );
});

// ===== FETCH =====
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET & cross-origin
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  // HTML: Network First
  if (request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetchWithTimeout(request, 3000)
        .then(networkResponse => {
          updateCache(request, networkResponse.clone());
          return networkResponse;
        })
        .catch(() => getFromCache(request) || getOfflinePage())
    );
    return;
  }

  // Static Assets: Cache First
  if (isStaticAsset(request)) {
    event.respondWith(
      getFromCache(request)
        .then(cached => cached || fetchAndCache(request))
    );
    return;
  }

  // API/Data: Network First
  event.respondWith(
    fetchWithTimeout(request)
      .then(networkResponse => {
        if (request.url.endsWith('.json')) {
          updateCache(request, networkResponse.clone());
        }
        return networkResponse;
      })
      .catch(() => getFromCache(request))
  );
});

// ===== HELPERS =====
function fetchWithTimeout(request, timeout = 1500) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]);
}

function updateCache(request, response) {
  if (response.ok) {
    caches.open(CACHE_NAME)
      .then(cache => cache.put(request, response))
      .catch(err => console.warn('[SW] Cache put error:', err));
  }
}

function getFromCache(request) {
  return caches.match(request)
    .then(response => response || Promise.reject('No cache match'));
}

function getOfflinePage() {
  return caches.match(OFFLINE_PAGE)
    .then(response => response || Response.error());
}

function fetchAndCache(request) {
  return fetch(request)
    .then(response => {
      updateCache(request, response.clone());
      return response;
    })
    .catch(() => {
      if (request.url.match(/\.(png|jpg|jpeg)$/)) {
        return caches.match('/img/default-guru.png');
      }
      return Response.error();
    });
}

function isStaticAsset(request) {
  return request.url.match(/\.(css|js|png|jpg|jpeg|ico|svg|woff2?)$/);
}

function cleanExpiredCache() {
  const now = Date.now();
  return caches.open(CACHE_NAME)
    .then(cache => cache.keys()
      .then(keys => {
        return Promise.all(keys.map(request => {
          return cache.match(request).then(response => {
            if (!response) return;
            const date = new Date(response.headers.get('date'));
            if (now - date > MAX_CACHE_AGE_DAYS * 86400000) {
              return cache.delete(request);
            }
          });
        }));
      })
    );
}

// ===== BACKGROUND SYNC =====
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  // Implement your sync logic here
  console.log('[SW] Syncing pending data...');
}y-tag"
  };
  const tagClass = tagClassMap[normalized] || "general-tag"; // Default tag

  return `<span class="subject-tag ${tagClass}">${escapeHtml(subject)}</span>`;
}

function generateFeedbackButtons() {
  return `
    <div class="feedback-controls">
        <button class="feedback-btn like-btn" onclick="handleFeedback('like')">
            <i class="icon-thumbs-up"></i>
        </button>
        <button class="feedback-btn dislike-btn" onclick="handleFeedback('dislike')">
            <i class="icon-thumbs-down"></i>
        </button>
    </div>
  `;
}

function generateDiagramPlaceholder(diagramUrl, subtopic) {
  return `
    <div class="response-diagram diagram-placeholder">
        <img src="${diagramUrl}" alt="Diagram ${escapeHtml(subtopic || '')}" loading="lazy">
        <div class="image-load-error">Gagal memuat diagram.</div>
    </div>
  `;
}

async function checkImageExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    console.error('Error checking image:', error);
    return false;
  }
}

function generateFallbackResponse(customMessage) {
  const message = customMessage || "Maaf, saya tidak mengerti pertanyaan Anda.";
  return `<div class="bot-message answer-box">${escapeHtml(message)}</div>`;
}

function getRandomResponse(responsesArray) {
  if (!responsesArray || responsesArray.length === 0) {
    console.warn("getRandomResponse called with empty or invalid array.");
    return "Informasi tidak tersedia saat ini."; // Fallback response
  }
  return responsesArray[Math.floor(Math.random() * responsesArray.length)];
}

// ================ [6] USER INTERFACE ================ //
function showTypingIndicator() {
  const chatbox = document.getElementById('chatbox');
  if (!chatbox) return null;

  const typingIndicator = document.createElement('div');
  typingIndicator.className = 'typing-indicator';
  typingIndicator.innerHTML = `
        <div class="typing-content">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
        </div>
    `;
  chatbox.appendChild(typingIndicator);
  scrollToBottom(chatbox);
  return typingIndicator;
}

function displayBotMessage(responseHTML) {
  const chatbox = document.getElementById('chatbox');
  if (!chatbox) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = 'bot-message';
  messageDiv.innerHTML = responseHTML;
  chatbox.appendChild(messageDiv);
  scrollToBottom(chatbox);

  // Simpan pesan bot ke riwayat
  sessionContext.conversationHistory.push({
    type: 'bot',
    text: messageDiv.textContent.trim(),
    timestamp: new Date().toISOString()
  });
  saveConversation();
}

function displayUserMessage(message) {
  const chatbox = document.getElementById('chatbox');
  if (!chatbox) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = 'user-message';
  messageDiv.textContent = message;
  chatbox.appendChild(messageDiv);
  scrollToBottom(chatbox);

  // Simpan pesan pengguna ke riwayat
  sessionContext.conversationHistory.push({
    type: 'user',
    text: message,
    timestamp: new Date().toISOString()
  });
  saveConversation();
}

function clearChat() {
  const chatbox = document.getElementById('chatbox');
  if (chatbox) {
    chatbox.innerHTML = '';
  }
  sessionContext.conversationHistory = [];
  sessionContext.currentTopic = null;
  sessionContext.lastSubtopic = null;
  saveConversation();
  showWelcomeMessage(); // Tampilkan welcome message setelah clear
}

function scrollToBottom(element) {
  if (element) {
    element.scrollTop = element.scrollHeight;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showWelcomeMessage() {
  const welcomeMessage = `
    <div class="welcome-message">
        <h3>Selamat datang!</h3>
        <p>Saya adalah asisten virtual Anda. Apa yang ingin Anda ketahui hari ini?</p>
        <div class="example-questions">
            <button class="example-question-btn">Apa itu sel?</button>
            <button class="example-question-btn">Bagaimana proses fotosintesis?</button>
            <button class="example-question-btn">Siapa guru biologi?</button>
        </div>
    </div>
  `;
  displayBotMessage(welcomeMessage);
}

// ================ [7] EVENT HANDLING ================ //
function setupEventListeners() {
  const userInput = document.getElementById('userInput');
  const sendButton = document.getElementById('sendButton');
  const clearButton = document.querySelector('.clear-btn');
  const themeToggle = document.querySelector('.theme-toggle');
  const app = document.getElementById('app');

  if (userInput && sendButton) {
    userInput.addEventListener('keydown', handleUserInput);
    sendButton.addEventListener('click', handleUserInput);
  }

  if (clearButton) {
    clearButton.addEventListener('click', clearChat);
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  if (app) {
    app.style.display = 'block';
  }

  // Event delegation untuk example questions
  document.addEventListener('click', function(event) {
    if (event.target && event.target.classList.contains('example-question-btn')) {
      userInput.value = event.target.textContent;
      processUserInput(event);
    }
  });
}

function handleUserInput(event) {
  if (event.type === 'keydown' && event.key !== 'Enter') return;
  event.preventDefault();

  const userInput = document.getElementById('userInput');
  if (!userInput) return;

  const message = userInput.value.trim();
  if (!message) return;

  if (isRateLimited()) {
    showRateLimitMessage();
    return;
  }

  displayUserMessage(message);
  userInput.value = '';
  processUserInput(event);
  lastMessageTime = Date.now();
}

function processUserInput(event) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const userInput = document.getElementById('userInput');
    if (!userInput) return;

    const query = userInput.value.trim();
    if (query) {
      handleUserMessage(query);
    }
  }, CONFIG.DEBOUNCE_TIME);
}

async function handleUserMessage(query) {
  try {
    const match = findBestMatch(query);
    const responseHTML = await formatResponse(match);
    displayBotMessage(responseHTML);
  } catch (error) {
    console.error('Error handling user message:', error);
    displayBotMessage(generateFallbackResponse("Terjadi kesalahan saat memproses pesan Anda."));
  }
}

function handleFeedback(type) {
  console.log(`Feedback: ${type}`);
  // Implementasikan logika penyimpanan feedback di sini (misalnya, ke server)
  alert(`Terima kasih atas feedback Anda! (${type})`);
}

function toggleTheme() {
  document.body.classList.toggle('dark-theme');
}

function isRateLimited() {
  return (Date.now() - lastMessageTime) < CONFIG.RATE_LIMIT_TIME;
}

function showRateLimitMessage() {
  const message = "Terlalu cepat! Mohon tunggu sebentar sebelum mengirim pesan lagi.";
  const errorDiv = document.createElement('div');
  errorDiv.className = 'rate-limit-notification';
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);

  setTimeout(() => {
    errorDiv.remove();
  }, 3000); // Hilangkan setelah 3 detik
}

// ================ [8] CONVERSATION HISTORY ================ //
function saveConversation() {
  try {
    localStorage.setItem('conversation', JSON.stringify(sessionContext.conversationHistory.slice(-CONFIG.MAX_HISTORY)));
  } catch (error) {
    console.error("Failed to save conversation:", error);
    // Mungkin berikan notifikasi ke pengguna jika penyimpanan gagal
  }
}

function loadConversation() {
  try {
    const savedHistory = localStorage.getItem('conversation');
    if (savedHistory) {
      sessionContext.conversationHistory = JSON.parse(savedHistory);
      restoreConversationUI();
    }
  } catch (error) {
    console.error("Failed to load conversation:", error);
    // Mungkin berikan notifikasi ke pengguna jika pemuatan gagal
  }
}

function restoreConversationUI() {
  const chatbox = document.getElementById('chatbox');
  if (!chatbox) return;

  chatbox.innerHTML = ''; // Bersihkan chatbox sebelum memulihkan

  sessionContext.conversationHistory.forEach(message => {
    const messageDiv = document.createElement('div');
    messageDiv.className = message.type === 'user' ? 'user-message' : 'bot-message';
    messageDiv.textContent = message.text;
    chatbox.appendChild(messageDiv);
  });
  scrollToBottom(chatbox);
}

// ================ [9] ERROR HANDLING ================ //
function showCriticalError(message) {
  let errorDiv = document.getElementById('critical-error-message');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.id = 'critical-error-message';
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '0';
    errorDiv.style.left = '0';
    errorDiv.style.width = '100%';
    errorDiv.style.backgroundColor = '#f44336';
    errorDiv.style.color = 'white';
    errorDiv.style.padding = '10px';
    errorDiv.style.textAlign = 'center';
    errorDiv.style.zIndex = '9999';
    errorDiv.textContent = message;
    document.body.prepend(errorDiv);
  } else {
    errorDiv.textContent = message; // Update pesan jika sudah ada
  }
  // Jangan gunakan alert jika Anda ingin UI yang lebih terintegrasi
  // alert(message); 
}


async function initializeApp() {
  console.log("Initializing application...");
  try {
    await loadDatabase(); // Muat database terlebih dahulu
    setupEventListeners(); // Setelah itu, siapkan event listener
    loadConversation(); // Muat riwayat percakapan
    
    // Tampilkan pesan selamat datang hanya jika tidak ada riwayat percakapan yang dimuat
    // atau jika chatbox kosong.
    const chatbox = document.getElementById('chatbox');
    if (!chatbox || chatbox.children.length === 0) {
        showWelcomeMessage();
    } else {
        scrollToBottom(chatbox); // Scroll ke bawah jika ada riwayat
    }
    console.log("Application initialized successfully.");
  } catch (error) {
    console.error("Initialization failed:", error);
    showCriticalError("Gagal menginisialisasi aplikasi. Silakan coba muat ulang halaman.");
  }
}

// Event listener untuk memulai aplikasi setelah DOM siap
document.addEventListener('DOMContentLoaded', () => {
  // Beri sedikit waktu agar semua elemen lain mungkin termuat,
  // meskipun biasanya 'DOMContentLoaded' sudah cukup.
  // Penundaan 100ms...
  setTimeout(initializeApp, 100);
});