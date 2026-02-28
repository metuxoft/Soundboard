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

let activeAudios = [];
let currentVolume = parseFloat(volumeSlider.value);

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

let customSounds = []; // To store { name, data } from IndexedDB
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
        const request = store.put(soundData);

        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

function deleteCustomSound(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['sounds'], 'readwrite');
        const store = transaction.objectStore('sounds');
        const request = store.delete(id);

        request.onsuccess = () => {
            customSounds = customSounds.filter(s => s.id !== id);
            renderButtons();
            resolve();
        };
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

if (fabAddFiles) {
    fabAddFiles.addEventListener('click', async () => {
        fabWrapper.classList.remove('open');
        if (isDeleteMode) toggleDeleteMode(false);
        try {
            const handles = await window.showOpenFilePicker({
                multiple: true,
                types: [{
                    description: 'Audio Files',
                    accept: { 'audio/*': ['.mp3', '.wav', '.ogg', '.m4a'] }
                }]
            });

            for (const handle of handles) {
                const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

                // TADY JE ZMĚNA: Rovnou získáme soubor (data) a uložíme ho celý
                const file = await handle.getFile();

                const soundData = {
                    id: id,
                    name: file.name.replace(/\.[^/.]+$/, ""),
                    data: file, // Ukládáme samotný soubor (Blob)
                    type: 'stored_file'
                };
                customSounds.push(soundData);
                await saveCustomSound(soundData);
            }
            renderButtons();
        } catch (e) {
            if (e.name !== 'AbortError') console.error('Error adding media:', e);
        }
    });
}

if (fabRemoveMedia) {
    fabRemoveMedia.addEventListener('click', () => {
        toggleDeleteMode();
    });
}

async function prepareAudioUrl(sound) {
    if (sound.type === 'default_url') {
        return sound.fileUrl; // From initial default array
    }
    if (sound.custom && sound.data) {
        return URL.createObjectURL(sound.data);
    }
    return sound.file; // Fallback
}


function renderButtons() {
    grid.innerHTML = ''; // Clear just in case

    // All sounds are now treated as custom (or originally default but stored in DB)
    const allSounds = customSounds.map(s => ({ ...s, custom: true }));

    allSounds.forEach(sound => {
        const btn = document.createElement('button');
        btn.className = 'sound-btn';
        btn.textContent = sound.name;
        if (sound.custom) btn.classList.add('custom-sound');

        // We defer Audio creation for custom sounds to handle permissions/Blobs
        let audio = null;
        let objectUrl = null;

        if (!sound.custom) {
            audio = new Audio(sound.file);
            audio.preload = 'auto';
            setupAudioListeners(audio, btn, sound);
        }

        let lastPlayed = 0;

        const handleInteraction = async (e) => {
            // Prevent default behavior to avoid double-firing events
            if (e && e.cancelable) e.preventDefault();

            // Defend against simultaneous fired touchstart + mousedown causing insta-cancel
            const now = Date.now();
            if (now - lastPlayed < 100) return;
            lastPlayed = now;

            // Handle Delete Mode
            if (isDeleteMode) {
                if (sound.custom) {
                    await deleteCustomSound(sound.id);
                } else {
                    // Visual shake / reject for predefined sounds
                    btn.style.animation = 'none';
                    void btn.offsetWidth; // trigger reflow
                    btn.style.animation = 'shake 0.4s ease-in-out';
                }
                return;
            }

            // Lazy load custom audio when trying to play
            if (sound.custom && !audio) {
                const url = await prepareAudioUrl(sound);
                if (url) {
                    objectUrl = url;
                    audio = new Audio(objectUrl);
                    setupAudioListeners(audio, btn, sound);
                } else {
                    console.error("Failed to load audio file.");
                    return;
                }
            }

            if (!audio) return;


            // Stop previously playing audios instantly
            activeAudios.forEach(oldAudio => {
                oldAudio.pause();
                oldAudio.currentTime = 0;
            });
            activeAudios = [];
            document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('playing'));

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

            // Add active class for visual tactile feedback
            btn.classList.add('active');
            setTimeout(() => btn.classList.remove('active'), 150);

            // Add playing class
            btn.classList.add('playing');

            // Reset this specific audio to start
            audio.currentTime = 0;

            // Check if we need to fade in (current volume is 0 or slider is at 0)
            const sliderVolume = parseFloat(volumeSlider.value);

            if (sliderVolume === 0 || currentVolume === 0) {
                currentVolume = 0;
                audio.volume = 0;
                volumeSlider.value = 0;

                // Start fade in to 1 (100%)
                const duration = 3000; // 3 seconds
                const intervalTime = 50;
                const steps = duration / intervalTime;
                let currentStep = 0;

                fadeInInterval = setInterval(() => {
                    currentStep++;
                    let newVol = currentStep / steps;
                    if (newVol > 1) newVol = 1;

                    currentVolume = newVol;
                    volumeSlider.value = newVol;

                    activeAudios.forEach(a => {
                        a.volume = newVol;
                    });

                    if (currentStep >= steps) {
                        clearInterval(fadeInInterval);
                        fadeInInterval = null;
                    }
                }, intervalTime);
            } else {
                audio.volume = currentVolume;
            }

            // Track and play
            activeAudios.push(audio);
            audio.play().catch(err => {
                console.warn("Autoplay blocked or audio format not supported: ", err);
            });

            // Start updating progress bar exclusively for this audio
            if (progressUpdateInterval) clearInterval(progressUpdateInterval);
            const progressBar = document.getElementById('progress-bar');

            progressUpdateInterval = setInterval(() => {
                if (audio.duration) {
                    const percent = (audio.currentTime / audio.duration) * 100;
                    if (progressBar) progressBar.style.width = `${percent}%`;
                }

                // If audio finished naturally, reset progress bar to 0 unless another audio took over
                if (audio.ended) {
                    if (activeAudios[activeAudios.length - 1] === audio) {
                        if (progressBar) progressBar.style.width = `0%`;
                        clearInterval(progressUpdateInterval);
                    }
                }
            }, 50);
        };

        // Fast-response mobile binding: touchstart triggers faster than a click
        btn.addEventListener('touchstart', handleInteraction, { passive: false });

        // Binding for mouse users 
        btn.addEventListener('mousedown', (e) => {
            // Prevent triggering twice on devices that fire both touchstart and mousedown (like some touch laptops)
            if (e.pointerType !== "touch") handleInteraction(e);
        });

        grid.appendChild(btn);
    });
}

function setupAudioListeners(audio, btn, sound) {
    // Cleanup when audio finishes naturally
    audio.addEventListener('ended', () => {
        activeAudios = activeAudios.filter(a => a !== audio);
        if (activeAudios.length === 0) btn.classList.remove('playing');
    });

    // If it errors (e.g., file not found), remove it too
    audio.addEventListener('error', () => {
        activeAudios = activeAudios.filter(a => a !== audio);
        if (activeAudios.length === 0) btn.classList.remove('playing');
        console.error(`Error loading or playing: ${sound.name}`);
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

        activeAudios.forEach(audio => {
            audio.volume = currentVolume;
        });

        if (fadeInterval) {
            clearInterval(fadeInterval);
            fadeInterval = null;
            fadeOutBtn.disabled = false;
        }
        if (fadeInInterval) {
            clearInterval(fadeInInterval);
            fadeInInterval = null;
        }
    });
}

// Update global volume & apply instantly to all currently playing sounds
volumeSlider.addEventListener('input', (e) => {
    currentVolume = parseFloat(e.target.value);

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

    activeAudios.forEach(audio => {
        audio.volume = currentVolume;
    });
});

// Fade Out Logic
fadeOutBtn.addEventListener('click', () => {
    // Only fade if volume > 0
    if (currentVolume <= 0) return;

    fadeOutBtn.disabled = true;

    const duration = 3000; // 3 seconds
    const intervalTime = 50;
    const steps = duration / intervalTime;

    let startVolume = parseFloat(volumeSlider.value);
    let currentStep = 0;

    if (fadeInterval) clearInterval(fadeInterval);
    if (fadeInInterval) clearInterval(fadeInInterval);
    fadeInInterval = null;

    fadeInterval = setInterval(() => {
        currentStep++;
        // Calculate new volume linearly
        let newVol = startVolume * (1 - (currentStep / steps));
        if (newVol < 0) newVol = 0;

        currentVolume = newVol;
        volumeSlider.value = newVol;

        activeAudios.forEach(audio => {
            audio.volume = newVol;
        });

        if (currentStep >= steps) {
            clearInterval(fadeInterval);
            fadeInterval = null;
            fadeOutBtn.disabled = false;
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

    // Stop all currently playing sounds
    activeAudios.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
    });
    activeAudios = [];
    document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('playing'));

    // Reset progress bar
    if (progressUpdateInterval) clearInterval(progressUpdateInterval);
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) progressBar.style.width = '0%';

    // Give a brief visual feedback on the button
    stopBtn.classList.add('active');
    setTimeout(() => stopBtn.classList.remove('active'), 150);
});

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
                if (name !== 'soundboard-v15') {
                    caches.delete(name);
                }
            }
        });

        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker Registered successfully! scope:', reg.scope))
            .catch(err => console.error('Service Worker Registration Failed!', err));
    });
}
