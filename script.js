// ==========================================
// SOUND CONFIGURATION
// Add your own sounds here.
// Provide a friendly 'name' and the 'file' path.
// Note: If you add an audio file here, remember to add it to sw.js for offline caching!
// ==========================================
const defaultSounds = [
    { id: 'default_play_me', name: "Play me", file: "audio/Play me.wav", type: 'default_url' }
];

const grid = document.getElementById('soundboard-grid');
const volumeSlider = document.getElementById('volume-slider');
const fadeOutBtn = document.getElementById('fade-out-btn');
const stopBtn = document.getElementById('stop-btn');

let currentVolume = parseFloat(volumeSlider.value);

function updateFadeButtonState() {
    if (!fadeOutBtn) return;
    if (currentVolume < 0.5) {
        fadeOutBtn.textContent = 'Fade In';
        fadeOutBtn.title = 'Fade volume to 1';
    } else {
        fadeOutBtn.textContent = 'Fade Out';
        fadeOutBtn.title = 'Fade volume to 0';
    }
}

updateFadeButtonState();

let fadeInterval = null;
let fadeInInterval = null;
let lastVolumeBeforeMute = 1;
let progressUpdateInterval = null;

// Theme Initialization
const themeToggleBtn = document.getElementById('theme-toggle');
const sunIconPath = `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>`;
const moonIconPath = `<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`;

function setTheme(isDark) {
    if (isDark) {
        document.documentElement.classList.remove('light-theme');
        document.documentElement.classList.add('dark-theme');
        themeToggleBtn.innerHTML = sunIconPath;
        localStorage.setItem('theme', 'dark');
        document.querySelector('meta[name="theme-color"]').setAttribute('content', '#1E222A');
    } else {
        document.documentElement.classList.remove('dark-theme');
        document.documentElement.classList.add('light-theme');
        themeToggleBtn.innerHTML = moonIconPath;
        localStorage.setItem('theme', 'light');
        document.querySelector('meta[name="theme-color"]').setAttribute('content', '#F0F4F8');
    }
}

// Check local storage or system preference on load
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') {
    setTheme(false);
} else {
    // Default to dark per user request
    setTheme(true);
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const isDark = document.documentElement.classList.contains('dark-theme');
        setTheme(!isDark);
    });
}

let customSounds = []; // To store { name, handle } from IndexedDB
let isDeleteMode = false;

// ==========================================
// IndexedDB Setup for Custom Sounds
// ==========================================
const dbName = 'ButtonboardDB';
const dbVersion = 1;
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);

        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            loadCustomSounds().then(resolve);
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains('sounds')) {
                db.createObjectStore('sounds', { keyPath: 'id' });
            }
        };
    });
}

function loadCustomSounds() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['sounds'], 'readonly');
        const store = transaction.objectStore('sounds');
        const request = store.getAll();

        request.onsuccess = async () => {
            let results = request.result || [];

            // If it's the very first time (no records at all, not even the default has been handled)
            // we check if a 'settings' record exists, if not we add the default sound to the store.
            if (!localStorage.getItem('defaultSoundInitialized')) {
                for (const ds of defaultSounds) {
                    await saveCustomSound({
                        id: ds.id,
                        name: ds.name,
                        fileUrl: ds.file,
                        type: ds.type
                    });
                    results.push({
                        id: ds.id,
                        name: ds.name,
                        fileUrl: ds.file,
                        type: ds.type
                    });
                }
                localStorage.setItem('defaultSoundInitialized', 'true');
            }

            customSounds = results;

            // Silently auto-migrate legacy FileHandle items if permission is already granted
            for (const sound of customSounds) {
                if (sound.handle && !sound.audioData) {
                    try {
                        const perm = await sound.handle.queryPermission({ mode: 'read' });
                        if (perm === 'granted') {
                            const file = await sound.handle.getFile();
                            const ab = await file.arrayBuffer();
                            sound.audioData = ab;
                            delete sound.handle;
                            await saveCustomSound({
                                id: sound.id,
                                name: sound.name,
                                isLooped: sound.isLooped,
                                audioData: ab,
                                type: 'blob'
                            });
                        }
                    } catch (e) {
                        console.warn("Background migration skipped for:", sound.name, e);
                    }
                }
            }

            renderButtons();
            resolve();
        };

        request.onerror = (e) => reject(e.target.error);
    });
}

function saveCustomSound(soundData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['sounds'], 'readwrite');
        const store = transaction.objectStore('sounds');
        
        const cleanData = {
            id: soundData.id,
            name: soundData.name,
            type: soundData.type || 'blob',
            isLooped: !!soundData.isLooped
        };
        if (soundData.audioData) cleanData.audioData = soundData.audioData;
        if (soundData.audioBlob) cleanData.audioBlob = soundData.audioBlob;
        if (soundData.fileUrl) cleanData.fileUrl = soundData.fileUrl;
        if (soundData.file) cleanData.file = soundData.file;
        if (soundData.handle) cleanData.handle = soundData.handle;

        const request = store.put(cleanData);

        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

// ==========================================
// FAB Logic
// ==========================================
const fabWrapper = document.querySelector('.fab-wrapper');
const fabMain = document.getElementById('fab-main');
const fabAddFiles = document.getElementById('fab-add-files');
const fabRemoveMedia = document.getElementById('fab-remove-media');

if (fabMain) {
    fabMain.addEventListener('click', () => {
        fabWrapper.classList.toggle('open');
        // If we close FAB, disable delete mode
        if (!fabWrapper.classList.contains('open') && isDeleteMode) {
            toggleDeleteMode(false);
        }
    });

    // Close FAB when clicking outside
    document.addEventListener('click', (e) => {
        if (fabWrapper.classList.contains('open') && !fabWrapper.contains(e.target)) {
            fabWrapper.classList.remove('open');
            if (isDeleteMode) toggleDeleteMode(false);
        }
    });
}

function toggleDeleteMode(force) {
    isDeleteMode = force !== undefined ? force : !isDeleteMode;
    const gridEl = document.getElementById('soundboard-grid');
    if (isDeleteMode) {
        gridEl.classList.add('delete-mode');
        fabRemoveMedia.style.backgroundColor = '#F43F5E';
        fabRemoveMedia.style.color = '#FFFFFF';
    } else {
        gridEl.classList.remove('delete-mode');
        fabRemoveMedia.style.backgroundColor = '';
        fabRemoveMedia.style.color = '';
    }
}

async function verifyPermission(fileHandle, readWrite) {
    const options = {};
    if (readWrite) {
        options.mode = 'readwrite';
    }
    try {
        if ((await fileHandle.queryPermission(options)) === 'granted') {
            return true;
        }
        if ((await fileHandle.requestPermission(options)) === 'granted') {
            return true;
        }
    } catch (e) {
        console.warn("Permission check error:", e);
    }
    return false;
}

function triggerFileInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac';
    input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                const soundData = {
                    id: id,
                    name: file.name.replace(/\.[^/.]+$/, ""),
                    audioData: arrayBuffer,
                    type: 'blob'
                };
                customSounds.push(soundData);
                await saveCustomSound(soundData);
            } catch (err) {
                console.error('Error reading file:', err);
            }
        }
        renderButtons();
    };
    input.click();
}

function addMediaFiles() {
    if ('showOpenFilePicker' in window) {
        window.showOpenFilePicker({
            multiple: true,
            types: [{
                description: 'Audio Files',
                accept: { 'audio/*': ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'] }
            }]
        }).then(async (handles) => {
            for (const handle of handles) {
                try {
                    const file = await handle.getFile();
                    const arrayBuffer = await file.arrayBuffer();
                    const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                    const soundData = {
                        id: id,
                        name: handle.name.replace(/\.[^/.]+$/, ""),
                        audioData: arrayBuffer,
                        type: 'blob'
                    };
                    customSounds.push(soundData);
                    await saveCustomSound(soundData);
                } catch (err) {
                    console.error('Error processing selected file handle:', err);
                }
            }
            renderButtons();
        }).catch((e) => {
            if (e.name !== 'AbortError') {
                console.warn('showOpenFilePicker error or fallback:', e);
                triggerFileInput();
            }
        });
    } else {
        triggerFileInput();
    }
}

if (fabAddFiles) {
    fabAddFiles.addEventListener('click', () => {
        fabWrapper.classList.remove('open');
        if (isDeleteMode) toggleDeleteMode(false);
        addMediaFiles();
    });
}

if (fabRemoveMedia) {
    fabRemoveMedia.addEventListener('click', () => {
        toggleDeleteMode();
    });
}

// ==========================================
// Web Audio API Engine for Gapless Looping
// ==========================================
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

const bufferCache = new Map(); // soundId -> AudioBuffer
let activeSessions = []; // Stores active Web Audio playback sessions

async function getSoundArrayBuffer(sound) {
    try {
        // 1. ArrayBuffer stored directly in IndexedDB (permission prompt free!)
        if (sound.audioData) {
            return sound.audioData.slice(0);
        }

        // 2. Blob stored in IndexedDB
        if (sound.audioBlob) {
            const ab = await sound.audioBlob.arrayBuffer();
            return ab.slice(0);
        }

        // 3. Legacy handle migration: loaded from previous FileSystemFileHandle
        if (sound.custom && sound.handle) {
            const hasPermission = await verifyPermission(sound.handle, false);
            if (!hasPermission) return null;
            const file = await sound.handle.getFile();
            const arrayBuffer = await file.arrayBuffer();

            // Store binary directly into IndexedDB & remove handle so browser permission prompt never fires again
            sound.audioData = arrayBuffer;
            delete sound.handle;
            await saveCustomSound({
                id: sound.id,
                name: sound.name,
                isLooped: sound.isLooped,
                audioData: arrayBuffer,
                type: 'blob'
            });

            return arrayBuffer.slice(0);
        }

        // 4. Predefined URL assets (e.g. audio/Play me.wav)
        const url = sound.fileUrl || sound.file;
        if (url) {
            const encodedUrl = encodeURI(url);
            const res = await fetch(encodedUrl);
            if (!res.ok) {
                console.error(`Fetch failed (${res.status}) for: ${encodedUrl}`);
                return null;
            }
            return await res.arrayBuffer();
        }
    } catch (err) {
        console.error("Error loading sound array buffer:", err);
    }
    return null;
}

async function loadAudioBuffer(sound) {
    if (bufferCache.has(sound.id)) {
        return bufferCache.get(sound.id);
    }
    try {
        const arrayBuffer = await getSoundArrayBuffer(sound);
        if (!arrayBuffer) return null;
        const ctx = getAudioContext();
        
        // Fail-safe decodeAudioData supporting both Promises and Callbacks
        const decoded = await new Promise((resolve, reject) => {
            try {
                const res = ctx.decodeAudioData(arrayBuffer, resolve, reject);
                if (res && typeof res.then === 'function') {
                    res.then(resolve).catch(reject);
                }
            } catch (err) {
                reject(err);
            }
        });

        bufferCache.set(sound.id, decoded);
        return decoded;
    } catch (e) {
        console.error("Failed to decode audio buffer for:", sound.name, e);
        return null;
    }
}

function stopAllActiveSessions() {
    activeSessions.forEach(session => {
        try {
            session.sourceNode.stop();
            session.sourceNode.disconnect();
            session.gainNode.disconnect();
        } catch (e) {}
    });
    activeSessions = [];
    document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('playing'));

    if (progressUpdateInterval) clearInterval(progressUpdateInterval);
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) progressBar.style.width = '0%';
}

function deleteCustomSound(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['sounds'], 'readwrite');
        const store = transaction.objectStore('sounds');
        const request = store.delete(id);

        request.onsuccess = () => {
            bufferCache.delete(id);
            stopAllActiveSessions();
            customSounds = customSounds.filter(s => s.id !== id);
            renderButtons();
            resolve();
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

function renderButtons() {
    grid.innerHTML = ''; // Clear just in case

    // All sounds are now treated as custom (or originally default but stored in DB)
    const allSounds = customSounds.map(s => ({ ...s, custom: true }));

    allSounds.forEach(sound => {
        // Preload buffer in background
        loadAudioBuffer(sound).catch(() => {});

        const btn = document.createElement('div');
        btn.className = 'sound-btn';
        btn.setAttribute('role', 'button');
        btn.setAttribute('tabindex', '0');
        if (sound.custom) btn.classList.add('custom-sound');

        // Loop Badge (Lucide Infinity Icon)
        const loopBadge = document.createElement('span');
        loopBadge.className = 'tile-loop-badge';
        loopBadge.style.display = sound.isLooped ? 'flex' : 'none';
        loopBadge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-infinity"><path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 1 0 0-8c-2 0-4 1.33-6 4Z"/></svg>`;
        btn.appendChild(loopBadge);

        // Sound Name Text
        const nameSpan = document.createElement('span');
        nameSpan.className = 'sound-name';
        nameSpan.textContent = sound.name;
        btn.appendChild(nameSpan);

        // Three Dot Options Button
        const menuBtn = document.createElement('button');
        menuBtn.className = 'tile-menu-btn';
        menuBtn.setAttribute('aria-label', `Options for ${sound.name}`);
        menuBtn.title = 'Options';
        menuBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-more-vertical"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`;

        const handleMenuClick = (e) => {
            if (e && e.cancelable) e.preventDefault();
            if (e && e.stopPropagation) e.stopPropagation();
            openBottomSheet(sound);
        };

        menuBtn.addEventListener('click', handleMenuClick);
        menuBtn.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });
        menuBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        btn.appendChild(menuBtn);

        let lastPlayed = 0;

        const handleInteraction = async (e) => {
            // Ignore click if target is tile menu button
            if (e && e.target && e.target.closest('.tile-menu-btn')) {
                return;
            }

            // Prevent default behavior to avoid double-firing events
            if (e && e.cancelable) e.preventDefault();

            // Direct user gesture: Unlock / resume AudioContext synchronously!
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            // Defend against simultaneous fired touchstart + mousedown
            const now = Date.now();
            if (now - lastPlayed < 100) return;
            lastPlayed = now;

            // Handle Delete Mode
            if (isDeleteMode) {
                if (sound.custom) {
                    await deleteCustomSound(sound.id);
                } else {
                    btn.style.animation = 'none';
                    void btn.offsetWidth; // trigger reflow
                    btn.style.animation = 'shake 0.4s ease-in-out';
                }
                return;
            }

            // Add active class for visual tactile feedback
            btn.classList.add('active');
            setTimeout(() => btn.classList.remove('active'), 150);

            const buffer = await loadAudioBuffer(sound);
            if (!buffer) {
                console.error("Audio buffer not available for:", sound.name);
                return;
            }

            stopAllActiveSessions();

            // Cancel any ongoing global fades
            if (fadeInterval) {
                clearInterval(fadeInterval);
                fadeInterval = null;
                fadeOutBtn.disabled = false;
            }
            if (fadeInInterval) {
                clearInterval(fadeInInterval);
                fadeInInterval = null;
            }

            const sourceNode = ctx.createBufferSource();
            sourceNode.buffer = buffer;
            sourceNode.loop = !!sound.isLooped;

            const gainNode = ctx.createGain();
            const sliderVolume = parseFloat(volumeSlider.value);

            if (sliderVolume === 0 || currentVolume === 0) {
                currentVolume = 0;
                gainNode.gain.setValueAtTime(0, ctx.currentTime);
                volumeSlider.value = 0;

                const duration = 3000;
                const intervalTime = 50;
                const steps = duration / intervalTime;
                let currentStep = 0;

                fadeInInterval = setInterval(() => {
                    currentStep++;
                    let newVol = currentStep / steps;
                    if (newVol > 1) newVol = 1;

                    currentVolume = newVol;
                    volumeSlider.value = newVol;

                    activeSessions.forEach(s => {
                        s.gainNode.gain.setValueAtTime(newVol, ctx.currentTime);
                    });

                    if (currentStep >= steps) {
                        clearInterval(fadeInInterval);
                        fadeInInterval = null;
                    }
                }, intervalTime);
            } else {
                gainNode.gain.setValueAtTime(currentVolume, ctx.currentTime);
            }

            sourceNode.connect(gainNode);
            gainNode.connect(ctx.destination);

            const session = {
                soundId: sound.id,
                sourceNode: sourceNode,
                gainNode: gainNode,
                buffer: buffer,
                startTime: ctx.currentTime,
                btn: btn
            };

            activeSessions.push(session);
            btn.classList.add('playing');

            sourceNode.onended = () => {
                if (!sourceNode.loop) {
                    activeSessions = activeSessions.filter(s => s !== session);
                    if (activeSessions.length === 0) {
                        btn.classList.remove('playing');
                    }
                }
            };

            sourceNode.start(0);

            // Start updating progress bar exclusively for this audio
            if (progressUpdateInterval) clearInterval(progressUpdateInterval);
            const progressBar = document.getElementById('progress-bar');

            progressUpdateInterval = setInterval(() => {
                if (activeSessions.length > 0) {
                    const active = activeSessions[activeSessions.length - 1];
                    const dur = active.buffer.duration;
                    const elapsed = ctx.currentTime - active.startTime;
                    const currentProgress = (elapsed % dur) / dur;
                    const percent = currentProgress * 100;
                    if (progressBar) progressBar.style.width = `${percent}%`;
                } else {
                    if (progressBar) progressBar.style.width = '0%';
                    clearInterval(progressUpdateInterval);
                }
            }, 50);
        };

        // Fast-response mobile binding: touchstart triggers faster than a click
        btn.addEventListener('touchstart', handleInteraction, { passive: false });

        // Binding for mouse users 
        btn.addEventListener('mousedown', (e) => {
            if (e.pointerType !== "touch") handleInteraction(e);
        });

        grid.appendChild(btn);
    });
}

// Tap Icon to toggle volume between 0 and previous volume (or 1)
const volumeIcon = document.querySelector('.volume-icon');
if (volumeIcon) {
    volumeIcon.style.cursor = 'pointer';
    volumeIcon.addEventListener('click', () => {
        const isMuted = currentVolume === 0;

        if (isMuted) {
            currentVolume = lastVolumeBeforeMute > 0 ? lastVolumeBeforeMute : 1;
            volumeIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`;
        } else {
            lastVolumeBeforeMute = currentVolume;
            currentVolume = 0;
            volumeIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" x2="17" y1="9" y2="15"/><line x1="17" x2="23" y1="9" y2="15"/>`;
        }

        volumeSlider.value = currentVolume;
        updateFadeButtonState();

        if (audioCtx) {
            activeSessions.forEach(s => {
                s.gainNode.gain.setValueAtTime(currentVolume, audioCtx.currentTime);
            });
        }

        if (fadeInterval) {
            clearInterval(fadeInterval);
            fadeInterval = null;
            fadeOutBtn.disabled = false;
        }
        if (fadeInInterval) {
            clearInterval(fadeInInterval);
            fadeInInterval = null;
        }
        updateFadeButtonState();
    });
}

// Update global volume & apply instantly to all currently playing sounds
volumeSlider.addEventListener('input', (e) => {
    currentVolume = parseFloat(e.target.value);
    updateFadeButtonState();

    // Stop fading if user manually changes slider
    if (fadeInterval) {
        clearInterval(fadeInterval);
        fadeInterval = null;
        fadeOutBtn.disabled = false;
    }
    if (fadeInInterval) {
        clearInterval(fadeInInterval);
        fadeInInterval = null;
    }

    if (audioCtx) {
        activeSessions.forEach(s => {
            s.gainNode.gain.setValueAtTime(currentVolume, audioCtx.currentTime);
        });
    }
});

// Fade In / Fade Out Logic
fadeOutBtn.addEventListener('click', () => {
    fadeOutBtn.disabled = true;

    const duration = 3000; // 3 seconds
    const intervalTime = 50;
    const steps = duration / intervalTime;

    let startVolume = parseFloat(volumeSlider.value);
    let currentStep = 0;

    if (fadeInterval) clearInterval(fadeInterval);
    if (fadeInInterval) clearInterval(fadeInInterval);
    fadeInInterval = null;

    const isFadeIn = startVolume < 0.5;

    fadeInterval = setInterval(() => {
        currentStep++;
        let newVol;
        if (isFadeIn) {
            newVol = startVolume + (1.0 - startVolume) * (currentStep / steps);
            if (newVol > 1) newVol = 1;
        } else {
            newVol = startVolume * (1 - (currentStep / steps));
            if (newVol < 0) newVol = 0;
        }

        currentVolume = newVol;
        volumeSlider.value = newVol;
        updateFadeButtonState();

        if (audioCtx) {
            activeSessions.forEach(s => {
                s.gainNode.gain.setValueAtTime(newVol, audioCtx.currentTime);
            });
        }

        if (currentStep >= steps) {
            clearInterval(fadeInterval);
            fadeInterval = null;
            fadeOutBtn.disabled = false;
            updateFadeButtonState();
        }
    }, intervalTime);
});

// Stop All Sounds Logic
stopBtn.addEventListener('click', () => {
    // Cancel any ongoing fades
    if (fadeInterval) {
        clearInterval(fadeInterval);
        fadeInterval = null;
        fadeOutBtn.disabled = false;
    }
    if (fadeInInterval) {
        clearInterval(fadeInInterval);
        fadeInInterval = null;
    }

    stopAllActiveSessions();
    updateFadeButtonState();

    // Give a brief visual feedback on the button
    stopBtn.classList.add('active');
    setTimeout(() => stopBtn.classList.remove('active'), 150);
});

// ==========================================
// Bottom Sheet Menu Controller
// ==========================================
let currentActiveSound = null;

const backdrop = document.getElementById('bottom-sheet-backdrop');
const sheet = document.getElementById('bottom-sheet');
const sheetSoundName = document.getElementById('sheet-sound-name');
const sheetOptionLoop = document.getElementById('sheet-option-loop');
const sheetLoopToggle = document.getElementById('sheet-loop-toggle');
const sheetOptionDelete = document.getElementById('sheet-option-delete');

function openBottomSheet(sound) {
    currentActiveSound = sound;
    if (sheetSoundName) sheetSoundName.textContent = sound.name;
    if (sheetLoopToggle) sheetLoopToggle.checked = !!sound.isLooped;

    if (backdrop) {
        backdrop.classList.add('open');
        backdrop.setAttribute('aria-hidden', 'false');
    }
    if (sheet) {
        sheet.classList.add('open');
        sheet.setAttribute('aria-hidden', 'false');
    }
}

function closeBottomSheet() {
    currentActiveSound = null;
    if (backdrop) {
        backdrop.classList.remove('open');
        backdrop.setAttribute('aria-hidden', 'true');
    }
    if (sheet) {
        sheet.classList.remove('open');
        sheet.setAttribute('aria-hidden', 'true');
        sheet.style.transform = '';
    }
}

if (backdrop) {
    backdrop.addEventListener('click', closeBottomSheet);
}

if (sheetOptionLoop) {
    sheetOptionLoop.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!currentActiveSound) return;

        currentActiveSound.isLooped = !currentActiveSound.isLooped;
        if (sheetLoopToggle) sheetLoopToggle.checked = currentActiveSound.isLooped;

        // Save updated sound object to IndexedDB
        await saveCustomSound({ ...currentActiveSound });

        // Also update local customSounds memory array
        const idx = customSounds.findIndex(s => s.id === currentActiveSound.id);
        if (idx !== -1) {
            customSounds[idx].isLooped = currentActiveSound.isLooped;
        }

        // Apply updated loop setting to active sessions matching this sound
        activeSessions.forEach(s => {
            if (s.soundId === currentActiveSound.id) {
                s.sourceNode.loop = !!currentActiveSound.isLooped;
            }
        });

        // Re-render buttons to reflect loop badge status on sound tile
        renderButtons();
    });
}

if (sheetOptionDelete) {
    sheetOptionDelete.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!currentActiveSound) return;
        const soundId = currentActiveSound.id;
        closeBottomSheet();
        await deleteCustomSound(soundId);
    });
}

[sheetOptionLoop, sheetOptionDelete].forEach(option => {
    if (option) {
        option.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                option.click();
            }
        });
    }
});

// Keyboard ESC to close bottom sheet
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet && sheet.classList.contains('open')) {
        closeBottomSheet();
    }
});

// Drag down gesture to dismiss bottom sheet
if (sheet) {
    let touchStartY = 0;
    let touchCurrentY = 0;
    let isDraggingSheet = false;

    sheet.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        touchStartY = touch.clientY;
        isDraggingSheet = true;
    }, { passive: true });

    sheet.addEventListener('touchmove', (e) => {
        if (!isDraggingSheet) return;
        const touch = e.touches[0];
        touchCurrentY = touch.clientY;
        const deltaY = touchCurrentY - touchStartY;

        if (deltaY > 0) {
            sheet.style.transform = `translateY(${deltaY}px)`;
            sheet.style.transition = 'none';
        }
    }, { passive: true });

    sheet.addEventListener('touchend', () => {
        if (!isDraggingSheet) return;
        isDraggingSheet = false;
        sheet.style.transition = '';
        const deltaY = touchCurrentY - touchStartY;
        if (deltaY > 70) {
            closeBottomSheet();
        } else {
            sheet.style.transform = '';
        }
        touchStartY = 0;
        touchCurrentY = 0;
    }, { passive: true });
}

// Start app
initDB().catch(err => {
    console.error("Failed to initialize database", err);
    // Fallback if IDB fails
    renderButtons();
});

// ==========================================
// SERVICE WORKER REGISTRATION & CACHE CLEARING
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Auto-clear old caches to ensure the new "Soundboard" updates apply immediately
        caches.keys().then(names => {
            for (let name of names) {
                if (name !== 'soundboard-v22') {
                    caches.delete(name);
                }
            }
        });

        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker Registered successfully! scope:', reg.scope))
            .catch(err => console.error('Service Worker Registration Failed!', err));
    });
}
