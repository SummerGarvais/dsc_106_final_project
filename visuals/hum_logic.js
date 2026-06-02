import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getCurrentYear, getCurrentMonth } from './sliders_setup.js';

// Global variables
let currentData = null;
let colorScale = null;

const humContainer = document.getElementById('hum-container');
let width = humContainer.offsetWidth;
let height = humContainer.offsetHeight;

const colors = [
    '#006d2c',   // Level 1: Extremely humid (very high specific humidity) - dark green
    '#31a354',   // Level 2: Very humid - green
    '#74c476',   // Level 3: Humid - light green
    '#a1d99b',   // Level 4: Moderately humid - pale green
    '#ccebc5',   // Level 5: Slightly humid - very pale green
    '#e5f5f0',   // Level 6: Near neutral - off-white/teal
    '#99d8c9',   // Level 7: Slightly dry - pale blue-green
    '#66c2a4',   // Level 8: Moderately dry - light teal
    '#35978f',   // Level 9: Dry - teal
    '#1f6e9e',   // Level 10: Very dry - blue-teal
    '#084594'    // Level 11: Extremely dry (very low specific humidity) - dark blue
];
// Initialize all viz elements when the page loads
document.addEventListener('DOMContentLoaded', function () {
    initializeHumCanvas();

    new ResizeObserver(() => {
        const newW = humContainer.clientWidth;
        const newH = humContainer.clientHeight;
        if (newW === width && newH === height) return;
        width = newW;
        height = newH;
        const canvas = document.getElementById('hum-canvas');
        if (canvas) {
            canvas.width = width;
            canvas.height = height;
            if (currentData) updateVisualization(currentData);
        }
    }).observe(humContainer);
});

function initializeHumCanvas() {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'hum-canvas';
    canvas.width = width;
    canvas.height = height;
    canvas.style.cursor = 'crosshair';
    canvas.style.border = '1px solid #ddd';
    canvas.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';

    const vizDiv = document.getElementById('hum-container');
    if (vizDiv) {
        vizDiv.innerHTML = '';
        vizDiv.appendChild(canvas);
    }

    // Add hover event listener
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
        const tooltip = document.querySelector("#hum-tooltip");
        tooltip.style.visibility = 'hidden';

        const pointStatsDiv = document.getElementById('hum-point-stats');
        if (pointStatsDiv) {
            pointStatsDiv.innerHTML = `
                📍 <strong>Location:</strong> No Data | 
                <strong>Specific Humidity:</strong> N/A <br>
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

export async function loadNewHumData() {
    const currentYear = getCurrentYear();
    const currentMonth = getCurrentMonth();

    try {
        // Fetch the JSON file for this specific year
        const response = await fetch(`./data/hum_data/hum_${currentYear}_${currentMonth.toString().padStart(2, '0')}.json`);

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
        if (overallStatsDiv) {
            overallStatsDiv.innerHTML = `❌ Error loading data for ${currentYear}, ${currentMonth}. Make sure sea_ice_${currentYear}_${currentMonth.toString().padStart(2, '0')}.json exists.`;
        }

        // Show error on canvas
        const canvas = document.getElementById('hum-canvas');
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

// Updates canvas with sea ice melt data
function updateVisualization(data) {
    const canvas = document.getElementById('hum-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const humData = data.data;

    if (!humData || humData.length === 0) {
        console.error('No data available');
        return;
    }

    const nx = humData[0].length;
    const ny = humData.length;
    const cellWidth = width / nx;
    const cellHeight = height / ny;

    // Clear canvas
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);

    const minThick = Math.min(humData);
    const maxThick = Math.max(humData);
    // Draw each grid cell
    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
            let x = i;
            let flipped_y = ny - j - 1;
            const value = humData[flipped_y][x];

            if (value !== null && !isNaN(value)) {
                // 11 discrete color levels for melt flux (-0.001 to 0.001 range)
                let color;

                // Specific humidity ranges (0.000 to 0.025 kg/kg or g/kg)
                if (value <= 0.001) {
                    color = colors[10];     // Level 11: Extremely dry
                } else if (value <= 0.0025) {
                    color = colors[9];      // Level 10: Very dry
                } else if (value <= 0.005) {
                    color = colors[8];      // Level 9: Dry
                } else if (value <= 0.0075) {
                    color = colors[7];      // Level 8: Moderately dry
                } else if (value <= 0.010) {
                    color = colors[6];      // Level 7: Slightly dry
                } else if (value <= 0.0125) {
                    color = colors[5];      // Level 6: Near neutral
                } else if (value <= 0.015) {
                    color = colors[4];      // Level 5: Slightly humid
                } else if (value <= 0.0175) {
                    color = colors[3];      // Level 4: Moderately humid
                } else if (value <= 0.020) {
                    color = colors[2];      // Level 3: Humid
                } else if (value <= 0.0225) {
                    color = colors[1];      // Level 2: Very humid
                } else if (value <= 0.025) {
                    color = colors[0];      // Level 1: Extremely humid
                }

                ctx.fillStyle = color;
                ctx.fillRect(i * cellWidth, j * cellHeight, cellWidth, cellHeight);

                // Subtle grid lines
                ctx.strokeStyle = 'rgba(200,200,200,0.2)';
                ctx.strokeRect(i * cellWidth, j * cellHeight, cellWidth, cellHeight);
            } else {
                // Land or no ice
                ctx.fillStyle = '#e0e0e0';
                ctx.fillRect(i * cellWidth, j * cellHeight, cellWidth, cellHeight);
            }
        }
    }

    // Add title and annotations
    const currentYear = getCurrentYear();
    const currentMonthName = getCurrentMonth(name = true);

    ctx.font = '500 16px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(26,26,24,0.75)';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle'; // Centers text vertically
    ctx.fillText(`Near-Surface Specific Humidity · ${currentMonthName} ${currentYear}`, width / 2, 20);

    // Draw mini color bar at bottom right
    const miniBarWidth = 140;
    const miniBarHeight = 12;
    const miniBarX = width - miniBarWidth - 10;
    const miniBarY = height - 25;

    // Define the color segments for mini bar
    const segments = [
        { color: colors[0], width: miniBarWidth / 11 },
        { color: colors[1], width: miniBarWidth / 11 },
        { color: colors[2], width: miniBarWidth / 11 },
        { color: colors[3], width: miniBarWidth / 11 },
        { color: colors[4], width: miniBarWidth / 11 },
        { color: colors[5], width: miniBarWidth / 11 },
        { color: colors[6], width: miniBarWidth / 11 },
        { color: colors[7], width: miniBarWidth / 11 },
        { color: colors[8], width: miniBarWidth / 11 },
        { color: colors[9], width: miniBarWidth / 11 },
        { color: colors[10], width: miniBarWidth / 11 }
    ];

    for (let i = 0; i < segments.length; i++) {
        ctx.fillStyle = segments[i].color;
        ctx.fillRect(miniBarX + (i * segments[i].width), miniBarY, segments[i].width, miniBarHeight);
    }

    // Border around mini color bar
    ctx.strokeStyle = '#999';
    ctx.strokeRect(miniBarX, miniBarY, miniBarWidth, miniBarHeight);

    // Labels for mini color bar
    ctx.fillStyle = 'rgba(26,26,24,0.55)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('Dry', miniBarX + 18, miniBarY - 5);
    ctx.fillText('Humid', miniBarX + miniBarWidth - 10, miniBarY - 5);
}

// Update stats for that year at the bottom of the page
function updateOverallStats(data) {
    const humData = data.data;
    const overallStatsDiv = document.getElementById('hum-overall-stats');

    if (!overallStatsDiv || !humData) return;

    // Flatten the array and filter valid values
    const values = [];
    for (let i = 0; i < humData.length; i++) {
        for (let j = 0; j < humData[i].length; j++) {
            const val = humData[i][j];
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
            Mean Specific Humidity: ${mean.toFixed(5)} — 
            Max: ${max.toFixed(5)} — 
            Min: ${min.toFixed(5)}<br>

            (Note: Specific humidity values are in kg/kg, i.e. a ratio of water vapor mass to total air mass. Values above 0.020 are considered very humid.)
        `;
    } else {
        overallStatsDiv.innerHTML = `📊 No specific humidity data detected in ${data.year}`;
    }
}

function handleMouseMove(event) {
    if (!currentData) return;

    const canvas = document.getElementById('hum-canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const humData = currentData.data;
    if (!humData) return;

    const nx = humData[0].length;
    const ny = humData.length;

    const i = Math.floor(mouseX / width * nx);
    const j = Math.floor(mouseY / height * ny);

    if (i >= 0 && i < nx && j >= 0 && j < ny) {
        let flipped_x = nx - i - 1;
        let flipped_y = ny - j - 1;
        const meltFlux = humData[flipped_y][flipped_x];

        updateToolTip(event, meltFlux);
        updatePointStats(i, j, meltFlux);
    }
}

function updateToolTip(event, meltFlux) {
    // Create a tooltip-like display right under the cursor
    const tooltipX = event.pageX;
    const tooltipY = event.pageY;

    // Create tooltip if one doesn't exist yet
    let tooltip = document.querySelector("#hum-tooltip");
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.classList.add("tooltip");
        tooltip.id = "hum-tooltip";
        // Put at the front so that its coordinates are relative to the screen rather than whatever container it's in
        document.body.prepend(tooltip);
    }
    tooltip.style.visibility = 'visible';

    if (meltFlux !== null && !isNaN(meltFlux)) {
        tooltip.innerHTML = `❄️ near-surface specific humidity: ${meltFlux.toFixed(5)}`;
    } else {
        tooltip.innerHTML = `🌊 No specific humidity data`;
    }

    // Put tooltip under cursor while on canvas
    tooltip.style.left = tooltipX + 'px';
    tooltip.style.top = tooltipY + 'px';
}

function updatePointStats(i, j, meltFlux) {
    // Update point stats at bottom of the document with data of cell being hovered over
    const pointStatsDiv = document.getElementById('hum-point-stats');
    if (!pointStatsDiv) return;

    if (meltFlux !== null && !isNaN(meltFlux)) {
        pointStatsDiv.innerHTML = `
            📍 <strong>Location:</strong> (${i}, ${j}) | 
            <strong>Specific Humidity:</strong> ${meltFlux.toFixed(5)} ${currentData.units || 'm'}<br>
            <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
        `;
    } else {
        pointStatsDiv.innerHTML = `
            📍 <strong>Location:</strong> (${i}, ${j}) | 
            <strong>Specific Humidity:</strong> 0.000 m <br>
            <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
        `;
    }
}

function createColorbar() {
    const colorbarDiv = document.getElementById('hum-colorbar');
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
        .text("Sea Specific Humidity →")
        .style("font-size", "11px")
        .style("text-anchor", "middle")
        .style("fill", "#666");
}