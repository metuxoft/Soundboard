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
const crossfadeToggleBtn = document.getElementById('crossfade-toggle-btn');
const muteToggleBtn = document.getElementById('mute-toggle-btn');
const volumeIcon = document.querySelector('.volume-icon');
const settingsBtn = document.getElementById('settings-btn');
const settingsBackdrop = document.getElementById('settings-sheet-backdrop');
const settingsSheet = document.getElementById('settings-sheet');
const settingsFadeOption = document.getElementById('settings-option-fade');
const settingsFadeSelect = document.getElementById('settings-fade-select');

let currentVolume = parseFloat(volumeSlider.value);
let crossfadeEnabled = true;
let fadeDuration = parseFloat(localStorage.getItem('fadeDuration')) || 3;

if (settingsFadeSelect) {
    settingsFadeSelect.value = fadeDuration.toString();
}

const fadeDecreasingIcon = `<svg class="lucide lucide-chart-no-axes-column-decreasing" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V3"/><path d="M12 21V9"/><path d="M19 21v-6"/></svg>`;
const fadeIncreasingIcon = `<svg class="lucide lucide-chart-no-axes-column-increasing" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21v-6"/><path d="M12 21V9"/><path d="M19 21V3"/></svg>`;

function updateFadeButtonState() {
    if (!fadeOutBtn) return;
    if (currentVolume < 0.5) {
        fadeOutBtn.innerHTML = fadeIncreasingIcon;
        fadeOutBtn.title = 'Fade volume to 1';
        fadeOutBtn.setAttribute('aria-label', 'Fade volume to 1');
    } else {
        fadeOutBtn.innerHTML = fadeDecreasingIcon;
        fadeOutBtn.title = 'Fade volume to 0';
        fadeOutBtn.setAttribute('aria-label', 'Fade volume to 0');
    }
}

function updateVolumeIconState() {
    if (!volumeIcon || !muteToggleBtn) return;
    if (currentVolume === 0) {
        volumeIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" x2="17" y1="9" y2="15"/><line x1="17" x2="23" y1="9" y2="15"/>`;
        muteToggleBtn.classList.add('muted');
        muteToggleBtn.title = 'Unmute volume';
    } else if (currentVolume < 0.5) {
        volumeIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
        muteToggleBtn.classList.remove('muted');
        muteToggleBtn.title = 'Mute volume';
    } else {
        volumeIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`;
        muteToggleBtn.classList.remove('muted');
        muteToggleBtn.title = 'Mute volume';
    }
}

updateFadeButtonState();
updateVolumeIconState();

let fadeInterval = null;
let fadeInInterval = null;
let lastVolumeBeforeMute = 1;
let progressUpdateInterval = null;

function triggerFadeIn() {
    if (fadeInterval) {
        clearInterval(fadeInterval);
        fadeInterval = null;
    }
    if (fadeInInterval) {
        clearInterval(fadeInInterval);
        fadeInInterval = null;
    }
    if (fadeOutBtn) fadeOutBtn.disabled = true;

    const duration = fadeDuration * 1000;
    const intervalTime = 50;
    const steps = duration / intervalTime;
    let startVolume = parseFloat(volumeSlider.value);
    let currentStep = 0;

    fadeInInterval = setInterval(() => {
        currentStep++;
        let newVol = startVolume + (1.0 - startVolume) * (currentStep / steps);
        if (newVol > 1) newVol = 1;

        currentVolume = newVol;
        volumeSlider.value = newVol;
        updateFadeButtonState();
        updateVolumeIconState();

        if (audioCtx) {
            activeSessions.forEach(s => {
                const soundVol = (s.sound && s.sound.volume !== undefined) ? s.sound.volume : 1.0;
                s.gainNode.gain.setValueAtTime(soundVol * newVol, audioCtx.currentTime);
            });
        }

        if (currentStep >= steps) {
            clearInterval(fadeInInterval);
            fadeInInterval = null;
            if (fadeOutBtn) fadeOutBtn.disabled = false;
            updateFadeButtonState();
        }
    }, intervalTime);
}
// Clean up any remaining theme preferences
localStorage.removeItem('theme');

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
                                isAdditive: sound.isAdditive,
                                isSolo: sound.isSolo,
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
            isLooped: !!soundData.isLooped,
            isAdditive: !!soundData.isAdditive,
            isSolo: !!soundData.isSolo,
            volume: soundData.volume !== undefined ? parseFloat(soundData.volume) : 1.0
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
            if (isDeleteMode && e.target.closest('.sound-btn')) {
                return;
            }
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
                isAdditive: sound.isAdditive,
                isSolo: sound.isSolo,
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
            if (session.crossfadeGainNode) {
                session.crossfadeGainNode.disconnect();
            }
        } catch (e) {}
    });
    activeSessions = [];
    document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('playing'));

    if (progressUpdateInterval) clearInterval(progressUpdateInterval);
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) progressBar.style.width = '0%';
}

function stopSessionImmediately(session) {
    try {
        session.sourceNode.stop();
        session.sourceNode.disconnect();
        session.gainNode.disconnect();
        if (session.crossfadeGainNode) {
            session.crossfadeGainNode.disconnect();
        }
    } catch (e) {}
    if (session.btn) {
        session.btn.classList.remove('playing');
    }
    activeSessions = activeSessions.filter(s => s !== session);
}

function fadeOutAndStopSession(session, duration = fadeDuration) {
    if (session.isFadingOut) return;
    session.isFadingOut = true;

    if (session.btn) {
        session.btn.classList.remove('playing');
    }

    const ctx = getAudioContext();
    try {
        const currentGainVal = session.crossfadeGainNode.gain.value;
        session.crossfadeGainNode.gain.setValueAtTime(currentGainVal, ctx.currentTime);
        session.crossfadeGainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
        session.sourceNode.stop(ctx.currentTime + duration);
    } catch (e) {
        console.warn("Error scheduling fade out:", e);
    }

    setTimeout(() => {
        try {
            session.sourceNode.disconnect();
            session.gainNode.disconnect();
            if (session.crossfadeGainNode) {
                session.crossfadeGainNode.disconnect();
            }
        } catch (e) {}

        activeSessions = activeSessions.filter(s => s !== session);

        if (activeSessions.length === 0) {
            if (progressUpdateInterval) {
                clearInterval(progressUpdateInterval);
                progressUpdateInterval = null;
            }
            const progressBar = document.getElementById('progress-bar');
            if (progressBar) progressBar.style.width = '0%';
        }
    }, duration * 1000);
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

function updateActiveSessionsGain() {
    if (!audioCtx) return;
    activeSessions.forEach(s => {
        const soundVol = (s.sound && s.sound.volume !== undefined) ? s.sound.volume : 1.0;
        const effectiveVol = soundVol * currentVolume;
        s.gainNode.gain.setValueAtTime(effectiveVol, audioCtx.currentTime);
    });
}

function updateSoundVolume(sound, newVolume, shouldSave = true) {
    sound.volume = Math.max(0, Math.min(1, Math.round(newVolume * 100) / 100));

    // Find button in DOM
    const btn = document.querySelector(`.sound-btn[data-id="${sound.id}"]`);
    if (btn) {
        const fill = btn.querySelector('.tile-volume-fill');
        if (fill) fill.style.width = `${sound.volume * 100}%`;
        const badge = btn.querySelector('.tile-volume-badge');
        if (badge) badge.textContent = `${Math.round(sound.volume * 100)}%`;
    }

    // Update active web audio sessions gain for this sound
    if (audioCtx) {
        activeSessions.forEach(s => {
            if (s.soundId === sound.id) {
                const effectiveGain = sound.volume * currentVolume;
                s.gainNode.gain.setValueAtTime(effectiveGain, audioCtx.currentTime);
            }
        });
    }

    // Update bottom sheet slider if open for this sound
    if (currentActiveSound && currentActiveSound.id === sound.id) {
        const sheetSlider = document.getElementById('sheet-volume-slider');
        const sheetVal = document.getElementById('sheet-volume-val');
        if (sheetSlider) sheetSlider.value = sound.volume;
        if (sheetVal) sheetVal.textContent = `${Math.round(sound.volume * 100)}%`;
    }

    // Update local memory customSounds array
    const idx = customSounds.findIndex(s => s.id === sound.id);
    if (idx !== -1) {
        customSounds[idx].volume = sound.volume;
    }

    if (shouldSave) {
        saveCustomSound({ ...sound });
    }
}

function renderButtons() {
    grid.innerHTML = ''; // Clear just in case

    // All sounds are now treated as custom (or originally default but stored in DB)
    const allSounds = customSounds.map(s => ({ ...s, custom: true }));

    allSounds.forEach(sound => {
        sound.volume = sound.volume !== undefined ? parseFloat(sound.volume) : 1.0;

        // Preload buffer in background
        loadAudioBuffer(sound).catch(() => {});

        const btn = document.createElement('div');
        btn.className = 'sound-btn';
        btn.setAttribute('role', 'button');
        btn.setAttribute('tabindex', '0');
        btn.setAttribute('data-id', sound.id);
        if (sound.custom) btn.classList.add('custom-sound');

        // Volume Fill Overlay (Google Home Light Tile Style)
        const volumeFill = document.createElement('div');
        volumeFill.className = 'tile-volume-fill';
        volumeFill.style.width = `${sound.volume * 100}%`;
        btn.appendChild(volumeFill);

        // Volume Percentage Badge
        const volumeBadge = document.createElement('span');
        volumeBadge.className = 'tile-volume-badge';
        volumeBadge.textContent = `${Math.round(sound.volume * 100)}%`;
        btn.appendChild(volumeBadge);

        // Badges Container (Loop & Additive Icons)
        const badgesContainer = document.createElement('div');
        badgesContainer.className = 'tile-badges';

        // Loop Badge (Lucide Infinity Icon)
        const loopBadge = document.createElement('span');
        loopBadge.className = 'tile-badge tile-loop-badge';
        loopBadge.style.display = sound.isLooped ? 'flex' : 'none';
        loopBadge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-infinity"><path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 1 0 0-8c-2 0-4 1.33-6 4Z"/></svg>`;
        badgesContainer.appendChild(loopBadge);

        // Additive Badge (Lucide Layers Icon)
        const additiveBadge = document.createElement('span');
        additiveBadge.className = 'tile-badge tile-additive-badge';
        additiveBadge.style.display = sound.isAdditive ? 'flex' : 'none';
        additiveBadge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layers"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
        badgesContainer.appendChild(additiveBadge);

        // Solo Badge (Lucide Step Forward Icon)
        const soloBadge = document.createElement('span');
        soloBadge.className = 'tile-badge tile-solo-badge';
        soloBadge.style.display = sound.isSolo ? 'flex' : 'none';
        soloBadge.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-step-forward"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`;
        badgesContainer.appendChild(soloBadge);

        btn.appendChild(badgesContainer);

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

        // Swipe & Drag Gesture Handling for Per-Tile Volume
        let pointerStartX = 0;
        let pointerStartY = 0;
        let isSwiping = false;
        let activePointerId = null;
        let tileRect = null;
        let ignoreTapUntil = 0;

        btn.addEventListener('pointerdown', (e) => {
            if (e.target && e.target.closest('.tile-menu-btn')) return;

            pointerStartX = e.clientX;
            pointerStartY = e.clientY;
            isSwiping = false;
            activePointerId = e.pointerId;
            tileRect = btn.getBoundingClientRect();
        });

        btn.addEventListener('pointermove', (e) => {
            if (isDeleteMode) return;
            if (activePointerId === null || e.pointerId !== activePointerId) return;

            const deltaX = e.clientX - pointerStartX;
            const deltaY = e.clientY - pointerStartY;

            if (!isSwiping) {
                if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
                    isSwiping = true;
                    btn.classList.add('swiping');
                    try {
                        btn.setPointerCapture(e.pointerId);
                    } catch (err) {}
                }
            }

            if (isSwiping) {
                if (e.cancelable) e.preventDefault();
                let ratio = (e.clientX - tileRect.left) / tileRect.width;
                ratio = Math.max(0, Math.min(1, ratio));
                updateSoundVolume(sound, ratio, false);
            }
        });

        const finishPointer = async (e) => {
            if (activePointerId !== null && e.pointerId === activePointerId) {
                const deltaX = e.clientX - pointerStartX;
                const deltaY = e.clientY - pointerStartY;
                const dist = Math.hypot(deltaX, deltaY);

                if (isSwiping) {
                    btn.classList.remove('swiping');
                    try {
                        btn.releasePointerCapture(e.pointerId);
                    } catch (err) {}
                    saveCustomSound({ ...sound });
                } else if (dist <= 8) {
                    // Tap gesture (no swipe drag): trigger audio play/stop toggle
                    await handleInteraction(e);
                }
                activePointerId = null;
                isSwiping = false;
            }
        };

        btn.addEventListener('pointerup', finishPointer);
        btn.addEventListener('pointercancel', (e) => {
            if (activePointerId !== null && e.pointerId === activePointerId) {
                if (isSwiping) {
                    btn.classList.remove('swiping');
                    try {
                        btn.releasePointerCapture(e.pointerId);
                    } catch (err) {}
                    saveCustomSound({ ...sound });
                }
                activePointerId = null;
                isSwiping = false;
            }
        });

        // Mouse Scroll Wheel Handling for Per-Tile Volume
        let wheelDebounceTimeout = null;

        btn.addEventListener('wheel', (e) => {
            if (isDeleteMode) return;
            if (e.cancelable) e.preventDefault();

            const currentVol = sound.volume !== undefined ? sound.volume : 1.0;
            // Scroll UP (deltaY < 0) increases volume, scroll DOWN (deltaY > 0) decreases volume
            const step = 0.05;
            let delta = 0;
            if (e.deltaY < 0) {
                delta = step;
            } else if (e.deltaY > 0) {
                delta = -step;
            }

            if (delta !== 0) {
                const newVol = Math.max(0, Math.min(1, Math.round((currentVol + delta) * 100) / 100));

                btn.classList.add('swiping');
                updateSoundVolume(sound, newVol, false);

                clearTimeout(wheelDebounceTimeout);
                wheelDebounceTimeout = setTimeout(() => {
                    btn.classList.remove('swiping');
                    saveCustomSound({ ...sound });
                }, 300);
            }
        }, { passive: false });

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

            // If track is already playing, stop it instead of starting over
            const isPlaying = activeSessions.some(s => s.soundId === sound.id && !s.isFadingOut);
            if (isPlaying) {
                activeSessions.forEach(session => {
                    if (session.soundId === sound.id && !session.isFadingOut) {
                        if (crossfadeEnabled) {
                            fadeOutAndStopSession(session);
                        } else {
                            stopSessionImmediately(session);
                        }
                    }
                });

                // Update playing class state for buttons
                document.querySelectorAll('.sound-btn').forEach(b => {
                    const bId = b.getAttribute('data-id');
                    const isStillActive = activeSessions.some(s => s.soundId === bId && !s.isFadingOut);
                    if (!isStillActive) {
                        b.classList.remove('playing');
                    }
                });

                const activeNonFading = activeSessions.filter(s => !s.isFadingOut);
                if (activeNonFading.length === 0) {
                    if (progressUpdateInterval) {
                        clearInterval(progressUpdateInterval);
                        progressUpdateInterval = null;
                    }
                    const progressBar = document.getElementById('progress-bar');
                    if (progressBar) progressBar.style.width = '0%';
                }
                return;
            }

            const buffer = await loadAudioBuffer(sound);
            if (!buffer) {
                console.error("Audio buffer not available for:", sound.name);
                return;
            }

            if (sound.isSolo) {
                // Solo track: stop all active sessions of ALL tracks, including additive ones
                activeSessions.forEach(session => {
                    if (!session.isFadingOut) {
                        if (crossfadeEnabled) {
                            fadeOutAndStopSession(session);
                        } else {
                            stopSessionImmediately(session);
                        }
                    }
                });
            } else if (sound.isAdditive) {
                // Additive track: stop previous active session of THIS sound if already playing
                activeSessions.forEach(session => {
                    if (session.soundId === sound.id && !session.isFadingOut) {
                        if (crossfadeEnabled) {
                            fadeOutAndStopSession(session);
                        } else {
                            stopSessionImmediately(session);
                        }
                    }
                });
            } else {
                // Non-additive track: stop all active sessions of non-additive tracks.
                // Additive tracks keep playing together with this track.
                activeSessions.forEach(session => {
                    if ((!session.sound || !session.sound.isAdditive) && !session.isFadingOut) {
                        if (crossfadeEnabled) {
                            fadeOutAndStopSession(session);
                        } else {
                            stopSessionImmediately(session);
                        }
                    }
                });
            }

            // Update playing class state for buttons
            document.querySelectorAll('.sound-btn').forEach(b => {
                const bId = b.getAttribute('data-id');
                const isStillActive = activeSessions.some(s => s.soundId === bId && !s.isFadingOut);
                if (!isStillActive) {
                    b.classList.remove('playing');
                }
            });

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

            const soundVol = sound.volume !== undefined ? sound.volume : 1.0;
            const effectiveGain = soundVol * currentVolume;

            const gainNode = ctx.createGain();
            gainNode.gain.setValueAtTime(effectiveGain, ctx.currentTime);

            const crossfadeGainNode = ctx.createGain();
            // Determine if we should fade in this new track. We only fade in if crossfade is enabled
            // AND global auto fade-in is not running (to avoid conflict with global volume ramp).
            const shouldFadeIn = crossfadeEnabled && (currentVolume >= 0.5);
            if (shouldFadeIn) {
                crossfadeGainNode.gain.setValueAtTime(0, ctx.currentTime);
                crossfadeGainNode.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeDuration);
            } else {
                crossfadeGainNode.gain.setValueAtTime(1, ctx.currentTime);
            }

            sourceNode.connect(gainNode);
            gainNode.connect(crossfadeGainNode);
            crossfadeGainNode.connect(ctx.destination);

            const session = {
                soundId: sound.id,
                sound: sound,
                sourceNode: sourceNode,
                gainNode: gainNode,
                crossfadeGainNode: crossfadeGainNode,
                buffer: buffer,
                startTime: ctx.currentTime,
                btn: btn
            };

            activeSessions.push(session);
            btn.classList.add('playing');

            sourceNode.onended = () => {
                if (!sourceNode.loop) {
                    activeSessions = activeSessions.filter(s => s !== session);
                    const activeNonFading = activeSessions.filter(s => !s.isFadingOut);
                    if (activeNonFading.length === 0) {
                        btn.classList.remove('playing');
                    }
                }
            };

            sourceNode.start(0);

            // Automatically run fade in function if volume is less than 50% (0.5)
            if (currentVolume < 0.5) {
                triggerFadeIn();
            }

            // Start updating progress bar exclusively for this audio
            if (progressUpdateInterval) clearInterval(progressUpdateInterval);
            const progressBar = document.getElementById('progress-bar');

            progressUpdateInterval = setInterval(() => {
                const activeNonFading = activeSessions.filter(s => !s.isFadingOut);
                if (activeNonFading.length > 0) {
                    const active = activeNonFading[activeNonFading.length - 1];
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

        // Prevent default click behavior to avoid duplicate execution
        btn.addEventListener('click', (e) => {
            if (e.cancelable) e.preventDefault();
        });

        grid.appendChild(btn);
    });
}

// Crossfade Toggle Listener
if (crossfadeToggleBtn) {
    crossfadeToggleBtn.addEventListener('click', () => {
        crossfadeEnabled = !crossfadeEnabled;
        if (crossfadeEnabled) {
            crossfadeToggleBtn.classList.add('active');
            crossfadeToggleBtn.title = 'Disable crossfade';
        } else {
            crossfadeToggleBtn.classList.remove('active');
            crossfadeToggleBtn.title = 'Enable crossfade';
        }
    });
}

// Tap Icon to toggle volume between 0 and previous volume (or 1)
if (muteToggleBtn) {
    muteToggleBtn.addEventListener('click', () => {
        const isMuted = currentVolume === 0;

        if (isMuted) {
            currentVolume = lastVolumeBeforeMute > 0 ? lastVolumeBeforeMute : 1;
        } else {
            lastVolumeBeforeMute = currentVolume;
            currentVolume = 0;
        }

        volumeSlider.value = currentVolume;
        updateFadeButtonState();
        updateVolumeIconState();

        updateActiveSessionsGain();

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
    updateVolumeIconState();

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

    updateActiveSessionsGain();
});

// Fade In / Fade Out Logic
fadeOutBtn.addEventListener('click', () => {
    let startVolume = parseFloat(volumeSlider.value);
    if (startVolume < 0.5) {
        triggerFadeIn();
    } else {
        fadeOutBtn.disabled = true;

        const duration = fadeDuration * 1000;
        const intervalTime = 50;
        const steps = duration / intervalTime;
        let currentStep = 0;

        if (fadeInterval) clearInterval(fadeInterval);
        if (fadeInInterval) clearInterval(fadeInInterval);
        fadeInInterval = null;

        fadeInterval = setInterval(() => {
            currentStep++;
            let newVol = startVolume * (1 - (currentStep / steps));
            if (newVol < 0) newVol = 0;

            currentVolume = newVol;
            volumeSlider.value = newVol;
            updateFadeButtonState();
            updateVolumeIconState();

            if (audioCtx) {
                activeSessions.forEach(s => {
                    const soundVol = (s.sound && s.sound.volume !== undefined) ? s.sound.volume : 1.0;
                    s.gainNode.gain.setValueAtTime(soundVol * newVol, audioCtx.currentTime);
                });
            }

            if (currentStep >= steps) {
                clearInterval(fadeInterval);
                fadeInterval = null;
                fadeOutBtn.disabled = false;
                updateFadeButtonState();
            }
        }, intervalTime);
    }
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
const sheetOptionAdditive = document.getElementById('sheet-option-additive');
const sheetAdditiveToggle = document.getElementById('sheet-additive-toggle');
const sheetOptionSolo = document.getElementById('sheet-option-solo');
const sheetSoloToggle = document.getElementById('sheet-solo-toggle');
const sheetOptionDelete = document.getElementById('sheet-option-delete');
const sheetVolumeSlider = document.getElementById('sheet-volume-slider');
const sheetVolumeVal = document.getElementById('sheet-volume-val');

function openBottomSheet(sound) {
    closeSettingsSheet();
    currentActiveSound = sound;
    if (sheetSoundName) sheetSoundName.textContent = sound.name;
    if (sheetLoopToggle) sheetLoopToggle.checked = !!sound.isLooped;
    if (sheetAdditiveToggle) sheetAdditiveToggle.checked = !!sound.isAdditive;
    if (sheetSoloToggle) sheetSoloToggle.checked = !!sound.isSolo;

    const trackVol = sound.volume !== undefined ? sound.volume : 1.0;
    if (sheetVolumeSlider) sheetVolumeSlider.value = trackVol;
    if (sheetVolumeVal) sheetVolumeVal.textContent = `${Math.round(trackVol * 100)}%`;

    if (backdrop) {
        backdrop.classList.add('open');
        backdrop.setAttribute('aria-hidden', 'false');
    }
    if (sheet) {
        sheet.classList.add('open');
        sheet.setAttribute('aria-hidden', 'false');
    }
}

if (sheetVolumeSlider) {
    sheetVolumeSlider.addEventListener('input', (e) => {
        if (!currentActiveSound) return;
        const newVol = parseFloat(e.target.value);
        updateSoundVolume(currentActiveSound, newVol, true);
    });
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

if (sheetOptionAdditive) {
    sheetOptionAdditive.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!currentActiveSound) return;

        currentActiveSound.isAdditive = !currentActiveSound.isAdditive;
        if (sheetAdditiveToggle) sheetAdditiveToggle.checked = currentActiveSound.isAdditive;

        // Save updated sound object to IndexedDB
        await saveCustomSound({ ...currentActiveSound });

        // Also update local customSounds memory array
        const idx = customSounds.findIndex(s => s.id === currentActiveSound.id);
        if (idx !== -1) {
            customSounds[idx].isAdditive = currentActiveSound.isAdditive;
        }

        // Update active sessions sound property if matching
        activeSessions.forEach(s => {
            if (s.soundId === currentActiveSound.id && s.sound) {
                s.sound.isAdditive = currentActiveSound.isAdditive;
            }
        });

        // Re-render buttons to reflect additive badge status on sound tile
        renderButtons();
    });
}

if (sheetOptionSolo) {
    sheetOptionSolo.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!currentActiveSound) return;

        currentActiveSound.isSolo = !currentActiveSound.isSolo;
        if (sheetSoloToggle) sheetSoloToggle.checked = currentActiveSound.isSolo;

        // Save updated sound object to IndexedDB
        await saveCustomSound({ ...currentActiveSound });

        // Also update local customSounds memory array
        const idx = customSounds.findIndex(s => s.id === currentActiveSound.id);
        if (idx !== -1) {
            customSounds[idx].isSolo = currentActiveSound.isSolo;
        }

        // Update active sessions sound property if matching
        activeSessions.forEach(s => {
            if (s.soundId === currentActiveSound.id && s.sound) {
                s.sound.isSolo = currentActiveSound.isSolo;
            }
        });

        // Re-render buttons to reflect solo badge status on sound tile
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

[sheetOptionLoop, sheetOptionAdditive, sheetOptionSolo, sheetOptionDelete].forEach(option => {
    if (option) {
        option.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                option.click();
            }
        });
    }
});

// Keyboard ESC to close bottom sheets
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (sheet && sheet.classList.contains('open')) {
            closeBottomSheet();
        }
        if (settingsSheet && settingsSheet.classList.contains('open')) {
            closeSettingsSheet();
        }
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

// ==========================================
// Settings Sheet Menu Controller
// ==========================================
function openSettingsSheet() {
    closeBottomSheet();
    if (settingsBackdrop) {
        settingsBackdrop.classList.add('open');
        settingsBackdrop.setAttribute('aria-hidden', 'false');
    }
    if (settingsSheet) {
        settingsSheet.classList.add('open');
        settingsSheet.setAttribute('aria-hidden', 'false');
    }
}

function closeSettingsSheet() {
    if (settingsBackdrop) {
        settingsBackdrop.classList.remove('open');
        settingsBackdrop.setAttribute('aria-hidden', 'true');
    }
    if (settingsSheet) {
        settingsSheet.classList.remove('open');
        settingsSheet.setAttribute('aria-hidden', 'true');
        settingsSheet.style.transform = '';
    }
}

if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettingsSheet);
}

if (settingsBackdrop) {
    settingsBackdrop.addEventListener('click', closeSettingsSheet);
}

if (settingsFadeSelect) {
    settingsFadeSelect.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
            fadeDuration = val;
            localStorage.setItem('fadeDuration', val.toString());
        }
    });
}

if (settingsFadeOption) {
    settingsFadeOption.addEventListener('click', (e) => {
        if (e.target.closest('#settings-fade-select')) return;
        if (settingsFadeSelect) {
            settingsFadeSelect.focus();
        }
    });

    settingsFadeOption.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (settingsFadeSelect) {
                settingsFadeSelect.focus();
            }
        }
    });
}

// Drag down gesture to dismiss settings sheet
if (settingsSheet) {
    let settingsTouchStartY = 0;
    let settingsTouchCurrentY = 0;
    let isDraggingSettingsSheet = false;

    settingsSheet.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        settingsTouchStartY = touch.clientY;
        isDraggingSettingsSheet = true;
    }, { passive: true });

    settingsSheet.addEventListener('touchmove', (e) => {
        if (!isDraggingSettingsSheet) return;
        const touch = e.touches[0];
        settingsTouchCurrentY = touch.clientY;
        const deltaY = settingsTouchCurrentY - settingsTouchStartY;

        if (deltaY > 0) {
            settingsSheet.style.transform = `translateY(${deltaY}px)`;
            settingsSheet.style.transition = 'none';
        }
    }, { passive: true });

    settingsSheet.addEventListener('touchend', () => {
        if (!isDraggingSettingsSheet) return;
        isDraggingSettingsSheet = false;
        settingsSheet.style.transition = '';
        const deltaY = settingsTouchCurrentY - settingsTouchStartY;
        if (deltaY > 70) {
            closeSettingsSheet();
        } else {
            settingsSheet.style.transform = '';
        }
        settingsTouchStartY = 0;
        settingsTouchCurrentY = 0;
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
                if (name !== 'soundboard-v0.6') {
                    caches.delete(name);
                }
            }
        });

        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker Registered successfully! scope:', reg.scope))
            .catch(err => console.error('Service Worker Registration Failed!', err));
    });
}
