// app.js - Versão Final Profissional

// --- 1. CONFIGURAÇÃO DE ÁUDIO ---
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

// --- 2. BANCO DE DADOS (IndexedDB) ---
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

// --- 3. MOTOR DE ÁUDIO ---

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
            // Visual LED
            const timeToBlink = (nextNoteTime - ctx.currentTime) * 1000;
            setTimeout(() => {
                const led = document.getElementById('led');
                led.classList.add('active');
                setTimeout(() => led.classList.remove('active'), 80);
            }, timeToBlink);
        }
        const secondsPerBeat = 60.0 / currentBPM;
        nextNoteTime += secondsPerBeat;
    }
    if (isPlaying) {
        metronomeInterval = requestAnimationFrame(scheduler);
    }
}

async function loadAudioForPlayback(arrayBuffer) {
    try {
        const audioData = await ctx.decodeAudioData(arrayBuffer.slice(0));
        musicBuffer = audioData;
        trackDuration = musicBuffer.duration;
        document.getElementById('timeTotal').textContent = formatTime(trackDuration);
        return true;
    } catch (e) {
        console.error(e);
        alert("Erro ao decodificar áudio.");
        return false;
    }
}

function play() {
    if (ctx.state === 'suspended') ctx.resume();
    if (!musicBuffer) return;

    musicSource = ctx.createBufferSource();
    musicSource.buffer = musicBuffer;
    musicSource.connect(musicGain);

    // Ajuste de Velocidade
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
    btn.innerHTML = playing ? '<span class="material-icons">pause</span>' : '<span class="material-icons">play_arrow</span>';
    btn.onclick = playing ? pause : play;
}

// --- 4. UI UPDATE ---

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
    document.getElementById('progressBar').value = pct || 0;
    document.getElementById('timeCurrent').textContent = formatTime(time);
}

function formatTime(s) {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

// --- 5. GERENCIAMENTO DA BIBLIOTECA ---

async function loadLibrary() {
    const list = document.getElementById('trackList');
    list.innerHTML = '<li style="color:#666; padding:10px;">Carregando...</li>';
    
    const tracks = await getAllTracks();
    list.innerHTML = "";

    if (tracks.length === 0) {
        list.innerHTML = '<li style="color:#666; padding:10px; text-align:center;">Nenhum ritmo salvo.</li>';
        return;
    }

    tracks.forEach(track => {
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
        li.onclick = () => selectTrack(track, li);
        list.appendChild(li);
    });
}

async function selectTrack(track, element) {
    stop();
    document.getElementById('displayTitle').textContent = "Carregando...";
    
    // UI Active State
    document.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');

    const success = await loadAudioForPlayback(track.audio);
    
    if (success) {
        document.getElementById('displayTitle').textContent = track.name;
        
        originalBPM = track.bpm;
        currentBPM = track.bpm;
        
        document.getElementById('displayBPM').textContent = currentBPM;
        
        const slider = document.getElementById('bpmSlider');
        slider.disabled = false;
        slider.value = currentBPM;
    }
}

window.removeTrack = async (id, event) => {
    event.stopPropagation();
    if(confirm("Excluir este ritmo?")) {
        await deleteTrack(id);
        loadLibrary();
    }
};

// --- 6. EVENT LISTENERS ---

document.addEventListener('DOMContentLoaded', () => {
    loadLibrary();

    // Upload UI
    const btnSelect = document.getElementById('btnSelectFile');
    const fileInput = document.getElementById('fileInput');
    const nameDisplay = document.getElementById('fileNameDisplay');
    const nameInput = document.getElementById('trackName');

    btnSelect.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            nameDisplay.textContent = file.name;
            nameInput.value = file.name.replace(/\.[^/.]+$/, "");
        }
    });

    // Salvar
    document.getElementById('btnSave').addEventListener('click', async () => {
        const status = document.getElementById('statusMsg');
        const bpmInput = document.getElementById('trackBPM');

        if (!fileInput.files[0] || !nameInput.value) {
            status.textContent = "⚠️ Selecione um arquivo e preencha o nome.";
            status.style.color = "var(--accent)";
            return;
        }

        status.textContent = "Salvando...";
        status.style.color = "#fff";
        document.getElementById('btnSave').disabled = true;

        try {
            const arrayBuffer = await fileInput.files[0].arrayBuffer();
            await saveTrackToDB(nameInput.value, bpmInput.value, arrayBuffer);
            
            status.textContent = "✅ Salvo com sucesso!";
            status.style.color = "var(--primary)";
            
            // Reset
            fileInput.value = "";
            nameDisplay.textContent = "Nenhum arquivo...";
            nameInput.value = "";
            loadLibrary();
        } catch (e) {
            status.textContent = "❌ Erro ao salvar.";
            status.style.color = "var(--danger)";
        }
        document.getElementById('btnSave').disabled = false;
    });

    // Player Controls
    document.getElementById('btnPlay').onclick = play;
    document.getElementById('btnStop').onclick = stop;
    
    const btnMetro = document.getElementById('btnMetronome');
    btnMetro.onclick = () => {
        isMetronomeOn = !isMetronomeOn;
        btnMetro.classList.toggle('active');
    };

    // Sliders
    const bpmSlider = document.getElementById('bpmSlider');
    bpmSlider.addEventListener('input', (e) => {
        currentBPM = parseInt(e.target.value);
        document.getElementById('displayBPM').textContent = currentBPM;
        if (musicSource && isPlaying) {
            musicSource.playbackRate.value = currentBPM / originalBPM;
        }
    });

    document.getElementById('btnResetBPM').addEventListener('click', () => {
        currentBPM = originalBPM;
        bpmSlider.value = originalBPM;
        document.getElementById('displayBPM').textContent = originalBPM;
        if (musicSource && isPlaying) musicSource.playbackRate.value = 1.0;
    });

    document.getElementById('volMusic').oninput = (e) => musicGain.gain.value = e.target.value / 100;
    document.getElementById('volClick').oninput = (e) => clickGain.gain.value = e.target.value / 100;

    document.getElementById('progressBar').oninput = (e) => {
        if (trackDuration > 0) {
            pauseOffset = (e.target.value / 100) * trackDuration;
            document.getElementById('timeCurrent').textContent = formatTime(pauseOffset);
            if (isPlaying) { pause(); play(); }
        }
    };

    document.getElementById('btnClearAll').onclick = () => {
        if(confirm("Apagar toda a biblioteca?")) clearDB();
    };
});