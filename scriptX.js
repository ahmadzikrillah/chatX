// ==================== [ METADATA APLIKASI ] ====================
const appMetadata = {
  appName: "ChatMed IPA", // Ganti dengan nama aplikasi Anda
  version: "1.0.0",             // Ganti dengan versi aplikasi Anda
  lastUpdated: "2025-05-12"     // Ganti dengan tanggal terakhir diperbarui
};

function displayMetadata() {
  const metadataContainer = document.getElementById('metadata-container');
  if (metadataContainer) {
    metadataContainer.textContent = `Versi: ${appMetadata.version} | Terakhir Diperbarui: ${appMetadata.lastUpdated}`;
  } else {
    console.warn("Elemen metadata-container// ==================== [ METADATA APLIKASI ] ====================
const appMetadata = {
  appName: "ChatMed IPA", // Ganti dengan nama aplikasi Anda
  version: "1.0.0",             // Ganti dengan versi aplikasi Anda
  lastUpdated: "2025-05-12"     // Ganti dengan tanggal terakhir diperbarui
};

function displayMetadata() {
  const metadataContainer = document.getElementById('metadata-container');
  if (metadataContainer) {
    metadataContainer.textContent = `Versi: ${appMetadata.version} | Terakhir Diperbarui: ${appMetadata.lastUpdated}`;
  } else {
    console.warn("Elemen metadata-container tidak ditemukan di HTML.");
  }
}
// ================ [1] INITIALIZATION & CONFIG ================ //
const CONFIG = {
    MIN_MATCH_SCORE: 0.6,
    CURRENT_TOPIC_BOOST: 1.3,
    QUESTION_TYPE_BONUS: {
        'apa': 1.2,
        'bagaimana': 1.15,
        'mengapa': 1.1
    },
    DEBOUNCE_TIME: 300,
    RATE_LIMIT_TIME: 1000
};

let dataset = null;
const sessionContext = {
    currentTopic: null,
    lastSubtopic: null,
    conversationHistory: []
};
let debounceTimer;
let lastMessageTime = 0;
let isDatabaseLoading = false;

// ================ [2] DATABASE HANDLING ================ //
async function loadDatabase() {
    if (dataset || isDatabaseLoading) return;
    isDatabaseLoading = true;

    try {
        const response = await fetch('database.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        dataset = await response.json();
        console.log("Database loaded successfully");
    } catch (error) {
        console.error("Error loading database:", error);
        dataset = getFallbackDataset();
        showDatabaseError();
    } finally {
        isDatabaseLoading = false;
    }
}

function getFallbackDataset() {
    return {
        topics: {
            "Biologi": {
                subtopics: {
                    "Sel": {
                        QnA: [{
                            patterns: ["apa itu sel"],
                            responses: ["Sel adalah unit terkecil makhluk hidup."]
                        }]
                    }
                }
            },
            "Profil Guru": {
                subtopics: {
                    "Informasi Umum": {
                        QnA: [{
                            patterns: ["siapa guru"],
                            responses: ["Guru Biologi: Ibu Siti, Guru Fisika: Pak Budi"]
                        }]
                    }
                }
            }
        }
    };
}

function showDatabaseError() {
    addMessage(`<div class="error-message">
        <strong>Peringatan:</strong> Database offline. periksa jaringan Internet.
        <small>Fitur mungkin terbatas.</small>
    </div>`);
}

// ================ [3] TEXT PROCESSING UTILITIES ================ //
function normalizeText(text) {
    if (!text) return '';
    text = text.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Hilangkan diakritik
        .replace(/[^\w\s]/g, '') // Hilangkan karakter non-alfanumerik selain spasi
        .replace(/\s+/g, ' ') // Hapus spasi berlebih
        .trim();

    // Penghapusan stop words yang lebih selektif
    const stopWords = new Set(['apa', 'bagaimana', 'mengapa', 'tolong', 'jelaskan', 'yang', 'dimaksud', 'itu', 'tentang', 'dengan', 'adalah', 'dari', 'sebutkan', 'kah', 'sih']);
    const words = text.split(' ').filter(word => !stopWords.has(word) && word.length > 1); // Filter stop words dan kata pendek
    return words.join(' ');
}

function tokenize(text) {
    return normalizeText(text).split(' ').filter(word => word.length > 2);
}
// ================ [4] MATCHING ENGINE IMPROVEMENTS ================ //
import stringSimilarity from 'string-similarity'; // Pastikan library ini sudah terinstal dan diimpor

function normalizeText(text) {
    if (!text) return '';
    text = text.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Hilangkan diakritik
        .replace(/[^\w\s]/g, '') // Hilangkan karakter non-alfanumerik selain spasi
        .replace(/\s+/g, ' ') // Hapus spasi berlebih
        .trim();

    // Penghapusan stop words yang lebih selektif
    const stopWords = new Set(['apa', 'bagaimana', 'mengapa', 'tolong', 'jelaskan', 'yang', 'dimaksud', 'itu', 'tentang', 'dengan', 'adalah', 'dari', 'sebutkan', 'kah', 'sih']);
    const words = text.split(' ').filter(word => !stopWords.has(word) && word.length > 1); // Filter stop words dan kata pendek
    return words.join(' ');
}

function calculateMatchScore(query, pattern) {
    if (!query || !pattern) {
        console.warn("calculateMatchScore dipanggil dengan query atau pattern yang tidak valid:", { query, pattern });
        return 0; // Atau nilai default lain yang sesuai
    }

    const normalizedQuery = normalizeText(query);
    const normalizedPattern = normalizeText(pattern);

    const queryTokens = new Set(normalizedQuery.split(' ').filter(word => word.length > 1));
    const patternTokens = new Set(normalizedPattern.split(' ').filter(word => word.length > 1));

    const intersection = new Set([...queryTokens].filter(t => patternTokens.has(t)));
    const union = new Set([...queryTokens, ...patternTokens]);
    let jaccardScore = intersection.size / union.size;

    // Tambahkan skor kemiripan fuzzy menggunakan library string-similarity
    const fuzzyScore = stringSimilarity.compareTwoStrings(normalizedQuery, normalizedPattern);

    // Kombinasikan skor Jaccard dan fuzzy (dengan pembobotan)
    let finalScore = (0.7 * jaccardScore) + (0.3 * fuzzyScore); // Anda bisa menyesuaikan bobot ini

    // Contextual boosting
    if (sessionContext.currentTopic && typeof normalizedPattern === 'string' && normalizedPattern.includes(sessionContext.currentTopic.toLowerCase())) {
        finalScore *= CONFIG.CURRENT_TOPIC_BOOST || 1.1; // Gunakan nilai default jika tidak ada
    }

    // Question type matching
    if (CONFIG.QUESTION_TYPE_BONUS) {
        for (const [type, bonus] of Object.entries(CONFIG.QUESTION_TYPE_BONUS)) {
            if (typeof normalizedQuery === 'string' && typeof normalizedPattern === 'string' && normalizedQuery.includes(type) && normalizedPattern.includes(type)) {
                finalScore *= bonus;
                break;
            }
        }
    }

    return Math.min(finalScore, 1.0);
}


function findBestMatch(query) {
    if (!dataset?.topics) {
        console.warn("Data belum dimuat!");
        return null;
    }

    const normalizedQuery = normalizeText(query);
    let bestMatch = { score: 0, topic: null, subtopic: null, patterns: [], response: null, diagram: null, responseIndex: -1 };

    // Log untuk melihat topik yang sedang diperiksa
    console.log(`[DEBUG findBestMatch] Memulai pencarian untuk query: "${query}" (Normalized: "${normalizedQuery}")`);

    // Search in current topic first if exists
    if (sessionContext.currentTopic && dataset.topics[sessionContext.currentTopic]) {
        console.log(`[DEBUG findBestMatch] Mencari di topik saat ini: "${sessionContext.currentTopic}"`);
        const topicMatch = searchInTopic(sessionContext.currentTopic, normalizedQuery);
        if (topicMatch.score > bestMatch.score) {
            bestMatch = topicMatch;
        }
        if (bestMatch.score > 0.7) return bestMatch; // Kembalikan jika skor sudah cukup tinggi
    }

    // Global search if no good match in current topic
    for (const topic in dataset.topics) {
        console.log(`[DEBUG findBestMatch] Memeriksa topik: "${topic}"`); // Log topik
        const topicMatch = searchInTopic(topic, normalizedQuery);
        if (topicMatch.score > bestMatch.score) {
            bestMatch = topicMatch;
        }
    }

    return bestMatch.score > (CONFIG.MIN_MATCH_SCORE || 0.5) ? bestMatch : null; // Gunakan nilai default jika tidak ada
}

function searchInTopic(topic, query) {
    let bestMatchInTopic = { score: 0, responseIndex: -1, patterns: [], topic: topic, subtopic: null, response: null, diagram: null };
    const topicData = dataset.topics[topic];

    for (const subtopic in topicData.subtopics) {
        console.log(`[DEBUG searchInTopic] Memeriksa subtopik: "${topic} - ${subtopic}"`); // Log subtopik
        for (const qna of topicData.subtopics[subtopic].QnA) {
            for (let i = 0; i < qna.patterns.length; i++) {
                const score = calculateMatchScore(query, qna.patterns[i]);
                console.log(`Membandingkan "${query}" (Normalized: "${normalizeText(query)}") dengan "${qna.patterns[i]}" (Normalized: "${normalizeText(qna.patterns[i])}") - Skor: ${score}`);
                if (score > bestMatchInTopic.score) {
                    bestMatchInTopic = {
                        score,
                        topic,
                        subtopic,
                        patterns: qna.patterns,
                        response: qna.responses[i],
                        diagram: qna.diagram || null,
                        responseIndex: i
                    };
                }
            }
        }
    }
    return bestMatchInTopic;
}
// ================ [5] RESPONSE GENERATION ================ //
async function formatResponse(match) {
    if (!match) return generateFallbackResponse();

    const typingIndicator = showTypingIndicator();

    try {
        let responseHTML = "";
        if (match.topic === "Profil Guru") {
            responseHTML = await formatTeacherProfileResponse(match);
        } else if (match.topic === "Sapaan") {
            responseHTML = await formatGreetingResponse(match);
        } else {
            responseHTML = await formatGeneralResponse(match);
        }

        // Tambahkan saran pertanyaan dari database
        responseHTML += generateNextQuestionSuggestions(match.topic, match.subtopic, match.patterns);

        return responseHTML;

    } finally {
        typingIndicator.remove();
    }
}



function generateNextQuestionSuggestions(topic, subtopic, currentPatterns) {
    const relatedQuestions = [];
    let qnaList = [];
    const allowedTopics = ["Biologi", "Fisika"]; // Daftar topik yang diizinkan
    const suggestionPrefixes = [
        "Coba tanyakan:",
        "Mungkin kamu ingin tahu tentang:",
        "sering juga ditanyakan:"
        // Tambahkan teks awalan lain sesuai keinginan Anda
    ];
    const randomPrefix = suggestionPrefixes[Math.floor(Math.random() * suggestionPrefixes.length)];

    if (dataset?.topics?.[topic]?.subtopics?.[subtopic]?.QnA) {
        qnaList = dataset.topics[topic].subtopics[subtopic].QnA;
    }

    // Filter QnA lain (selain yang cocok dengan pertanyaan saat ini) dalam subtopik yang sama
    let otherQnA = qnaList.filter(qna => {
        if (!qna?.patterns || !Array.isArray(qna.patterns)) {
            console.warn("generateNextQuestionSuggestions: qna.patterns tidak valid:", qna);
            return false;
        }
        return !qna.patterns.some(pattern => currentPatterns.includes(pattern));
    });

    // Jika topik diizinkan dan tidak ada cukup pertanyaan berbeda, ambil dari subtopik lain
    if (allowedTopics.includes(topic) && otherQnA.length < 2 && dataset?.topics?.[topic]?.subtopics) {
        for (const otherSubtopic in dataset.topics[topic].subtopics) {
            if (otherSubtopic !== subtopic && dataset.topics[topic].subtopics[otherSubtopic]?.QnA) {
                const otherSubtopicQnA = dataset.topics[topic].subtopics[otherSubtopic].QnA;
                otherQnA = otherQnA.concat(otherSubtopicQnA.filter(qna => {
                    if (!qna?.patterns || !Array.isArray(qna.patterns)) {
                        console.warn("generateNextQuestionSuggestions: qna.patterns tidak valid:", qna);
                        return false;
                    }
                    return !qna.patterns.some(pattern => currentPatterns.includes(pattern));
                }));
            }
            if (otherQnA.length >= 2) break;
        }
    }

    if (otherQnA.length > 0) {
        // Pilih dua pertanyaan acak dari QnA lain
        for (let i = 0; i < Math.min(2, otherQnA.length); i++) {
            const randomIndex = Math.floor(Math.random() * otherQnA.length);
            const randomQnA = otherQnA.splice(randomIndex, 1)[0];
            relatedQuestions.push(randomQnA?.patterns?.[0]);
        }
    }

    if (relatedQuestions.length === 0) return "";

    let suggestionsHTML = `<div class='next-question-suggestions'><b>${randomPrefix}</b><ul>`;
    for (const question of relatedQuestions) {
        if (question) {
            suggestionsHTML += `<li><button onclick="handleSuggestedQuestionClick('${question}')">${question}</button></li>`;
        }
    }
    suggestionsHTML += "</ul></div>";
    return suggestionsHTML;
}


async function formatTeacherProfileResponse(match) {
    let responseText = "";
    if (match && match.response) {
        if (Array.isArray(match.response) && match.response.length > 0) {
            responseText = getRandomResponse(match.response);
        } else if (typeof match.response === 'string') {
            responseText = match.response;
        } else {
            console.warn("formatTeacherProfileResponse: match.response tidak valid:", match);
            responseText = generateFallbackResponse();
        }
    } else {
        console.warn("formatTeacherProfileResponse: match tidak valid atau tidak memiliki response:", match);
        responseText = generateFallbackResponse();
    }
    const imgExists = await checkImageExists(match.diagram || 'images/default-guru.png');

    return `
        <div class="answer-box">
            <div class="guru-profile">
                <img src="${imgExists ? match.diagram : 'images/default-guru.png'}"
                     alt="Foto Guru">
                <div class="guru-info">
                    <p>${responseText}</p>
                </div>
            </div>
            ${generateFeedbackButtons()}
        </div>
    `;
}

async function formatGreetingResponse(match) {
    let responseText = "";
    if (match && Array.isArray(match.response) && match.response.length > 0) {
        responseText = getRandomResponse(match.response);
    } else {
        console.warn("formatGreetingResponse: match.response tidak valid:", match);
        responseText = generateFallbackResponse(); // Atau pesan error spesifik
    }
    return `
        <div class="answer-box greeting-message">
            <div class="answer-content">${responseText}</div>
            ${generateFeedbackButtons()}
        </div>
    `;
}

async function formatGeneralResponse(match) {
    const responseText = match ? match.response : generateFallbackResponse();
    let html = `
        <div class="answer-box">
            <div class="answer-content">${responseText}</div>
    `;

    if (match && match.diagram) {
        const imageExists = await checkImageExists(match.diagram);
        if (imageExists) {
            html += `<div class="diagram"><img src="${match.diagram}" alt="${match.subtopic}"></div>`;
        }
    }

    html += `${generateFeedbackButtons()}</div>`;
    return html;
}

function getRandomResponse(responses) {
    if (!Array.isArray(responses)) {
        console.error("getRandomResponse menerima input yang tidak valid:", responses);
        return ""; // Mengembalikan string kosong agar tidak error, atau respons default lain
    }
    return responses[Math.floor(Math.random() * responses.length)];
}

function generateFallbackResponse() {
    const fallbackPhrases = [
        "Maaf, saya tidak mengerti pertanyaan Kamu. Coba tanyakan hal lain.",
        "Pertanyaan Kamu di luar pengetahuan saya saat ini.",
        "Saya belum bisa menjawab itu. Ada pertanyaan lain?",
        "Bisa diulang dengan kata lain? Saya belum paham."
    ];
    return getRandomResponse(fallbackPhrases);
}

// ================ [6] CHAT INTERFACE FUNCTIONS ================ //
function addMessage(content, isBot = true) {
    const chatbox = document.getElementById('chatbox');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isBot ? 'bot-message' : 'user-message'}`;
    messageDiv.innerHTML = content;
    chatbox.appendChild(messageDiv);
    chatbox.scrollTop = chatbox.scrollHeight;
}

function showTypingIndicator() {
    const chatbox = document.getElementById('chatbox');
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    chatbox.appendChild(indicator);
    chatbox.scrollTop = chatbox.scrollHeight;
    return indicator;
}

function showWelcomeMessage() {
    addMessage(`
        <div class="answer-box greeting-message">
            <div class="answer-content">Hai! Saya Asisten Virtual Pak Zikri. Silakan ketik pertanyaan kamu .</div>
        </div>
    `);
    addMessage(`
        <div class="welcome-message">
            <p><b>Contoh pertanyaan:</b></p>
            <ul>
                <li>Apa itu sel?</li>
                <li>Bagaimana proses fotosintesis?</li>
                <li>Apa fungsi jantung?</li>
                <li>Siapa guru Ipa?</li>
            </ul>
        </div>
    `);
}

// ================ [7] USER INPUT PROCESSING ================ //
async function processUserInput() {
    if (Date.now() - lastMessageTime < CONFIG.RATE_LIMIT_TIME) return;
    lastMessageTime = Date.now();

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleUserMessage, CONFIG.DEBOUNCE_TIME);
}

async function handleUserMessage() {
    try {
        const input = document.getElementById('userInput');
        const userMessage = input.value.trim();
        if (!userMessage) return;

        addMessage(userMessage, false);
        input.value = '';

        if (!dataset) {
            addMessage("Memuat database pengetahuan...");
            await loadDatabase();
        }

        const match = findBestMatch(userMessage);
        const response = match ? await formatResponse(match) : generateFallbackResponse();

        addMessage(response);
        updateSessionContext(match, userMessage, response);
    } catch (error) {
        console.error("Processing error:", error);
        showErrorMessage();
    }
}

function handleSuggestedQuestionClick(question) {
    document.getElementById('userInput').value = question;
    document.getElementById('sendButton').click(); // Simulate click on send button
}

function showErrorMessage() {
    addMessage(`<div class="error-message">Terjadi kesalahan sistem. Silakan coba lagi.</div>`);
}
// ================ [8] SESSION MANAGEMENT ================ //
const SESSION_TIMEOUT = 3600000; // 1 jam dalam milidetik
let lastInteractionTime = Date.now();

function updateSessionContext(match, userMessage, response) {
    const now = Date.now();
    if (now - lastInteractionTime > SESSION_TIMEOUT) {
        console.log("[DEBUG updateSessionContext] Sesi telah berakhir karena tidak aktif. Mereset konteks.");
        resetSession();
    }
    lastInteractionTime = now;

    if (match?.topic) {
        sessionContext.currentTopic = match.topic;
        sessionContext.lastSubtopic = match.subtopic;
    }

    sessionContext.conversationHistory.push({
        query: userMessage,
        response: match?.response || response,
        timestamp: new Date().toISOString()
    });

    trimConversationHistory();
    saveConversation();

    console.log("[DEBUG updateSessionContext] sessionContext setelah update:", sessionContext);
}

function resetSession() {
    sessionContext.currentTopic = null;
    sessionContext.lastSubtopic = null;
    sessionContext.conversationHistory = [];
    localStorage.removeItem('chatHistory');
    console.log("[DEBUG resetSession] Sesi direset.");
    // Tidak perlu memanggil showWelcomeMessage() di sini,
    // karena resetSession bisa dipanggil di luar interaksi langsung.
}

function clearConversation() {
    document.getElementById('chatbox').innerHTML = '';
    resetSession();
    showWelcomeMessage();
}

function trimConversationHistory(maxLength = 10) {
    if (sessionContext.conversationHistory.length > maxLength) {
        sessionContext.conversationHistory = sessionContext.conversationHistory.slice(-maxLength);
        console.log("[DEBUG trimConversationHistory] Riwayat percakapan dipangkas.");
    }
}

// ================ [9] PERSISTENCE FUNCTIONS ================ //
function saveConversation() {
    try {
        localStorage.setItem('chatHistory', JSON.stringify(sessionContext.conversationHistory));
    } catch (e) {
        handleStorageError(e);
    }
}

function loadConversation() {
    try {
        const savedHistory = localStorage.getItem('chatHistory');
        if (savedHistory) {
            const parsed = JSON.parse(savedHistory);
            if (Array.isArray(parsed)) {
                sessionContext.conversationHistory = parsed;
                parsed.forEach(entry => {
                    addMessage(entry.query, false);
                    addMessage(entry.response, true);
                });
            }
        }
        // Set last interaction time on load
        lastInteractionTime = Date.now();
    } catch (e) {
        console.error("Error loading history:", e);
        localStorage.removeItem('chatHistory');
    }
}

function handleStorageError(e) {
    console.error("Error saving conversation:", e);
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.warn("Local Storage Quota Exceeded. Clearing conversation history.");
        sessionContext.conversationHistory = [];
        localStorage.setItem('chatHistory', '[]');
    }
}

// Tambahkan fungsi untuk memuat ulang sesi jika diperlukan (misalnya, saat inisialisasi)
function initializeSession() {
    loadConversation();
    // Jika tidak ada riwayat, tampilkan pesan selamat datang
    if (sessionContext.conversationHistory.length === 0) {
        showWelcomeMessage();
    }
    console.log("[DEBUG initializeSession] Sesi diinisialisasi:", sessionContext);
}

// Panggil initializeSession saat aplikasi pertama kali dimuat
document.addEventListener('DOMContentLoaded', initializeSession);

// Perbarui lastInteractionTime pada setiap interaksi pengguna (misalnya, saat mengirim pesan)
document.getElementById('inputbox').addEventListener('keypress', () => {
    lastInteractionTime = Date.now();
});

document.getElementById('sendbtn').addEventListener('click', () => {
    lastInteractionTime = Date.now();
});
// ================ [10] FEEDBACK SYSTEM ================ //
function handleFeedback(button, type) {
    const answerBox = button.closest('.answer-box');
    if (!answerBox) return;

    answerBox.querySelector('.feedback-buttons').innerHTML =
        `<span class="feedback-confirm">${
            type === 'up' ? 'Terima kasih!' : 'Akan kami perbaiki...'
        }</span>`;

    saveFeedback(answerBox, type);
}

function saveFeedback(answerBox, type) {
    const feedbackData = {
        question: answerBox.querySelector('.answer-content')?.textContent || '',
        rating: type,
        timestamp: new Date().toISOString()
    };

    try {
        const feedbackHistory = JSON.parse(localStorage.getItem('feedbackHistory') || '[]');
        feedbackHistory.push(feedbackData);
        localStorage.setItem('feedbackHistory', JSON.stringify(feedbackHistory));
    } catch (e) {
        console.error("Error saving feedback:", e);
    }
}

function generateFeedbackButtons() {
    return `
        <div class="feedback-buttons">
            <button onclick="handleFeedback(this, 'up')">👍</button>
            <button onclick="handleFeedback(this, 'down')">👎</button>
        </div>
    `;
}

// ================ [11] UTILITY FUNCTIONS ================ //
async function checkImageExists(url) {
    if (!url) return false;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
    });
}

// ================ [12] INITIALIZATION & EVENT HANDLERS ================ //
function setupEventListeners() {
    document.getElementById('sendButton').addEventListener('click', processUserInput);
    document.getElementById('userInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') processUserInput();
    });
    document.getElementById('clearChat').addEventListener('click', clearConversation);
    setupThemeToggle();
}

function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;
    const currentTheme = localStorage.getItem('theme');

    if (currentTheme === 'dark') {
        body.classList.add('dark-theme');
    }

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-theme');
        const newTheme = body.classList.contains('dark-theme') ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
    });
}

async function initializeApp() {
    try {
        await loadDatabase();
        setupEventListeners();
        loadConversation();
        showWelcomeMessage();
        registerServiceWorker();
    } catch (error) {
        console.error("Initialization failed:", error);
        addMessage("Terjadi error saat memulai aplikasi. Silakan refresh halaman.");
    }
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('swX.js')
            .then(registration => {
                console.log('ServiceWorker registered');
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
document.addEventListener('DOMContentLoaded', displayMetadata); tidak ditemukan di HTML.");
  }
}
// ================ [1] INITIALIZATION & CONFIG ================ //
const CONFIG = {
    MIN_MATCH_SCORE: 0.6,
    CURRENT_TOPIC_BOOST: 1.3,
    QUESTION_TYPE_BONUS: {
        'apa': 1.2,
        'bagaimana': 1.15,
        'mengapa': 1.1
    },
    DEBOUNCE_TIME: 300,
    RATE_LIMIT_TIME: 1000
};

let dataset = null;
const sessionContext = {
    currentTopic: null,
    lastSubtopic: null,
    conversationHistory: []
};
let debounceTimer;
let lastMessageTime = 0;
let isDatabaseLoading = false;

// ================ [2] DATABASE HANDLING ================ //
async function loadDatabase() {
    if (dataset || isDatabaseLoading) return;
    isDatabaseLoading = true;

    try {
        const response = await fetch('database.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        dataset = await response.json();
        console.log("Database loaded successfully");
    } catch (error) {
        console.error("Error loading database:", error);
        dataset = getFallbackDataset();
        showDatabaseError();
    } finally {
        isDatabaseLoading = false;
    }
}

function getFallbackDataset() {
    return {
        topics: {
            "Biologi": {
                subtopics: {
                    "Sel": {
                        QnA: [{
                            patterns: ["apa itu sel"],
                            responses: ["Sel adalah unit terkecil makhluk hidup."]
                        }]
                    }
                }
            },
            "Profil Guru": {
                subtopics: {
                    "Informasi Umum": {
                        QnA: [{
                            patterns: ["siapa guru"],
                            responses: ["Guru Biologi: Ibu Siti, Guru Fisika: Pak Budi"]
                        }]
                    }
                }
            }
        }
    };
}

function showDatabaseError() {
    addMessage(`<div class="error-message">
        <strong>Peringatan:</strong> Database offline. periksa jaringan Internet.
        <small>Fitur mungkin terbatas.</small>
    </div>`);
}

// ================ [3] TEXT PROCESSING UTILITIES ================ //
function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, '')        
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(text) {
    return normalizeText(text).split(' ').filter(word => word.length > 2);
}

// ================ [4] MATCHING ENGINE IMPROVEMENTS ================ //
function calculateMatchScore(query, pattern) {
    if (!query || !pattern) {
        console.warn("calculateMatchScore dipanggil dengan query atau pattern yang tidak valid:", { query, pattern });
        return 0; // Atau nilai default lain yang sesuai
    }

    const queryTokens = new Set(tokenize(query));
    const patternTokens = new Set(tokenize(pattern));

    const intersection = new Set([...queryTokens].filter(t => patternTokens.has(t)));
    const union = new Set([...queryTokens, ...patternTokens]);
    let score = intersection.size / union.size;

    // Contextual boosting
    if (sessionContext.currentTopic && typeof pattern === 'string' && pattern.includes(sessionContext.currentTopic)) {
        score *= CONFIG.CURRENT_TOPIC_BOOST;
    }

    // Question type matching
    for (const [type, bonus] of Object.entries(CONFIG.QUESTION_TYPE_BONUS)) {
        if (typeof query === 'string' && typeof pattern === 'string' && query.includes(type) && pattern.includes(type)) {
            score *= bonus;
            break;
        }
    }

    return Math.min(score, 1.0);
}


function findBestMatch(query) {
    if (!dataset?.topics) {
        console.warn("Data belum dimuat!");
        return null;
    }

    const normalizedQuery = normalizeText(query);
    let bestMatch = { score: 0 };

    // Log untuk melihat topik yang sedang diperiksa
    console.log(`[DEBUG findBestMatch] Memulai pencarian untuk query: "${query}"`);

    // Search in current topic first if exists
    if (sessionContext.currentTopic && dataset.topics[sessionContext.currentTopic]) {
        console.log(`[DEBUG findBestMatch] Mencari di topik saat ini: "${sessionContext.currentTopic}"`);
        bestMatch = searchInTopic(sessionContext.currentTopic, normalizedQuery);
        if (bestMatch.score > 0.7) return bestMatch;
    }

    // Global search if no good match in current topic
    for (const topic in dataset.topics) {
        console.log(`[DEBUG findBestMatch] Memeriksa topik: "${topic}"`); // Log topik
        const topicMatch = searchInTopic(topic, normalizedQuery);
        if (topicMatch.score > bestMatch.score) {
            bestMatch = topicMatch;
        }
    }

    return bestMatch.score > CONFIG.MIN_MATCH_SCORE ? bestMatch : null;
}

function searchInTopic(topic, query) {
    let bestMatch = { score: 0, responseIndex: -1, patterns: [] };
    const topicData = dataset.topics[topic];

    for (const subtopic in topicData.subtopics) {
        console.log(`[DEBUG searchInTopic] Memeriksa subtopik: "${topic} - ${subtopic}"`); // Log subtopik
        for (const qna of topicData.subtopics[subtopic].QnA) {
            for (let i = 0; i < qna.patterns.length; i++) {
                const score = calculateMatchScore(query, qna.patterns[i]);
                console.log(`Membandingkan "<span class="math-inline">\{query\}" dengan "</span>{qna.patterns[i]}" - Skor: ${score}`);
                if (score > bestMatch.score) {
                    bestMatch = {
                        score,
                        topic,
                        subtopic,
                        patterns: qna.patterns,
                        response: qna.responses[i],
                        diagram: qna.diagram || null,
                        responseIndex: i
                    };
                }
            }
        }
    }
    return bestMatch;
}

// ================ [5] RESPONSE GENERATION ================ //
async function formatResponse(match) {
    if (!match) return generateFallbackResponse();

    const typingIndicator = showTypingIndicator();

    try {
        let responseHTML = "";
        if (match.topic === "Profil Guru") {
            responseHTML = await formatTeacherProfileResponse(match);
        } else if (match.topic === "Sapaan") {
            responseHTML = await formatGreetingResponse(match);
        } else {
            responseHTML = await formatGeneralResponse(match);
        }

        // Tambahkan saran pertanyaan dari database
        responseHTML += generateNextQuestionSuggestions(match.topic, match.subtopic, match.patterns);

        return responseHTML;

    } finally {
        typingIndicator.remove();
    }
}



function generateNextQuestionSuggestions(topic, subtopic, currentPatterns) {
    const relatedQuestions = [];
    let qnaList = [];
    const allowedTopics = ["Biologi", "Fisika"]; // Daftar topik yang diizinkan
    const suggestionPrefixes = [
        "Coba tanyakan:",
        "Mungkin kamu ingin tahu tentang:",
        "sering juga ditanyakan:"
        // Tambahkan teks awalan lain sesuai keinginan Anda
    ];
    const randomPrefix = suggestionPrefixes[Math.floor(Math.random() * suggestionPrefixes.length)];

    if (dataset?.topics?.[topic]?.subtopics?.[subtopic]?.QnA) {
        qnaList = dataset.topics[topic].subtopics[subtopic].QnA;
    }

    // Filter QnA lain (selain yang cocok dengan pertanyaan saat ini) dalam subtopik yang sama
    let otherQnA = qnaList.filter(qna => {
        if (!qna?.patterns || !Array.isArray(qna.patterns)) {
            console.warn("generateNextQuestionSuggestions: qna.patterns tidak valid:", qna);
            return false;
        }
        return !qna.patterns.some(pattern => currentPatterns.includes(pattern));
    });

    // Jika topik diizinkan dan tidak ada cukup pertanyaan berbeda, ambil dari subtopik lain
    if (allowedTopics.includes(topic) && otherQnA.length < 2 && dataset?.topics?.[topic]?.subtopics) {
        for (const otherSubtopic in dataset.topics[topic].subtopics) {
            if (otherSubtopic !== subtopic && dataset.topics[topic].subtopics[otherSubtopic]?.QnA) {
                const otherSubtopicQnA = dataset.topics[topic].subtopics[otherSubtopic].QnA;
                otherQnA = otherQnA.concat(otherSubtopicQnA.filter(qna => {
                    if (!qna?.patterns || !Array.isArray(qna.patterns)) {
                        console.warn("generateNextQuestionSuggestions: qna.patterns tidak valid:", qna);
                        return false;
                    }
                    return !qna.patterns.some(pattern => currentPatterns.includes(pattern));
                }));
            }
            if (otherQnA.length >= 2) break;
        }
    }

    if (otherQnA.length > 0) {
        // Pilih dua pertanyaan acak dari QnA lain
        for (let i = 0; i < Math.min(2, otherQnA.length); i++) {
            const randomIndex = Math.floor(Math.random() * otherQnA.length);
            const randomQnA = otherQnA.splice(randomIndex, 1)[0];
            relatedQuestions.push(randomQnA?.patterns?.[0]);
        }
    }

    if (relatedQuestions.length === 0) return "";

    let suggestionsHTML = `<div class='next-question-suggestions'><b>${randomPrefix}</b><ul>`;
    for (const question of relatedQuestions) {
        if (question) {
            suggestionsHTML += `<li><button onclick="handleSuggestedQuestionClick('${question}')">${question}</button></li>`;
        }
    }
    suggestionsHTML += "</ul></div>";
    return suggestionsHTML;
}


async function formatTeacherProfileResponse(match) {
    let responseText = "";
    if (match && match.response) {
        if (Array.isArray(match.response) && match.response.length > 0) {
            responseText = getRandomResponse(match.response);
        } else if (typeof match.response === 'string') {
            responseText = match.response;
        } else {
            console.warn("formatTeacherProfileResponse: match.response tidak valid:", match);
            responseText = generateFallbackResponse();
        }
    } else {
        console.warn("formatTeacherProfileResponse: match tidak valid atau tidak memiliki response:", match);
        responseText = generateFallbackResponse();
    }
    const imgExists = await checkImageExists(match.diagram || 'images/default-guru.png');

    return `
        <div class="answer-box">
            <div class="guru-profile">
                <img src="${imgExists ? match.diagram : 'images/default-guru.png'}"
                     alt="Foto Guru">
                <div class="guru-info">
                    <p>${responseText}</p>
                </div>
            </div>
            ${generateFeedbackButtons()}
        </div>
    `;
}

async function formatGreetingResponse(match) {
    let responseText = "";
    if (match && Array.isArray(match.response) && match.response.length > 0) {
        responseText = getRandomResponse(match.response);
    } else {
        console.warn("formatGreetingResponse: match.response tidak valid:", match);
        responseText = generateFallbackResponse(); // Atau pesan error spesifik
    }
    return `
        <div class="answer-box greeting-message">
            <div class="answer-content">${responseText}</div>
            ${generateFeedbackButtons()}
        </div>
    `;
}

async function formatGeneralResponse(match) {
    const responseText = match ? match.response : generateFallbackResponse();
    let html = `
        <div class="answer-box">
            <div class="answer-content">${responseText}</div>
    `;

    if (match && match.diagram) {
        const imageExists = await checkImageExists(match.diagram);
        if (imageExists) {
            html += `<div class="diagram"><img src="${match.diagram}" alt="${match.subtopic}"></div>`;
        }
    }

    html += `${generateFeedbackButtons()}</div>`;
    return html;
}

function getRandomResponse(responses) {
    if (!Array.isArray(responses)) {
        console.error("getRandomResponse menerima input yang tidak valid:", responses);
        return ""; // Mengembalikan string kosong agar tidak error, atau respons default lain
    }
    return responses[Math.floor(Math.random() * responses.length)];
}

function generateFallbackResponse() {
    const fallbackPhrases = [
        "Maaf, saya tidak mengerti pertanyaan Kamu. Coba tanyakan hal lain.",
        "Pertanyaan Kamu di luar pengetahuan saya saat ini.",
        "Saya belum bisa menjawab itu. Ada pertanyaan lain?",
        "Bisa diulang dengan kata lain? Saya belum paham."
    ];
    return getRandomResponse(fallbackPhrases);
}

// ================ [6] CHAT INTERFACE FUNCTIONS ================ //
function addMessage(content, isBot = true) {
    const chatbox = document.getElementById('chatbox');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isBot ? 'bot-message' : 'user-message'}`;
    messageDiv.innerHTML = content;
    chatbox.appendChild(messageDiv);
    chatbox.scrollTop = chatbox.scrollHeight;
}

function showTypingIndicator() {
    const chatbox = document.getElementById('chatbox');
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    chatbox.appendChild(indicator);
    chatbox.scrollTop = chatbox.scrollHeight;
    return indicator;
}

function showWelcomeMessage() {
    addMessage(`
        <div class="answer-box greeting-message">
            <div class="answer-content">Hai! Saya Asisten Virtual Pak Zikri. Silakan ketik pertanyaan kamu .</div>
        </div>
    `);
    addMessage(`
        <div class="welcome-message">
            <p><b>Contoh pertanyaan:</b></p>
            <ul>
                <li>Apa itu sel?</li>
                <li>Bagaimana proses fotosintesis?</li>
                <li>Apa fungsi jantung?</li>
                <li>Siapa guru Ipa?</li>
            </ul>
        </div>
    `);
}

// ================ [7] USER INPUT PROCESSING ================ //
async function processUserInput() {
    if (Date.now() - lastMessageTime < CONFIG.RATE_LIMIT_TIME) return;
    lastMessageTime = Date.now();

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleUserMessage, CONFIG.DEBOUNCE_TIME);
}

async function handleUserMessage() {
    try {
        const input = document.getElementById('userInput');
        const userMessage = input.value.trim();
        if (!userMessage) return;

        addMessage(userMessage, false);
        input.value = '';

        if (!dataset) {
            addMessage("Memuat database pengetahuan...");
            await loadDatabase();
        }

        const match = findBestMatch(userMessage);
        const response = match ? await formatResponse(match) : generateFallbackResponse();

        addMessage(response);
        updateSessionContext(match, userMessage, response);
    } catch (error) {
        console.error("Processing error:", error);
        showErrorMessage();
    }
}

function handleSuggestedQuestionClick(question) {
    document.getElementById('userInput').value = question;
    document.getElementById('sendButton').click(); // Simulate click on send button
}

function showErrorMessage() {
    addMessage(`<div class="error-message">Terjadi kesalahan sistem. Silakan coba lagi.</div>`);
}

// ================ [8] SESSION MANAGEMENT ================ //
function updateSessionContext(match, userMessage, response) {
    if (match?.topic) {
        sessionContext.currentTopic = match.topic;
        sessionContext.lastSubtopic = match.subtopic;
    }

    sessionContext.conversationHistory.push({
        query: userMessage,
        response: match?.response || response,
        timestamp: new Date().toISOString()
    });

    saveConversation();

    console.log("[DEBUG updateSessionContext] sessionContext setelah update:", sessionContext);
}

function clearConversation() {
    document.getElementById('chatbox').innerHTML = '';
    sessionContext.currentTopic = null;
    sessionContext.lastSubtopic = null;
    sessionContext.conversationHistory = [];
    localStorage.removeItem('chatHistory');
    showWelcomeMessage();
}

// ================ [9] PERSISTENCE FUNCTIONS ================ //
function saveConversation() {
    try {
        localStorage.setItem('chatHistory', JSON.stringify(sessionContext.conversationHistory));
    } catch (e) {
        handleStorageError(e);
    }
}

function loadConversation() {
    try {
        const savedHistory = localStorage.getItem('chatHistory');
        if (savedHistory) {
            const parsed = JSON.parse(savedHistory);
            if (Array.isArray(parsed)) {
                sessionContext.conversationHistory = parsed;
                parsed.forEach(entry => {
                    addMessage(entry.query, false);
                    addMessage(entry.response, true);
                });
            }
        }
    } catch (e) {
        console.error("Error loading history:", e);
        localStorage.removeItem('chatHistory');
    }
}

function handleStorageError(e) {
    console.error("Error saving conversation:", e);
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        sessionContext.conversationHistory = [];
        localStorage.setItem('chatHistory', '[]');
    }
}

// ================ [10] FEEDBACK SYSTEM ================ //
function handleFeedback(button, type) {
    const answerBox = button.closest('.answer-box');
    if (!answerBox) return;

    answerBox.querySelector('.feedback-buttons').innerHTML =
        `<span class="feedback-confirm">${
            type === 'up' ? 'Terima kasih!' : 'Akan kami perbaiki...'
        }</span>`;

    saveFeedback(answerBox, type);
}

function saveFeedback(answerBox, type) {
    const feedbackData = {
        question: answerBox.querySelector('.answer-content')?.textContent || '',
        rating: type,
        timestamp: new Date().toISOString()
    };

    try {
        const feedbackHistory = JSON.parse(localStorage.getItem('feedbackHistory') || '[]');
        feedbackHistory.push(feedbackData);
        localStorage.setItem('feedbackHistory', JSON.stringify(feedbackHistory));
    } catch (e) {
        console.error("Error saving feedback:", e);
    }
}

function generateFeedbackButtons() {
    return `
        <div class="feedback-buttons">
            <button onclick="handleFeedback(this, 'up')">👍</button>
            <button onclick="handleFeedback(this, 'down')">👎</button>
        </div>
    `;
}

// ================ [11] UTILITY FUNCTIONS ================ //
async function checkImageExists(url) {
    if (!url) return false;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
    });
}

// ================ [12] INITIALIZATION & EVENT HANDLERS ================ //
function setupEventListeners() {
    document.getElementById('sendButton').addEventListener('click', processUserInput);
    document.getElementById('userInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') processUserInput();
    });
    document.getElementById('clearChat').addEventListener('click', clearConversation);
    setupThemeToggle();
}

function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;
    const currentTheme = localStorage.getItem('theme');

    if (currentTheme === 'dark') {
        body.classList.add('dark-theme');
    }

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-theme');
        const newTheme = body.classList.contains('dark-theme') ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
    });
}

async function initializeApp() {
    try {
        await loadDatabase();
        setupEventListeners();
        loadConversation();
        showWelcomeMessage();
        registerServiceWorker();
    } catch (error) {
        console.error("Initialization failed:", error);
        addMessage("Terjadi error saat memulai aplikasi. Silakan refresh halaman.");
    }
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('swX.js')
            .then(registration => {
                console.log('ServiceWorker registered');
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
document.addEventListener('DOMContentLoaded', displayMetadata);
