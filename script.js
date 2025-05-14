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
    RATE_LIMIT_TIME: 1000,
    MAX_HISTORY: 50,
    FALLBACK_IMAGE: 'images/default-guru.png',
    // Konfigurasi tambahan
    maxFallbackAttempts: 3, // Batas mencoba fallback sebelum menyerah
    stopWords: ['yang', 'di', 'ke', 'dari', 'dan'],
    enablePartialMatching: true, // Izinkan pencocokan sebagian
    partialMatchThreshold: 0.4
};

let dataset = null;
const sessionContext = {
    currentTopic: null,
    lastSubtopic: null,
    conversationHistory: [],
    fallbackAttempts: 0 // Counter untuk percobaan fallback
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

        const data = await response.json();
        if (!validateDatabaseStructure(data)) {
            throw new Error('Invalid database structure');
        }

        dataset = data;
        console.log("Database loaded successfully");
        sessionContext.fallbackAttempts = 0; // Reset fallback attempts on success
    } catch (error) {
        console.error("Database error:", error);
        dataset = getFallbackDataset();
        showDatabaseError();
        sessionContext.fallbackAttempts++;
        if (sessionContext.fallbackAttempts >= CONFIG.maxFallbackAttempts) {
            showCriticalError("Gagal memuat database setelah beberapa kali percobaan.");
            // Optionally disable input or further attempts
        }
    } finally {
        isDatabaseLoading = false;
    }
}

function validateDatabaseStructure(data) {
    return data &&
        data.topics &&
        typeof data.topics === 'object' &&
        Object.values(data.topics).every(topic =>
            topic.subtopics && typeof topic.subtopics === 'object' &&
            Object.values(topic.subtopics).every(subtopic =>
                subtopic.QnA && Array.isArray(subtopic.QnA) &&
                subtopic.QnA.every(qna =>
                    qna.patterns && Array.isArray(qna.patterns) &&
                    qna.responses && Array.isArray(qna.responses)
                )
            )
        );
}

function getFallbackDataset() {
    const timestamp = new Date().toISOString();

    return {
        _metadata: {
            type: "fallback",
            generatedAt: timestamp,
            version: "1.0.0"
        },
        topics: {
            "Umum": {
                description: "Topik umum",
                subtopics: {
                    "Sapaan": {
                        QnA: [{
                            intent: "greeting",
                            patterns: ["halo", "hai", "pagi"],
                            responses: [
                                "Halo! Saya dalam mode darurat. Database utama tidak tersedia.",
                                "Hai! Saya bisa membantu dengan informasi dasar saja saat ini."
                            ],
                            createdAt: timestamp
                        }]
                    }
                }
            },
            "Bantuan": {
                description: "Bantuan teknis",
                subtopics: {
                    "Error": {
                        QnA: [{
                            intent: "database_error",
                            patterns: ["error database", "masalah sistem"],
                            responses: [
                                "Maaf, saya sedang menggunakan data darurat. Silakan coba lagi nanti.",
                                "Sistem sedang dalam pemeliharaan. Mohon bersabar."
                            ],
                            tags: ["technical"]
                        }]
                    }
                }
            }
        },
        config: {
            minMatchScore: 0.5,
            responseTimeout: 2000
        }
    };
}

// ================ [2.2] DATABASE ERROR HANDLING ================ //
/**
 * Tampilkan notifikasi error database ke user
 * @param {string|null} customMessage - Pesan custom opsional
 */
function showDatabaseError(customMessage = null) {
    const existingNotification = document.querySelector('.database-error-notification');

    try {
        const errorMessage = customMessage ||
            "⚠️ Database offline. Menggunakan data terbatas. Beberapa fitur mungkin tidak tersedia.";

        if (existingNotification) {
            // Update existing notification
            existingNotification.querySelector('.error-body p').textContent = errorMessage;
            existingNotification.querySelector('.error-body small').textContent = `Terakhir diperbarui: ${new Date().toLocaleString()}`;
        } else {
            // Create new notification
            const errorElement = document.createElement('div');
            errorElement.className = 'database-error-notification';
            errorElement.innerHTML = `
                <div class="error-header">
                    <i class="icon-warning"></i>
                    <h3>Mode Terbatas</h3>
                </div>
                <div class="error-body">
                    <p>${errorMessage}</p>
                    <small>Terakhir diperbarui: ${new Date().toLocaleString()}</small>
                </div>
                <button class="dismiss-btn">Mengerti</button>
            `;

            const container = document.getElementById('notifications') || document.body;
            container.prepend(errorElement);

            const dismissTimer = setTimeout(() => {
                if (errorElement) errorElement.remove();
            }, 10000);

            errorElement.querySelector('.dismiss-btn').addEventListener('click', () => {
                clearTimeout(dismissTimer);
                if (errorElement) errorElement.remove();
            });
        }

        console.warn("Database error notification shown/updated");
        if (window.analytics) {
            window.analytics.track('database_fallback_activated');
        }

    } catch (error) {
        console.error("Failed to show/update database error:", error);
        alert("Terjadi masalah pada sistem. Silakan refresh halaman.");
    }
}

// ================ [3] TEXT PROCESSING UTILITIES ================ //
function normalizeText(text) {
    if (!text || typeof text !== 'string') return '';

    return text
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s?]/g, ' ') // Allow question marks
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(text) {
    const stopWords = new Set(CONFIG.stopWords);
    return normalizeText(text)
        .split(' ')
        .filter(word => word.length > 2 && !stopWords.has(word));
}

// ================ [4] MATCHING ENGINE ================ //
function calculateMatchScore(query, pattern) {
    const queryTokens = new Set(tokenize(query));
    const patternTokens = new Set(tokenize(pattern));

    const intersection = new Set([...queryTokens].filter(t => patternTokens.has(t)));
    const union = new Set([...queryTokens, ...patternTokens]);

    let score = union.size === 0 ? 0 : intersection.size / union.size; // Prevent division by zero

    if (sessionContext.currentTopic && pattern.toLowerCase().includes(sessionContext.currentTopic.toLowerCase())) {
        score *= CONFIG.CURRENT_TOPIC_BOOST;
    }

    for (const [type, bonus] of Object.entries(CONFIG.QUESTION_TYPE_BONUS)) {
        if (query.toLowerCase().includes(type) && pattern.toLowerCase().includes(type)) {
            score *= bonus;
            break;
        }
    }

    return Math.min(score, 1.0);
}

function findBestMatch(query) {
    if (typeof query !== 'string' || query.trim() === '') {
        console.warn('Invalid query:', query);
        return null;
    }

    if (!dataset?.topics) {
        console.warn('Dataset not loaded or invalid structure');
        return generateFallbackResponse("Dataset tidak termuat.");
    }

    const normalizedQuery = normalizeText(query);
    let bestMatch = {
        score: 0,
        topic: null,
        subtopic: null,
        responses: [],
        responseIndex: -1,
        diagram: null
    };

    try {
        if (sessionContext.currentTopic && dataset.topics[sessionContext.currentTopic]) {
            const currentTopicMatch = searchInTopic(
                sessionContext.currentTopic,
                normalizedQuery
            );

            if (currentTopicMatch.score > (CONFIG.MIN_MATCH_SCORE * 0.85)) {
                bestMatch = currentTopicMatch;
                if (bestMatch.score > 0.8) {
                    return bestMatch;
                }
            }
        }

        for (const topicName in dataset.topics) {
            if (topicName === sessionContext.currentTopic) continue;

            const topicMatch = searchInTopic(topicName, normalizedQuery);

            if (topicMatch.score > bestMatch.score) {
                bestMatch = topicMatch;
                if (bestMatch.score > 0.85) break;
            }
        }

        if (bestMatch.score < CONFIG.MIN_MATCH_SCORE && CONFIG.enablePartialMatching) {
            const partialMatch = findPartialMatch(normalizedQuery);
            if (partialMatch && partialMatch.score >= CONFIG.partialMatchThreshold) {
                return partialMatch;
            }
        }

        return bestMatch.score >= CONFIG.MIN_MATCH_SCORE ? bestMatch : null;

    } catch (error) {
        console.error('Matching error:', error);
        return generateFallbackResponse("Terjadi kesalahan saat mencari jawaban.");
    }
}

function searchInTopic(topicName, query) {
    if (!dataset?.topics?.[topicName]?.subtopics) {
        console.warn(`Invalid topic structure or topic not found: ${topicName}`);
        return {
            score: 0,
            topic: topicName,
            subtopic: null,
            responses: [],
            responseIndex: -1,
            diagram: null
        };
    }

    const topicData = dataset.topics[topicName];
    let bestMatchInTopic = {
        score: 0,
        topic: topicName,
        subtopic: null,
        responses: [],
        responseIndex: -1,
        diagram: null
    };

    try {
        for (const subtopicName in topicData.subtopics) {
            const qnaList = topicData.subtopics[subtopicName]?.QnA;
            if (!Array.isArray(qnaList)) continue;

            for (const qna of qnaList) {
                if (!qna.patterns || !Array.isArray(qna.patterns) || !qna.responses || !Array.isArray(qna.responses)) continue;

                for (let i = 0; i < qna.patterns.length; i++) {
                    const pattern = qna.patterns[i];
                    if (typeof pattern !== 'string') continue;

                    const score = calculateMatchScore(query, pattern);

                    if (score > bestMatchInTopic.score) {
                        bestMatchInTopic = {
                            score,
                            topic: topicName,
                            subtopic: subtopicName,
                            responses: qna.responses,
                            responseIndex: i,
                            diagram: qna.diagram || null
                        };
                    }
                }
            }
        }
        return bestMatchInTopic;
    } catch (error) {
        console.error(`Search error in topic ${topicName}:`, error);
        return {
            score: 0,
            topic: topicName,
            subtopic: null,
            responses: [],
            responseIndex: -1,
            diagram: null
        };
    }
}

function findPartialMatch(query) {
    let partialMatch = null;
    let bestScore = 0;

    for (const topic in dataset.topics) {
        for (const subtopic in dataset.topics[topic].subtopics) {
            const qnaList = dataset.topics[topic].subtopics[subtopic].QnA;
            for (const qna of qnaList) {
                for (const pattern of qna.patterns) {
                    const score = calculatePartialMatchScore(query, pattern);
                    if (score > bestScore) {
                        bestScore = score;
                        partialMatch = {
                            score,
                            topic,
                            subtopic,
                            responses: qna.responses,
                            responseIndex: 0,
                            diagram: qna.diagram || null
                        };
                    }
                }
            }
        }
    }

    return partialMatch;
}

function calculatePartialMatchScore(query, pattern) {
    const queryTokens = tokenize(query);
    const patternTokens = tokenize(pattern);
    let matchedTokens = 0;

    for (const queryToken of queryTokens) {
        if (patternTokens.includes(queryToken)) {
            matchedTokens++;
        }
    }

    return patternTokens.length > 0 ? matchedTokens / patternTokens.length : 0;
}

/**
 * @typedef {Object} MatchResult
 * @property {number} score - Skor kecocokan (0-1)
 * @property {string} topic - Nama topik
 * @property {string} subtopic - Nama subtopik
 * @property {string[]} responses - Array jawaban
 * @property {number} responseIndex - Index pattern yang cocok
 * @property {string|null} diagram - URL diagram (jika ada)
 */

// ================ [5] RESPONSE GENERATION ================ //
async function formatResponse(match) {
    if (!match) return generateFallbackResponse();

    const typingIndicator = showTypingIndicator();
    try {
        let responseHTML;
        switch (match.topic) {
            case 'Profil Guru':
                responseHTML = await formatTeacherProfileResponse(match);
                break;
            default:
                responseHTML = await formatGeneralResponse(match);
        }
        return responseHTML;
    } catch (error) {
        console.error("Format error:", error);
        return generateFallbackResponse("Terjadi kesalahan saat memformat jawaban.");
    } finally {
        if (typingIndicator) typingIndicator.remove();
    }
}

async function formatTeacherProfileResponse(match) {
    if (!match || !match.responses || !Array.isArray(match.responses)) {
        console.error('Invalid match data for teacher profile:', match);
        return generateFallbackResponse("Data profil guru tidak valid.");
    }

    try {
        const responseText = getRandomResponse(match.responses) ||
            "Informasi guru tidak tersedia saat ini.";

        const imageUrl = match.diagram || CONFIG.FALLBACK_IMAGE;
        const imageExists = await checkImageExists(imageUrl);
        const actualImage = imageExists ? imageUrl : CONFIG.FALLBACK_IMAGE;

        let html = `
            <div class="teacher-profile-response answer-box">
                <div class="profile-header">
                    <img src="<span class="math-inline">\{actualImage\}" 
alt\="Foto Guru"
class\="profile\-image"
onerror\="this\.src\='</span>{CONFIG.FALLBACK_IMAGE}'">
                    <h3>Profil Guru: <span class="math-inline">\{escapeHtml\(match\.subtopic \|\| ''\)\}</h3\>
</div\>
<div class\="profile\-content"\>
<p\></span>{escapeHtml(responseText)}</p>
                    ${generateSubjectTags(match.subtopic)}
                </div>
                ${generateFeedbackButtons()}
            </div>
        `;

        if (!imageExists) {
            html += `<p class="image-load-error">Gagal memuat gambar profil.</p>`;
        }

        return html;

    } catch (error) {
        console.error('Error formatting teacher profile:', error);
        return generateFallbackResponse("Gagal memformat profil guru.");
    }
}

async function formatGeneralResponse(match) {
    if (!match?.responses?.length) {
        return generateFallbackResponse("Tidak ada respons yang cocok.");
    }

    try {
        const responseText = getRandomResponse(match.responses);
        let htmlContent = `
            <div class="general-response answer-box">
                <div class="response-header">
                    <h4><span class="math-inline">\{escapeHtml\(match\.subtopic \|\| 'Informasi'\)\}</h4\>
</div\>
<div class\="response\-content"\>
<p\></span>{escapeHtml(responseText)}</p>
        `;

        if (match.diagram) {
            const imageExists = await checkImageExists(match.diagram);
            const actualImage = imageExists ? match.diagram : CONFIG.FALLBACK_IMAGE;

            htmlContent += `
                    <div class="response-diagram">
                        <img src="${actualImage}" 
                             alt="Diagram ${escapeHtml(match.subtopic || '')}"
                             loading="lazy">
                    </div>
                `;
            if (!imageExists) {
                htmlContent += `<p class="image-loadError">Gagal memuat diagram.</p>`;
            }
        }

        htmlContent += generateFeedbackButtons();
        htmlContent += `</div></div>`;

        return htmlContent;

    } catch (error) {
        console.error('Error formatting general response:', error);
        return generateFallbackResponse("Gagal memformat jawaban.");
    }
}

function generateSubjectTags(subject) {
    const subjectClasses = {
        "Biologi": "biology-tag",
        "Fisika": "physics-tag",
        "Kimia": "chemistry-tag",
        "Umum": "general-tag"
    };
    const className = subjectClasses[subject] || "general-tag";
    return `<span class="subject-tag ${className}">${escapeHtml(subject)}</span>`;
}

function escapeHtml(text) {
    const tempDiv = document.createElement('div');
    tempDiv.textContent = text;
    return tempDiv.innerHTML;
}

function getRandomResponse(responsesArray) {
    if (!Array.isArray(responsesArray) || responsesArray.length === 0) {
        console.warn("getRandomResponse called with invalid or empty array:", responsesArray);
        return "Maaf, terjadi kesalahan.";
    }
    const randomIndex = Math.floor(Math.random() * responsesArray.length);
    return responsesArray[randomIndex];
}

function generateFeedbackButtons() {
    return `
        <div class="feedback-buttons">
            <button class="like-btn" onclick="handleFeedback(true)" aria-label="Suka">👍</button>
            <button class="dislike-btn" onclick="handleFeedback(false)" aria-label="Tidak Suka">👎</button>
            <span class="feedback-ack"></span>
        </div>
    `;
}

function generateFallbackResponse(message = "Maaf, saya tidak mengerti atau terjadi kesalahan.") {
    return `<div class="fallback-response answer-box">${escapeHtml(message)}</div>`;
}

// ================ [6] CHAT INTERFACE ================ //
function addMessage(content, isBot = true) {
    try {
        const chatbox = document.getElementById('chatbox');
        if (!chatbox) {
            console.error("Chatbox element not found!");
            return;
        }

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', isBot ? 'bot-message' : 'user-message');
        messageDiv.setAttribute('role', 'article');
        messageDiv.setAttribute('aria-label', isBot ? 'Pesan dari bot' : 'Pesan Anda');

        if (isBot) {
            messageDiv.innerHTML = content;
        } else {
            messageDiv.textContent = content; // Use textContent for user messages
        }

        chatbox.appendChild(messageDiv);
        scrollToBottom(chatbox);
    } catch (error) {
        console.error("Error adding message:", error);
    }
}

function sanitizeHTML(html) {
    const tempDiv = document.createElement('div');
    tempDiv.textContent = html;
    return tempDiv.innerHTML;
}

function showTypingIndicator() {
    try {
        const chatbox = document.getElementById('chatbox');
        if (!chatbox) {
            console.error("Chatbox element not found!");
            return null;
        }

        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'typing-indicator';
        typingIndicator.innerHTML = `
            <div class="typing-content">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
            <span>Bot sedang mengetik...</span>
        `;
        chatbox.appendChild(typingIndicator);
        scrollToBottom(chatbox);
        return typingIndicator;
    } catch (error) {
        console.error("Error showing typing indicator:", error);
        return null;
    }
}

function showWelcomeMessage() {
    const welcomeMessage = `
        <div class="welcome-message answer-box">
            <h3>Selamat datang!</h3>
            <p>Saya Asisten IPA, siap membantu Anda dengan pertanyaan seputar Biologi dan Fisika.</p>
            <p>Silakan ajukan pertanyaan, atau coba beberapa contoh di bawah ini:</p>
            <div class="example-questions">
                <button class="example-question-btn" onclick="insertExample('Apa itu sel?')">Apa itu sel?</button>
                <button class="example-question-btn" onclick="insertExample('Bagaimana fotosintesis terjadi?')">Bagaimana fotosintesis terjadi?</button>
                <button class="example-question-btn" onclick="insertExample('Siapa itu Albert Einstein?')">Siapa itu Albert Einstein?</button>
            </div>
        </div>
    `;
    addMessage(welcomeMessage, true);
}

function scrollToBottom(element) {
    if (element) {
        element.scrollTo({
            top: element.scrollHeight,
            behavior: 'smooth'
        });
    }
}

function insertExample(question) {
    const userInput = document.getElementById('userInput');
    if (userInput) {
        userInput.value = question;
        userInput.focus();
    }
}

// ================ [7] INPUT PROCESSING ================ //
function processUserInput() {
    const userInput = document.getElementById('userInput');
    if (!userInput) return;

    if (Date.now() - lastMessageTime < CONFIG.RATE_LIMIT_TIME) {
        showRateLimitWarning();
        return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        handleUserMessage(userInput.value);
        userInput.value = '';
    }, CONFIG.DEBOUNCE_TIME);
}

// ================ [8] MAIN CHAT LOGIC ================ //
async function handleUserMessage(userMessage) {
    if (!userMessage || userMessage.trim() === '') return;

    lastMessageTime = Date.now();
    addMessage(userMessage, false);

    try {
        const match = findBestMatch(userMessage);
        const responseHTML = await formatResponse(match);
        addMessage(responseHTML, true);

        updateSessionContext(match, userMessage, responseHTML);

    } catch (error) {
        console.error("Error handling user message:", error);
        addMessage(generateFallbackResponse(), true);
    }
}

function showRateLimitWarning() {
    const warningDiv = document.createElement('div');
    warningDiv.className = 'rate-limit-warning answer-box';
    warningDiv.textContent = 'Harap tunggu sebelum mengirim pesan lagi.';
    document.getElementById('chatbox').appendChild(warningDiv);
    setTimeout(() => warningDiv.remove(), 3000);
}

// ================ [9] SESSION MANAGEMENT ================ //
function updateSessionContext(match, userMessage, response) {
    if (match && match.topic) {
        sessionContext.currentTopic = match.topic;
        sessionContext.lastSubtopic = match.subtopic;
    }

    sessionContext.conversationHistory.push({
        user: userMessage,
        bot: response
    });

    if (sessionContext.conversationHistory.length > CONFIG.MAX_HISTORY) {
        sessionContext.conversationHistory.shift();
    }

    saveConversation();
}

function saveConversation() {
    try {
        localStorage.setItem('conversationHistory', JSON.stringify(sessionContext.conversationHistory));
    } catch (error) {
        handleStorageError(error);
    }
}

function loadConversation() {
    try {
        const savedHistory = localStorage.getItem('conversationHistory');
        if (savedHistory) {
            sessionContext.conversationHistory = JSON.parse(savedHistory);
            const chatbox = document.getElementById('chatbox');
            chatbox.innerHTML = ''; // Clear existing messages
            sessionContext.conversationHistory.forEach(entry => {
                addMessage(entry.bot, true);
                addMessage(entry.user, false);
            });
            scrollToBottom(chatbox);
        }
    } catch (error) {
        handleStorageError(error);
    }
}

function clearConversation() {
    try {
        localStorage.removeItem('conversationHistory');
        sessionContext.conversationHistory = [];
        const chatbox = document.getElementById('chatbox');
        if (chatbox) chatbox.innerHTML = ''; // Clear chatbox content
        showWelcomeMessage(); // Tampilkan pesan selamat datang setelah dibersihkan
    } catch (error) {
        handleStorageError(error);
    }
}

function handleStorageError(error) {
    console.error("LocalStorage error:", error);
    // Mungkin beri tahu pengguna, tetapi hindari alert yang mengganggu
    showCriticalError("Gagal menyimpan/memuat riwayat percakapan.");
}

// ================ [10] FEEDBACK SYSTEM ================ //
function handleFeedback(isPositive) {
    const feedbackAck = document.querySelector('.feedback-ack');
    if (feedbackAck) {
        feedbackAck.textContent = isPositive ? "Terima kasih atas masukannya! 👍" : "Terima kasih atas masukannya! 👎";
        setTimeout(() => feedbackAck.textContent = '', 3000);
    }
    // Logika pengiriman feedback ke server (jika ada)
}

// ================ [11] UTILITIES ================ //
async function checkImageExists(url) {
    try {
        const response = await fetch(url, {
            method: 'HEAD',
            cache: 'no-cache'
        });
        return response.ok;
    } catch (error) {
        console.error("Error checking image:", error);
        return false;
    }
}

function showCriticalError(message) {
    let errorDiv = document.getElementById('critical-error-message');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'critical-error-message';
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '0';
        errorDiv.style.left = '0';
        errorDiv.style.width = '100%';
        errorDiv.style.padding = '1em';
        errorDiv.style.backgroundColor = 'red';
        errorDiv.style.color = 'white';
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
    setTimeout(initializeApp, 50);
});

// ================ [12] EVENT LISTENERS ================ //
function setupEventListeners() {
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const clearChatButton = document.getElementById('clearChat');

    if (userInput) {
        userInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                processUserInput();
            }
        });
    }

    if (sendButton) {
        sendButton.addEventListener('click', processUserInput);
    }

    if (clearChatButton) {
        clearChatButton.addEventListener('click', clearConversation);
    }

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // Tambahkan event listener untuk contoh pertanyaan (jika diperlukan)
    const exampleButtons = document.querySelectorAll('.example-question-btn');
    exampleButtons.forEach(button => {
        button.addEventListener('click', () => {
            insertExample(button.textContent);
        });
    });
}

// ================ [13] THEME TOGGLE (Tambahan) ================ //
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    document.documentElement.classList.toggle('dark-theme');
}

// ================ [14] ANALYTICS (Placeholder) ================ //
// Fungsi placeholder untuk pelacakan analitik
// Anda perlu menggantinya dengan integrasi analitik yang sebenarnya
if (!window.analytics) {
    window.analytics = {
        track: (event, properties) => {
            console.log(`[Analytics] Tracked: ${event}`, properties);
        }
    };
}
				
				
				
				
				
				