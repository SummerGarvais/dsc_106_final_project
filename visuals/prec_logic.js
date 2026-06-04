import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getCurrentYear, getCurrentMonth } from './sliders_setup.js';
import { getCached, setCached, urlFor, prefetch } from './data_cache.js';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = d3.range(1850, 2001, 10);
const ANNUAL_YEARS = d3.range(1850, 2001);
const ANNUAL_TIMELINE = ANNUAL_YEARS.map(year => ({
    year,
    date: new Date(`${year}-07`)
}));
const MIN_VIEWPORT_SPAN = 12;
const SERIES_BATCH_SIZE = 6;
const SMOOTHING_WINDOW_YEARS = 5;

let currentData = null;
let currentFrame = null;
let colorScale = null;
let viewport = null;
let dragState = null;
let regionalSeries = [];
let seriesRequestId = 0;
let seriesTimer = null;
let seriesViewportKey = null;

const precContainer = document.getElementById('prec-container');
let width = precContainer.offsetWidth;
let height = precContainer.offsetHeight;

// Stops as RGB triples
const PREC_HIGH = [8, 69, 148];
const PREC_MID = [254, 217, 118];
const PREC_LOW = [255, 255, 255];
// Writes the interpolated color straight into an ImageData buffer 
function writePrecRGB(d, o, precValue, minPrecip, maxPrecip) {
    const t = Math.max(0, Math.min(1, (precValue - minPrecip) / (maxPrecip - minPrecip)));
    let a, b, tt;
    if (t <= 0.5) { a = PREC_HIGH; b = PREC_MID; tt = t * 2; }
    else { a = PREC_MID; b = PREC_LOW; tt = (t - 0.5) * 2; }
    d[o] = (a[0] + (b[0] - a[0]) * tt) | 0;
    d[o + 1] = (a[1] + (b[1] - a[1]) * tt) | 0;
    d[o + 2] = (a[2] + (b[2] - a[2]) * tt) | 0;
    d[o + 3] = 255;
}

let offCanvas = null, offCtx = null, offImg = null, offW = 0, offH = 0;
function ensureOffscreen(nx, ny) {
    if (!offCanvas) { offCanvas = document.createElement('canvas'); offCtx = offCanvas.getContext('2d'); }
    if (offW !== nx || offH !== ny) {
        offCanvas.width = nx; offCanvas.height = ny;
        offImg = offCtx.createImageData(nx, ny);
        offW = nx; offH = ny;
    }
}
function canvasVisible(canvas) {
    const r = canvas.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return r.bottom > 0 && r.top < vh;
}

document.addEventListener('DOMContentLoaded', function () {
    initializePrecCanvas();

    new ResizeObserver(() => {
        const newW = precContainer.clientWidth;
        const newH = precContainer.clientHeight;
        if (newW === width && newH === height) return;
        width = newW;
        height = newH;
        const canvas = document.getElementById('prec-canvas');
        if (canvas) {
            resizeCanvas(canvas);
            if (currentData) paintFrame(currentData.data, getCurrentYear(), getCurrentMonth(), currentData.units);
        }
    }).observe(precContainer);
});

function resizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function initializePrecCanvas() {
    width = precContainer.clientWidth;
    height = precContainer.clientHeight;

    const canvas = document.createElement('canvas');
    canvas.id = 'prec-canvas';

    const vizDiv = document.getElementById('prec-container');
    if (vizDiv) {
        vizDiv.innerHTML = '';
        vizDiv.appendChild(canvas);
    }

    resizeCanvas(canvas);

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', endPointerDrag);
    canvas.addEventListener('pointercancel', endPointerDrag);
    canvas.addEventListener('dblclick', resetViewport);
    canvas.addEventListener('mouseleave', () => {
        const tooltip = document.querySelector("#prec-tooltip");
        if (tooltip) tooltip.style.visibility = 'hidden';
        const pointStatsDiv = document.getElementById('prec-point-stats');
        if (pointStatsDiv) {
            pointStatsDiv.innerHTML = `
                📍 <strong>Location:</strong> No Data |
                <strong>Precipitation:</strong> N/A <br>
                <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
            `;
        }
    });

    colorScale = d3.scaleSequentialLog().domain([0.01, 5]).interpolator(d3.interpolateBlues);
    buildRegionPanel();
}

export async function loadNewPrecData() {
    const year = getCurrentYear();
    const month = getCurrentMonth();

    const cached = getCached('prec', year, month);
    if (cached) {
        currentData = cached;
        paintFrame(cached.data, year, month, cached.units);
        return;
    }

    try {
        const response = await fetch(urlFor('prec', year, month));
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const newData = await response.json();
        setCached('prec', year, month, newData);
        currentData = newData;
        paintFrame(newData.data, year, month, newData.units);
    } catch (error) {
        console.error(`Error loading data for ${year}:`, error);
        const canvas = document.getElementById('prec-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ff0000';
            ctx.font = '16px Arial';
            ctx.fillText(`Failed to load data for ${year}, ${month}`, width / 2 - 150, height / 2);
        }
    }
}

export function renderPrecInterpolated(yA, mA, yB, mB, f) {
    const cv = document.getElementById('prec-canvas');
    if (cv && !canvasVisible(cv)) return;

    const a = getCached('prec', yA, mA);
    if (!a) { prefetch('prec', yA, mA); return; }
    const b = getCached('prec', yB, mB);
    if (!b) prefetch('prec', yB, mB);

    currentData = a;
    const label = f < 0.5 ? { y: yA, m: mA } : { y: yB, m: mB };
    paintFrame(a.data, label.y, label.m, a.units, { skipIfHidden: true, b: (b && f > 0) ? b.data : null, f });
}

function paintFrame(values, year, month, units, opts = {}) {
    const canvas = document.getElementById('prec-canvas');
    if (!canvas || !values || values.length === 0) return;
    if (opts.skipIfHidden && !canvasVisible(canvas)) return;

    const ctx = canvas.getContext('2d');
    const ny = values.length;
    const nx = values[0].length;
    ensureViewport(nx, ny);

    // B-frame interpolation 
    const B = opts.b || null;
    const f = opts.f || 0;
    const interp = (a, b) => {
        if (!B) return a;
        const aBad = a === null || isNaN(a);
        const bBad = b === null || isNaN(b);
        if (aBad && bBad) return NaN;
        if (aBad) return b;
        if (bBad) return a;
        return a + (b - a) * f;
    };

    // Interpolated data range for the color scale
    let minPrecip = Infinity, maxPrecip = -Infinity;
    for (let j = 0; j < ny; j++) {
        const aRow = values[j];
        const bRow = B ? B[j] : null;
        for (let i = 0; i < nx; i++) {
            const v = bRow ? interp(aRow[i], bRow[i]) : aRow[i];
            if (v !== null && !isNaN(v)) {
                if (v < minPrecip) minPrecip = v;
                if (v > maxPrecip) maxPrecip = v;
            }
        }
    }

    // Rasterize into the offscreen buffer
    ensureOffscreen(nx, ny);
    const d = offImg.data;
    for (let py = 0; py < ny; py++) {
        const aRow = values[ny - py - 1];
        const bRow = B ? B[ny - py - 1] : null;
        for (let px = 0; px < nx; px++) {
            const value = bRow ? interp(aRow[px], bRow[px]) : aRow[px];
            const o = (py * nx + px) * 4;
            if (value !== null && !isNaN(value)) {
                writePrecRGB(d, o, value, minPrecip, maxPrecip);
            } else {
                d[o] = 240; d[o + 1] = 240; d[o + 2] = 240; d[o + 3] = 255;
            }
        }
    }
    offCtx.putImageData(offImg, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, width, height);
    drawViewport(ctx);

    drawAnnotations(ctx, year, month);
    currentFrame = { values, year, month, units, b: B, f };
    updateRegionStats(values, B, f);
    updateLegend(minPrecip, maxPrecip);
    drawMeanChart();
    scheduleSeriesRefresh();
}

function drawAnnotations(ctx, year, month) {
    const monthName = MONTH_NAMES[month] || month;
    const titleSize = Math.max(11, Math.min(16, width / 28));
    ctx.font = `500 ${titleSize}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(233,238,244,0.84)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Precipitation · ${monthName} ${year}`, width / 2, 20);
}

function ensureViewport(nx, ny) {
    if (!viewport) {
        viewport = { x0: 0, y0: 0, x1: nx, y1: ny };
        return;
    }
    viewport.x0 = clamp(viewport.x0, 0, nx - MIN_VIEWPORT_SPAN);
    viewport.y0 = clamp(viewport.y0, 0, ny - MIN_VIEWPORT_SPAN);
    viewport.x1 = clamp(viewport.x1, viewport.x0 + MIN_VIEWPORT_SPAN, nx);
    viewport.y1 = clamp(viewport.y1, viewport.y0 + MIN_VIEWPORT_SPAN, ny);
}

function drawViewport(ctx) {
    if (!viewport) {
        ctx.drawImage(offCanvas, 0, 0, width, height);
        return;
    }
    ctx.drawImage(
        offCanvas,
        viewport.x0,
        viewport.y0,
        viewport.x1 - viewport.x0,
        viewport.y1 - viewport.y0,
        0,
        0,
        width,
        height
    );
}

function screenToGrid(x, y) {
    if (!viewport) return { x, y };
    return {
        x: viewport.x0 + (x / width) * (viewport.x1 - viewport.x0),
        y: viewport.y0 + (y / height) * (viewport.y1 - viewport.y0)
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function clampViewport() {
    if (!currentData?.data || !viewport) return;
    const ny = currentData.data.length;
    const nx = currentData.data[0].length;
    const spanX = viewport.x1 - viewport.x0;
    const spanY = viewport.y1 - viewport.y0;

    if (viewport.x0 < 0) { viewport.x1 -= viewport.x0; viewport.x0 = 0; }
    if (viewport.y0 < 0) { viewport.y1 -= viewport.y0; viewport.y0 = 0; }
    if (viewport.x1 > nx) { viewport.x0 -= viewport.x1 - nx; viewport.x1 = nx; }
    if (viewport.y1 > ny) { viewport.y0 -= viewport.y1 - ny; viewport.y1 = ny; }

    viewport.x0 = clamp(viewport.x0, 0, Math.max(0, nx - spanX));
    viewport.y0 = clamp(viewport.y0, 0, Math.max(0, ny - spanY));
    viewport.x1 = viewport.x0 + spanX;
    viewport.y1 = viewport.y0 + spanY;
}

function repaintCurrentFrame() {
    if (!currentFrame) return;
    paintFrame(currentFrame.values, currentFrame.year, currentFrame.month, currentFrame.units, {
        b: currentFrame.b,
        f: currentFrame.f
    });
}

function resetViewport() {
    if (!currentData?.data) return;
    const ny = currentData.data.length;
    const nx = currentData.data[0].length;
    viewport = { x0: 0, y0: 0, x1: nx, y1: ny };
    regionalSeries = [];
    seriesViewportKey = null;
    repaintCurrentFrame();
    refreshRegionalSeries();
}

function handleWheel(event) {
    if (!currentData?.data || !viewport) return;
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const focus = screenToGrid(event.clientX - rect.left, event.clientY - rect.top);
    const zoomFactor = event.deltaY < 0 ? 0.82 : 1.18;
    const spanX = viewport.x1 - viewport.x0;
    const spanY = viewport.y1 - viewport.y0;
    const newSpanX = clamp(spanX * zoomFactor, MIN_VIEWPORT_SPAN, currentData.data[0].length);
    const newSpanY = clamp(spanY * zoomFactor, MIN_VIEWPORT_SPAN, currentData.data.length);
    const fx = (focus.x - viewport.x0) / spanX;
    const fy = (focus.y - viewport.y0) / spanY;

    viewport = {
        x0: focus.x - newSpanX * fx,
        y0: focus.y - newSpanY * fy,
        x1: focus.x + newSpanX * (1 - fx),
        y1: focus.y + newSpanY * (1 - fy)
    };
    clampViewport();
    regionalSeries = [];
    seriesViewportKey = null;
    repaintCurrentFrame();
}

function handlePointerDown(event) {
    if (!currentData?.data || !viewport) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        viewport: { ...viewport }
    };
}

function handlePointerMove(event) {
    if (!dragState || dragState.pointerId !== event.pointerId || !viewport) return;
    const dx = (event.clientX - dragState.x) / width * (dragState.viewport.x1 - dragState.viewport.x0);
    const dy = (event.clientY - dragState.y) / height * (dragState.viewport.y1 - dragState.viewport.y0);
    viewport = {
        x0: dragState.viewport.x0 - dx,
        y0: dragState.viewport.y0 - dy,
        x1: dragState.viewport.x1 - dx,
        y1: dragState.viewport.y1 - dy
    };
    clampViewport();
    repaintCurrentFrame();
}

function endPointerDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragState = null;
    regionalSeries = [];
    seriesViewportKey = null;
    scheduleSeriesRefresh();
}

// Build the region summary and chart shell once
function buildRegionPanel() {
    const div = document.getElementById('prec-overall-stats');
    if (!div) return;
    div.className = 'viz-stats prec-region-panel';
    div.innerHTML = `
        <div class="prec-region-topline">
            <span id="prec-region-label">Global region</span>
            <strong id="prec-region-mean">—</strong>
            <button id="prec-reset-btn" type="button">Reset</button>
        </div>
        <div class="legend">
            <span class="legend-label">Rainfall rate (mm/day)</span>
            <span class="ramp">
                <span id="prec-leg-min">—</span>
                <span class="bar" style="background:linear-gradient(to right,#084594,#fed976,#ffffff)"></span>
                <span id="prec-leg-max">—</span>
            </span>
        </div>
        <div id="prec-mean-chart" class="prec-mean-chart"></div>`;
    document.getElementById('prec-reset-btn')?.addEventListener('click', resetViewport);
}

// Convert precipitation in m/s to mm/day and format for display
const SECONDS_PER_DAY = 86400;
function fmtMmPerDay(v) {
    if (!isFinite(v)) return '—';
    const mm = v * SECONDS_PER_DAY;
    if (mm < 0.05) return '≈0';
    return `${mm.toFixed(mm < 10 ? 1 : 0)}`;
}

function updateLegend(min, max) {
    const lo = document.getElementById('prec-leg-min');
    const hi = document.getElementById('prec-leg-max');
    if (lo) lo.textContent = fmtMmPerDay(min);
    if (hi) hi.textContent = fmtMmPerDay(max);
}

function valueAt(values, bValues, f, px, py) {
    const ny = values.length;
    const rowIndex = ny - py - 1;
    const a = values[rowIndex]?.[px];
    const b = bValues ? bValues[rowIndex]?.[px] : null;
    if (!bValues) return a;
    const aBad = a === null || Number.isNaN(a);
    const bBad = b === null || Number.isNaN(b);
    if (aBad && bBad) return NaN;
    if (aBad) return b;
    if (bBad) return a;
    return a + (b - a) * f;
}

function meanForViewport(values, bValues = null, f = 0) {
    if (!values || !viewport) return NaN;
    const ny = values.length;
    const nx = values[0].length;
    const x0 = clamp(Math.floor(viewport.x0), 0, nx - 1);
    const x1 = clamp(Math.ceil(viewport.x1), x0 + 1, nx);
    const y0 = clamp(Math.floor(viewport.y0), 0, ny - 1);
    const y1 = clamp(Math.ceil(viewport.y1), y0 + 1, ny);
    let sum = 0;
    let count = 0;

    for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
            const value = valueAt(values, bValues, f, px, py);
            if (value !== null && Number.isFinite(value)) {
                sum += value;
                count++;
            }
        }
    }

    return count ? sum / count : NaN;
}

function viewportLabel() {
    if (!currentData?.data || !viewport) return 'Global region';
    const ny = currentData.data.length;
    const nx = currentData.data[0].length;
    const full = viewport.x0 <= 0.5 && viewport.y0 <= 0.5 &&
        viewport.x1 >= nx - 0.5 && viewport.y1 >= ny - 0.5;
    if (full) return 'Global region';

    const lon0 = viewport.x0 / nx * 360 - 180;
    const lon1 = viewport.x1 / nx * 360 - 180;
    const latTop = 90 - viewport.y0 / ny * 180;
    const latBottom = 90 - viewport.y1 / ny * 180;
    return `${formatCoord(latBottom, 'S', 'N')}–${formatCoord(latTop, 'S', 'N')}, ${formatCoord(lon0, 'W', 'E')}–${formatCoord(lon1, 'W', 'E')}`;
}

function formatCoord(value, negSuffix, posSuffix) {
    const suffix = value < 0 ? negSuffix : posSuffix;
    return `${Math.abs(value).toFixed(0)}°${suffix}`;
}

function updateRegionStats(values, bValues = null, f = 0) {
    const label = document.getElementById('prec-region-label');
    const mean = document.getElementById('prec-region-mean');
    if (label) label.textContent = viewportLabel();
    if (mean) mean.textContent = `${fmtMmPerDay(meanForViewport(values, bValues, f))} mm/day`;
}

function scheduleSeriesRefresh() {
    const key = getViewportKey();
    if (key === seriesViewportKey && regionalSeries.length) return;
    clearTimeout(seriesTimer);
    seriesTimer = setTimeout(refreshRegionalSeries, 220);
}

function getViewportKey() {
    if (!viewport) return 'none';
    return [viewport.x0, viewport.y0, viewport.x1, viewport.y1]
        .map(v => v.toFixed(2))
        .join(',');
}

async function loadPrecipFrame(year, month) {
    const cached = getCached('prec', year, month);
    if (cached) return cached;

    const response = await fetch(urlFor('prec', year, month));
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    setCached('prec', year, month, data);
    return data;
}

async function loadAnnualPrecipFrame(year) {
    const cached = getCached('precAnnual', year, 1);
    if (cached) return cached;

    const response = await fetch(urlFor('precAnnual', year, 1));
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    setCached('precAnnual', year, 1, data);
    return data;
}

async function meanForYear(year) {
    const frame = await loadAnnualPrecipFrame(year);
    return meanForViewport(frame.data);
}

async function refreshRegionalSeries() {
    if (!viewport) return;
    const requestId = ++seriesRequestId;
    seriesViewportKey = getViewportKey();
    const points = [];

    drawMeanChart(true);

    for (let i = 0; i < ANNUAL_TIMELINE.length; i += SERIES_BATCH_SIZE) {
        const batch = ANNUAL_TIMELINE.slice(i, i + SERIES_BATCH_SIZE);
        const loaded = await Promise.all(batch.map(async point => {
            try {
                return { ...point, value: await meanForYear(point.year) };
            } catch {
                return { ...point, value: NaN };
            }
        }));

        if (requestId !== seriesRequestId) return;
        points.push(...loaded);
        regionalSeries = points.slice().sort((a, b) => a.date - b.date);
        drawMeanChart(i + SERIES_BATCH_SIZE < ANNUAL_TIMELINE.length);
    }
}

function smoothAnnualSeries(series, windowSize = SMOOTHING_WINDOW_YEARS) {
    const radius = Math.floor(windowSize / 2);
    return series.map((point, index) => {
        const neighbors = series
            .slice(Math.max(0, index - radius), Math.min(series.length, index + radius + 1))
            .map(d => d.value)
            .filter(Number.isFinite);
        return {
            ...point,
            value: neighbors.length ? d3.mean(neighbors) : NaN
        };
    });
}

function drawMeanChart(isLoading = false) {
    const chart = document.getElementById('prec-mean-chart');
    if (!chart) return;

    chart.innerHTML = '';
    const cw = Math.max(220, chart.clientWidth || 360);
    const ch = Math.max(92, chart.clientHeight || 110);
    const margin = { top: 10, right: 16, bottom: 24, left: 34 };
    const innerW = cw - margin.left - margin.right;
    const innerH = ch - margin.top - margin.bottom;
    const svg = d3.select(chart).append('svg')
        .attr('width', cw)
        .attr('height', ch)
        .attr('viewBox', `0 0 ${cw} ${ch}`);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const smoothedSeries = smoothAnnualSeries(regionalSeries);
    const valid = smoothedSeries.filter(d => Number.isFinite(d.value));
    if (valid.length < 2) {
        g.append('text')
            .attr('x', innerW / 2)
            .attr('y', innerH / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', '#95a3b2')
            .attr('font-size', 11)
            .text(isLoading ? 'Loading regional rainfall…' : 'Regional rainfall');
        return;
    }

    const x = d3.scaleTime()
        .domain(d3.extent(ANNUAL_TIMELINE, d => d.date))
        .range([0, innerW]);
    const y = d3.scaleLinear()
        .domain(d3.extent(valid, d => d.value * SECONDS_PER_DAY))
        .nice()
        .range([innerH, 0]);
    const line = d3.line()
        .defined(d => Number.isFinite(d.value))
        .x(d => x(d.date))
        .y(d => y(d.value * SECONDS_PER_DAY));

    g.append('g')
        .attr('transform', `translate(0,${innerH})`)
        .call(d3.axisBottom(x).ticks(4).tickFormat(d3.timeFormat('%Y')))
        .call(axis => axis.selectAll('text').attr('fill', '#95a3b2').attr('font-size', 10))
        .call(axis => axis.selectAll('path,line').attr('stroke', 'rgba(255,255,255,0.22)'));

    g.append('g')
        .call(d3.axisLeft(y).ticks(3))
        .call(axis => axis.selectAll('text').attr('fill', '#95a3b2').attr('font-size', 10))
        .call(axis => axis.selectAll('path,line').attr('stroke', 'rgba(255,255,255,0.22)'));

    g.append('path')
        .datum(smoothedSeries)
        .attr('d', line)
        .attr('fill', 'none')
        .attr('stroke', '#7fb4dd')
        .attr('stroke-width', 1.8);

    const currentYear = getActiveYear();
    const currentDate = new Date(`${currentYear}-07`);
    const currentPoint = smoothedSeries.find(d => d.year === currentYear && Number.isFinite(d.value));
    const currentX = x(currentDate);

    g.append('line')
        .attr('x1', currentX)
        .attr('x2', currentX)
        .attr('y1', 0)
        .attr('y2', innerH)
        .attr('stroke', '#ff6b6b')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,4');

    if (currentPoint) {
        g.append('circle')
            .attr('cx', currentX)
            .attr('cy', y(currentPoint.value * SECONDS_PER_DAY))
            .attr('r', 3.5)
            .attr('fill', '#ff6b6b')
            .attr('stroke', '#0b1018')
            .attr('stroke-width', 1.5);
    }

    if (isLoading) {
        svg.append('text')
            .attr('x', cw - 8)
            .attr('y', 12)
            .attr('text-anchor', 'end')
            .attr('fill', '#95a3b2')
            .attr('font-size', 10)
            .text('loading');
    }
}

function getActiveYear() {
    const frameYear = currentFrame?.year;
    const year = Number.isFinite(frameYear) ? frameYear : getCurrentYear();
    return clamp(Math.round(year), ANNUAL_YEARS[0], ANNUAL_YEARS[ANNUAL_YEARS.length - 1]);
}

function handleMouseMove(event) {
    if (!currentData) return;
    if ('ontouchstart' in window) return;

    const canvas = document.getElementById('prec-canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const precData = currentData.data;
    if (!precData) return;

    const nx = precData[0].length;
    const ny = precData.length;
    const gridPoint = screenToGrid(mouseX, mouseY);
    const i = Math.floor(gridPoint.x);
    const j = Math.floor(gridPoint.y);

    if (i >= 0 && i < nx && j >= 0 && j < ny) {
        const precLevel = currentFrame
            ? valueAt(currentFrame.values, currentFrame.b, currentFrame.f, i, j)
            : precData[ny - j - 1][i];
        updateToolTip(event, precLevel);
        updatePointStats(i, j, precLevel);
    }
}

function updateToolTip(event, precLevel) {
    let tooltip = document.querySelector("#prec-tooltip");
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.classList.add("tooltip");
        tooltip.id = "prec-tooltip";
        document.body.prepend(tooltip);
    }
    tooltip.style.visibility = 'visible';
    if (precLevel !== null && !isNaN(precLevel)) {
        tooltip.innerHTML = `🌧️ rainfall: ${fmtMmPerDay(precLevel)} mm/day`;
    } else {
        tooltip.innerHTML = `🌊 No precipitation / Land`;
    }
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.top = event.pageY + 'px';
}

function updatePointStats(i, j, precLevel) {
    const pointStatsDiv = document.getElementById('prec-point-stats');
    if (!pointStatsDiv) return;
    const val = (precLevel !== null && !isNaN(precLevel)) ? `${fmtMmPerDay(precLevel)} mm/day` : '≈0 mm/day';
    const lon = i / currentData.data[0].length * 360 - 180;
    const lat = 90 - j / currentData.data.length * 180;
    pointStatsDiv.innerHTML = `
        <strong>Location:</strong> ${formatCoord(lat, 'S', 'N')}, ${formatCoord(lon, 'W', 'E')} |
        <strong>Precipitation:</strong> ${val}<br>
        <span style="font-size: 12px; color: #666;">Visible-region mean updates with zoom</span>
    `;
}

function createColorbar() {
    const colorbarDiv = document.getElementById('prec-colorbar');
    if (!colorbarDiv) return;
    colorbarDiv.innerHTML = '';

    const svg = d3.select("#colorbar").append("svg")
        .attr("width", 400).attr("height", 70)
        .style("display", "block").style("margin", "0 auto");

    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
        .attr("id", "iceGradient")
        .attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "0%");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#f0f8ff");
    gradient.append("stop").attr("offset", "20%").attr("stop-color", "#c6dbef");
    gradient.append("stop").attr("offset", "40%").attr("stop-color", "#9ecae1");
    gradient.append("stop").attr("offset", "60%").attr("stop-color", "#6baed6");
    gradient.append("stop").attr("offset", "80%").attr("stop-color", "#2171b5");
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#084594");

    svg.append("rect").attr("width", 300).attr("height", 20).attr("x", 50).attr("y", 10)
        .style("fill", "url(#iceGradient)").style("stroke", "#ddd").style("stroke-width", "1px");
    svg.append("text").attr("x", 50).attr("y", 45).text("0 m").style("font-size", "12px").style("text-anchor", "middle");
    svg.append("text").attr("x", 200).attr("y", 45).text("1 m").style("font-size", "12px").style("text-anchor", "middle");
    svg.append("text").attr("x", 350).attr("y", 45).text("3+ m").style("font-size", "12px").style("text-anchor", "middle");
    svg.append("text").attr("x", 200).attr("y", 65).text("Precipitation →").style("font-size", "11px").style("text-anchor", "middle").style("fill", "#666");
}
