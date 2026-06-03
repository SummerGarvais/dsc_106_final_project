import { loadNewIceData, renderIceInterpolated } from './ice_logic.js';
import { loadNewMeltData, renderMeltInterpolated } from './melt_logic.js';
import { updateSliderLine } from './volo_logic.js';
import { loadNewPrecData, renderPrecInterpolated } from './prec_logic.js';
import { prefetch } from './data_cache.js';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

// ── Timeline: 16 decades (1850…2000) × 12 months = 192 ordered frames ──
const DECADES = 16;
const FRAMES = DECADES * 12; // 192

function frameToYM(idx) {
    idx = Math.max(0, Math.min(FRAMES - 1, idx));
    const decadeIdx = Math.floor(idx / 12);
    const monthIdx = idx % 12;
    return { year: 1850 + decadeIdx * 10, month: monthIdx + 1 };
}
function ymToFrame(year, month) {
    const decadeIdx = (year - 1850) / 10;
    return decadeIdx * 12 + (month - 1);
}

document.addEventListener('DOMContentLoaded', function () {
    setupYearSlider();
    setupMonthSlider();
    setupTooltips();

    setupPlayPauseButton();
    setupSpeedButton();
    setupLoopButton();

    loadRememberedYear();
});

function setupYearSlider() {
    const slider = document.getElementById('year-slider');
    slider.setAttribute('step', 'any');
    slider.addEventListener('input', onManualChange);
    slider.setAttribute('list', 'decades');

    const datalist = document.createElement('datalist');
    datalist.id = 'decades';
    for (let y = 1850; y <= 2000; y += 10) {
        const option = document.createElement('option');
        option.value = y;
        option.label = y;
        datalist.appendChild(option);
    }
    document.body.appendChild(datalist);
}

function setupMonthSlider() {
    const slider = document.getElementById('month-slider');
    slider.setAttribute('step', 'any');
    slider.addEventListener('input', onManualChange);
    slider.setAttribute('list', 'months');

    const datalist = document.createElement('datalist');
    datalist.id = 'months';
    for (let m = 1; m <= 12; m++) {
        const option = document.createElement('option');
        option.value = m;
        option.label = m;
        datalist.appendChild(option);
    }
    document.body.appendChild(datalist);
}

// Manual slider interaction
function onManualChange() {
    if (isPlaying) pauseAnimation();
    // The year slider is `step="any"` for smooth playback
    const yslider = document.getElementById('year-slider');
    yslider.value = Math.round(parseFloat(yslider.value) / 10) * 10;
    playT = ymToFrame(getCurrentYear(), getCurrentMonth());
    updateGraphs();
}

// Ease-in-out position curve
function smoothstep(x) {
    const t = Math.min(1, Math.max(0, x));
    return t * t * (3 - 2 * t);
}

function updateGraphs() {
    const year = getCurrentYear();
    document.getElementById('year-value').textContent = year;
    document.getElementById('month-value').textContent = getCurrentMonth(true);

    loadNewIceData();
    loadNewMeltData();
    updateSliderLine();
    loadNewPrecData();
}

export function getCurrentYear() {
    return parseInt(document.getElementById('year-slider').value);
}

export function getCurrentMonth(name = false) {
    const month = Math.max(1, Math.min(12, Math.floor(parseFloat(document.getElementById('month-slider').value))));
    return name ? MONTH_NAMES[month] : month;
}

function setupTooltips() {
    for (const id of ['ice-tooltip', 'melt-tooltip']) {
        if (!document.getElementById(id)) {
            const t = document.createElement('div');
            t.classList.add('tooltip');
            t.id = id;
            document.body.prepend(t);
        }
    }
}

function loadRememberedYear() {
    document.getElementById('year-value').textContent = getCurrentYear();
    document.getElementById('month-value').textContent = getCurrentMonth(true);
    playT = ymToFrame(getCurrentYear(), getCurrentMonth());
    updateGraphs();
}

// ─── Continuous playback ───
let isPlaying = false;
let isLooping = false;
let speedMultiplier = 1;
let playRAF = null;
let lastTs = 0;
let playT = 0;
const FRAMES_PER_SEC = 7;
const DECADE_HOLD = 0.9;

function prefetchAhead(year, month, steps = 5) {
    let idx = ymToFrame(year, month);
    for (let i = 0; i < steps; i++) {
        idx++;
        if (idx > FRAMES - 1) idx = isLooping ? idx - 12 : 0;
        const { year: y, month: m } = frameToYM(idx);
        prefetch('ice', y, m);
        prefetch('melt', y, m);
        prefetch('prec', y, m);
    }
}

// Render the visualizations at a continuous timeline position
function renderAtContinuous(t) {
    const a = Math.min(FRAMES - 1, Math.floor(t));
    let f = t - a;
    let b = a + 1;

    if (isLooping) {
        const decStart = Math.floor(a / 12) * 12;
        if (b >= decStart + 12) b = decStart;
    } else if (b > FRAMES - 1) {
        b = a;
        f = 0;
    }

    const A = frameToYM(a);
    const B = frameToYM(b);

    renderIceInterpolated(A.year, A.month, B.year, B.month, f);
    renderMeltInterpolated(A.year, A.month, B.year, B.month, f);
    renderPrecInterpolated(A.year, A.month, B.year, B.month, f);

    // Glide the decade thumb between decades with an inverse-parabolic velocity
    const decadeIdx = Math.floor(t / 12);
    let yearThumb;
    if (isLooping) {
        yearThumb = 1850 + decadeIdx * 10;
    } else {
        const fracDecade = (t - decadeIdx * 12) / 12;
        const eased = smoothstep((fracDecade - DECADE_HOLD) / (1 - DECADE_HOLD));
        yearThumb = Math.min(2000, 1850 + decadeIdx * 10 + 10 * eased);
    }

    document.getElementById('year-slider').value = yearThumb;
    document.getElementById('month-slider').value = Math.min(12, A.month + f);
    document.getElementById('year-value').textContent = Math.round(yearThumb / 10) * 10;
    document.getElementById('month-value').textContent = MONTH_NAMES[A.month];

    updateSliderLine();
    prefetchAhead(B.year, B.month);
}

function playStep(ts) {
    if (!isPlaying) return;
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.1) dt = 0.1;

    const prevDec = Math.floor(playT / 12);
    playT += dt * FRAMES_PER_SEC * speedMultiplier;

    if (isLooping) {
        const decEnd = (prevDec + 1) * 12;
        if (playT >= decEnd) playT = prevDec * 12 + (playT - decEnd);
    } else if (playT >= FRAMES - 1) {
        playT = 0;
    }

    renderAtContinuous(playT);
    playRAF = requestAnimationFrame(playStep);
}

function setupPlayPauseButton() {
    const btn = document.getElementById('play-pause-btn');
    btn.addEventListener('click', togglePlayPause);
}

function startAnimation() {
    isPlaying = true;
    lastTs = 0;
    playT = ymToFrame(getCurrentYear(), getCurrentMonth());
    prefetchAhead(getCurrentYear(), getCurrentMonth());
    const btn = document.getElementById('play-pause-btn');
    btn.textContent = '⏸ Pause';
    btn.classList.add('active');
    playRAF = requestAnimationFrame(playStep);
}

function pauseAnimation() {
    isPlaying = false;
    if (playRAF) cancelAnimationFrame(playRAF);
    playRAF = null;
    const btn = document.getElementById('play-pause-btn');
    btn.textContent = '▶ Play';
    btn.classList.remove('active');

    // Snap to the nearest real data month so the paused frame is exact
    const idx = Math.round(playT);
    const { year, month } = frameToYM(idx);
    playT = idx;
    document.getElementById('year-slider').value = year;
    document.getElementById('month-slider').value = month;
    updateGraphs();
}

function togglePlayPause() {
    if (isPlaying) pauseAnimation();
    else startAnimation();
}

function setupSpeedButton() {
    const btn = document.getElementById('speed-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        speedMultiplier = speedMultiplier === 1 ? 2 : 1;
        btn.textContent = `${speedMultiplier}×`;
        btn.classList.toggle('active', speedMultiplier === 2);
    });
}

function setupLoopButton() {
    const btn = document.getElementById('loop-btn');
    btn.addEventListener('click', () => {
        isLooping = !isLooping;
        btn.classList.toggle('active', isLooping);
    });
}
