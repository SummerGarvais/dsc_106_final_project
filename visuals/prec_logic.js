import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getCurrentYear, getCurrentMonth } from './sliders_setup.js';

// Global variables
let currentData = null;
let colorScale = null;

const precContainer = document.getElementById('prec-container');
let width = precContainer.offsetWidth;
let height = precContainer.offsetHeight;

const colorHigh = '#084594';  // Blue (extreme precipitation)
const colorMid = '#fed976';   // Yellow (moderate precipitation)
const colorLow = '#ffffff';   // White (minimal/no precipitation)

function interpolateColor(precValue, minPrecip, maxPrecip) {
    // Clamp value between min and max
    const t = Math.max(0, Math.min(1, (precValue - minPrecip) / (maxPrecip - minPrecip)));

    let r, g, b;

    if (t <= 0.5) {
        // Transition from Blue (high precip) to Yellow (mid precip)
        const t2 = t * 2; // Scale 0-0.5 to 0-1

        const r1 = parseInt(colorHigh.slice(1, 3), 16);
        const g1 = parseInt(colorHigh.slice(3, 5), 16);
        const b1 = parseInt(colorHigh.slice(5, 7), 16);

        const r2 = parseInt(colorMid.slice(1, 3), 16);
        const g2 = parseInt(colorMid.slice(3, 5), 16);
        const b2 = parseInt(colorMid.slice(5, 7), 16);

        r = Math.round(r1 + (r2 - r1) * t2);
        g = Math.round(g1 + (g2 - g1) * t2);
        b = Math.round(b1 + (b2 - b1) * t2);
    } else {
        // Transition from Yellow (mid precip) to White (low precip)
        const t2 = (t - 0.5) * 2; // Scale 0.5-1 to 0-1

        const r1 = parseInt(colorMid.slice(1, 3), 16);
        const g1 = parseInt(colorMid.slice(3, 5), 16);
        const b1 = parseInt(colorMid.slice(5, 7), 16);

        const r2 = parseInt(colorLow.slice(1, 3), 16);
        const g2 = parseInt(colorLow.slice(3, 5), 16);
        const b2 = parseInt(colorLow.slice(5, 7), 16);

        r = Math.round(r1 + (r2 - r1) * t2);
        g = Math.round(g1 + (g2 - g1) * t2);
        b = Math.round(b1 + (b2 - b1) * t2);
    }

    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Initialize all viz elements when the page loads
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
            canvas.width = width;
            canvas.height = height;
            if (currentData) updateVisualization(currentData);
        }
    }).observe(precContainer);
});

function initializePrecCanvas() {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'prec-canvas';
    canvas.width = width;
    canvas.height = height;
    canvas.style.cursor = 'crosshair';
    canvas.style.border = '1px solid #ddd';
    canvas.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';

    const vizDiv = document.getElementById('prec-container');
    if (vizDiv) {
        vizDiv.innerHTML = '';
        vizDiv.appendChild(canvas);
    }

    // Add hover event listener
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
        const tooltip = document.querySelector("#prec-tooltip");
        tooltip.style.visibility = 'hidden';

        const pointStatsDiv = document.getElementById('prec-point-stats');
        if (pointStatsDiv) {
            pointStatsDiv.innerHTML = `
                📍 <strong>Location:</strong> No Data | 
                <strong>Precipitation:</strong> N/A <br>
                <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
            `;
        }
    });

    // Create color scale
    colorScale = d3.scaleSequentialLog()
        .domain([0.01, 5])
        .interpolator(d3.interpolateBlues);

    // Create colorbar
    createColorbar();
}

export async function loadNewPrecData() {
    const currentYear = getCurrentYear();
    const currentMonth = getCurrentMonth();

    try {
        // Fetch the JSON file for this specific year
        const response = await fetch(`./data/prec_data/prec_${currentYear}_${currentMonth.toString().padStart(2, '0')}.json`);
        console.log(`getting data from prec_${currentYear}_${currentMonth.toString().padStart(2, '0')}.json`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const newData = await response.json();
        // Update global variable with currently used dataset
        currentData = newData;

        // Update the visualization
        updateVisualization(newData);

        // Update statistics
        updateOverallStats(newData);

    } catch (error) {
        console.error(`Error loading data for ${currentYear}:`, error);
        const overallStatsDiv = document.getElementById('prec-overall-stats');
        if (overallStatsDiv) {
            overallStatsDiv.innerHTML = `❌ Error loading data for ${currentYear}, ${currentMonth}. Make sure sea_ice_${currentYear}_${currentMonth.toString().padStart(2, '0')}.json exists.`;
        }

        // Show error on canvas
        const canvas = document.getElementById('prec-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ff0000';
            ctx.font = '16px Arial';
            ctx.fillText(`Failed to load data for ${currentYear}, ${currentMonth}`, width / 2 - 150, height / 2);
        }
    }
}

// Updates canvas with precipitation data
function updateVisualization(data) {
    const canvas = document.getElementById('prec-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const precData = data.data;

    if (!precData || precData.length === 0) {
        console.error('No data available');
        return;
    }

    const nx = precData[0].length;
    const ny = precData.length;

    // SOLUTION 1: Force integer dimensions
    const cellWidth = Math.floor(width / nx);
    const cellHeight = Math.floor(height / ny);

    // Adjust canvas dimensions to be exact multiples of cell sizes
    const adjustedWidth = cellWidth * nx;
    const adjustedHeight = cellHeight * ny;

    canvas.width = adjustedWidth;
    canvas.height = adjustedHeight;

    // Clear canvas
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);

    // Draw each grid cell
    const flattenedData = precData.flat();

    const minPrecip = Math.min(...flattenedData);
    const maxPrecip = Math.max(...flattenedData);


    console.log(minPrecip, maxPrecip);

    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
            let x = i;
            let flipped_y = ny - j - 1;
            const value = precData[flipped_y][x];

            let color = interpolateColor(value, minPrecip, maxPrecip);
            ctx.fillStyle = color;
            ctx.fillRect(i * cellWidth, j * cellHeight, cellWidth, cellHeight);
        }
    }

    // Add title and annotations
    const currentYear = getCurrentYear();
    const currentMonthName = getCurrentMonth(name = true);

    ctx.font = '500 16px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(26,26,24,0.75)';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle'; // Centers text vertically
    ctx.fillText(`Precipitation · ${currentMonthName} ${currentYear}`, width / 2, 20);

    // Draw mini color bar at bottom right
    const miniBarWidth = 140;
    const miniBarHeight = 12;
    const miniBarX = width - miniBarWidth - 10;
    const miniBarY = height - 25;

    // Create a linear gradient for continuous color transition
    const gradient = ctx.createLinearGradient(miniBarX, miniBarY, miniBarX + miniBarWidth, miniBarY);
    gradient.addColorStop(0, '#fed976');   // Yellow - No rain (min)
    gradient.addColorStop(1, '#084594');   // Blue - Heavy rain (max)

    // Draw the continuous color bar
    ctx.fillStyle = gradient;
    ctx.fillRect(miniBarX, miniBarY, miniBarWidth, miniBarHeight);

    // Border around mini color bar
    ctx.strokeStyle = '#999';
    ctx.strokeRect(miniBarX, miniBarY, miniBarWidth, miniBarHeight);

    // Labels for mini color bar
    ctx.fillStyle = 'rgba(26,26,24,0.55)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('Heavy Rain', miniBarX + 18, miniBarY - 5);
    ctx.fillText('No Rain', miniBarX + miniBarWidth - 30, miniBarY - 5);
}

// Update stats for that year at the bottom of the page
function updateOverallStats(data) {
    const precData = data.data;
    const overallStatsDiv = document.getElementById('prec-overall-stats');

    if (!overallStatsDiv || !precData) return;

    // Flatten the array and filter valid values
    const values = [];
    for (let i = 0; i < precData.length; i++) {
        for (let j = 0; j < precData[i].length; j++) {
            const val = precData[i][j];
            if (val !== null && !isNaN(val) && val > 0) {
                values.push(val);
            }
        }
    }

    if (values.length > 0) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);

        const currentMonthName = getCurrentMonth(name = true);
        const currentYear = getCurrentYear();
        overallStatsDiv.innerHTML = `
            <strong>Statistics for ${currentMonthName} ${currentYear}:</strong><br>
            Mean precipitation: ${mean.toFixed(5)} ${data.units || 'm'} — 
            Max: ${max.toFixed(5)} ${data.units || 'm'} — 
            Min: ${min.toFixed(5)} ${data.units || 'm'}<br>
        `;
    } else {
        overallStatsDiv.innerHTML = `📊 No precipitation detected in ${data.year}`;
    }
}

function handleMouseMove(event) {
    if (!currentData) return;

    const canvas = document.getElementById('prec-canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const precData = currentData.data;
    if (!precData) return;

    const nx = precData[0].length;
    const ny = precData.length;

    const i = Math.floor(mouseX / width * nx);
    const j = Math.floor(mouseY / height * ny);

    if (i >= 0 && i < nx && j >= 0 && j < ny) {
        let x = i;
        let flipped_y = ny - j - 1;
        const precLevel = precData[flipped_y][x];

        updateToolTip(event, precLevel);
        updatePointStats(i, j, precLevel);
    }
}

function updateToolTip(event, precLevel) {
    // Create a tooltip-like display right under the cursor
    const tooltipX = event.pageX;
    const tooltipY = event.pageY;

    // Create tooltip if one doesn't exist yet
    let tooltip = document.querySelector("#prec-tooltip");
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.classList.add("tooltip");
        tooltip.id = "prec-tooltip";
        // Put at the front so that its coordinates are relative to the screen rather than whatever container it's in
        document.body.prepend(tooltip);
    }
    tooltip.style.visibility = 'visible';

    if (precLevel !== null && !isNaN(precLevel)) {
        tooltip.innerHTML = `❄️ precipitation: ${precLevel.toFixed(5)} ${currentData.units || 'm'}`;
    } else {
        tooltip.innerHTML = `🌊 No precipitation / Land`;
    }

    // Put tooltip under cursor while on canvas
    tooltip.style.left = tooltipX + 'px';
    tooltip.style.top = tooltipY + 'px';
}

function updatePointStats(i, j, precLevel) {
    // Update point stats at bottom of the document with data of cell being hovered over
    const pointStatsDiv = document.getElementById('prec-point-stats');
    if (!pointStatsDiv) return;

    if (precLevel !== null && !isNaN(precLevel)) {
        pointStatsDiv.innerHTML = `
            📍 <strong>Location:</strong> (${i}, ${j}) | 
            <strong>Precipitation:</strong> ${precLevel.toFixed(5)} ${currentData.units || 'm'}<br>
            <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
        `;
    } else {
        pointStatsDiv.innerHTML = `
            📍 <strong>Location:</strong> (${i}, ${j}) | 
            <strong>Precipitation:</strong> 0.000 m <br>
            <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
        `;
    }
}

function createColorbar() {
    const colorbarDiv = document.getElementById('prec-colorbar');
    if (!colorbarDiv) return;

    colorbarDiv.innerHTML = '';

    const svg = d3.select("#colorbar")
        .append("svg")
        .attr("width", 400)
        .attr("height", 70)
        .style("display", "block")
        .style("margin", "0 auto");

    // Create gradient
    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
        .attr("id", "iceGradient")
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "100%")
        .attr("y2", "0%");

    // Add color stops
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#f0f8ff");
    gradient.append("stop").attr("offset", "20%").attr("stop-color", "#c6dbef");
    gradient.append("stop").attr("offset", "40%").attr("stop-color", "#9ecae1");
    gradient.append("stop").attr("offset", "60%").attr("stop-color", "#6baed6");
    gradient.append("stop").attr("offset", "80%").attr("stop-color", "#2171b5");
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#084594");

    // Draw colorbar rectangle
    svg.append("rect")
        .attr("width", 300)
        .attr("height", 20)
        .attr("x", 50)
        .attr("y", 10)
        .style("fill", "url(#iceGradient)")
        .style("stroke", "#ddd")
        .style("stroke-width", "1px");

    // Add labels
    svg.append("text")
        .attr("x", 50)
        .attr("y", 45)
        .text("0 m")
        .style("font-size", "12px")
        .style("text-anchor", "middle");

    svg.append("text")
        .attr("x", 200)
        .attr("y", 45)
        .text("1 m")
        .style("font-size", "12px")
        .style("text-anchor", "middle");

    svg.append("text")
        .attr("x", 350)
        .attr("y", 45)
        .text("3+ m")
        .style("font-size", "12px")
        .style("text-anchor", "middle");

    svg.append("text")
        .attr("x", 200)
        .attr("y", 65)
        .text("Precipitation →")
        .style("font-size", "11px")
        .style("text-anchor", "middle")
        .style("fill", "#666");
}