// ================ [1] INITIALIZATION & CONFIG ================ //
/**
 * Konfigurasi utama aplikasi.
 * @type {{
 *  MIN_MATCH_SCORE: number,
 *  CURRENT_TOPIC_BOOST: number,
 *  QUESTION_TYPE_BONUS: Record<string, number>,
 *  DEBOUNCE_TIME: number,
 *  RATE_LIMIT_TIME: number,
 *  FALLBACK_IMAGE_PATH: string,
 *  MAX_CONVERSATION_HISTORY: number
 * }}
 */
const CONFIG = {
    MIN_MATCH_SCORE: 0.6,
    CURRENT_TOPIC_BOOST: 1.3,
    QUESTION_TYPE_BONUS: {
        'definition': 1.4,  // Untuk pertanyaan definisi (apa, jelaskan)
        'process': 1.3,     // Untuk pertanyaan proses (bagaimana, langkah)
        'reason': 1.2       // Untuk pertanyaan alasan (mengapa, sebab)
    },
    DEBOUNCE_TIME: 300,
    RATE_LIMIT_TIME: 1000,
    FALLBACK_IMAGE_PATH: 'images/default-guru.png',
    MAX_CONVERSATION_HISTORY: 50  // Batasi penyimpanan riwayat
};

/**
 * State aplikasi dan session pengguna.
 * @type {{
 *  currentTopic: string | null,
 *  lastSubtopic: string | null,
 *  conversationHistory: Array<{
 *      query: string,
 *      response: string,
 *      timestamp: string
 *  }>
 * }}
 */
const sessionContext = {
    currentTopic: null,
    lastSubtopic: null,
    conversationHistory: []
};

// Variabel sistem
let dataset = null;
let isDatabaseLoading = false;
let debounceTimer = null;
let lastMessageTime = 0;
// ================ [2] DATABASE HANDLING ================ //

async function loadDatabase() {
    if (dataset || isDatabaseLoading) return;
    isDatabaseLoading = true;

    try {
        const response = await fetch('database.json');
        if (!response.ok) throw new Error(`Gagal memuat database (HTTP ${response.status})`);
        
        dataset = await response.json();
        validateDatabaseStructure(dataset); // Validasi struktur
        console.log("Database loaded:", Object.keys(dataset.topics));
    } catch (error) {
        console.error("Database error:", error);
        dataset = getFallbackDataset();
        showDatabaseError();
    } finally {
        isDatabaseLoading = false;
    }
}

/**
 * Validasi struktur database.
 * @param {any} data 
 * @throws {Error} Jika struktur tidak valid
 */
function validateDatabaseStructure(data) {
    if (!data?.topics || typeof data.topics !== 'object') {
        throw new Error("Struktur database tidak valid: 'topics' tidak ditemukan");
    }
}

/**
 * Fallback dataset untuk mode offline.
 * @returns {{
 *  topics: Record<string, {
 *      subtopics: Record<string, {
 *          QnA: Array<{
 *              intent?: string,
 *              patterns: string[],
 *              responses: string[],
 *              diagram?: string
 *          }>
 *      }>
 *  }>
 * }}
 */
function getFallbackDataset() {
    return {
        topics: {
            "Biologi": {
                subtopics: {
                    "Sel": {
                        QnA: [{
                            intent: "definition",
                            patterns: ["apa itu sel", "definisi sel"],
                            responses: [
                                "Sel adalah unit terkecil makhluk hidup.",
                                "Struktur dasar penyusun semua organisme."
                            ],
                            diagram: "images/sel.jpg"
                        }]
                    }
                }
            },
            "Profil Guru": {
                subtopics: {
                    "Informasi Umum": {
                        QnA: [{
                            intent: "information",
                            patterns: ["siapa guru biologi", "nama guru"],
                            responses: ["Guru Biologi: Ibu Siti, Guru Fisika: Pak Budi"]
                        }]
                    }
                }
            }
        }
    };
}

/**
 * Menampilkan pesan error database ke UI.
 */
function showDatabaseError() {
    const errorHTML = `
        <div class="error-message">
            <strong>⚠️ Mode Terbatas:</strong> Database offline. 
            <small>Beberapa fitur mungkin tidak tersedia.</small>
        </div>
    `;
    addMessage(errorHTML);
}

// ================ [3] TEXT PROCESSING UTILITIES ================ //
/**
 * Normalisasi teks untuk pencocokan yang lebih baik.
 * @param {string} text - Input teks dari pengguna.
 * @returns {string} Teks yang sudah dinormalisasi.
 */
function normalizeText(text) {
    if (typeof text !== 'string') return '';
    
    return text
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // Hapus diakritik (é → e)
        .replace(/[^\w\s]/g, ' ')  // Ganti simbol dengan spasi
        .replace(/\s+/g, ' ')      // Hapus spasi berlebih
        .trim();
}

/**
 * Tokenisasi teks dengan filter stopwords dan sinonim.
 * @param {string} text - Teks input.
 * @returns {string[]} Array kata-kata penting.
 */
function tokenize(text) {
    const stopWords = new Set(['yang', 'di', 'ke', 'dari', 'dan', 'itu', 'ada']);
    const synonymMap = {
        'sel': ['unit terkecil', 'struktur dasar'],
        'fotosintesis': ['proses tumbuhan', 'pembuatan makanan']
    };

    return normalizeText(text)
        .split(' ')
        .filter(word => word.length > 0 && !stopWords.has(word))
        .flatMap(word => synonymMap[word] ? [word, ...synonymMap[word]] : [word]);
}

// ================ [4] MATCHING ENGINE IMPROVEMENTS ================ //
/**
 * Hitung skor kecocokan antara query dan pola.
 * @param {string} query - Pertanyaan pengguna.
 * @param {string} pattern - Pola dari database.
 * @returns {number} Skor antara 0-1.
 */
function calculateMatchScore(query, pattern) {
    const queryTokens = tokenize(query);
    const patternTokens = tokenize(pattern);

    // 1. Exact Match Bonus
    const exactMatches = queryTokens.filter(t => patternTokens.includes(t));
    let score = exactMatches.length * 0.3;

    // 2. Partial Match (Substring/Subsequence)
    const partialMatchThreshold = 0.6;
    const queryStr = queryTokens.join(' ');
    const patternStr = patternTokens.join(' ');
    if (queryStr.includes(patternStr) || patternStr.includes(queryStr)) {
        score += 0.4;
    }

    // 3. Contextual Boosting
    if (sessionContext.currentTopic && pattern.includes(sessionContext.currentTopic)) {
        score *= CONFIG.CURRENT_TOPIC_BOOST;
    }

    return Math.min(score, 1.0);
}

/**
 * Cari jawaban terbaik di database.
 * @param {string} query - Pertanyaan pengguna.
 * @returns {{
 *  score: number,
 *  topic: string,
 *  subtopic: string,
 *  responses: string[],
 *  intent?: string
 * } | null} Hasil pencarian atau null jika tidak ditemukan.
 */
function findBestMatch(query) {
    if (!dataset?.topics) return null;

    const normalizedQuery = normalizeText(query);
    let bestMatch = { score: 0 };

    // Prioritaskan pencarian berdasarkan intent
    const { intent } = detectQuestionType(normalizedQuery);
    for (const topic in dataset.topics) {
        const topicMatch = searchInTopic(topic, normalizedQuery, intent);
        if (topicMatch.score > bestMatch.score) {
            bestMatch = topicMatch;
            if (bestMatch.score > 0.8) break; // Early exit jika sudah sangat cocok
        }
    }

    return bestMatch.score >= CONFIG.MIN_MATCH_SCORE ? bestMatch : null;
}

/**
 * Deteksi tipe pertanyaan untuk bonus skor.
 * @param {string} query 
 * @returns {{type: string, bonus: number}}
 */
function detectQuestionType(query) {
    const questionTypes = {
        'definition': ['apa', 'definisi', 'artinya'],
        'process': ['bagaimana', 'proses', 'tahap'],
        'reason': ['mengapa', 'alasan', 'sebab']
    };

    const tokens = tokenize(query);
    for (const [type, keywords] of Object.entries(questionTypes)) {
        if (keywords.some(kw => tokens.includes(kw))) {
            return { type, bonus: CONFIG.QUESTION_TYPE_BONUS[type] || 1.0 };
        }
    }
    return { type: 'general', bonus: 1.0 };
}

// ================ [5] RESPONSE GENERATION ================ //
/**
 * Format jawaban berdasarkan tipe konten.
 * @param {MatchResult} match - Hasil dari findBestMatch.
 * @returns {Promise<string>} HTML response.
 */
async function formatResponse(match) {
    if (!match) return generateFallbackResponse();

    const typingIndicator = showTypingIndicator();
    try {
        // Prioritaskan berdasarkan intent
        switch (match.intent) {
            case 'definition':
                return await formatDefinitionResponse(match);
            case 'process':
                return await formatProcessResponse(match);
            default:
                return await formatGeneralResponse(match);
        }
    } finally {
        typingIndicator.remove();
    }
}

/**
 * Format respons untuk definisi.
 * @param {MatchResult} match 
 * @returns {Promise<string>}
 */
async function formatDefinitionResponse(match) {
    const responseText = getRandomResponse(match.responses);
    return `
        <div class="answer-box definition">
            <h3>📖 ${match.subtopic}</h3>
            <p>${responseText}</p>
            ${await generateDiagramHTML(match)}
            ${generateFeedbackButtons()}
        </div>
    `;
}

/**
 * Generate diagram HTML jika tersedia.
 * @param {MatchResult} match 
 * @returns {Promise<string>}
 */
async function generateDiagramHTML(match) {
    if (!match.diagram) return '';
    const imageExists = await checkImageExists(match.diagram);
    return imageExists ? 
        `<div class="diagram"><img src="${match.diagram}" alt="${match.subtopic}"></div>` :
        '';
}

/**
 * Fallback response ketika tidak ada match.
 * @returns {string}
 */
function generateFallbackResponse() {
    const fallbacks = [
        "Maaf, saya belum paham pertanyaan Anda. Coba gunakan kata kunci lain.",
        "Pertanyaan menarik! Namun saya belum memiliki informasinya saat ini."
    ];
    return `<div class="answer-box fallback">${getRandomResponse(fallbacks)}</div>`;
}

// ================ [6] CHAT INTERFACE FUNCTIONS ================ //
/**
 * Tambahkan pesan ke chatbox dengan sanitasi HTML.
 * @param {string} content - Konten pesan (bisa berupa HTML atau teks biasa).
 * @param {boolean} isBot - True jika pesan dari bot.
 * @param {string} [messageType] - Tipe pesan ('error', 'warning', 'info').
 */
function addMessage(content, isBot = true, messageType = '') {
    const chatbox = document.getElementById('chatbox');
    if (!chatbox) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isBot ? 'bot-message' : 'user-message'} ${messageType}`;
    
    // Sanitasi HTML sebelum dimasukkan (gunakan DOMPurify jika tersedia)
    messageDiv.innerHTML = window.DOMPurify?.sanitize(content) || sanitizeHTML(content);
    chatbox.appendChild(messageDiv);
    scrollToBottom(chatbox);
}

/**
 * Sanitasi HTML sederhana (fallback jika DOMPurify tidak ada).
 * @param {string} html 
 * @returns {string}
 */
function sanitizeHTML(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
}

/**
 * Tampilkan typing indicator animasi.
 * @returns {HTMLElement} Element indicator yang bisa di-remove.
 */
function showTypingIndicator() {
    const chatbox = document.getElementById('chatbox');
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = `
        <div class="typing-content">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
        </div>
    `;
    chatbox.appendChild(indicator);
    scrollToBottom(chatbox);
    return indicator;
}

/**
 * Tampilkan pesan welcome dengan contoh pertanyaan.
 */
function showWelcomeMessage() {
    addMessage(`
        <div class="welcome-message">
            <h3>👋 Halo! Saya Asisten Virtual Biologi</h3>
            <p>Silakan tanyakan tentang:</p>
            <ul>
                <li><button onclick="insertExample('Apa itu sel?')">Apa itu sel?</button></li>
                <li><button onclick="insertExample('Bagaimana proses fotosintesis?')">Proses fotosintesis</button></li>
                <li><button onclick="insertExample('Siapa guru biologi?')">Guru biologi</button></li>
            </ul>
        </div>
    `, true, 'info');
}

/**
 * Scroll chatbox ke bawah.
 * @param {HTMLElement} element 
 */
function scrollToBottom(element) {
    element.scrollTo({
        top: element.scrollHeight,
        behavior: 'smooth'
    });
}

// ================ [7] USER INPUT PROCESSING ================ //
/**
 * Handle input pengguna dari elemen userInput.
 * @param {Event} event
 */
async function handleUserInput(event) {
    const input = event.target;
    const userMessage = input.value.trim();

    if (event.type === 'input' && userMessage) {
        //  Input event (misalnya, perubahan teks)
        console.log("User input:", userMessage);
        //  Anda bisa tambahkan logika di sini untuk live-update, validasi, dll.
    }

    if (event instanceof KeyboardEvent && event.key === 'Enter' && !event.shiftKey && userMessage) {
        //  Enter key pressed
        event.preventDefault(); // Mencegah baris baru di input
        await processUserInput(userMessage); // Kirim pesan untuk diproses
        input.value = ''; // Bersihkan input setelah dikirim
    }
}


/**
 * Proses input pengguna dengan rate limiting dan debounce.
 * @param {string} userMessage - Pesan dari pengguna
 */
async function processUserInput(userMessage) {
    const now = Date.now();
    if (now - lastMessageTime < CONFIG.RATE_LIMIT_TIME) {
        showRateLimitWarning();
        return;
    }
    lastMessageTime = now;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        try {
            await handleUserMessage(userMessage); // Gunakan pesan yang diterima
        } catch (error) {
            console.error("Process error:", error);
            addMessage("Terjadi kesalahan saat memproses pesan.", true, 'error');
        }
    }, CONFIG.DEBOUNCE_TIME);
}

/**
 * Handle pengiriman pesan pengguna.
 * @param {string} userMessage - Pesan dari pengguna
 */
async function handleUserMessage(userMessage) {
    if (!userMessage) return;

    // Tampilkan pesan pengguna
    addMessage(userMessage, false);

    // Load database jika belum ada
    if (!dataset && !isDatabaseLoading) {
        addMessage("Memuat pengetahuan...", true, 'info');
        await loadDatabase();
    }

    // Cari dan format jawaban
    const match = findBestMatch(userMessage);
    const response = await formatResponse(match);
    addMessage(response, true);

    // Update konteks percakapan
    updateSessionContext(match, userMessage, response);
}

/**
 * Tampilkan peringatan rate limit.
 */
function showRateLimitWarning() {
    const warning = document.getElementById('rateLimitWarning');
    if (warning) {
        warning.style.display = 'block';
        setTimeout(() => warning.style.display = 'none', 2000);
    }
}

// ================ [8] SESSION MANAGEMENT ================ //
/**
 * Update konteks percakapan.
 * @param {MatchResult|null} match - Hasil pencarian terbaik.
 * @param {string} userMessage - Pesan pengguna.
 * @param {string} botResponse - Jawaban bot.
 */
function updateSessionContext(match, userMessage, botResponse) {
    // Update topik saat ini
    if (match?.topic) {
        sessionContext.currentTopic = match.topic;
        sessionContext.lastSubtopic = match.subtopic;
    }

    // Simpan riwayat (dengan batasan maksimal)
    sessionContext.conversationHistory.push({
        query: userMessage,
        response: botResponse,
        timestamp: new Date().toISOString(),
        match: match ? {
            topic: match.topic,
            subtopic: match.subtopic,
            intent: match.intent
        } : null
    });

    // Batasi riwayat
    if (sessionContext.conversationHistory.length > CONFIG.MAX_CONVERSATION_HISTORY) {
        sessionContext.conversationHistory.shift();
    }

    saveConversation();
}

/**
 * Bersihkan percakapan dan reset state.
 */
function clearConversation() {
    const chatbox = document.getElementById('chatbox');
    if (chatbox) chatbox.innerHTML = '';

    sessionContext.currentTopic = null;
    sessionContext.lastSubtopic = null;
    sessionContext.conversationHistory = [];
    localStorage.removeItem('chatHistory');

    showWelcomeMessage();
}

/**
 * Auto-save konteks ke localStorage.
 */
function saveConversation() {
    try {
        const dataToSave = {
            context: {
                currentTopic: sessionContext.currentTopic,
                lastSubtopic: sessionContext.lastSubtopic
            },
            history: sessionContext.conversationHistory.slice(-10) // Simpan hanya 10 terakhir
        };
        localStorage.setItem('chatHistory', JSON.stringify(dataToSave));
    } catch (error) {
        handleStorageError(error);
    }
}

// ================ [9] PERSISTENCE FUNCTIONS ================ //
/**
 * Simpan percakapan ke localStorage dengan kompresi dan error handling.
 */
function saveConversation() {
    if (!sessionContext.conversationHistory.length) return;

    try {
        const dataToSave = {
            meta: {
                version: 1,
                lastUpdated: new Date().toISOString()
            },
            context: {
                currentTopic: sessionContext.currentTopic,
                lastSubtopic: sessionContext.lastSubtopic
            },
            history: compressHistory(sessionContext.conversationHistory)
        };

        localStorage.setItem('chatHistory', JSON.stringify(dataToSave));
    } catch (error) {
        handleStorageError(error);
    }
}

/**
 * Kompres riwayat percakapan untuk menghemat space.
 * @param {Array} history 
 * @returns {Array} Compressed history
 */
function compressHistory(history) {
    return history.map(entry => ({
        q: entry.query,          // q = query
        r: entry.response,       // r = response
        t: entry.timestamp,      // t = timestamp
        m: entry.match ? {       // m = match
            tp: entry.match.topic,    // tp = topic
            st: entry.match.subtopic, // st = subtopic
            i: entry.match.intent     // i = intent
        } : null
    }));
}

/**
 * Muat percakapan dari localStorage.
 */
function loadConversation() {
    try {
        const rawData = localStorage.getItem('chatHistory');
        if (!rawData) return;

        const parsed = JSON.parse(rawData);
        if (!parsed?.history) return;

        sessionContext.conversationHistory = decompressHistory(parsed.history);
        sessionContext.currentTopic = parsed.context?.currentTopic || null;
        sessionContext.lastSubtopic = parsed.context?.lastSubtopic || null;

        // Render ulang percakapan
        sessionContext.conversationHistory.forEach(entry => {
            addMessage(entry.query, false);
            addMessage(entry.response, true);
        });
    } catch (error) {
        console.error("Failed to load conversation:", error);
        clearStorage();
    }
}

/**
 * Dekompres riwayat percakapan.
 */
function decompressHistory(compressed) {
    return compressed.map(entry => ({
        query: entry.q,
        response: entry.r,
        timestamp: entry.t,
        match: entry.m ? {
            topic: entry.m.tp,
            subtopic: entry.m.st,
            intent: entry.m.i
        } : null
    }));
}

/**
 * Handle error penyimpanan (khusus QuotaExceeded).
 */
function handleStorageError(error) {
    console.error("Storage error:", error);
    if (error.name === 'QuotaExceededError') {
        // Coba hapus data lama jika penuh
        const keys = Object.keys(localStorage);
        for (const key of keys) {
            if (key !== 'chatHistory') {
                localStorage.removeItem(key);
            }
        }
        // Coba simpan lagi dengan data yang lebih kecil
        saveConversation();
    }
}

/**
 * Bersihkan semua data penyimpanan.
 */
function clearStorage() {
    localStorage.removeItem('chatHistory');
    localStorage.removeItem('feedbackHistory');
}
// ================ [10] FEEDBACK SYSTEM ================ //
/**
 * Handle feedback pengguna (upvote/downvote).
 * @param {HTMLElement} button - Tombol feedback yang diklik
 * @param {'up'|'down'} type - Jenis feedback
 */
function handleFeedback(button, type) {
    if (!button || !type) return;

    const answerBox = button.closest('.answer-box');
    if (!answerBox) return;

    // Update UI
    const feedbackUI = answerBox.querySelector('.feedback-buttons');
    if (feedbackUI) {
        feedbackUI.innerHTML = type === 'up' 
            ? '<span class="feedback-ack">👍 Terima kasih!</span>'
            : '<span class="feedback-ack">🙏 Akan kami perbaiki.</span>';
    }

    // Simpan feedback
    saveFeedback(answerBox, type);
}

/**
 * Simpan feedback ke localStorage.
 */
function saveFeedback(answerBox, type) {
    try {
        const question = answerBox.querySelector('.answer-content')?.textContent || '';
        const feedbackData = {
            question: question.substring(0, 100), // Batasi panjang
            rating: type,
            timestamp: new Date().toISOString(),
            context: {
                topic: sessionContext.currentTopic,
                subtopic: sessionContext.lastSubtopic
            }
        };

        const existing = JSON.parse(localStorage.getItem('feedbackHistory') || '[]');
        existing.push(feedbackData);
        
        // Batasi maksimal 100 feedback
        const trimmedHistory = existing.slice(-100);
        localStorage.setItem('feedbackHistory', JSON.stringify(trimmedHistory));

        // Log ke analytics (jika ada)
        if (window.analytics) {
            window.analytics.track('feedback', feedbackData);
        }
    } catch (error) {
        console.error("Failed to save feedback:", error);
    }
}

/**
 * Generate tombol feedback dengan aksesibilitas.
 */
function generateFeedbackButtons() {
    return `
        <div class="feedback-buttons" aria-label="Beri nilai jawaban">
            <button onclick="handleFeedback(this, 'up')" 
                    aria-label="Jawaban membantu">
                👍
            </button>
            <button onclick="handleFeedback(this, 'down')" 
                    aria-label="Jawaban kurang membantu">
                👎
            </button>
        </div>
    `;
}

// ================ [11] UTILITY FUNCTIONS ================ //
/**
 * Memeriksa keberadaan resource (gambar/API endpoint) dengan timeout dan retry.
 * @param {string} url - URL resource yang akan diperiksa
 * @param {Object} [options] - Konfigurasi tambahan
 * @param {number} [options.timeout=2000] - Timeout dalam ms
 * @param {number} [options.retry=1] - Jumlah percobaan ulang
 * @returns {Promise<boolean>}
 */
async function checkResourceExists(url, { timeout = 2000, retry = 1 } = {}) {
    if (!url || typeof url !== 'string') return false;
    
    try {
        // Handle data URLs dan blob URLs
        if (url.startsWith('data:') || url.startsWith('blob:')) {
            return true;
        }

        let attempts = 0;
        while (attempts <= retry) {
            try {
                const exists = await Promise.race([
                    new Promise(resolve => {
                        const img = new Image();
                        img.onload = () => resolve(true);
                        img.onerror = () => resolve(false);
                        img.src = url;
                    }),
                    new Promise(resolve => setTimeout(() => resolve(false), timeout))
                ]);
                
                if (exists) return true;
            } catch (error) {
                console.warn(`Attempt ${attempts + 1} failed for ${url}`, error);
            }
            attempts++;
        }
        return false;
    } catch (error) {
        console.error('Resource check error:', error);
        return false;
    }
}

/**
 * Debounce function dengan immediate execution option.
 * @param {Function} func - Fungsi yang akan di-debounce
 * @param {number} wait - Waktu tunggu dalam ms
 * @param {boolean} [immediate=false] - Eksekusi langsung pada panggilan pertama
 * @returns {Function}
 */
function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = () => {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        
        if (callNow) func.apply(context, args);
    };
}

/**
 * Throttle function dengan trailing execution.
 * @param {Function} func - Fungsi yang akan di-throttle
 * @param {number} limit - Waktu limit dalam ms
 * @returns {Function}
 */
function throttle(func, limit) {
    let lastFunc;
    let lastRan;
    return function throttledFunction(...args) {
        const context = this;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if (Date.now() - lastRan >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
}

/**
 * Generate ID unik untuk tracking.
 * @param {number} [length=8] - Panjang ID
 * @returns {string}
 */
function generateUniqueId(length = 8) {
    return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * Validasi dan format timestamp.
 * @param {string|Date} [timestamp] - Timestamp input
 * @returns {string} - ISO format timestamp
 */
function formatTimestamp(timestamp = new Date()) {
    try {
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    } catch {
        return new Date().toISOString();
    }
}
// ================ [12] INITIALIZATION & EVENT HANDLERS ================ //
const AppController = {
    // State management
    status: 'idle',
    eventListeners: [],
    perfMetrics: {},

    /**
     * Initialize aplikasi utama
     */
    async initialize() {
        if (this.status !== 'idle') return;
        this.status = 'initializing';
        this.perfMetrics.start = performance.now();

        try {
            // Phase 1: Load critical resources
            await this._loadResources();
            this.perfMetrics.resourcesLoaded = performance.now();

            // Phase 2: Setup UI components
            await this._setupUI();
            this.perfMetrics.uiReady = performance.now();

            // Phase 3: Finalize
            this.status = 'ready';
            this.perfMetrics.fullyReady = performance.now();
            this._logMetrics();

        } catch (error) {
            this.status = 'error';
            this._handleError(error);
        }
    },

    /**
     * Cleanup aplikasi sebelum unload
     */
    cleanup() {
        this._removeEventListeners();
        this.status = 'idle';
        console.log('App cleaned up successfully');
    },

    // Private methods
    async _loadResources() {
        await Promise.all([
            loadDatabase(),
            initializeTheme(),
            this._registerServiceWorker()
        ]);
    },

    async _setupUI() {
        this._setupEventListeners();
        loadConversation();
        showWelcomeMessage();
    },

    _setupEventListeners() {
        const appContainer = document.getElementById('app') || document.body;
        
        // Event delegation map
        const eventMap = [
            { element: appContainer, type: 'click', handler: this._handleAppClick },
            { element: appContainer, type: 'keydown', handler: this._handleAppKeyEvents },
            { 
                element: document.getElementById('userInput'), 
                type: 'input', 
                handler: debounce(handleUserInput, CONFIG.DEBOUNCE_TIME),
                optional: true
            }
        ];

        // Register listeners with cleanup tracking
        eventMap.forEach(({ element, type, handler, optional }) => {
            if (!element && !optional) {
                console.warn(`Element not found for ${type} event`);
                return;
            }
            element?.addEventListener(type, handler);
            this.eventListeners.push({ element, type, handler });
        });
    },

    _removeEventListeners() {
        this.eventListeners.forEach(({ element, type, handler }) => {
            element?.removeEventListener(type, handler);
        });
        this.eventListeners = [];
    },

    async _registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;

        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            
            // Auto-update logic
            registration.addEventListener('updatefound', () => {
                console.log('Service worker update detected');
                this._showUpdateNotification();
            });

            // Check for updates periodically
            setInterval(() => registration.update(), CONFIG.SW_UPDATE_INTERVAL);

        } catch (error) {
            console.error('Service Worker registration failed:', error);
            throw error;
        }
    },

    _handleAppClick(event) {
        const { target } = event;
        
        // Feedback handler
        if (target.closest('.feedback-buttons button')) {
            const button = target.closest('button');
            const type = button.textContent.includes('👍') ? 'up' : 'down';
            handleFeedback(button, type);
            return;
        }

        // Example insertion
        if (target.closest('.welcome-message button')) {
            insertExample(target.textContent);
            return;
        }

        // Clear chat
        if (target.id === 'clearChat') {
            clearConversation();
            return;
        }
    },

    _handleAppKeyEvents(event) {
        // Submit on Enter (exclude Shift+Enter for multiline)
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            processUserInput();
        }
    },

    _handleError(error) {
        console.error('App initialization error:', error);
        
        // Critical error UI
        document.body.innerHTML = `
            <div class="critical-error">
                <h2>⚠️ Application Error</h2>
                <p>${error.message || 'Initialization failed'}</p>
                <div class="error-actions">
                    <button onclick="window.location.reload()">Reload</button>
                    <button onclick="AppController.cleanup()">Reset</button>
                </div>
            </div>
        `;
        
        // Log to analytics if available
        if (window.analytics) {
            window.analytics.track('app_error', { 
                error: error.toString(),
                status: this.status
            });
        }
    },

    _logMetrics() {
        const metrics = {
            'Resource Loading': `${this.perfMetrics.resourcesLoaded - this.perfMetrics.start}ms`,
            'UI Initialization': `${this.perfMetrics.uiReady - this.perfMetrics.resourcesLoaded}ms`,
            'Total Boot Time': `${this.perfMetrics.fullyReady - this.perfMetrics.start}ms`,
            'Memory Usage': `${(performance.memory?.usedJSHeapSize / 1048576).toFixed(2)} MB`
        };
        
        console.table(metrics);
        
        // Send to analytics if available
        if (window.analytics) {
            window.analytics.track('performance_metrics', metrics);
        }
    },

    _showUpdateNotification() {
        // Implement your UI update notification here
        console.log('New version available');
    }
};

// Initialize theme manager
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 
                      matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    
    document.documentElement.dataset.theme = savedTheme;

    document.getElementById('themeToggle')?.addEventListener('click', () => {
        const newTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = newTheme;
        localStorage.setItem('theme', newTheme);
        
        // Dispatch theme change event
        document.dispatchEvent(new CustomEvent('themeChanged', { 
            detail: { theme: newTheme }
        }));
    });
}

// Start application
document.addEventListener('DOMContentLoaded', () => {
    // Add loading state class
    document.documentElement.classList.add('loading');
    
    // Initialize with small delay to allow rendering
    setTimeout(async () => {
        await AppController.initialize();
        document.documentElement.classList.remove('loading');
    }, 50);
});

// Cleanup before unload
window.addEventListener('beforeunload', () => {
    AppController.cleanup();
});