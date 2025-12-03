// app.js - Com Ritmos da sua Lista

// --- 1. LISTA DE RITMOS DO APP ---
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
        document.getElementById('timeTotal').textContent = formatTime(trackDuration);
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

    const play
