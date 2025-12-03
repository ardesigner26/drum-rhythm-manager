// app.js - CÓDIGO COMPLETO E FINAL

// --- 1. LISTA DE RITMOS (PRESETS) ---
const presets = [
    { name: "Arrocha", bpm: 134, url: "sounds/arrocha134.mp3" },
    { name: "Axé", bpm: 100, url: "sounds/axe100.mp3" },
    { name: "Baião", bpm: 95, url: "sounds/baiao95.mp3" },
    { name: "Bolero", bpm: 110, url: "sounds/bolero110.mp3" },
    { name: "Guarania", bpm: 110, url: "sounds/guarania110.mp3" },
    { name: "Marchinha de Carnaval", bpm: 130, url: "sounds/marchinha130.mp3" },
    { name: "Pagode Anos 90", bpm: 90, url: "sounds/pagode90.mp3" },
    { name: "Rancheira Valsa", bpm: 84, url: "sounds/rancheira84.mp3" },
    { name: "Reggae", bpm: 160, url: "sounds/reggae160.mp3" },
    { name: "Rock", bpm: 140, url: "sounds/rock140.mp3" },
    { name: "Samba", bpm: 70, url: "sounds/samba70.mp3" },
    { name: "Vaneira", bpm: 90, url: "sounds/vaneira90.mp3" },
    { name: "Xote", bpm: 90, url: "sounds/xote90.mp3" }
];

// --- 2. CONFIGURAÇÃO DE ÁUDIO ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioContext();

let musicSource = null;
let musicBuffer = null;
let musicGain = ctx.createGain();
let clickGain = ctx.createGain();

musicGain.connect(ctx.destination);
clickGain.connect(ctx.destination);

// Estado Global
let isPlaying = false;
let startTime = 0;
let pauseOffset = 0;
let trackDuration = 0;
let metronomeInterval = null;
let nextNoteTime = 0;

// BPM
let originalBPM = 120;
let currentBPM = 120;
let isMetronomeOn = false;

// --- 3. BANCO DE DADOS (IndexedDB) ---
const DB_NAME = "DrumProDB";

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("tracks")) {
                db.createObjectStore("tracks", { keyPath: "id", autoIncrement: true });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject("Erro DB");
    });
}

async function saveTrackToDB(name, bpm, arrayBuffer) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("tracks", "readwrite");
        const store = tx.objectStore("tracks");
        const request = store.add({
            name: name,
            bpm: parseInt(bpm),
            audio: arrayBuffer,
            date: new Date()
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject();
    });
}

async function getAllTracks() {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction("tracks", "readonly");
        const store = tx.objectStore("tracks");
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
    });
}

async function deleteTrack(id) {
    const db = await openDB();
    const tx = db.transaction("tracks", "readwrite");
    tx.objectStore("tracks").delete(id);
    return tx.complete;
}

async function clearDB() {
    const db = await openDB();
    const tx = db.transaction("tracks", "readwrite");
    tx.objectStore("tracks").clear();
    loadLibrary();
}

// --- 4. MOTOR DE ÁUDIO ---

function playClick(time) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.value = 1200;
    env.gain.value = 1;
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    osc.connect(env);
    env.connect(clickGain);
    osc.start(time);
    osc.stop(time + 0.08);
}

function scheduler() {
    while (nextNoteTime < ctx.currentTime + 0.1) {
        if (isMetronomeOn) {
            playClick(nextNoteTime);
            const timeToBlink = (nextNoteTime - ctx.currentTime) * 1000;
            setTimeout(() => {
                const led = document.getElementById('led');
                if(led) {
                    led.classList.add('active');
                    setTimeout(() => led.classList.remove('active'), 80);
                }
            }, timeToBlink);
        }
        const secondsPerBeat = 60.0 / currentBPM;
        nextNoteTime += secondsPerBeat;
    }
    if (isPlaying) {
        metronomeInterval = requestAnimationFrame(scheduler);
    }
}

async function loadAudioForPlayback(data, isUrl = false) {
    try {
        let arrayBuffer;
        
        if (isUrl) {
            // Se for URL (Preset), baixa o arquivo
            const response = await fetch(data);
            if (!response.ok) throw new Error("Arquivo não encontrado");
            arrayBuffer = await response.arrayBuffer();
        } else {
            // Se for do Banco de Dados
            arrayBuffer = data;
        }

        const audioData = await ctx.decodeAudioData(arrayBuffer.slice(0));
        musicBuffer = audioData;
        trackDuration = musicBuffer.duration;
        const timeTotal = document.getElementById('timeTotal');
        if(timeTotal) timeTotal.textContent = formatTime(trackDuration);
        return true;
    } catch (e) {
        console.error(e);
        alert("Erro ao carregar áudio. Verifique se o arquivo existe na pasta 'sounds'.");
        return false;
    }
}

function play() {
    if (ctx.state === 'suspended') ctx.resume();
    if (!musicBuffer) return;

    musicSource = ctx.createBufferSource();
    musicSource.buffer = musicBuffer;
    musicSource.connect(musicGain);

    const playbackRate = currentBPM / originalBPM;
    musicSource.playbackRate.value = playbackRate;

    if (pauseOffset >= trackDuration) pauseOffset = 0;
    startTime = ctx.currentTime - (pauseOffset / playbackRate);

    musicSource.start(0, pauseOffset);
    
    isPlaying = true;
    nextNoteTime = ctx.currentTime;
    scheduler();
    updateProgress();

    togglePlayBtn(true);
}

function pause() {
    if (musicSource) {
        try { musicSource.stop(); } catch(e){}
    }
    isPlaying = false;
    cancelAnimationFrame(metronomeInterval);
    
    const playbackRate = currentBPM / originalBPM;
    pauseOffset = (ctx.currentTime - startTime) * playbackRate;
    
    togglePlayBtn(false);
}

function stop() {
    pause();
    pauseOffset = 0;
    updateUIProgress(0);
}

function togglePlayBtn(playing) {
    const btn = document.getElementById('btnPlay');
    if(btn) {
        btn.innerHTML = playing ? '<span class="material-icons">pause</span>' : '<span class="material-icons">play_arrow</span>';
        btn.onclick = playing ? pause : play;
    }
}

// --- 5. UI UPDATE ---

function updateProgress() {
    if (!isPlaying) return;
    const playbackRate = currentBPM / originalBPM;
    const current = (ctx.currentTime - startTime) * playbackRate;

    if (current >= trackDuration) {
        stop();
    } else {
        updateUIProgress(current);
        requestAnimationFrame(updateProgress);
    }
}

function updateUIProgress(time) {
    const pct = (time / trackDuration) * 100;
    const progressBar = document.getElementById('progressBar');
    const timeCurrent = document.getElementById('timeCurrent');
    
    if(progressBar) progressBar.value = pct || 0;
    if(timeCurrent) timeCurrent.textContent = formatTime(time);
}

function formatTime(s) {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

// --- 6. GERENCIAMENTO DA BIBLIOTECA ---

async function loadLibrary() {
    const list = document.getElementById('trackList');
    if(!list) return;

    list.innerHTML = '';

    // 1. Carregar Presets (Ritmos do App)
    if (presets.length > 0) {
        const header = document.createElement('li');
        header.innerHTML = '<small style="color:var(--primary); text-transform:uppercase; letter-spacing:1px; margin-top:10px; display:block;">Ritmos do App</small>';
        list.appendChild(header);

        presets.forEach((track, index) => {
            const li = document.createElement('li');
            li.className = 'track-item preset-item';
            li.innerHTML = `
                <div class="track-info">
                    <strong>${track.name}</strong>
                    <span>${track.bpm} BPM</span>
                </div>
                <span class="material-icons" style="color:var(--primary)">verified</span>
            `;
            li.onclick = () => selectTrack(track, li, true);
            list.appendChild(li);
        });
    }

    // 2. Carregar Ritmos do Usuário (Banco de Dados)
    try {
        const userTracks = await getAllTracks();
        
        if (userTracks.length > 0) {
            const headerUser = document.createElement('li');
            headerUser.innerHTML = '<small style="color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-top:20px; display:block;">Seus Uploads</small>';
            list.appendChild(headerUser);

            userTracks.forEach(track => {
                const li = document.createElement('li');
                li.className = 'track-item';
                li.innerHTML = `
                    <div class="track-info">
                        <strong>${track.name}</strong>
                        <span>${track.bpm} BPM</span>
                    </div>
                    <button class="btn-icon-danger" onclick="removeTrack(${track.id}, event)">
                        <span class="material-icons">delete</span>
                    </button>
                `;
                li.onclick = () => selectTrack(track, li, false);
                list.appendChild(li);
            });
        }
    } catch(e) {
        console.log("Erro ao carregar DB", e);
    }

    if (presets.length === 0) {
        list.innerHTML = '<li style="color:#666; padding:10px; text-align:center;">Nenhum ritmo encontrado.</li>';
    }
}

async function selectTrack(track, element, isPreset) {
    stop();
    const title = document.getElementById('displayTitle');
    if(title) title.textContent = "Carregando...";
    
    document.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');

    // Se for Preset, passa a URL. Se for DB, passa o ArrayBuffer.
    const dataToLoad = isPreset ? track.url : track.audio;
    const success = await loadAudioForPlayback(dataToLoad, isPreset);
    
    if (success) {
        if(title) title.textContent = track.name;
        
        originalBPM = track.bpm;
        currentBPM = track.bpm;
        
        const displayBPM = document.getElementById('displayBPM');
        if(displayBPM) displayBPM.textContent = currentBPM;
        
        const slider = document.getElementById('bpmSlider');
        if(slider) {
            slider.disabled = false;
            slider.value = currentBPM;
        }
    }
}

window.removeTrack = async (id, event) => {
    event.stopPropagation();
    if(confirm("Excluir este ritmo?")) {
        await deleteTrack(id);
        loadLibrary();
    }
};

// --- 7. EVENT LISTENERS ---

document.addEventListener('DOMContentLoaded', () => {
    loadLibrary();

    // Upload UI
    const btnSelect = document.getElementById('btnSelectFile');
    const fileInput = document.getElementById('fileInput');
    const nameDisplay = document.getElementById('fileNameDisplay');
    const nameInput = document.getElementById('trackName');
    const btnSave = document.getElementById('btnSave');
    
    // Player UI
    const btnPlay = document.getElementById('btnPlay');
    const btnStop = document.getElementById('btnStop');
    const btnMetro = document.getElementById('btnMetronome');
    const bpmSlider = document.getElementById('bpmSlider');
    const btnResetBPM = document.getElementById('btnResetBPM');
    const volMusic = document.getElementById('volMusic');
    const volClick = document.getElementById('volClick');
    const progressBar = document.getElementById('progressBar');
    const btnClearAll = document.getElementById('btnClearAll');

    if(btnSelect) btnSelect.addEventListener('click', () => fileInput.click());

    if(fileInput) fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            nameDisplay.textContent = file.name;
            nameInput.value = file.name.replace(/\.[^/.]+$/, "");
        }
    });

    // Salvar
    if(btnSave) btnSave.addEventListener('click', async () => {
        const status = document.getElementById('statusMsg');
        const bpmInput = document.getElementById('trackBPM');

        if (!fileInput.files[0] || !nameInput.value) {
            if(status) {
                status.textContent = "⚠️ Selecione um arquivo e preencha o nome.";
                status.style.color = "var(--accent)";
            }
            return;
        }

        if(status) {
            status.textContent = "Salvando...";
            status.style.color = "#fff";
        }
        btnSave.disabled = true;

        try {
            const arrayBuffer = await fileInput.files[0].arrayBuffer();
            await saveTrackToDB(nameInput.value, bpmInput.value, arrayBuffer);
            
            if(status) {
                status.textContent = "✅ Salvo com sucesso!";
                status.style.color = "var(--primary)";
            }
            
            fileInput.value = "";
            nameDisplay.textContent = "Nenhum arquivo...";
            nameInput.value = "";
            loadLibrary();
        } catch (e) {
            if(status) {
                status.textContent = "❌ Erro ao salvar.";
                status.style.color = "var(--danger)";
            }
        }
        btnSave.disabled = false;
    });

    // Player Controls
    if(btnPlay) btnPlay.onclick = play;
    if(btnStop) btnStop.onclick = stop;
    
    if(btnMetro) btnMetro.onclick = () => {
        isMetronomeOn = !isMetronomeOn;
        btnMetro.classList.toggle('active');
    };

    // Sliders
    if(bpmSlider) bpmSlider.addEventListener('input', (e) => {
        currentBPM = parseInt(e.target.value);
        const display = document.getElementById('displayBPM');
        if(display) display.textContent = currentBPM;
        if (musicSource && isPlaying) {
            musicSource.playbackRate.value = currentBPM / originalBPM;
        }
    });

    if(btnResetBPM) btnResetBPM.addEventListener('click', () => {
        currentBPM = originalBPM;
        if(bpmSlider) bpmSlider.value = originalBPM;
        const display = document.getElementById('displayBPM');
        if(display) display.textContent = originalBPM;
        if (musicSource && isPlaying) musicSource.playbackRate.value = 1.0;
    });

    if(volMusic) volMusic.oninput = (e) => musicGain.gain.value = e.target.value / 100;
    if(volClick) volClick.oninput = (e) => clickGain.gain.value = e.target.value / 100;

    if(progressBar) progressBar.oninput = (e) => {
        if (trackDuration > 0) {
            pauseOffset = (e.target.value / 100) * trackDuration;
            const timeCurrent = document.getElementById('timeCurrent');
            if(timeCurrent) timeCurrent.textContent = formatTime(pauseOffset);
            if (isPlaying) { pause(); play(); }
        }
    };

    if(btnClearAll) btnClearAll.onclick = () => {
        if(confirm("Apagar toda a biblioteca?")) clearDB();
    };
});
