/* ============================================================
   J.A.R.V.I.S — VOICE AI CORE
   Voice-first edition: wake word + continuous listening + speech
   output + local browser actions + optional AI endpoint.

   IMPORTANT:
   - The browser's Web Speech API handles microphone recognition.
   - For genuinely open-ended questions/actions, set AI_ENDPOINT
     to your own secure AI proxy (recommended) or an API endpoint.
   - Never publish a private API key in a public website.
   ============================================================ */

/* ---------------- CONFIG ---------------- */
const JARVIS_CONFIG = window.JARVIS_CONFIG || {
    // Example: "https://your-server.example.com/api/jarvis"
    AI_ENDPOINT: "",
    AI_API_KEY: "",
    AI_MODEL: "your-model",
    WAKE_WORDS: ["jarvis", "j a r vis", "जार्विस", "جارڤيس"],
    WAKE_TIMEOUT: 12000,
    DEFAULT_LANGUAGE: navigator.language || "en-IN"
};

/* ---------------- ELEMENTS ---------------- */
const startup = document.getElementById("startup");
const startupLine = document.getElementById("startup-line");
const startupBar = document.getElementById("startup-bar-fill");
const startupStatus = document.getElementById("startup-status");

const statusText = document.getElementById("status-text");
const statusClock = document.getElementById("status-clock");
const panelTime = document.getElementById("panel-time");
const panelPeriod = document.getElementById("panel-period");
const panelDate = document.getElementById("panel-date");
const coreStatus = document.getElementById("core-status");
const aiMode = document.getElementById("ai-mode");
const terminalTitle = document.getElementById("terminal-title");
const terminalStatus = document.getElementById("terminal-status");
const terminalBody = document.getElementById("terminal-body");
const jarvisCore = document.getElementById("jarvis-core");
const navItems = document.querySelectorAll(".nav-item");
const navActiveLine = document.getElementById("nav-active-line");
const leftPanel = document.getElementById("panel-left");
const rightPanel = document.getElementById("panel-right");
const terminal = document.getElementById("terminal");
const coreSection = document.getElementById("core-section");

const voiceStatus = document.getElementById("voice-status");
const voiceStatusText = document.getElementById("voice-status-text");
const voiceTranscript = document.getElementById("voice-transcript");

/* ---------------- STATE ---------------- */
let recognition = null;
let isListening = false;
let voiceEnabled = false;
let jarvisAwake = false;
let wakeTimer = null;
let restartTimer = null;
let isSpeaking = false;
let currentLanguage = JARVIS_CONFIG.DEFAULT_LANGUAGE;

/* ---------------- VOICE UI LANGUAGE ---------------- */
const VOICE_UI_TEXT = {
    en: { listening: "LISTENING...", sayJarvis: 'SAY "JARVIS"', active: "JARVIS ACTIVE — SPEAK NOW", speaking: "SPEAKING...", standby: 'SAY "JARVIS"', reconnecting: "VOICE RECONNECTING..." },
    hi: { listening: "सुन रहा हूँ...", sayJarvis: 'कहिए "जार्विस"', active: "जार्विस सक्रिय — बोलिए", speaking: "बोल रहा हूँ...", standby: 'कहिए "जार्विस"', reconnecting: "वॉइस फिर से कनेक्ट हो रही है..." },
    ja: { listening: "聞いています...", sayJarvis: "「ジャービス」と言ってください", active: "JARVIS 起動中 — 話してください", speaking: "話しています...", standby: "「ジャービス」と言ってください", reconnecting: "音声を再接続しています..." },
    zh: { listening: "正在聆听...", sayJarvis: "请说“JARVIS”", active: "JARVIS 已激活 — 请说话", speaking: "正在说话...", standby: "请说“JARVIS”", reconnecting: "正在重新连接语音..." },
    ko: { listening: "듣고 있습니다...", sayJarvis: '"자비스"라고 말하세요', active: "JARVIS 활성화 — 말씀하세요", speaking: "말하고 있습니다...", standby: '"자비스"라고 말하세요', reconnecting: "음성 연결을 다시 시도하고 있습니다..." },
    fr: { listening: "J'ÉCOUTE...", sayJarvis: 'DITES « JARVIS »', active: "JARVIS ACTIF — PARLEZ", speaking: "JE PARLE...", standby: 'DITES « JARVIS »', reconnecting: "RECONNEXION VOCALE..." },
    de: { listening: "ICH HÖRE ZU...", sayJarvis: 'SAGEN SIE „JARVIS“', active: "JARVIS AKTIV — SPRECHEN SIE", speaking: "ICH SPRECHE...", standby: 'SAGEN SIE „JARVIS“', reconnecting: "SPRACHVERBINDUNG WIRD ERNEUERT..." },
    es: { listening: "ESCUCHANDO...", sayJarvis: 'DI «JARVIS»', active: "JARVIS ACTIVO — HABLA", speaking: "HABLANDO...", standby: 'DI «JARVIS»', reconnecting: "RECONECTANDO VOZ..." }
};

function getVoiceText(key) {
    const code = String(currentLanguage || "en").toLowerCase().split("-")[0];
    return VOICE_UI_TEXT[code]?.[key] || VOICE_UI_TEXT.en[key];
}
const SESSION_KEY = "jarvis-session-v2";
let conversation = [];
let activePanelName = "core";
let lastTranscript = "";

function saveJarvisSession() {
    try {
        if (!jarvisSettings?.saveHistory) return;
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            conversation: conversation.slice(-20),
            activePanelName,
            savedAt: Date.now()
        }));
    } catch (_) {}
}

function loadJarvisSession() {
    try {
        const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
        if (!saved) return;
        if (Array.isArray(saved.conversation)) conversation = saved.conversation.slice(-20);
        if (saved.activePanelName && ["core","system","intelligence","command","history","settings","help"].includes(saved.activePanelName)) {
            activePanelName = saved.activePanelName;
        }
    } catch (_) {}
}

function navigateExternal(url, responseText = null) {
    // External sites cause a full page navigation. Save JARVIS state first so
    // browser Back restores the same panel and HISTORY instead of a fresh screen.
    if (responseText) conversation.push({ role: "assistant", content: responseText });
    saveJarvisSession();
    window.location.href = url;
}

const SETTINGS_KEY = "jarvis-settings-v1";
let jarvisSettings = (() => {
    try {
        return { voiceResponses: true, saveHistory: true, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")) };
    } catch {
        return { voiceResponses: true, saveHistory: true };
    }
})();
function saveJarvisSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(jarvisSettings)); } catch (_) {}
}
saveJarvisSettings();
loadJarvisSession();

/* ---------------- STARTUP ---------------- */
function runStartup() {
    const steps = [
        { text: "INITIALIZING NEURAL SYSTEM...", progress: 20 },
        { text: "LOADING VOICE ENGINE...", progress: 45 },
        { text: "CALIBRATING HOLOGRAPHIC MATRIX...", progress: 70 },
        { text: "CONNECTING J.A.R.V.I.S...", progress: 90 },
        { text: "VOICE CHANNEL ONLINE", progress: 100 }
    ];

    let currentStep = 0;

    function nextStep() {
        if (currentStep >= steps.length) {
            finishStartup();
            return;
        }

        const step = steps[currentStep];
        startupLine.textContent = step.text;
        startupBar.style.width = step.progress + "%";
        if (step.progress === 100) startupStatus.textContent = "READY";
        currentStep++;
        setTimeout(nextStep, 650);
    }

    nextStep();
}

function finishStartup() {
    statusText.textContent = "VOICE SYSTEM READY";
    coreStatus.textContent = "NEURAL CORE // STANDBY";
    aiMode.textContent = "VOICE";
    terminalStatus.textContent = "VOICE STANDBY";

    setTimeout(() => {
        startup.classList.add("hide");
        initializeVoiceEngine();
    }, 900);
}

/* ---------------- CLOCK ---------------- */
function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const period = hours >= 12 ? "PM" : "AM";

    hours %= 12;
    if (hours === 0) hours = 12;
    const displayHours = String(hours).padStart(2, "0");

    statusClock.textContent = `${displayHours}:${minutes}:${seconds}`;
    panelTime.textContent = `${displayHours}:${minutes}`;
    panelPeriod.textContent = period;
    panelDate.textContent = now.toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric"
    });
}

/* ---------------- TERMINAL ---------------- */
function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function addTerminalLine(text, type = "normal") {
    const paragraph = document.createElement("p");
    paragraph.classList.add("terminal-line");

    if (type === "user") {
        paragraph.classList.add("user-command");
        paragraph.innerHTML = '<span class="terminal-dot"></span>YOU &gt; ' + escapeHtml(text);
    } else if (type === "jarvis") {
        paragraph.classList.add("jarvis-response");
        paragraph.innerHTML = '<span class="terminal-dot"></span>JARVIS &gt; ' + escapeHtml(text);
    } else if (type === "error") {
        paragraph.classList.add("command-error");
        paragraph.innerHTML = '<span class="terminal-dot"></span>' + escapeHtml(text);
    } else {
        paragraph.textContent = text;
    }

    terminalBody.appendChild(paragraph);
    terminalBody.scrollTop = terminalBody.scrollHeight;
}

function showTerminal(title, status, lines) {
    terminalTitle.textContent = title;
    terminalStatus.textContent = status;
    terminalBody.innerHTML = "";
    lines.forEach((line, index) => {
        const p = document.createElement("p");
        p.className = index === 0 ? "terminal-line" : "terminal-line dim";
        p.textContent = line;
        terminalBody.appendChild(p);
    });
}

function renderSettings() {
    terminal.classList.add("settings-mode");
    terminal.classList.remove("history-mode", "help-mode");
    terminalTitle.textContent = "JARVIS SETTINGS";
    terminalStatus.textContent = "CONFIG";
    terminalBody.innerHTML = `
        <div class="settings-panel">
            <div class="settings-intro">
                <span class="settings-kicker">J.A.R.V.I.S // CONFIG</span>
                <span class="settings-note">Compact controls for this browser session</span>
            </div>
            <div class="settings-list">
                <label class="setting-row"><span><b>VOICE RESPONSES</b><small>Speak JARVIS replies aloud</small></span><input type="checkbox" data-setting="voiceResponses" ${jarvisSettings.voiceResponses ? "checked" : ""}></label>
                <label class="setting-row"><span><b>SAVE HISTORY</b><small>Keep conversation history for this session</small></span><input type="checkbox" data-setting="saveHistory" ${jarvisSettings.saveHistory ? "checked" : ""}></label>
                <div class="setting-row static"><span><b>VOICE LANGUAGE</b><small>Use the language selector on the main command area</small></span><strong>${escapeHtml(currentLanguage)}</strong></div>
                <div class="setting-row static"><span><b>AI ENDPOINT</b><small>Open-ended AI service status</small></span><strong>${JARVIS_CONFIG.AI_ENDPOINT ? "CONNECTED" : "NOT CONNECTED"}</strong></div>
            </div>
        </div>`;
    terminalBody.querySelectorAll("[data-setting]").forEach(input => {
        input.addEventListener("change", () => {
            jarvisSettings[input.dataset.setting] = input.checked;
            saveJarvisSettings();
        });
    });
    terminalBody.scrollTop = 0;
}

function renderHelp() {
    terminal.classList.add("help-mode");
    terminal.classList.remove("history-mode");
    terminalTitle.textContent = "J.A.R.V.I.S HELP";
    terminalStatus.textContent = "ONLINE";
    terminalBody.innerHTML = `
        <div class="help-guide">
            <div class="help-intro">
                <div class="help-kicker">J.A.R.V.I.S // QUICK GUIDE</div>
                <h2>HOW TO USE JARVIS</h2>
                <p>Voice-first browser assistant. Say <strong>“Jarvis”</strong> and then your request.</p>
            </div>
            <div class="help-grid">
                <article class="help-card">
                    <span class="help-number">01</span>
                    <h3>VOICE</h3>
                    <p>Wake JARVIS with “Jarvis”, then speak your command. The listening indicator shows the current voice state.</p>
                </article>
                <article class="help-card">
                    <span class="help-number">02</span>
                    <h3>LANGUAGES</h3>
                    <p>Choose a supported voice recognition language from the selector. Typed text remains Unicode-friendly.</p>
                </article>
                <article class="help-card">
                    <span class="help-number">03</span>
                    <h3>INTELLIGENCE</h3>
                    <p>Use Weather, Location and System intelligence for browser/API-backed information. Unsupported data is shown as unavailable.</p>
                </article>
                <article class="help-card">
                    <span class="help-number">04</span>
                    <h3>STUDY</h3>
                    <p>Create tasks, track completion, use Pomodoro and monitor your study progress. Data is saved locally in this browser.</p>
                </article>
                <article class="help-card">
                    <span class="help-number">05</span>
                    <h3>HISTORY</h3>
                    <p>Open HISTORY to review commands you spoke or typed and JARVIS responses from the current browser session.</p>
                </article>
                <article class="help-card">
                    <span class="help-number">06</span>
                    <h3>LIMITS</h3>
                    <p>Browser-only JARVIS cannot directly control Windows applications or expose hardware metrics that the browser does not provide.</p>
                </article>
            </div>
            <div class="help-command-strip">
                <span>TIP</span>
                <strong>Say “Jarvis, what time is it?”</strong>
                <span>or ask for weather, location, a search, or a study task.</span>
            </div>
        </div>`;
    terminalBody.scrollTop = 0;
}

function renderHistory() {
    terminalTitle.textContent = "VOICE HISTORY";
    terminalStatus.textContent = conversation.length ? "ARCHIVE" : "EMPTY";
    terminalBody.innerHTML = "";

    if (!conversation.length) {
        const empty = document.createElement("p");
        empty.className = "terminal-line dim history-empty";
        empty.textContent = "No conversation history yet.";
        terminalBody.appendChild(empty);
        return;
    }

    conversation.forEach((entry, index) => {
        const row = document.createElement("div");
        row.className = `history-entry ${entry.role === "user" ? "history-user" : "history-jarvis"}`;

        const meta = document.createElement("span");
        meta.className = "history-meta";
        meta.textContent = entry.role === "user" ? "YOU" : "JARVIS";

        const message = document.createElement("span");
        message.className = "history-message";
        message.textContent = entry.content;

        row.appendChild(meta);
        row.appendChild(message);
        terminalBody.appendChild(row);
    });

    terminalBody.scrollTop = terminalBody.scrollHeight;
}

/* ---------------- NAVIGATION ---------------- */
function clearPanelFocus() {
    leftPanel.classList.remove("nav-focus");
    rightPanel.classList.remove("nav-focus");
    terminal.classList.remove("nav-focus");
    coreSection.classList.remove("nav-focus");
}

function focusPanel(panel) {
    clearPanelFocus();
    if (!panel) return;
    panel.classList.add("nav-focus");
    setTimeout(() => panel.classList.remove("nav-focus"), 700);
}

function activateNavigation(item) {
    navItems.forEach(navItem => navItem.classList.remove("active"));
    item.classList.add("active");

    const nav = document.getElementById("nav");
    const itemRect = item.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    navActiveLine.style.left =
        (itemRect.left - navRect.left + itemRect.width / 2) + "px";
}

function handleNavigation(panelName) {
    activePanelName = panelName;
    const data = {
        core: ["CORE ONLINE", "NEURAL CORE // STANDBY", "VOICE", "CORE TERMINAL", "READY", [
            "J.A.R.V.I.S core selected.",
            "Voice neural channel is standing by.",
            "Say 'Jarvis' followed by your request."
        ], coreSection],
        system: ["SYSTEM VIEW", "SYSTEM // MONITORING", "MONITOR", "SYSTEM MONITOR", "ACTIVE", [
            "System diagnostics selected.",
            "CPU / memory / network modules are online.",
            "Browser-exposed diagnostics are active."
        ], leftPanel],
        intelligence: ["INTELLIGENCE VIEW", "INTELLIGENCE // ACTIVE", "ANALYSIS", "INTELLIGENCE", "ACTIVE", [
            "Intelligence module selected.",
            "Voice requests can use local actions or the configured AI endpoint.",
            "Weather uses live Open-Meteo data when location is available."
        ], rightPanel],
        command: ["VOICE MODE", "VOICE // ACTIVE", "VOICE", "VOICE COMMAND CHANNEL", "READY", [
            "Typed commands have been removed.",
            "Speak naturally after saying 'Jarvis'.",
            "Example: 'Jarvis, open YouTube and search for Java tutorials.'"
        ], terminal],
        history: ["HISTORY VIEW", "HISTORY // ARCHIVE", "ARCHIVE", "VOICE HISTORY", "ARCHIVE", [
            "Current voice conversation is shown below.",
            "Conversation memory is kept for this browser session."
        ], terminal],
        settings: ["SETTINGS VIEW", "SETTINGS // CONFIG", "CONFIG", "VOICE SETTINGS", "CONFIG", [
            "Voice-first mode is enabled.",
            `Recognition language: ${currentLanguage}`,
            "AI endpoint: " + (JARVIS_CONFIG.AI_ENDPOINT ? "CONNECTED" : "LOCAL FALLBACK")
        ], terminal],
        help: ["HELP SYSTEM", "HELP // ONLINE", "GUIDE", "J.A.R.V.I.S HELP", "ONLINE", [
            "Say 'Jarvis' followed by a request.",
            "You can ask for time, date, calculations, websites and searches.",
            "For open-ended questions, connect an AI endpoint in script.js."
        ], terminal]
    };

    const d = data[panelName];
    if (!d) return;
    statusText.textContent = d[0];
    coreStatus.textContent = d[1];
    aiMode.textContent = d[2];
    terminal.classList.toggle("history-mode", panelName === "history");
    terminal.classList.toggle("help-mode", panelName === "help");
    terminal.classList.toggle("settings-mode", panelName === "settings");
    if (panelName === "history") {
        renderHistory();
    } else if (panelName === "help") {
        renderHelp();
    } else if (panelName === "settings") {
        renderSettings();
    } else {
        showTerminal(d[3], d[4], d[5]);
    }
    focusPanel(d[6]);
}

navItems.forEach(item => {
    item.addEventListener("click", () => {
        activateNavigation(item);
        handleNavigation(item.dataset.panel);
    });
});

// CORE interaction: selecting CORE triggers a short visual pulse on the central HUD.
if (jarvisCore) {
    jarvisCore.addEventListener("click", () => {
        jarvisCore.classList.remove("core-selected");
        void jarvisCore.offsetWidth;
        jarvisCore.classList.add("core-selected");
        setTimeout(() => jarvisCore.classList.remove("core-selected"), 900);
    });
}

/* ---------------- VOICE UI ---------------- */
function setVoiceState(state, text = null) {
    voiceStatus.classList.remove("listening", "speaking", "error", "awake");
    if (state) voiceStatus.classList.add(state);

    if (text === null) {
        if (state === "listening") text = getVoiceText("listening");
        else if (state === "awake") text = getVoiceText("active");
        else if (state === "speaking") text = getVoiceText("speaking");
        else text = getVoiceText("standby");
    }

    voiceStatusText.textContent = text;

    if (state === "listening" || state === "awake") {
        statusText.textContent = state === "awake" ? "JARVIS ACTIVE" : "LISTENING";
        coreStatus.textContent = "VOICE CHANNEL // ACTIVE";
        aiMode.textContent = "LISTEN";
        jarvisCore.classList.add("voice-listening");
        jarvisCore.classList.remove("voice-speaking");
    } else if (state === "speaking") {
        statusText.textContent = "SPEAKING";
        coreStatus.textContent = "VOICE CHANNEL // OUTPUT";
        aiMode.textContent = "SPEAK";
        jarvisCore.classList.remove("voice-listening");
        jarvisCore.classList.add("voice-speaking");
    } else if (state === "error") {
        statusText.textContent = "VOICE ERROR";
        aiMode.textContent = "ERROR";
        jarvisCore.classList.remove("voice-listening", "voice-speaking");
    } else {
        statusText.textContent = "VOICE SYSTEM READY";
        coreStatus.textContent = "NEURAL CORE // STANDBY";
        aiMode.textContent = "VOICE";
        jarvisCore.classList.remove("voice-listening", "voice-speaking");
    }
}

function normalize(text) {
    return String(text)
        .toLowerCase()
        .replace(/[!?.,;:]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function extractWakeRequest(transcript) {
    const original = String(transcript || "").trim();
    const normalized = normalize(original);
    const wakePatterns = [
        /\bjarvis\b/i, /\bj\s*a\s*r\s*v\s*i\s*s\b/i, /\bjar\s*vis\b/i,
        /\bjar\s*is\b/i, /\bjervis\b/i, /जार्विस/i, /जारविस/i, /जर्विस/i,
        /جارڤيس/i, /جارڤز/i, /ジャービス/i, /ジャーヴィス/i, /자비스/i,
        /贾维斯/i, /杰维斯/i
    ];
    for (const pattern of wakePatterns) {
        if (pattern.test(original)) return original.replace(pattern, "").trim();
    }
    const compact = normalized.replace(/\s+/g, "");
    if (compact.includes("jarvis") || compact.includes("jervis")) {
        return original.replace(/j\s*a\s*r\s*v\s*i\s*s|j\s*e\s*r\s*v\s*i\s*s|jar\s*vis|jar\s*is/ig, "").trim();
    }
    return null;
}

function startWakeWindow() {
    jarvisAwake = true;
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(() => {
        jarvisAwake = false;
        if (!isSpeaking) setVoiceState("listening");
    }, JARVIS_CONFIG.WAKE_TIMEOUT);
    setVoiceState("awake");
}

function initializeVoiceEngine() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        setVoiceState("error", "VOICE RECOGNITION NOT SUPPORTED");
        addTerminalLine("Use Chrome or Edge for browser voice recognition.", "error");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = currentLanguage;

    recognition.onstart = () => {
        isListening = true;
        setVoiceState(jarvisAwake ? "awake" : "listening");
        terminalStatus.textContent = "LISTENING";
    };

    recognition.onresult = async (event) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const piece = event.results[i][0].transcript;
            if (event.results[i].isFinal) finalTranscript += piece;
            else interimTranscript += piece;
        }

        const liveText = (finalTranscript || interimTranscript).trim();
        if (liveText) voiceTranscript.textContent = liveText;
        if (!finalTranscript.trim()) return;

        const transcript = finalTranscript.trim();
        if (transcript === lastTranscript) return;
        lastTranscript = transcript;

        const wakeRequest = extractWakeRequest(transcript);

        if (wakeRequest !== null) {
            startWakeWindow();
            if (wakeRequest) {
                await processVoiceRequest(wakeRequest);
                jarvisAwake = false;
                clearTimeout(wakeTimer);
            } else {
                await speakText("Hello sir. I am listening.", currentLanguage);
            }
            return;
        }

        if (jarvisAwake) {
            clearTimeout(wakeTimer);
            jarvisAwake = false;
            await processVoiceRequest(transcript);
        }
    };

    recognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            setVoiceState("error", "MICROPHONE PERMISSION REQUIRED");
            addTerminalLine("Allow microphone access to use voice commands.", "error");
            voiceEnabled = false;
            return;
        }
        if (event.error !== "aborted" && event.error !== "no-speech") {
            setVoiceState("error", "VOICE RECONNECTING...");
        }
    };

    recognition.onend = () => {
        isListening = false;
        if (voiceEnabled) scheduleRecognitionRestart();
    };

    // Voice is automatic: there is intentionally no microphone button in the UI.
    // The browser will request microphone permission when recognition starts.
    voiceEnabled = true;
    setVoiceState(null, getVoiceText("sayJarvis"));
    setTimeout(() => startRecognition(), 250);
}

function startRecognition() {
    if (!recognition || isListening) return;
    try {
        recognition.lang = currentLanguage;
        recognition.start();
    } catch (_) {
        // Browser may reject a duplicate start; onend will recover.
    }
}

function stopRecognition() {
    clearTimeout(restartTimer);
    clearTimeout(wakeTimer);
    jarvisAwake = false;
    if (!recognition) return;
    try { recognition.stop(); } catch (_) {}
}

function scheduleRecognitionRestart() {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
        if (voiceEnabled && !isSpeaking) startRecognition();
    }, 600);
}

/* ---------------- SPEECH OUTPUT ---------------- */
function pickVoice(language) {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    const base = language.toLowerCase().split("-")[0];
    return voices.find(v => v.lang.toLowerCase() === language.toLowerCase()) ||
           voices.find(v => v.lang.toLowerCase().startsWith(base)) ||
           voices[0];
}

function speakText(message, language = currentLanguage) {
    return new Promise(resolve => {
        if (!("speechSynthesis" in window)) {
            resolve();
            return;
        }

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        const voice = pickVoice(language);
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang || language;
        utterance.rate = 0.92;
        utterance.pitch = 0.82;
        utterance.volume = 1;

        isSpeaking = true;
        setVoiceState("speaking", "SPEAKING...");
        terminalStatus.textContent = "OUTPUT";

        utterance.onend = () => {
            isSpeaking = false;
            setVoiceState(null);
            terminalStatus.textContent = "VOICE STANDBY";
            if (voiceEnabled && !isListening) scheduleRecognitionRestart();
            resolve();
        };
        utterance.onerror = () => {
            isSpeaking = false;
            setVoiceState(null);
            resolve();
        };

        window.speechSynthesis.speak(utterance);
    });
}

/* ---------------- REQUEST ENGINE ---------------- */
async function processVoiceRequest(request) {
    const clean = request.trim();
    if (!clean) return;

    addTerminalLine(clean, "user");
    voiceTranscript.textContent = clean;
    statusText.textContent = "PROCESSING";
    coreStatus.textContent = "NEURAL CORE // PROCESSING";
    aiMode.textContent = "THINK";
    terminalStatus.textContent = "PROCESSING";
    jarvisCore.classList.add("processing");

    conversation.push({ role: "user", content: clean });
    saveJarvisSession();
    if (conversation.length > 20) conversation = conversation.slice(-20);
    if (activePanelName === "history") renderHistory();

    const local = await runLocalAction(clean);
    if (local?.handled) {
        jarvisCore.classList.remove("processing");
        addTerminalLine(local.text, "jarvis");
        conversation.push({ role: "assistant", content: local.text });
        saveJarvisSession();
        if (activePanelName === "history") renderHistory();
        await speakText(local.text, local.language || currentLanguage);
        return;
    }

    if (JARVIS_CONFIG.AI_ENDPOINT) {
        try {
            const answer = await askAI(clean);
            jarvisCore.classList.remove("processing");
            addTerminalLine(answer.text, "jarvis");
            conversation.push({ role: "assistant", content: answer.text });
            saveJarvisSession();
            if (activePanelName === "history") renderHistory();
            if (jarvisSettings.voiceResponses) await speakText(answer.text, answer.language || currentLanguage);
            return;
        } catch (error) {
            console.error("JARVIS AI error:", error);
            const message = "I could not reach my intelligence service. Please check the AI endpoint connection.";
            jarvisCore.classList.remove("processing");
            addTerminalLine(message, "error");
            if (jarvisSettings.voiceResponses) await speakText(message);
            return;
        }
    }

    const fallback = localizedResponse(9);
    jarvisCore.classList.remove("processing");
    addTerminalLine(fallback, "jarvis");
    conversation.push({ role: "assistant", content: fallback });
    saveJarvisSession();
    if (activePanelName === "history") renderHistory();
    if (jarvisSettings.voiceResponses) await speakText(fallback);
}

async function askAI(userText) {
    const payload = {
        model: JARVIS_CONFIG.AI_MODEL,
        messages: [
            {
                role: "system",
                content: `You are J.A.R.V.I.S, a concise voice assistant. Reply ONLY in the currently selected JARVIS language. Do not switch languages based on the user's spoken language. Be natural and helpful. The user is speaking to a browser assistant. Current time: ${new Date().toString()}.`
            },
            ...conversation.slice(-10)
        ],
        input: userText
    };

    const headers = { "Content-Type": "application/json" };
    if (JARVIS_CONFIG.AI_API_KEY) {
        headers.Authorization = `Bearer ${JARVIS_CONFIG.AI_API_KEY}`;
    }

    const response = await fetch(JARVIS_CONFIG.AI_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
    const data = await response.json();

    const text = data.text ||
        data.output_text ||
        data.answer ||
        data?.choices?.[0]?.message?.content ||
        data?.candidates?.[0]?.content?.parts?.map(p => p.text).join(" ");

    if (!text) throw new Error("AI response did not contain text");
    return { text: String(text), language: detectLanguageHint(userText) };
}

/* ---------------- LOCAL VOICE ACTIONS ---------------- */
async function runLocalAction(request) {
    const c=normalize(request), language=currentLanguage;
    if(/^(hello|hi|hey|namaste|नमस्ते|नमस्कार|ਸਤ ਸ੍ਰੀ ਅਕਾਲ|bonjour|hallo|hola|ciao|olá|こんにちは|안녕하세요|здравствуйте|مرحبا|merhaba|halo|xin chào)\b/i.test(c)) return {handled:true,text:localizedResponse(0),language};
    if(/(what.*time|time.*is it|kitne baje|समय|टाइम|ਕਿੰਨੇ ਵਜੇ|वेळ|সময়|સમય|நேரம்|సమయం|ಸಮಯ|സമയം|وقت|heure|uhr|hora|ora|现在.*时间|何時|시간|время|الوقت|saat|sekarang.*jam|giờ)/i.test(c)){const t=new Date().toLocaleTimeString(currentLanguage,{hour:"numeric",minute:"2-digit"});return {handled:true,text:localizedResponse(1,t),language};}
    if(/(today.*date|what.*date|aaj.*tarikh|आज.*तारीख|ਅੱਜ.*ਤਾਰੀਖ|আজ.*তারিখ|આજ.*તારીખ|இன்று.*தேதி|ఈ రోజు.*తేదీ|ಇಂದು.*ದಿನಾಂಕ|ഇന്ന്.*തീയതി|آج.*تاریخ|date|aujourd'hui|heute|hoy|oggi|hoje|今天|今日|오늘|сегодня|اليوم|bugün|hari ini|hôm nay)/i.test(c)){const d=new Date().toLocaleDateString(currentLanguage,{weekday:"long",month:"long",day:"numeric",year:"numeric"});return {handled:true,text:localizedResponse(2,d),language};}
    if(/(are you online|system status|system check|status report|क्या आप ऑनलाइन|ऑनलाइन हो|online|en ligne|在线|オンライン|온라인|в сети|متصل|çevrimiçi|trực tuyến)/i.test(c)) return {handled:true,text:localizedResponse(3),language};
    const math=extractMath(c); if(math!==null) return {handled:true,text:localizedResponse(8,math),language};
    const open=c.match(/^(?:please\s+)?(?:open|launch|start|खोलो|खोलना|खोलिए|उघड|খুলুন|ખોલો|திற|తెరువు|ತೆರೆ|തുറക്കുക|کھولو|ouvrir|öffnen|abrir|apri|打开|開いて|열어|открой|افتح|aç|buka|mở)\s+(.+)$/i);
    if(open){const target=open[1].trim(),key=target.replace(/\s+/g,"").toLowerCase(),sites={google:"https://www.google.com",youtube:"https://www.youtube.com",github:"https://github.com",gmail:"https://mail.google.com",instagram:"https://www.instagram.com",wikipedia:"https://www.wikipedia.org",reddit:"https://www.reddit.com",chatgpt:"https://chatgpt.com"};if(sites[key]){const response = localizedResponse(5,target); navigateExternal(sites[key], response); return {handled:true,text:response,language};}}
    const yt=c.match(/^(?:search|find|look up|खोजो|ढूंढो|தேடு|వెతుకు|ಹುಡುಕು|തിരയുക|ابحث|rechercher|suchen|buscar|cerca|pesquisar|搜索|検索|검색|найди|ara|cari|tìm)\s+(?:youtube|यूट्यूब|ਯੂਟਿਊਬ|ইউটিউব|யூடியூப்|యూట్యూబ్|ಯೂಟ್ಯೂಬ್|യൂട്യൂബ്|یوٹیوب)\s+(?:for|के लिए|ਲਈ|জন্য|க்காக|కోసం|ಗಾಗಿ|വേണ്ടി|کے لیے|pour|für|para|per)?\s*(.+)$/i);
    if(yt){const q=yt[1].trim();const response = localizedResponse(7,q); navigateExternal("https://www.youtube.com/results?search_query="+encodeURIComponent(q), response); return {handled:true,text:response,language};}
    const search=c.match(/^(?:search|find|look up|खोजो|ढूंढो|தேடு|వెతుకు|ಹುಡುಕು|തിരയുക|ابحث|rechercher|suchen|buscar|cerca|pesquisar|搜索|検索|검색|найди|ara|cari|tìm)\s+(?:google\s+)?(?:for|के लिए|ਲਈ|জন্য|க்காக|కోసం|ಗಾಗಿ|വേണ്ടി|کے لیے|pour|für|para|per)?\s*(.+)$/i);
    if(search){const q=search[1].trim();const response = localizedResponse(6,q); navigateExternal("https://www.google.com/search?q="+encodeURIComponent(q), response); return {handled:true,text:response,language};}
    return {handled:false};
}

function extractMath(text) {
    const looksLikeMath = /(?:calculate|what is|solve|plus|minus|times|multiplied|divided|percent|\d\s*[+\-*/]\s*\d)/i.test(text);
    if (!looksLikeMath) return null;

    const value = text
        .toLowerCase()
        .replace(/^(calculate|what is|solve)\s+/i, "")
        .replace(/\bplus\b/g, "+")
        .replace(/\bminus\b/g, "-")
        .replace(/\btimes\b/g, "*")
        .replace(/\bmultiplied by\b/g, "*")
        .replace(/\bdivided by\b/g, "/")
        .replace(/\bover\b/g, "/")
        .replace(/\binto\b/g, "*")
        .replace(/\bmod\b/g, "%")
        .replace(/\bpercent\b/g, "/100")
        .replace(/[^0-9+\-*/().%\s]/g, "")
        .trim();

    if (!value || !/^[0-9+\-*/%.()\s]+$/.test(value)) return null;

    try {
        const result = Function('"use strict"; return (' + value + ')')();
        return Number.isFinite(result) ? result : null;
    } catch (_) {
        return null;
    }
}

/* A practical browser-only hint. The AI endpoint should be used for
   complete language detection and multilingual reasoning. */
function detectLanguageHint(text) { return currentLanguage; }

const LANGUAGE_PACKS = {"en-IN":["Hello sir. JARVIS is online and listening.","The current time is {x}.","Today is {x}.","All JARVIS voice and interface systems are operational.","Hello sir. I am listening.","Opening {x}.","Searching Google for {x}.","Searching YouTube for {x}.","The answer is {x}.","I understood the command, but that action is not available yet."],"hi-IN":["नमस्ते सर। JARVIS ऑनलाइन है और आपकी बात सुन रहा है।","अभी समय {x} है।","आज {x} है।","JARVIS के सभी वॉइस और इंटरफेस सिस्टम सही तरह से काम कर रहे हैं।","जी सर। मैं सुन रहा हूँ।","{x} खोला जा रहा है।","{x} के लिए Google पर खोज रहा हूँ।","{x} के लिए YouTube पर खोज रहा हूँ।","उत्तर {x} है।","मैंने कमांड समझ ली, लेकिन यह कार्य अभी उपलब्ध नहीं है।"],"pa-IN":["ਸਤ ਸ੍ਰੀ ਅਕਾਲ ਸਰ। JARVIS ਆਨਲਾਈਨ ਹੈ ਅਤੇ ਤੁਹਾਡੀ ਗੱਲ ਸੁਣ ਰਿਹਾ ਹੈ।","ਹੁਣ ਸਮਾਂ {x} ਹੈ।","ਅੱਜ {x} ਹੈ।","JARVIS ਦੇ ਸਾਰੇ ਵੌਇਸ ਅਤੇ ਇੰਟਰਫੇਸ ਸਿਸਟਮ ਠੀਕ ਕੰਮ ਕਰ ਰਹੇ ਹਨ।","ਜੀ ਸਰ। ਮੈਂ ਸੁਣ ਰਿਹਾ ਹਾਂ।","{x} ਖੋਲ੍ਹਿਆ ਜਾ ਰਿਹਾ ਹੈ।","{x} ਲਈ Google ਤੇ ਖੋਜ ਕਰ ਰਿਹਾ ਹਾਂ।","{x} ਲਈ YouTube ਤੇ ਖੋਜ ਕਰ ਰਿਹਾ ਹਾਂ।","ਜਵਾਬ {x} ਹੈ।","ਮੈਂ ਕਮਾਂਡ ਸਮਝ ਲਈ ਹੈ, ਪਰ ਇਹ ਕੰਮ ਹਾਲੇ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।"],"mr-IN":["नमस्कार सर. JARVIS ऑनलाइन आहे आणि तुमचे ऐकत आहे.","सध्या वेळ {x} आहे.","आज {x} आहे.","JARVIS चे सर्व व्हॉइस आणि इंटरफेस सिस्टम व्यवस्थित कार्यरत आहेत.","हो सर. मी ऐकत आहे.","{x} उघडत आहे.","{x} साठी Google वर शोधत आहे.","{x} साठी YouTube वर शोधत आहे.","उत्तर {x} आहे.","कमांड समजली, पण हे कार्य सध्या उपलब्ध नाही."],"bn-IN":["নমস্কার স্যার। JARVIS অনলাইন এবং আপনার কথা শুনছে।","এখন সময় {x}।","আজ {x}।","JARVIS-এর সব ভয়েস এবং ইন্টারফেস সিস্টেম ঠিকভাবে কাজ করছে।","জি স্যার। আমি শুনছি।","{x} খোলা হচ্ছে।","{x}-এর জন্য Google-এ খুঁজছি।","{x}-এর জন্য YouTube-এ খুঁজছি।","উত্তর হল {x}।","আমি কমান্ড বুঝেছি, কিন্তু এই কাজটি এখনো উপলব্ধ নয়।"],"gu-IN":["નમસ્તે સર. JARVIS ઓનલાઇન છે અને તમારી વાત સાંભળી રહ્યું છે.","હાલનો સમય {x} છે.","આજે {x} છે.","JARVISની બધી વૉઇસ અને ઇન્ટરફેસ સિસ્ટમ્સ યોગ્ય રીતે કાર્યરત છે.","જી સર. હું સાંભળી રહ્યો છું.","{x} ખોલી રહ્યું છું.","{x} માટે Google પર શોધી રહ્યો છું.","{x} માટે YouTube પર શોધી રહ્યો છું.","જવાબ {x} છે.","કમાન્ડ સમજી ગયો, પરંતુ આ કાર્ય હાલમાં ઉપલબ્ધ નથી."],"ta-IN":["வணக்கம் சார். JARVIS ஆன்லைனில் உள்ளது, உங்கள் குரலைக் கேட்கிறது.","தற்போதைய நேரம் {x}.","இன்று {x}.","JARVIS-ன் அனைத்து குரல் மற்றும் இடைமுக அமைப்புகளும் இயங்குகின்றன.","சரி சார். நான் கேட்கிறேன்.","{x} திறக்கப்படுகிறது.","{x} க்காக Google-ல் தேடுகிறேன்.","{x} க்காக YouTube-ல் தேடுகிறேன்.","பதில் {x}.","கட்டளையை புரிந்துகொண்டேன், ஆனால் இந்த செயல் தற்போது கிடைக்கவில்லை."],"te-IN":["నమస్తే సర్. JARVIS ఆన్‌లైన్‌లో ఉంది మరియు మీ మాట వింటోంది.","ప్రస్తుతం సమయం {x}.","ఈ రోజు {x}.","JARVIS వాయిస్ మరియు ఇంటర్‌ఫేస్ సిస్టమ్‌లు అన్నీ సక్రమంగా పనిచేస్తున్నాయి.","అవును సర్. నేను వింటున్నాను.","{x} తెరవబడుతోంది.","{x} కోసం Googleలో వెతుకుతున్నాను.","{x} కోసం YouTubeలో వెతుకుతున్నాను.","సమాధానం {x}.","కమాండ్ అర్థమైంది, కానీ ఈ చర్య ప్రస్తుతం అందుబాటులో లేదు."],"kn-IN":["ನಮಸ್ಕಾರ ಸರ್. JARVIS ಆನ್‌ಲೈನ್‌ನಲ್ಲಿದೆ ಮತ್ತು ನಿಮ್ಮ ಮಾತು ಕೇಳುತ್ತಿದೆ.","ಈಗಿನ ಸಮಯ {x}.","ಇಂದು {x}.","JARVIS ನ ಎಲ್ಲಾ ಧ್ವನಿ ಮತ್ತು ಇಂಟರ್ಫೇಸ್ ವ್ಯವಸ್ಥೆಗಳು ಸರಿಯಾಗಿ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತಿವೆ.","ಹೌದು ಸರ್. ನಾನು ಕೇಳುತ್ತಿದ್ದೇನೆ.","{x} ತೆರೆಯಲಾಗುತ್ತಿದೆ.","{x} ಗಾಗಿ Google ನಲ್ಲಿ ಹುಡುಕುತ್ತಿದ್ದೇನೆ.","{x} ಗಾಗಿ YouTube ನಲ್ಲಿ ಹುಡುಕುತ್ತಿದ್ದೇನೆ.","ಉತ್ತರ {x}.","ಕಮಾಂಡ್ ಅರ್ಥವಾಗಿದೆ, ಆದರೆ ಈ ಕಾರ್ಯ ಈಗ ಲಭ್ಯವಿಲ್ಲ."],"ml-IN":["നമസ്കാരം സർ. JARVIS ഓൺലൈനിലാണ്, നിങ്ങളുടെ വാക്കുകൾ കേൾക്കുന്നു.","ഇപ്പോൾ സമയം {x} ആണ്.","ഇന്ന് {x} ആണ്.","JARVIS-ന്റെ എല്ലാ വോയ്സ്, ഇന്റർഫേസ് സിസ്റ്റങ്ങളും പ്രവർത്തിക്കുന്നു.","ശരി സർ. ഞാൻ കേൾക്കുന്നു.","{x} തുറക്കുന്നു.","{x} നായി Google-ൽ തിരയുന്നു.","{x} നായി YouTube-ൽ തിരയുന്നു.","ഉത്തരം {x} ആണ്.","കമാൻഡ് മനസ്സിലായി, പക്ഷേ ഈ പ്രവർത്തനം ഇപ്പോൾ ലഭ്യമല്ല."],"or-IN":["ନମସ୍କାର ସାର। JARVIS ଅନଲାଇନ୍ ଅଛି ଏବଂ ଆପଣଙ୍କ କଥା ଶୁଣୁଛି।","ବର୍ତ୍ତମାନ ସମୟ {x}।","ଆଜି {x}।","JARVIS ର ସମସ୍ତ ଭଏସ୍ ଏବଂ ଇଣ୍ଟରଫେସ୍ ସିଷ୍ଟମ୍ ସଠିକ୍ ଭାବେ କାମ କରୁଛି।","ହଁ ସାର। ମୁଁ ଶୁଣୁଛି।","{x} ଖୋଲୁଛି।","{x} ପାଇଁ Google ରେ ଖୋଜୁଛି।","{x} ପାଇଁ YouTube ରେ ଖୋଜୁଛି।","ଉତ୍ତର {x}।","କମାଣ୍ଡ ବୁଝିଲି, କିନ୍ତୁ ଏହି କାର୍ଯ୍ୟ ଏବେ ଉପଲବ୍ଧ ନାହିଁ।"],"as-IN":["নমস্কাৰ ছাৰ। JARVIS অনলাইনত আছে আৰু আপোনাৰ কথা শুনি আছে।","এতিয়া সময় {x}।","আজি {x}।","JARVIS-ৰ সকলো ভইচ আৰু ইণ্টাৰফেচ ছিষ্টেম ঠিকমতে চলি আছে।","হয় ছাৰ। মই শুনি আছোঁ।","{x} খোলা হৈছে।","{x}-ৰ বাবে Google-ত বিচাৰি আছোঁ।","{x}-ৰ বাবে YouTube-ত বিচাৰি আছোঁ।","উত্তৰ {x}।","মই কমাণ্ডটো বুজিছোঁ, কিন্তু এই কামটো এতিয়া উপলব্ধ নহয়।"],"ur-PK":["السلام علیکم سر۔ JARVIS آن لائن ہے اور آپ کی بات سن رہا ہے۔","اس وقت {x} بجے ہیں۔","آج {x} ہے۔","JARVIS کے تمام وائس اور انٹرفیس سسٹمز درست کام کر رہے ہیں۔","جی سر۔ میں سن رہا ہوں۔","{x} کھولا جا رہا ہے۔","{x} کے لیے Google پر تلاش کر رہا ہوں۔","{x} کے لیے YouTube پر تلاش کر رہا ہوں۔","جواب {x} ہے۔","میں نے کمانڈ سمجھ لی، لیکن یہ عمل ابھی دستیاب نہیں ہے۔"],"fr-FR":["Bonjour monsieur. JARVIS est en ligne et vous écoute.","Il est actuellement {x}.","Nous sommes le {x}.","Tous les systèmes vocaux et d’interface de JARVIS fonctionnent correctement.","Oui monsieur. Je vous écoute.","Ouverture de {x}.","Recherche de {x} sur Google.","Recherche de {x} sur YouTube.","La réponse est {x}.","J’ai compris la commande, mais cette action n’est pas encore disponible."],"de-DE":["Guten Tag. JARVIS ist online und hört zu.","Es ist jetzt {x}.","Heute ist {x}.","Alle Sprach- und Oberflächensysteme von JARVIS funktionieren ordnungsgemäß.","Ja. Ich höre zu.","{x} wird geöffnet.","Ich suche auf Google nach {x}.","Ich suche auf YouTube nach {x}.","Die Antwort ist {x}.","Ich habe den Befehl verstanden, aber diese Aktion ist noch nicht verfügbar."],"es-ES":["Hola señor. JARVIS está en línea y escuchando.","La hora actual es {x}.","Hoy es {x}.","Todos los sistemas de voz e interfaz de JARVIS funcionan correctamente.","Sí, señor. Estoy escuchando.","Abriendo {x}.","Buscando {x} en Google.","Buscando {x} en YouTube.","La respuesta es {x}.","Entendí el comando, pero esta acción todavía no está disponible."],"it-IT":["Buongiorno signore. JARVIS è online e sta ascoltando.","Sono le {x}.","Oggi è {x}.","Tutti i sistemi vocali e di interfaccia di JARVIS funzionano correttamente.","Sì signore. La ascolto.","Apertura di {x}.","Cerco {x} su Google.","Cerco {x} su YouTube.","La risposta è {x}.","Ho capito il comando, ma questa azione non è ancora disponibile."],"pt-BR":["Olá senhor. JARVIS está online e ouvindo.","Agora são {x}.","Hoje é {x}.","Todos os sistemas de voz e interface do JARVIS estão funcionando corretamente.","Sim, senhor. Estou ouvindo.","Abrindo {x}.","Pesquisando {x} no Google.","Pesquisando {x} no YouTube.","A resposta é {x}.","Entendi o comando, mas esta ação ainda não está disponível."],"zh-CN":["您好先生。JARVIS 已上线，正在听您说话。","现在时间是 {x}。","今天是 {x}。","JARVIS 的语音和界面系统均运行正常。","好的先生，我在听。","正在打开 {x}。","正在 Google 搜索 {x}。","正在 YouTube 搜索 {x}。","答案是 {x}。","我理解了您的指令，但此操作目前不可用。"],"ja-JP":["こんにちは。JARVISはオンラインで、あなたの声を聞いています。","現在の時刻は{x}です。","今日は{x}です。","JARVISの音声とインターフェースは正常に動作しています。","はい。聞いています。","{x}を開きます。","Googleで{x}を検索します。","YouTubeで{x}を検索します。","答えは{x}です。","コマンドを理解しましたが、この操作はまだ利用できません。"],"ko-KR":["안녕하세요. JARVIS가 온라인 상태이며 듣고 있습니다.","현재 시간은 {x}입니다.","오늘은 {x}입니다.","JARVIS의 음성 및 인터페이스 시스템이 정상적으로 작동하고 있습니다.","네. 듣고 있습니다.","{x}을(를) 엽니다.","Google에서 {x}을(를) 검색합니다.","YouTube에서 {x}을(를) 검색합니다.","답은 {x}입니다.","명령을 이해했지만 이 작업은 아직 사용할 수 없습니다."],"ru-RU":["Здравствуйте. JARVIS в сети и слушает вас.","Сейчас {x}.","Сегодня {x}.","Все голосовые системы и интерфейс JARVIS работают нормально.","Да. Я слушаю.","Открываю {x}.","Ищу {x} в Google.","Ищу {x} на YouTube.","Ответ: {x}.","Я понял команду, но это действие пока недоступно."],"ar-SA":["مرحباً سيدي. جارڤيس متصل ويستمع إليك.","الوقت الآن {x}.","اليوم {x}.","جميع أنظمة الصوت والواجهة في جارڤيس تعمل بشكل صحيح.","نعم سيدي. أنا أستمع.","جارٍ فتح {x}.","أبحث عن {x} في Google.","أبحث عن {x} في YouTube.","الإجابة هي {x}.","فهمت الأمر، لكن هذا الإجراء غير متاح حالياً."],"tr-TR":["Merhaba efendim. JARVIS çevrimiçi ve sizi dinliyor.","Şu an saat {x}.","Bugün {x}.","JARVIS ses ve arayüz sistemlerinin tümü düzgün çalışıyor.","Evet efendim. Dinliyorum.","{x} açılıyor.","Google'da {x} aranıyor.","YouTube'da {x} aranıyor.","Cevap {x}.","Komutu anladım, ancak bu işlem henüz kullanılamıyor."],"id-ID":["Halo. JARVIS sedang online dan mendengarkan.","Sekarang pukul {x}.","Hari ini {x}.","Semua sistem suara dan antarmuka JARVIS berfungsi dengan baik.","Ya. Saya mendengarkan.","Membuka {x}.","Mencari {x} di Google.","Mencari {x} di YouTube.","Jawabannya adalah {x}.","Saya memahami perintahnya, tetapi tindakan ini belum tersedia."],"vi-VN":["Xin chào. JARVIS đang trực tuyến và đang lắng nghe.","Bây giờ là {x}.","Hôm nay là {x}.","Tất cả hệ thống giọng nói và giao diện của JARVIS đang hoạt động bình thường.","Vâng. Tôi đang nghe.","Đang mở {x}.","Đang tìm {x} trên Google.","Đang tìm {x} trên YouTube.","Câu trả lời là {x}.","Tôi hiểu lệnh, nhưng thao tác này hiện chưa khả dụng."]};
function localizedResponse(index,value=""){const p=LANGUAGE_PACKS[currentLanguage]||LANGUAGE_PACKS["en-IN"];return String(p[index]||LANGUAGE_PACKS["en-IN"][index]).replaceAll("{x}",String(value));}

/* ---------------- RESET / CLEAR ---------------- */
function clearTerminal() {
    terminalBody.innerHTML = "";
    addTerminalLine("Voice history cleared. JARVIS is ready.");
    terminalTitle.textContent = "J.A.R.V.I.S VOICE CHANNEL";
    terminalStatus.textContent = "VOICE STANDBY";
}

function resetJarvis() {
    const coreButton = document.querySelector('.nav-item[data-panel="core"]');
    if (coreButton) {
        activateNavigation(coreButton);
        handleNavigation("core");
    }
    conversation = [];
    saveJarvisSession();
    jarvisAwake = false;
    addTerminalLine("J.A.R.V.I.S memory reset for this session.");
}

/* ---------------- START ---------------- */
updateClock();
setInterval(updateClock, 1000);
runStartup();

window.speechSynthesis?.addEventListener?.("voiceschanged", () => {
    // Voices are loaded asynchronously by some browsers.
});

window.addEventListener("load", () => {
    const nav = document.getElementById("nav");
    const firstItem = document.querySelector(".nav-item.active");
    if (nav) nav.scrollLeft = 0;
    if (firstItem) activateNavigation(firstItem);
});

// The navigation is intentionally horizontally scrollable. Mouse-wheel
// movement over it is mapped to horizontal scrolling so both CORE and
// STUDY can be reached without adding another control.
const navScroller = document.getElementById("nav");
if (navScroller) {
    navScroller.addEventListener("wheel", (event) => {
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.preventDefault();
            navScroller.scrollLeft += event.deltaY;
        }
    }, { passive: false });

    navScroller.addEventListener("scroll", () => {
        const active = document.querySelector(".nav-item.active");
        if (active && navActiveLine) {
            const itemRect = active.getBoundingClientRect();
            const navRect = navScroller.getBoundingClientRect();
            navActiveLine.style.left =
                (itemRect.left - navRect.left + itemRect.width / 2) + "px";
        }
    });
}

/* Escape stops spoken output but does not create a text command system. */
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        isSpeaking = false;
        setVoiceState(null);
    }
});

/* ============================================================
   REQUIREMENTS PATCH — PRESERVE ORIGINAL + ADD FEATURES
   ============================================================ */

// 1) Typed commands are ALWAYS accepted as Unicode. The language selector
// never blocks typing. It only controls the browser voice locale/TTS.
const commandForm = document.getElementById("command-form");
const commandInput = document.getElementById("command-input");
const clearButton = document.getElementById("clear-button");
const languageSelect = document.getElementById("voice-language");

if (languageSelect) {
    languageSelect.value = [...languageSelect.options].some(o => o.value === currentLanguage)
        ? currentLanguage : "en-IN";
    currentLanguage = languageSelect.value;
    languageSelect.addEventListener("change", () => {
        currentLanguage = languageSelect.value;
        if (recognition) recognition.lang = currentLanguage;
        if (!jarvisAwake) setVoiceState(null);
        addTerminalLine(`Voice locale changed to ${languageSelect.options[languageSelect.selectedIndex].text}.`);
    });
}

if (commandForm && commandInput) {
    commandForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const value = commandInput.value;
        if (!value.trim()) return;
        // Do NOT validate language. Preserve exactly what the user typed.
        await processVoiceRequest(value);
        commandInput.value = "";
        commandInput.focus();
    });
}

if (clearButton) clearButton.addEventListener("click", clearTerminal);

document.querySelectorAll(".quick-command").forEach(button => {
    button.addEventListener("click", async () => {
        const command = button.dataset.command || "";
        if (commandInput) commandInput.value = command;
        await processVoiceRequest(command);
        if (commandInput) commandInput.value = "";
    });
});

// 2) Real browser location + Open-Meteo weather (no API key required).
const panelWeather = document.getElementById("panel-weather");
const panelLocation = document.getElementById("panel-location");
const intelLocation = document.getElementById("intel-location");
const intelCondition = document.getElementById("intel-condition");
const intelTemp = document.getElementById("intel-temp");
const intelFeels = document.getElementById("intel-feels");
const intelHumidity = document.getElementById("intel-humidity");
const intelWind = document.getElementById("intel-wind");
const intelUv = document.getElementById("intel-uv");
const intelSunrise = document.getElementById("intel-sunrise");
const intelSunset = document.getElementById("intel-sunset");

const WEATHER_CODES = {
    0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Rime fog",
    51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",
    71:"Light snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Rain showers",82:"Heavy showers",
    95:"Thunderstorm",96:"Thunderstorm + hail",99:"Thunderstorm + hail"
};
let jarvisLocation = null;

function setIntelText(el, value) { if (el) el.textContent = value; }
function formatClock(value) {
    if (!value) return "--:--";
    const d = new Date(value);
    return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
}

async function loadWeather(lat, lon, place = "YOUR LOCATION") {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,uv_index&daily=sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
        const data = await response.json();
        const c = data.current || {};
        setIntelText(panelWeather, Number.isFinite(c.temperature_2m) ? `${Math.round(c.temperature_2m)}°C` : "UNAVAILABLE");
        setIntelText(panelLocation, place);
        setIntelText(intelLocation, place);
        setIntelText(intelCondition, WEATHER_CODES[c.weather_code] || "Unknown");
        setIntelText(intelTemp, Number.isFinite(c.temperature_2m) ? `${Math.round(c.temperature_2m)}°C` : "--°C");
        setIntelText(intelFeels, Number.isFinite(c.apparent_temperature) ? `${Math.round(c.apparent_temperature)}°C` : "--°C");
        setIntelText(intelHumidity, Number.isFinite(c.relative_humidity_2m) ? `${c.relative_humidity_2m}%` : "--%");
        setIntelText(intelWind, Number.isFinite(c.wind_speed_10m) ? `${Math.round(c.wind_speed_10m)} km/h` : "-- km/h");
        setIntelText(intelUv, Number.isFinite(c.uv_index) ? String(c.uv_index) : "--");
        setIntelText(intelSunrise, formatClock(data.daily?.sunrise?.[0]));
        setIntelText(intelSunset, formatClock(data.daily?.sunset?.[0]));
        return data;
    } catch (error) {
        setIntelText(panelWeather, "UNAVAILABLE");
        setIntelText(intelCondition, "UNAVAILABLE");
        addTerminalLine("Weather service unavailable right now.", "error");
        return null;
    }
}

async function reverseGeocode(lat, lon) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
        const response = await fetch(url, {headers:{"Accept":"application/json"}});
        if (!response.ok) throw new Error("Reverse geocode failed");
        const data = await response.json();
        const a = data.address || {};
        return a.city || a.town || a.village || a.municipality || a.county || data.display_name || "UNAVAILABLE";
    } catch (_) { return "UNAVAILABLE"; }
}

function initIntelligence() {
    if (!navigator.geolocation) {
        setIntelText(intelLocation, "GEOLOCATION UNSUPPORTED");
        setIntelText(panelLocation, "GEOLOCATION UNSUPPORTED");
        return;
    }
    setIntelText(intelLocation, "LOCATING...");
    setIntelText(panelLocation, "LOCATING...");
    navigator.geolocation.getCurrentPosition(async position => {
        const {latitude, longitude} = position.coords;
        jarvisLocation = {latitude, longitude};
        const place = await reverseGeocode(latitude, longitude);
        await loadWeather(latitude, longitude, place);
    }, () => {
        setIntelText(intelLocation, "Awaiting GPS permission");
        setIntelText(panelLocation, "Awaiting GPS permission");
        setIntelText(intelCondition, "LOCATION PERMISSION NEEDED");
    }, {enableHighAccuracy:true, timeout:10000, maximumAge:300000});
}

// 3) Intelligence tabs: each module opens its own information view.
const intelDetail = document.getElementById("intel-detail");

function intelShell(title, rows, extraClass = "") {
    return `<div class="intel-heading ${extraClass}">${title}</div>
        ${rows.map(([label, value, cls=""]) => `<div class="intel-row"><span>${label}</span><strong class="${cls}">${value}</strong></div>`).join("")}
        <div class="intel-scanline"></div>`;
}

function getOSName() {
    const ua = navigator.userAgent;
    if (/Windows/i.test(ua)) return "Windows";
    if (/Android/i.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
    if (/Mac OS X/i.test(ua)) return "macOS";
    if (/Linux/i.test(ua)) return "Linux";
    return "UNAVAILABLE";
}

function getDeviceType() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "MOBILE" : "DESKTOP";
}

function getBrowserVersion() {
    const ua = navigator.userAgent;
    const match = ua.match(/(Edg|Chrome|Firefox|Version)\/(\d+)/);
    return match ? `${getBrowserName()} ${match[2]}` : getBrowserName();
}

function getBatteryInfo() {
    if (!navigator.getBattery) return Promise.resolve("UNAVAILABLE");
    return navigator.getBattery().then(b => `${Math.round(b.level * 100)}%${b.charging ? " / CHARGING" : ""}`).catch(() => "UNAVAILABLE");
}

async function getPermissionInfo() {
    try {
        if (!navigator.permissions?.query) return "LIMITED";
        const names = ["geolocation", "microphone"];
        const states = await Promise.all(names.map(async name => {
            try { return (await navigator.permissions.query({ name })).state; }
            catch { return "unsupported"; }
        }));
        return states.map((state, i) => `${names[i].toUpperCase()}: ${state.toUpperCase()}`).join(" / ");
    } catch {
        return "LIMITED";
    }
}

async function showIntelModule(type) {
    if (!intelDetail) return;

    if (type === "weather") {
        intelDetail.innerHTML = intelShell("WEATHER INTELLIGENCE", [
            ["LOCATION", intelLocation?.textContent || "LOCATING..."],
            ["CONDITION", intelCondition?.textContent || "WAITING..."],
            ["TEMP", intelTemp?.textContent || "--°C"],
            ["FEELS LIKE", intelFeels?.textContent || "--°C"],
            ["HUMIDITY", intelHumidity?.textContent || "--%"],
            ["WIND", intelWind?.textContent || "-- km/h"],
            ["UV", intelUv?.textContent || "--"],
            ["SUNRISE", intelSunrise?.textContent || "--:--"],
            ["SUNSET", intelSunset?.textContent || "--:--"]
        ], "weather-heading");
        if (jarvisLocation) loadWeather(jarvisLocation.latitude, jarvisLocation.longitude, intelLocation?.textContent || "YOUR LOCATION");
        return;
    }

    if (type === "location") {
        const coords = jarvisLocation
            ? `${jarvisLocation.latitude.toFixed(5)}, ${jarvisLocation.longitude.toFixed(5)}`
            : "Awaiting GPS permission";
        intelDetail.innerHTML = intelShell("LOCATION INTELLIGENCE", [
            ["LOCATION", intelLocation?.textContent || "LOCATING...", "location-value"],
            ["STATUS", jarvisLocation ? "GPS ACTIVE" : "Awaiting GPS permission", jarvisLocation ? "" : "gps-waiting"],
            ["LATITUDE", jarvisLocation ? jarvisLocation.latitude.toFixed(5) : "--"],
            ["LONGITUDE", jarvisLocation ? jarvisLocation.longitude.toFixed(5) : "--"],
            ["COORDINATES", coords],
            ["SOURCE", "BROWSER GEOLOCATION API"]
        ], "location-heading");
        return;
    }

    if (type === "system") {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const battery = await getBatteryInfo();
        const permissions = await getPermissionInfo();
        const screenInfo = `${window.screen.width} × ${window.screen.height}`;
        const memory = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "UNAVAILABLE";
        const colorDepth = window.screen.colorDepth ? `${window.screen.colorDepth}-BIT` : "UNAVAILABLE";
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UNAVAILABLE";
        intelDetail.innerHTML = intelShell("SYSTEM INTELLIGENCE", [
            ["CPU CORES", navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency}` : "UNAVAILABLE"],
            ["MEMORY", memory],
            ["BROWSER", getBrowserVersion()],
            ["OS", getOSName()],
            ["DEVICE", getDeviceType()],
            ["SCREEN", screenInfo],
            ["COLOR DEPTH", colorDepth],
            ["NETWORK", navigator.onLine ? "ONLINE" : "OFFLINE"],
            ["CONNECTION", connection?.effectiveType ? connection.effectiveType.toUpperCase() : "UNAVAILABLE"],
            ["BATTERY", battery],
            ["TIMEZONE", timezone],
            ["LANGUAGE", navigator.language || "UNAVAILABLE"],
            ["PERMISSIONS", permissions]
        ], "system-heading");
        return;
    }

    if (type === "study") {
        const total = study?.tasks?.length || 0;
        const done = study?.tasks?.filter(t => t.done).length || 0;
        const progress = total ? Math.round((done / total) * 100) : 0;
        intelDetail.innerHTML = `<div class="study-intel-card">
            <div class="intel-heading study-heading">STUDY INTELLIGENCE</div>
            <div class="study-stat-grid">
                <div><span>TODAY'S TASKS</span><strong>${total}</strong></div>
                <div><span>COMPLETED</span><strong>${done}</strong></div>
                <div><span>PROGRESS</span><strong>${progress}%</strong></div>
                <div><span>STREAK</span><strong>${study?.streak || 0}</strong></div>
            </div>
            <div class="study-intel-progress"><span style="width:${progress}%"></span></div>
            <div class="study-intel-actions">
                <span>FOCUS MODE</span><strong>READY</strong>
            </div>
            <div class="study-intel-note">Use the STUDY module below for goals, tasks and Pomodoro. Progress is saved locally.</div>
            <div class="intel-scanline"></div>
        </div>`;
    }
}

document.querySelectorAll(".intel-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".intel-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const type = tab.dataset.intel;
        const studyModule = document.getElementById("study-module");
        if (studyModule) studyModule.hidden = true;
        showIntelModule(type);
        if (type === "study") {
            statusText.textContent = "STUDY MODE";
            coreStatus.textContent = "FOCUS CORE // ACTIVE";
            aiMode.textContent = "FOCUS";
        } else {
            aiMode.textContent = type === "weather" ? "WEATHER" : type === "location" ? "LOCATION" : "SYSTEM";
        }
    });
});

// 4) Real browser/system information. Browser security prevents normal web
// pages from reading true CPU utilization, fan speed, GPU temperature, etc.
function getBrowserName() {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return "Microsoft Edge";
    if (/Chrome\//.test(ua)) return "Google Chrome";
    if (/Firefox\//.test(ua)) return "Mozilla Firefox";
    if (/Safari\//.test(ua)) return "Safari";
    return "Browser";
}
async function updateSystemPanel() {
    const cpu = document.getElementById("sys-cpu-cores");
    const memory = document.getElementById("sys-memory");
    const network = document.getElementById("sys-network");
    const browser = document.getElementById("sys-browser");
    const os = document.getElementById("sys-os");
    const batteryEl = document.getElementById("sys-battery");
    if (cpu) cpu.textContent = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency}` : "UNAVAILABLE";
    if (memory) memory.textContent = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "UNAVAILABLE";
    if (network) network.textContent = navigator.onLine ? "ONLINE" : "OFFLINE";
    if (browser) browser.textContent = getBrowserVersion();
    if (os) os.textContent = getOSName();
    if (batteryEl) batteryEl.textContent = await getBatteryInfo();
}


// ============================================================
// FULL-SCREEN STUDY MODE
// Tasks, Pomodoro, statistics, Study DND, distraction reminder,
// timetable upload and quick notes. Everything is saved in
// localStorage. Wrapped in a function so it cannot clash with
// any other J.A.R.V.I.S variable.
// ============================================================
(function () {
    "use strict";

    const KEY = "jarvis-study-pro-v1";          // tasks, notes, stats, DND
    const TT_KEY = "jarvis-study-pro-v1-timetable"; // timetable file (kept apart: it can be large)
    const OLD_KEY = "jarvis-study-screen-v1";   // previous Study screen data (read once, never changed)
    const MODES = {
        focus: { label: "FOCUS", minutes: 25 },
        short: { label: "SHORT BREAK", minutes: 5 },
        long: { label: "LONG BREAK", minutes: 15 }
    };
    const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
    const PRIORITY_TEXT = { high: "HIGH", medium: "MED", low: "LOW" };

    const $ = (id) => document.getElementById(id);
    const screen = $("study-screen");
    if (!screen) return;

    // ---------- element references ----------
    const el = {
        exit: $("study-exit"),
        dndToggle: $("sm-dnd-toggle"), dndLabel: $("sm-dnd-label"), dndStatus: $("sm-dnd-status"),
        statSessions: $("sm-stat-sessions"), statMinutes: $("sm-stat-minutes"), statTasks: $("sm-stat-tasks"),
        statStreak: $("sm-stat-streak"), statDistractions: $("sm-stat-distractions"),
        form: $("sm-task-form"), subject: $("sm-task-subject"), title: $("sm-task-title"),
        priority: $("sm-task-priority"), minutes: $("sm-task-minutes"),
        submit: $("sm-task-submit"), cancel: $("sm-task-cancel"),
        taskCount: $("sm-task-count"), taskList: $("sm-task-list"), taskBar: $("sm-task-bar"),
        remaining: $("sm-task-remaining"), clearDone: $("sm-clear-done"),
        timerState: $("sm-timer-state"), timerDot: $("sm-timer-dot"), modes: $("sm-modes"),
        time: $("sm-time"), timerBar: $("sm-timer-bar"), start: $("sm-timer-start"),
        pause: $("sm-timer-pause"), reset: $("sm-timer-reset"), timerNote: $("sm-timer-note"),
        nextTitle: $("sm-next-title"), nextMeta: $("sm-next-meta"), nextPri: $("sm-next-pri"),
        notes: $("sm-notes"), notesState: $("sm-notes-state"),
        fileInput: $("study-timetable-file"), fileState: $("study-file-state"),
        ttPreview: $("sm-tt-preview"), ttOpen: $("sm-tt-open"), ttRemove: $("sm-tt-remove"),
        toast: $("sm-toast"), toastClose: $("sm-toast-close")
    };

    // ============================================================
    // 1. STORAGE
    // ============================================================
    function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

    function defaultData() {
        return { tasks: [], notes: "", dnd: false, sessions: [], completions: [], distractions: [], timetable: null };
    }

    function saveStudyData() {
        try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
        catch (err) { console.warn("Study Mode: could not save", err); return false; }
    }

    function loadStudyData() {
        let d = defaultData();
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) d = Object.assign(d, JSON.parse(raw));
            else d = importOldData(d);
        } catch (err) { console.warn("Study Mode: could not load", err); }
        ["tasks", "sessions", "completions", "distractions"].forEach((k) => { if (!Array.isArray(d[k])) d[k] = []; });
        if (typeof d.notes !== "string") d.notes = "";
        d.dnd = d.dnd === true;
        return d;
    }

    // One-time import of what the previous Study screen saved (tasks + timetable image).
    // Nothing is invented: imported finished tasks are counted but get no date.
    function importOldData(d) {
        try {
            const old = JSON.parse(localStorage.getItem(OLD_KEY) || "null");
            if (!old) return d;
            (old.tasks || []).forEach((t) => {
                if (!t || !t.text) return;
                const id = newId();
                d.tasks.push({ id, subject: "", title: String(t.text).slice(0, 80), priority: "medium", minutes: 0, done: !!t.done, createdAt: Date.now() });
                if (t.done) d.completions.push({ id, ts: null });
            });
            if (old.timetable && old.timetable.data) {
                const type = old.timetable.data.slice(5, old.timetable.data.indexOf(";"));
                localStorage.setItem(TT_KEY, JSON.stringify({ name: old.timetable.name || "timetable", type, data: old.timetable.data }));
                d.timetable = { name: old.timetable.name || "timetable", type, saved: true };
            }
        } catch (err) { /* ignore: old data is optional */ }
        return d;
    }

    let data = loadStudyData();

    // ============================================================
    // 2. TASKS
    // ============================================================
    let editingId = null;

    const findTask = (id) => data.tasks.find((t) => t.id === id);
    const taskLabel = (t) => (t.subject ? t.subject + " — " + t.title : t.title);

    function addTask(subject, title, priority, minutes) {
        data.tasks.push({ id: newId(), subject, title, priority, minutes, done: false, createdAt: Date.now() });
        saveStudyData();
        renderAll();
    }

    // editTask applies the new values; startEdit only loads a task into the form.
    function editTask(id, fields) {
        const t = findTask(id);
        if (!t) return;
        Object.assign(t, fields);
        saveStudyData();
        renderAll();
    }

    function deleteTask(id) {
        data.tasks = data.tasks.filter((t) => t.id !== id);
        if (editingId === id) cancelEdit();
        saveStudyData();
        renderAll();
    }

    function toggleTask(id) {
        const t = findTask(id);
        if (!t) return;
        t.done = !t.done;
        // The completions log is what the statistics read from.
        if (t.done) data.completions.push({ id, ts: Date.now() });
        else data.completions = data.completions.filter((c) => c.id !== id);
        saveStudyData();
        renderAll();
    }

    function clearCompleted() {
        data.tasks = data.tasks.filter((t) => !t.done);
        if (editingId && !findTask(editingId)) cancelEdit();
        saveStudyData();
        renderAll();
    }

    function startEdit(id) {
        const t = findTask(id);
        if (!t) return;
        editingId = id;
        el.subject.value = t.subject || "";
        el.title.value = t.title;
        el.priority.value = t.priority;
        el.minutes.value = t.minutes || "";
        el.submit.textContent = "SAVE";
        el.cancel.hidden = false;
        el.title.focus();
        renderTasks();
    }

    function cancelEdit() {
        editingId = null;
        el.form.reset();
        el.priority.value = "medium";
        el.submit.textContent = "ADD";
        el.cancel.hidden = true;
        renderTasks();
    }

    // Highest priority unfinished task; the earliest added wins a tie.
    function getNextTask() {
        const open = data.tasks.filter((t) => !t.done);
        if (!open.length) return null;
        return open.reduce((a, b) => (PRIORITY_RANK[b.priority] < PRIORITY_RANK[a.priority] ? b : a));
    }

    el.form.addEventListener("submit", (e) => {
        e.preventDefault();
        const subject = el.subject.value.trim();
        const title = el.title.value.trim();
        if (!title) { el.title.focus(); return; }
        let minutes = parseInt(el.minutes.value, 10);
        minutes = minutes > 0 ? Math.min(minutes, 600) : 0;
        const priority = PRIORITY_RANK[el.priority.value] !== undefined ? el.priority.value : "medium";
        if (editingId) {
            editTask(editingId, { subject, title, priority, minutes });
            cancelEdit();
        } else {
            addTask(subject, title, priority, minutes);
            el.form.reset();
            el.priority.value = "medium";
        }
        el.title.focus();
    });
    el.cancel.addEventListener("click", cancelEdit);
    el.clearDone.addEventListener("click", clearCompleted);

    function makeIconButton(text, label, cls, onClick) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "sm-icon " + cls; b.textContent = text;
        b.setAttribute("aria-label", label); b.title = label;
        b.addEventListener("click", onClick);
        return b;
    }

    function renderTasks() {
        el.taskList.innerHTML = "";
        if (!data.tasks.length) {
            const empty = document.createElement("li");
            empty.className = "sm-empty";
            empty.textContent = "NO TASKS YET";
            el.taskList.appendChild(empty);
        }
        data.tasks.forEach((t) => {
            const li = document.createElement("li");
            li.className = "sm-task" + (t.done ? " done" : "") + (t.id === editingId ? " editing" : "");

            const box = document.createElement("input");
            box.type = "checkbox"; box.className = "sm-check"; box.checked = t.done;
            box.setAttribute("aria-label", "Mark complete: " + taskLabel(t));
            box.addEventListener("change", () => toggleTask(t.id));

            const text = document.createElement("span");
            text.className = "sm-task-text"; text.textContent = taskLabel(t);

            const meta = document.createElement("span");
            meta.className = "sm-task-meta";
            const pri = document.createElement("span");
            pri.className = "sm-pri sm-pri-" + t.priority; pri.textContent = PRIORITY_TEXT[t.priority] || "MED";
            meta.appendChild(pri);
            if (t.minutes) {
                const m = document.createElement("span");
                m.className = "sm-min"; m.textContent = t.minutes + " MIN";
                meta.appendChild(m);
            }

            const actions = document.createElement("span");
            actions.className = "sm-task-actions";
            actions.append(
                makeIconButton("✎", "Edit task", "sm-icon-edit", () => startEdit(t.id)),
                makeIconButton("✕", "Delete task", "sm-icon-del", () => deleteTask(t.id))
            );

            li.append(box, text, meta, actions);
            el.taskList.appendChild(li);
        });

        const total = data.tasks.length;
        const done = data.tasks.filter((t) => t.done).length;
        const left = data.tasks.filter((t) => !t.done).reduce((sum, t) => sum + (t.minutes || 0), 0);
        el.taskCount.textContent = done + " / " + total;
        el.taskBar.style.width = (total ? (done / total) * 100 : 0) + "%";
        el.remaining.textContent = "REMAINING " + left + " MIN";
        el.clearDone.hidden = done === 0;
    }

    function renderNext() {
        const t = getNextTask();
        if (!t) {
            el.nextTitle.textContent = "NO UPCOMING TASK";
            el.nextPri.textContent = "—";
            el.nextMeta.textContent = data.tasks.length ? "All tasks are complete." : "Add a task to see it here.";
            return;
        }
        el.nextTitle.textContent = taskLabel(t);
        el.nextPri.textContent = (PRIORITY_TEXT[t.priority] || "MED") + " PRIORITY";
        el.nextMeta.textContent = t.minutes ? "Estimated " + t.minutes + " min." : "No time estimate.";
    }

    // ============================================================
    // 3. POMODORO TIMER (uses real clock time, so it stays accurate)
    // ============================================================
    let mode = "focus";
    let totalMs = MODES.focus.minutes * 60000;
    let remainingMs = totalMs;
    let endAt = 0;
    let tickId = null;
    let stateText = "READY";

    const isRunning = () => tickId !== null;
    const pad2 = (n) => String(n).padStart(2, "0");

    function renderTimer() {
        const secs = Math.ceil(remainingMs / 1000);
        el.time.textContent = pad2(Math.floor(secs / 60)) + ":" + pad2(secs % 60);
        el.timerBar.style.width = (totalMs ? ((totalMs - remainingMs) / totalMs) * 100 : 0) + "%";
        el.timerState.textContent = stateText;
        el.timerDot.classList.toggle("on", isRunning());
        el.start.disabled = isRunning();
        el.pause.disabled = !isRunning();
        el.modes.querySelectorAll(".sm-mode").forEach((b) => {
            b.classList.toggle("active", b.dataset.mode === mode);
            b.disabled = isRunning();
        });
        el.timerNote.textContent = MODES[mode].label + " · " + MODES[mode].minutes + " MIN";
    }

    function stopTick() {
        if (tickId !== null) { clearInterval(tickId); tickId = null; }
    }

    function startTimer() {
        if (isRunning() || remainingMs <= 0) return;
        if (!data.dnd && "Notification" in window && Notification.permission === "default") {
            try { Notification.requestPermission(); } catch (err) { /* optional */ }
        }
        endAt = Date.now() + remainingMs;
        tickId = setInterval(tick, 250);
        stateText = "RUNNING";
        renderTimer();
    }

    function pauseTimer() {
        if (!isRunning()) return;
        remainingMs = Math.max(0, endAt - Date.now());
        stopTick();
        leftDuringFocus = false;
        stateText = "PAUSED";
        renderTimer();
    }

    function resetTimer() {
        stopTick();
        leftDuringFocus = false;
        remainingMs = totalMs;
        stateText = "READY";
        renderTimer();
    }

    function setMode(newMode) {
        if (isRunning() || !MODES[newMode]) return;
        mode = newMode;
        totalMs = MODES[mode].minutes * 60000;
        resetTimer();
    }

    function tick() {
        remainingMs = Math.max(0, endAt - Date.now());
        if (remainingMs <= 0) completeTimer();
        else renderTimer();
    }

    function completeTimer() {
        stopTick();
        leftDuringFocus = false;
        if (mode === "focus") {
            // Record the finished focus session; statistics are calculated from this list.
            data.sessions.push({ ts: Date.now(), minutes: MODES.focus.minutes });
            saveStudyData();
            stateText = "SESSION RECORDED";
        } else {
            stateText = "BREAK COMPLETE";
        }
        remainingMs = totalMs;
        renderTimer();
        renderStats();
        // DND keeps desktop notifications silent; the status text above still updates.
        if (!data.dnd && "Notification" in window && Notification.permission === "granted") {
            try { new Notification("J.A.R.V.I.S // STUDY MODE", { body: mode === "focus" ? "Focus session complete." : "Break complete." }); } catch (err) { /* optional */ }
        }
    }

    el.start.addEventListener("click", startTimer);
    el.pause.addEventListener("click", pauseTimer);
    el.reset.addEventListener("click", resetTimer);
    el.modes.addEventListener("click", (e) => {
        const b = e.target.closest(".sm-mode");
        if (b) setMode(b.dataset.mode);
    });

    // ============================================================
    // 4. STATISTICS (always calculated from stored activity)
    // ============================================================
    function dayKey(ts) {
        const d = new Date(ts);
        return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    }

    // A streak is consecutive days with at least one finished focus session or completed task.
    // If today has no activity yet, the streak is counted up to yesterday.
    function computeStreak() {
        const days = new Set();
        data.sessions.forEach((s) => days.add(dayKey(s.ts)));
        data.completions.forEach((c) => { if (c.ts) days.add(dayKey(c.ts)); });
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
        let n = 0;
        while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
        return n;
    }

    function renderStats() {
        const streak = computeStreak();
        const today = dayKey(Date.now());
        el.statSessions.textContent = data.sessions.length;
        el.statMinutes.textContent = data.sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);
        el.statTasks.textContent = data.completions.length;
        el.statStreak.textContent = streak + (streak === 1 ? " DAY" : " DAYS");
        el.statDistractions.textContent = pad2(data.distractions.filter((x) => dayKey(x.ts) === today).length);
    }

    // ============================================================
    // 5. STUDY DND (affects this browser tab only)
    // ============================================================
    function renderDND() {
        el.dndLabel.textContent = data.dnd ? "DND ACTIVE" : "DND OFF";
        el.dndStatus.classList.toggle("on", data.dnd);
        screen.classList.toggle("sm-dnd-on", data.dnd);
        el.dndToggle.classList.toggle("active", data.dnd);
        el.dndToggle.setAttribute("aria-pressed", String(data.dnd));
    }

    function enableDND() {
        data.dnd = true;
        saveStudyData();
        renderDND();
        // Fullscreen needs a user click, which is how this is called.
        if (screen.requestFullscreen && !document.fullscreenElement) {
            screen.requestFullscreen().catch(() => { /* user or browser declined */ });
        }
    }

    function disableDND() {
        data.dnd = false;
        saveStudyData();
        renderDND();
        if (document.fullscreenElement === screen) document.exitFullscreen().catch(() => {});
    }

    el.dndToggle.addEventListener("click", () => (data.dnd ? disableDND() : enableDND()));

    // With DND active, warn before the tab is closed or reloaded during a focus session.
    window.addEventListener("beforeunload", (e) => {
        flushNotes();
        if (data.dnd && isRunning() && mode === "focus") { e.preventDefault(); e.returnValue = ""; }
    });

    // ============================================================
    // 6. DISTRACTION REMINDER (Page Visibility API)
    // ============================================================
    let leftDuringFocus = false;
    let toastTimer = null;

    function handleVisibilityChange() {
        if (screen.hidden) return;
        if (document.hidden) {
            // Remember the exit once; it is counted only when the user comes back.
            if (isRunning() && mode === "focus") leftDuringFocus = true;
            return;
        }
        if (leftDuringFocus) {
            leftDuringFocus = false;
            if (isRunning() && mode === "focus") recordDistraction();
        }
    }

    function recordDistraction() {
        data.distractions.push({ ts: Date.now() });
        saveStudyData();
        renderStats();
        showReminder();
    }

    function showReminder() {
        el.toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(hideReminder, 7000);
    }

    function hideReminder() { el.toast.hidden = true; clearTimeout(toastTimer); }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    el.toastClose.addEventListener("click", hideReminder);

    // ============================================================
    // 7. QUICK NOTES (auto-saved)
    // ============================================================
    let notesTimer = null;

    function renderNotesState(justSaved) {
        if (justSaved) {
            const n = new Date();
            el.notesState.textContent = "SAVED " + pad2(n.getHours()) + ":" + pad2(n.getMinutes());
        } else {
            el.notesState.textContent = data.notes ? "SAVED" : "NO DATA";
        }
    }

    function flushNotes() {
        if (notesTimer === null) return;
        clearTimeout(notesTimer);
        notesTimer = null;
        data.notes = el.notes.value;
        saveStudyData();
        renderNotesState(true);
    }

    el.notes.addEventListener("input", () => {
        el.notesState.textContent = "SAVING…";
        clearTimeout(notesTimer);
        notesTimer = setTimeout(flushNotes, 400);
    });

    // ============================================================
    // 8. TIMETABLE (displayed as uploaded — never parsed)
    // ============================================================
    let ttUrl = null;

    function dataUrlToBlob(dataUrl) {
        const parts = dataUrl.split(",");
        const mime = (parts[0].match(/:(.*?);/) || [])[1] || "application/octet-stream";
        const bin = atob(parts[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    }

    function showTimetable(file) {
        if (ttUrl) { URL.revokeObjectURL(ttUrl); ttUrl = null; }
        el.ttPreview.innerHTML = "";
        if (!file) {
            const none = document.createElement("span");
            none.textContent = "NO TIMETABLE UPLOADED";
            el.ttPreview.appendChild(none);
            el.fileState.textContent = "NOT LOADED";
            el.ttOpen.hidden = true; el.ttRemove.hidden = true;
            return;
        }
        ttUrl = URL.createObjectURL(dataUrlToBlob(file.data));
        if (file.type === "application/pdf") {
            const frame = document.createElement("iframe");
            frame.src = ttUrl; frame.title = "Uploaded timetable (PDF)";
            el.ttPreview.appendChild(frame);
        } else {
            const img = document.createElement("img");
            img.src = ttUrl; img.alt = "Uploaded timetable";
            el.ttPreview.appendChild(img);
        }
        el.ttOpen.href = ttUrl;
        el.ttOpen.hidden = false; el.ttRemove.hidden = false;
        const name = (file.name || "TIMETABLE").toUpperCase();
        el.fileState.textContent = (name.length > 22 ? name.slice(0, 21) + "…" : name) + (file.saved === false ? " · NOT SAVED" : "");
    }

    function loadSavedTimetable() {
        try {
            const raw = localStorage.getItem(TT_KEY);
            if (raw) { const f = JSON.parse(raw); if (f && f.data) showTimetable(f); }
        } catch (err) { /* ignore a damaged copy */ }
    }

    // Big phone photos are shrunk so they fit in localStorage.
    function shrinkImage(dataUrl, done) {
        const img = new Image();
        img.onload = () => {
            const MAX = 2000;
            if (Math.max(img.width, img.height) <= MAX) return done(dataUrl, "");
            const scale = MAX / Math.max(img.width, img.height);
            const c = document.createElement("canvas");
            c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            done(c.toDataURL("image/jpeg", 0.9), "image/jpeg");
        };
        img.onerror = () => done(null, "");
        img.src = dataUrl;
    }

    function storeTimetable(name, type, dataUrl) {
        const file = { name, type, data: dataUrl, saved: true };
        try { localStorage.removeItem(TT_KEY); localStorage.setItem(TT_KEY, JSON.stringify(file)); }
        catch (err) { file.saved = false; }   // too large: still shown now, but gone after refresh
        data.timetable = { name, type, saved: file.saved };
        saveStudyData();
        showTimetable(file);
    }

    el.fileInput.addEventListener("change", () => {
        const f = el.fileInput.files && el.fileInput.files[0];
        el.fileInput.value = "";
        if (!f) return;
        const lower = f.name.toLowerCase();
        const isPdf = f.type === "application/pdf" || lower.endsWith(".pdf");
        const isImg = f.type === "image/png" || f.type === "image/jpeg" || /\.(png|jpe?g)$/.test(lower);
        if (!isPdf && !isImg) { el.fileState.textContent = "UNSUPPORTED FILE"; return; }
        const reader = new FileReader();
        reader.onerror = () => { el.fileState.textContent = "COULD NOT READ FILE"; };
        reader.onload = () => {
            if (isPdf) {
                storeTimetable(f.name, "application/pdf", "data:application/pdf;base64," + String(reader.result).split(",")[1]);
            } else {
                shrinkImage(String(reader.result), (url, newType) => {
                    if (!url) { el.fileState.textContent = "COULD NOT READ IMAGE"; return; }
                    storeTimetable(f.name, newType || (f.type || "image/png"), url);
                });
            }
        };
        reader.readAsDataURL(f);
    });

    el.ttRemove.addEventListener("click", () => {
        try { localStorage.removeItem(TT_KEY); } catch (err) { /* ignore */ }
        data.timetable = null;
        saveStudyData();
        showTimetable(null);
    });

    // ============================================================
    // 9. OPEN / CLOSE THE STUDY SCREEN
    // ============================================================
    function renderAll() {
        renderTasks();
        renderNext();
        renderStats();
        renderTimer();
        renderDND();
    }

    let studyReturnPanel = "command";

    function openStudyScreen(fromHistory) {
        if (!fromHistory) {
            // Remember the panel that was visible before Study Mode so the back arrow
            // returns to exactly that view (including HISTORY).
            studyReturnPanel = (activePanelName && activePanelName !== "study") ? activePanelName : "command";
            history.pushState({ jarvisStudy: true, returnPanel: studyReturnPanel }, "", location.href.split("#")[0] + "#study");
        }
        screen.hidden = false;
        document.body.classList.add("study-open");
        renderAll();
    }

    function closeStudyScreen(fromPop) {
        screen.hidden = true;
        document.body.classList.remove("study-open");
        pauseTimer();                 // a session never keeps running while Study Mode is closed
        flushNotes();
        hideReminder();
        if (document.fullscreenElement === screen) document.exitFullscreen().catch(() => {});
        const returnPanel = studyReturnPanel || "command";
        if (!fromPop && location.hash === "#study") {
            history.back();
        } else {
            // Browser Back already changed the URL; restore the previous JARVIS panel.
            const navItem = document.querySelector(`.nav-item[data-panel="${returnPanel}"]`);
            if (navItem) {
                activateNavigation(navItem);
                handleNavigation(returnPanel);
            } else {
                handleNavigation("command");
            }
        }
    }

    // The navigation code in script.js calls these two by name.
    window.openStudyScreen = openStudyScreen;
    window.closeStudyScreen = closeStudyScreen;

    el.exit.addEventListener("click", () => closeStudyScreen(false));
    const closeFromHistory = () => { if (location.hash !== "#study" && !screen.hidden) closeStudyScreen(true); };
    window.addEventListener("popstate", closeFromHistory);
    window.addEventListener("hashchange", closeFromHistory);

    // ---------- first paint ----------
    el.notes.value = data.notes;
    renderNotesState(false);
    loadSavedTimetable();
    renderAll();
})();

// 5) Lightweight Study Mode: goals, tasks, Pomodoro, progress and streak,
// persisted locally. It does not pretend to block Windows applications.
const STUDY_KEY = "jarvis-study-v1";
let study = JSON.parse(localStorage.getItem(STUDY_KEY) || "null") || {tasks:[], streak:0};
const studyTask = document.getElementById("study-task");
const studyAdd = document.getElementById("study-add");
const studyList = document.getElementById("study-list");
const studyProgressFill = document.getElementById("study-progress-fill");
const studyStreak = document.getElementById("study-streak");
const pomodoro = document.getElementById("pomodoro");
let pomoSeconds = 25 * 60;
let pomoTimer = null;

function saveStudy(){ localStorage.setItem(STUDY_KEY, JSON.stringify(study)); }
function renderStudy(){
    if (!studyList) return;
    studyList.innerHTML = "";
    study.tasks.forEach((task, index) => {
        const row = document.createElement("label"); row.className = "study-item" + (task.done ? " done" : "");
        const box = document.createElement("input"); box.type="checkbox"; box.checked=!!task.done;
        box.addEventListener("change",()=>{task.done=box.checked;saveStudy();renderStudy();});
        const text=document.createElement("span"); text.textContent=task.text;
        row.append(box,text); studyList.appendChild(row);
    });
    const total=study.tasks.length, done=study.tasks.filter(t=>t.done).length;
    if (studyProgressFill) studyProgressFill.style.width=(total ? (done/total)*100 : 0)+"%";
    if (studyStreak) studyStreak.textContent=`STREAK ${study.streak || 0}`;
}
if(studyAdd && studyTask){
    studyAdd.addEventListener("click",()=>{
        const text=studyTask.value.trim(); if(!text)return;
        study.tasks.push({text,done:false}); studyTask.value=""; saveStudy(); renderStudy();
    });
    studyTask.addEventListener("keydown",e=>{if(e.key==="Enter")studyAdd.click();});
}
if(pomodoro){
    pomodoro.addEventListener("click",()=>{
        if(pomoTimer){clearInterval(pomoTimer);pomoTimer=null;pomodoro.textContent="25:00";pomoSeconds=1500;return;}
        pomodoro.textContent="25:00";
        pomoTimer=setInterval(()=>{
            pomoSeconds--; const m=String(Math.floor(pomoSeconds/60)).padStart(2,"0"),s=String(pomoSeconds%60).padStart(2,"0"); pomodoro.textContent=`${m}:${s}`;
            if(pomoSeconds<=0){clearInterval(pomoTimer);pomoTimer=null;pomoSeconds=1500;pomodoro.textContent="DONE";if("Notification" in window && Notification.permission==="granted")new Notification("JARVIS Study Mode",{body:"Pomodoro complete. Take a break."});}
        },1000);
        if("Notification" in window && Notification.permission==="default") Notification.requestPermission();
    });
}
renderStudy();

// 6) Expand navigation without removing the original seven modules.
const originalHandleNavigation = handleNavigation;
handleNavigation = function(panelName){
    if(panelName === "study"){
        statusText.textContent="STUDY MODE"; coreStatus.textContent="FOCUS CORE // ACTIVE"; aiMode.textContent="FOCUS";
        openStudyScreen(false);
        return;
    }
    if(document.getElementById("study-module")) document.getElementById("study-module").hidden=true;
    if(document.getElementById("intel-detail")) document.getElementById("intel-detail").hidden=false;
    originalHandleNavigation(panelName);
};

updateSystemPanel();
initIntelligence();

// Restore the exact JARVIS panel after returning from an external website.
if (location.hash === "#study") {
    openStudyScreen(true);
} else {
    const restoreButton = document.querySelector(`.nav-item[data-panel="${activePanelName}"]`);
    if (restoreButton) activateNavigation(restoreButton);
    handleNavigation(activePanelName);
}

