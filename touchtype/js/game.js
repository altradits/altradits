'use strict';
/* Muscle Memory Dojo - Arcade Overdrive (browser build).
 * Runs fully offline: no network calls during play, progress in localStorage,
 * sound effects off by default. The pure core below (createGame, handleKey,
 * generateDrill, checkPromotion, stats) has no DOM dependency and is covered
 * by game.test.js under node. */

var GAME_VERSION = '1.0.0';
var STEP_STORAGE_KEY = 'arcade_step';
var SOUND_STORAGE_KEY = 'arcade_sound';
var PROMOTION_MIN_HITS = 25;
var PROMOTION_TARGET_ACC = 95;

var ADVENTURE_STEPS = [
    { id: "1", name: "1. Index Isolation (L3/R3)", keys: ["f", "r", "g", "v", "b", "j", "u", "h", "m", "n"], patterns: ["frf", "fgf", "fvf", "fbf", "juj", "jhj", "jmj", "jnj"] },
    { id: "2", name: "2. Middle Isolation (L2/R2)", keys: ["d", "e", "c", "3", "k", "i", ",", "8"], patterns: ["ded", "dcd", "de3d", "kik", "k,k", "ki8k"] },
    { id: "3", name: "3. Ring Independence (L1/R1)", keys: ["s", "w", "x", "2", "l", "o", ".", "9"], patterns: ["sws", "sxs", "sw2s", "lol", "l.l", "lo9l"] },
    { id: "4", name: "4. Pinky Perimeter (L0/R0)", keys: ["a", "q", "z", "1", ";", "p", "/", "0", "-", "="], patterns: ["aqa", "aza", "a1a", ";p;", ";/;", ";0;"] },
    { id: "5", name: "5. Interlocking Finger Weave", keys: ["q", "p", "w", "o", "e", "i", "r", "u", "t", "y", "a", ";", "s", "l", "d", "k", "f", "j"], patterns: ["qp", "wo", "ei", "ru", "ty", "a;", "sl", "dk", "fj"] },
    { id: "6", name: "6. Home Row Anchors", keys: ["f", "j", "d", "k", "a", "s", "l", ";"], patterns: ["fj", "dk", "as", "l;"] },
    { id: "7", name: "7. Upper Deck Exploration", keys: ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"], patterns: ["qw", "er", "ty", "ui", "op"] },
    { id: "8", name: "8. Lower Deck Traversal", keys: ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"], patterns: ["zx", "cv", "bn", "m,", "./"] },
    { id: "9", name: "9. Spacebar Rhythm", keys: ["f", "j", " ", "a", "e", "i", "o"], patterns: ["f j", "a e", "i o", "j f"] },
    { id: "10", name: "10. Numeric Ascent", keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"], patterns: ["12", "34", "56", "78", "90"] },
    { id: "11", name: "11. Structural Symbols", keys: ["-", "=", "[", "]", "'", "`"], patterns: ["-=", "[]", "'`"] },
    { id: "12", name: "12. Subconscious Grandmaster", keys: ["ALL"], patterns: [] }
];

var FINGER_NAMES = {
    0: "Left Pinky", 1: "Left Ring", 2: "Left Middle", 3: "Left Index", 4: "Thumb",
    5: "Right Index", 6: "Right Middle", 7: "Right Ring", 8: "Right Pinky"
};

var KEY_FINGER_MAP = {
    '`': { hand: 0, finger: 0 }, '1': { hand: 0, finger: 0 }, 'q': { hand: 0, finger: 0 }, 'a': { hand: 0, finger: 0 }, 'z': { hand: 0, finger: 0 },
    '2': { hand: 0, finger: 1 }, 'w': { hand: 0, finger: 1 }, 's': { hand: 0, finger: 1 }, 'x': { hand: 0, finger: 1 },
    '3': { hand: 0, finger: 2 }, 'e': { hand: 0, finger: 2 }, 'd': { hand: 0, finger: 2 }, 'c': { hand: 0, finger: 2 },
    '4': { hand: 0, finger: 3 }, '5': { hand: 0, finger: 3 }, 'r': { hand: 0, finger: 3 }, 't': { hand: 0, finger: 3 }, 'f': { hand: 0, finger: 3 }, 'g': { hand: 0, finger: 3 }, 'v': { hand: 0, finger: 3 }, 'b': { hand: 0, finger: 3 },
    '6': { hand: 1, finger: 3 }, '7': { hand: 1, finger: 3 }, 'y': { hand: 1, finger: 3 }, 'u': { hand: 1, finger: 3 }, 'h': { hand: 1, finger: 3 }, 'j': { hand: 1, finger: 3 }, 'n': { hand: 1, finger: 3 }, 'm': { hand: 1, finger: 3 },
    '8': { hand: 1, finger: 2 }, 'i': { hand: 1, finger: 2 }, 'k': { hand: 1, finger: 2 }, ',': { hand: 1, finger: 2 },
    '9': { hand: 1, finger: 1 }, 'o': { hand: 1, finger: 1 }, 'l': { hand: 1, finger: 1 }, '.': { hand: 1, finger: 1 },
    '0': { hand: 1, finger: 0 }, '-': { hand: 1, finger: 0 }, '=': { hand: 1, finger: 0 }, 'p': { hand: 1, finger: 0 }, '[': { hand: 1, finger: 0 }, ']': { hand: 1, finger: 0 }, ';': { hand: 1, finger: 0 }, '\'': { hand: 1, finger: 0 }, '/': { hand: 1, finger: 0 },
    ' ': { hand: 0, finger: 4 }
};

var ENCOUNTERS = [
    { type: 'BOSS', name: "BOSS ENCOUNTER: TIME SURGE!", length: 8 },
    { type: 'STEALTH', name: "STEALTH DRILL: BLIND TARGETS!", length: 6 },
    { type: 'SPEED', name: "HYPER BURST: 2X XP!", length: 7 }
];

function defaultStorageBackend() {
    try {
        if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) { /* storage unavailable */ }
    return null;
}

/* Safe storage: every access is guarded so private mode or a missing
 * localStorage never breaks the game. */
function createStorage(backend) {
    var store = (backend === undefined) ? defaultStorageBackend() : backend;
    return {
        get: function (key) {
            try { return store ? store.getItem(key) : null; }
            catch (e) { return null; }
        },
        set: function (key, value) {
            try { if (store) store.setItem(key, String(value)); }
            catch (e) { /* ignore */ }
        },
        remove: function (key) {
            try { if (store) store.removeItem(key); }
            catch (e) { /* ignore */ }
        }
    };
}

function loadStepIdx(storage) {
    var raw = storage.get(STEP_STORAGE_KEY);
    var idx = parseInt(raw || '0', 10);
    if (isNaN(idx) || idx < 0 || idx >= ADVENTURE_STEPS.length) return 0;
    return idx;
}

function createGame(options) {
    options = options || {};
    var storage = options.storage || createStorage();
    return {
        storage: storage,
        stepIdx: (typeof options.stepIdx === 'number') ? options.stepIdx : loadStepIdx(storage),
        currentText: '',
        charIndex: 0,
        streak: 0,
        totalHits: 0,
        correctHits: 0,
        startTime: null,
        stageTotalHits: 0,
        stageCorrectHits: 0,
        multiplier: 1,
        activeSurprise: null,
        soundEnabled: (typeof options.soundEnabled === 'boolean')
            ? options.soundEnabled
            : storage.get(SOUND_STORAGE_KEY) === '1'
    };
}

function getActiveKeySet(game) {
    var step = ADVENTURE_STEPS[game.stepIdx];
    if (step.keys.indexOf("ALL") !== -1) return Object.keys(KEY_FINGER_MAP);
    var pool = [];
    for (var i = 0; i <= game.stepIdx; i++) {
        var keys = ADVENTURE_STEPS[i].keys;
        for (var j = 0; j < keys.length; j++) {
            if (keys[j] !== "ALL" && pool.indexOf(keys[j]) === -1) pool.push(keys[j]);
        }
    }
    return pool;
}

function pickSurprise(game, rand) {
    if (game.stepIdx > 0 && rand() < 0.22) {
        return ENCOUNTERS[Math.floor(rand() * ENCOUNTERS.length)];
    }
    return null;
}

function generateDrill(game, rand) {
    rand = rand || Math.random;
    var step = ADVENTURE_STEPS[game.stepIdx];
    game.activeSurprise = pickSurprise(game, rand);

    if (step.patterns && step.patterns.length > 0 && rand() > 0.3) {
        var patternList = [];
        var count = game.activeSurprise ? game.activeSurprise.length / 2 : 4;
        for (var i = 0; i < count; i++) {
            patternList.push(step.patterns[Math.floor(rand() * step.patterns.length)]);
        }
        game.currentText = patternList.join(" ");
    } else {
        var pool = getActiveKeySet(game);
        var length = game.activeSurprise ? game.activeSurprise.length : 10;
        var result = [];
        for (var k = 0; k < length; k++) {
            result.push(pool[Math.floor(rand() * pool.length)]);
        }
        game.currentText = result.join(game.stepIdx >= 8 ? "" : " ");
    }
    game.charIndex = 0;
    return game.currentText;
}

function stageAccuracy(game) {
    if (game.stageTotalHits <= 0) return 0;
    return (game.stageCorrectHits / game.stageTotalHits) * 100;
}

function accuracy(game) {
    if (game.totalHits <= 0) return 100;
    return Math.round((game.correctHits / game.totalHits) * 100);
}

function wpm(game, now) {
    if (game.startTime === null) return 0;
    var elapsedMin = (now - game.startTime) / 60000;
    if (elapsedMin <= 0) return 0;
    return Math.round((game.correctHits / 5) / elapsedMin);
}

function multiplierForStreak(streak) {
    if (streak > 25) return 4;
    if (streak > 15) return 3;
    if (streak > 8) return 2;
    return 1;
}

/* Returns true when the player earned a promotion to the next stage. */
function checkPromotion(game) {
    var acc = stageAccuracy(game);
    if (game.stageTotalHits >= PROMOTION_MIN_HITS && acc >= PROMOTION_TARGET_ACC) {
        if (game.stepIdx < ADVENTURE_STEPS.length - 1) {
            game.stepIdx++;
            game.storage.set(STEP_STORAGE_KEY, game.stepIdx);
            game.stageTotalHits = 0;
            game.stageCorrectHits = 0;
            generateDrill(game);
            return true;
        }
    }
    return false;
}

/* Applies one typed key. Returns { ignored, correct, drillComplete, promoted }. */
function handleKey(game, key, now) {
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].indexOf(key) !== -1) {
        return { ignored: true, correct: false, drillComplete: false, promoted: false };
    }
    if (game.startTime === null) game.startTime = (typeof now === 'number') ? now : Date.now();

    game.totalHits += game.multiplier;
    game.stageTotalHits += game.multiplier;

    var expected = game.currentText[game.charIndex];
    var correct = (key === expected);
    var drillComplete = false;
    if (correct) {
        game.correctHits += game.multiplier;
        game.stageCorrectHits += game.multiplier;
        game.streak++;
        game.charIndex++;
        game.multiplier = multiplierForStreak(game.streak);
        if (game.charIndex >= game.currentText.length) {
            generateDrill(game);
            drillComplete = true;
        }
    } else {
        game.streak = 0;
        game.multiplier = 1;
    }
    var promoted = checkPromotion(game);
    return { ignored: false, correct: correct, drillComplete: drillComplete, promoted: promoted };
}

function bossTimeout(game) {
    game.streak = 0;
    game.multiplier = 1;
    generateDrill(game);
}

function resetProgress(game) {
    game.storage.remove(STEP_STORAGE_KEY);
    game.stepIdx = 0;
    game.stageTotalHits = 0;
    game.stageCorrectHits = 0;
    game.streak = 0;
    game.multiplier = 1;
    game.activeSurprise = null;
    generateDrill(game);
}

function setSoundEnabled(game, enabled) {
    game.soundEnabled = !!enabled;
    game.storage.set(SOUND_STORAGE_KEY, game.soundEnabled ? '1' : '0');
}

/* ---- Browser presentation layer (no-ops outside a DOM) ---- */

function initBrowserGame() {
    var game = createGame();
    var audioCtx = null;
    var bossTimerId = null;
    var bossTimeLeft = 100;

    var arenaEl = document.getElementById('arena');
    var streamEl = document.getElementById('stream-text');
    var fingerHintEl = document.getElementById('finger-hint');
    var eventBadgeEl = document.getElementById('event-badge');
    var bossTimerEl = document.getElementById('boss-timer');
    var keys = document.querySelectorAll('.key');
    var handsCanvas = document.getElementById('hands-overlay');
    var hCtx = handsCanvas.getContext('2d');
    var keyboardEl = document.getElementById('keyboard');
    var soundBtn = document.getElementById('btn-sound');

    function initAudioContext() {
        try {
            if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        } catch (e) { /* audio unavailable */ }
    }

    function playSyntheticSound(freq, duration, type) {
        if (!game.soundEnabled) return;
        freq = freq || 1200;
        duration = duration || 0.03;
        type = type || 'triangle';
        try {
            initAudioContext();
            if (!audioCtx) return;
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + duration);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) { /* ignore */ }
    }

    function playLevelUpSound() {
        if (!game.soundEnabled) return;
        try {
            if (typeof Audio !== 'undefined') {
                var jingle = new Audio('/touchtype/sound/type_sound.mp3');
                var played = jingle.play();
                if (played && played.catch) {
                    played.catch(function () { playSyntheticSound(1800, 0.25, 'sine'); });
                }
                return;
            }
        } catch (e) { /* fall through to synth */ }
        playSyntheticSound(1800, 0.25, 'sine');
    }

    function syncSoundButton() {
        soundBtn.textContent = game.soundEnabled ? 'Sound FX: On' : 'Sound FX: Off';
        soundBtn.classList.toggle('active', game.soundEnabled);
    }

    function clearBossTimer() {
        if (bossTimerId) {
            clearInterval(bossTimerId);
            bossTimerId = null;
        }
        bossTimerEl.style.display = 'none';
        arenaEl.classList.remove('boss-mode');
    }

    function startBossTimer() {
        clearBossTimer();
        bossTimeLeft = 100;
        bossTimerEl.style.display = 'block';
        bossTimerEl.style.width = '100%';
        arenaEl.classList.add('boss-mode');

        bossTimerId = setInterval(function () {
            bossTimeLeft -= 2;
            bossTimerEl.style.width = bossTimeLeft + '%';
            if (bossTimeLeft <= 0) {
                clearBossTimer();
                bossTimeout(game);
                syncAfterDrill();
                triggerErrorEffect();
                updateStream();
            }
        }, 100);
    }

    function syncAfterDrill() {
        clearBossTimer();
        if (game.activeSurprise) {
            eventBadgeEl.textContent = game.activeSurprise.name;
            eventBadgeEl.style.display = 'block';
            if (game.activeSurprise.type === 'BOSS') startBossTimer();
        } else {
            eventBadgeEl.style.display = 'none';
        }
    }

    function newDrill() {
        generateDrill(game);
        syncAfterDrill();
    }

    function updateStageUI() {
        var step = ADVENTURE_STEPS[game.stepIdx];
        document.getElementById('player-level').textContent = 'STAGE ' + step.id;
        document.getElementById('quest-title').textContent = step.name;

        var activePool = getActiveKeySet(game);
        keys.forEach(function (k) {
            var kVal = k.getAttribute('data-key').toLowerCase();
            k.classList.toggle('unlocked-stage', activePool.indexOf(kVal) !== -1);
        });
        updateMastery();
    }

    function updateMastery() {
        var acc = stageAccuracy(game);
        document.getElementById('mastery-text').textContent =
            Math.round(acc) + '% / ' + PROMOTION_TARGET_ACC + '%';
        document.getElementById('xp-fill').style.width =
            Math.min(100, (acc / PROMOTION_TARGET_ACC) * 100) + '%';
    }

    function resizeCanvas() {
        handsCanvas.width = keyboardEl.offsetWidth;
        handsCanvas.height = keyboardEl.offsetHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function getCenterPos(keyChar) {
        var el = Array.from(keys).find(function (k) {
            return k.getAttribute('data-key').toLowerCase() === keyChar.toLowerCase();
        });
        if (!el) return null;
        var rect = el.getBoundingClientRect();
        var kbRect = keyboardEl.getBoundingClientRect();
        return { x: rect.left - kbRect.left + rect.width / 2, y: rect.top - kbRect.top + rect.height / 2 };
    }

    function drawHands() {
        hCtx.clearRect(0, 0, handsCanvas.width, handsCanvas.height);
        var currentKey = game.currentText[game.charIndex] || game.currentText[0] || ' ';
        var mapInfo = KEY_FINGER_MAP[currentKey.toLowerCase()] || { hand: 0, finger: 3 };

        var homeLeft = { 0: getCenterPos('a'), 1: getCenterPos('s'), 2: getCenterPos('d'), 3: getCenterPos('f'), 4: getCenterPos(' ') };
        var homeRight = { 0: getCenterPos(';'), 1: getCenterPos('l'), 2: getCenterPos('k'), 3: getCenterPos('j'), 4: getCenterPos(' ') };
        var targetPos = getCenterPos(currentKey);

        if (homeLeft[0] && homeRight[0]) {
            drawHandShadow(0, homeLeft, mapInfo.hand === 0 ? mapInfo.finger : null, targetPos);
            drawHandShadow(1, homeRight, mapInfo.hand === 1 ? mapInfo.finger : null, targetPos);
        }
        requestAnimationFrame(drawHands);
    }

    function drawHandShadow(handType, homePositions, activeFingerIdx, targetKeyPos) {
        hCtx.save();
        var wristX = handType === 0 ? handsCanvas.width * 0.35 : handsCanvas.width * 0.65;
        for (var i = 0; i < 5; i++) {
            if (!homePositions[i]) continue;
            var tip = { x: homePositions[i].x, y: homePositions[i].y };
            var isActive = (i === activeFingerIdx);
            if (isActive && targetKeyPos) tip = { x: targetKeyPos.x, y: targetKeyPos.y };

            hCtx.beginPath();
            hCtx.moveTo((homePositions[i].x + wristX) / 2, handsCanvas.height - 4);
            hCtx.lineTo(tip.x, tip.y);
            hCtx.strokeStyle = isActive ? 'rgba(139, 92, 246, 0.45)' : 'rgba(255, 255, 255, 0.05)';
            hCtx.lineWidth = isActive ? 3 : 1.5;
            hCtx.stroke();

            hCtx.beginPath();
            hCtx.arc(tip.x, tip.y, isActive ? 6.5 : 4.5, 0, Math.PI * 2);
            hCtx.fillStyle = isActive ? 'rgba(139, 92, 246, 0.6)' : 'rgba(255, 255, 255, 0.05)';
            hCtx.fill();
        }
        hCtx.restore();
    }

    function updateStream() {
        var html = '';
        var isStealth = game.activeSurprise && game.activeSurprise.type === 'STEALTH';
        for (var i = 0; i < game.currentText.length; i++) {
            var char = game.currentText[i];
            var displayChar = char === ' ' ? '␣' : char;
            var stateClass = (i < game.charIndex) ? 'printed' : (i === game.charIndex ? 'current' : '');
            if (isStealth && i >= game.charIndex) stateClass += ' hidden-target';
            html += '<span class="char-box ' + stateClass + '">' + displayChar + '</span>';
        }
        streamEl.innerHTML = html;

        var current = game.currentText[game.charIndex] || '';
        var mapInfo = KEY_FINGER_MAP[current.toLowerCase()];
        if (mapInfo) {
            var mappedIdx = mapInfo.hand === 0 ? mapInfo.finger : mapInfo.finger + 4;
            fingerHintEl.textContent = 'TARGET FINGER: ' + (FINGER_NAMES[mappedIdx] || 'Thumb');
        }

        keys.forEach(function (k) {
            var kVal = k.getAttribute('data-key').toLowerCase();
            k.classList.toggle('target', kVal === current.toLowerCase());
        });

        document.getElementById('stat-streak').textContent = game.streak;
        document.getElementById('multiplier-tag').textContent = game.multiplier + 'x MULTIPLIER';
    }

    function triggerErrorEffect() {
        arenaEl.classList.add('shake');
        setTimeout(function () { arenaEl.classList.remove('shake'); }, 200);
    }

    window.addEventListener('keydown', function (e) {
        var result = handleKey(game, e.key, Date.now());
        if (result.ignored) return;

        keys.forEach(function (k) {
            if (k.getAttribute('data-key').toLowerCase() === e.key.toLowerCase()) {
                k.classList.add('pressed');
                setTimeout(function () { k.classList.remove('pressed'); }, 100);
            }
        });

        if (result.correct) {
            playSyntheticSound(1000 + (game.streak * 20), 0.03);
            if (result.drillComplete) syncAfterDrill();
        } else {
            playSyntheticSound(250, 0.08, 'sawtooth');
            triggerErrorEffect();
        }

        if (result.promoted) {
            playLevelUpSound();
            updateStageUI();
            syncAfterDrill();
        }

        document.getElementById('stat-acc').textContent = accuracy(game) + '%';
        document.getElementById('stat-wpm').textContent = wpm(game, Date.now()) + ' WPM';

        updateMastery();
        updateStream();
    });

    soundBtn.addEventListener('click', function () {
        setSoundEnabled(game, !game.soundEnabled);
        syncSoundButton();
    });

    document.getElementById('btn-reset').addEventListener('click', function () {
        resetProgress(game);
        updateStageUI();
        syncAfterDrill();
        updateStream();
    });

    syncSoundButton();
    updateStageUI();
    newDrill();
    updateStream();
    drawHands();
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initBrowserGame);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        GAME_VERSION: GAME_VERSION,
        STEP_STORAGE_KEY: STEP_STORAGE_KEY,
        SOUND_STORAGE_KEY: SOUND_STORAGE_KEY,
        PROMOTION_MIN_HITS: PROMOTION_MIN_HITS,
        PROMOTION_TARGET_ACC: PROMOTION_TARGET_ACC,
        ADVENTURE_STEPS: ADVENTURE_STEPS,
        KEY_FINGER_MAP: KEY_FINGER_MAP,
        FINGER_NAMES: FINGER_NAMES,
        ENCOUNTERS: ENCOUNTERS,
        createStorage: createStorage,
        loadStepIdx: loadStepIdx,
        createGame: createGame,
        getActiveKeySet: getActiveKeySet,
        generateDrill: generateDrill,
        stageAccuracy: stageAccuracy,
        accuracy: accuracy,
        wpm: wpm,
        multiplierForStreak: multiplierForStreak,
        checkPromotion: checkPromotion,
        handleKey: handleKey,
        bossTimeout: bossTimeout,
        resetProgress: resetProgress,
        setSoundEnabled: setSoundEnabled
    };
}
