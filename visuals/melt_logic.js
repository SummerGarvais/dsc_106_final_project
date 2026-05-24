// Global variables
let currentData = null;
let width = 1200;
let height = 800;
let colorScale = null;
const colors = [
    '#084594',  // Level 1: Extreme freeze
    '#1f64af',  // Level 2: Strong freeze
    '#367ebd',  // Level 3: Moderate freeze
    '#60b2e9',  // Level 4: Light freeze
    '#99d6f9',  // Level 5: Very light freeze
    '#f0f8ff',  // Level 6: Near zero / minimal
    '#ffeabb',  // Level 7: Very minimal melt
    '#ffd4b3',  // Level 8: Light melt
    '#ffb377',  // Level 9: Moderate melt
    '#f97e3c',  // Level 10: Strong melt
    '#e34a33'   // Level 11: Very strong melt
];
// Initialize all viz elements when the page loads
document.addEventListener('DOMContentLoaded', function () {
    initializeSeaMeltCanvas();
    loadRememberedYear();
});

function initializeSeaMeltCanvas() {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'melt-canvas';
    canvas.width = width;
    canvas.height = height;
    canvas.style.cursor = 'crosshair';
    canvas.style.border = '1px solid #ddd';
    canvas.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';

    const vizDiv = document.getElementById('melt-visualization');
    if (vizDiv) {
        vizDiv.innerHTML = '';
        vizDiv.appendChild(canvas);
    }

    // Add hover event listener
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', () => {
        const tooltip = document.querySelector(".tooltip");
        tooltip.style.visibility = 'hidden';

        const pointStatsDiv = document.getElementById('melt-point-stats');
        if (pointStatsDiv) {
            pointStatsDiv.innerHTML = `
                📍 <strong>Location:</strong> No Data | 
                <strong>Ice flux:</strong> N/A <br>
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

async function loadNewMeltData() {
    const yearSlider = document.getElementById('year-slider');
    const monthSlider = document.getElementById('month-slider');
    const currentYear = parseInt(yearSlider.value);
    const currentMonth = parseInt(monthSlider.value);

    // Show loading state
    const overallStatsDiv = document.getElementById('melt-overall-stats');
    if (overallStatsDiv) {
        overallStatsDiv.innerHTML = '📡 Loading sea ice flux data for ' + currentYear + ', ' + currentMonth + '...';
    }

    try {
        // Fetch the JSON file for this specific year
        const response = await fetch(`./data/ice_melt_${currentYear}_${currentMonth.toString().padStart(2, '0')}.json`);

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
        const canvas = document.getElementById('melt-canvas');
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

// Sliders will remember their values between refreshes, 
// so load them in to make all other elements match
function loadRememberedYear() {
    const yearSlider = document.getElementById('year-slider');
    const yearDisplay = document.getElementById('year-value');
    currentYear = parseInt(yearSlider.value); // Get the year slider's current value
    yearDisplay.textContent = currentYear; // Update display to match

    const monthSlider = document.getElementById('month-slider');
    const monthDisplay = document.getElementById('month-value');
    currentMonth = parseInt(monthSlider.value); // Get the month slider's current value
    monthDisplay.textContent = currentMonth; // Update display to match
    loadNewData(); // Load data for that year and month
}

// Updates canvas with sea ice melt data
function updateVisualization(data) {
    const canvas = document.getElementById('melt-meltCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const fluxData = data.data;

    if (!fluxData || fluxData.length === 0) {
        console.error('No data available');
        return;
    }

    const nx = fluxData[0].length;
    const ny = fluxData.length;
    const cellWidth = width / nx;
    const cellHeight = height / ny;

    // Clear canvas
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);

    const minThick = Math.min(fluxData);
    const maxThick = Math.max(fluxData);
    // Draw each grid cell
    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
            let flipped_x = nx - i - 1;
            let flipped_y = ny - j - 1;
            const value = fluxData[flipped_y][flipped_x];

            if (value !== null && !isNaN(value)) {
                // 11 discrete color levels for melt flux (-0.001 to 0.001 range)
                let color;

                if (value <= -0.0009) {
                    color = colors[0];      // Level 1: Extreme freeze
                } else if (value <= -0.0007) {
                    color = colors[1];      // Level 2: Strong freeze
                } else if (value <= -0.0005) {
                    color = colors[2];      // Level 3: Moderate freeze
                } else if (value <= -0.0003) {
                    color = colors[3];      // Level 4: Light freeze
                } else if (value <= -0.0001) {
                    color = colors[4];      // Level 5: Very light freeze
                } else if (value <= 0) {
                    color = colors[5];      // Level 6: Near zero / minimal
                } else if (value <= 0.0001) {
                    color = colors[6];      // Level 7: Very minimal melt
                } else if (value <= 0.0003) {
                    color = colors[7];      // Level 8: Light melt
                } else if (value <= 0.0005) {
                    color = colors[8];      // Level 9: Moderate melt
                } else if (value <= 0.0007) {
                    color = colors[9];      // Level 10: Strong melt
                } else if (value <= 0.0009) {
                    color = colors[10];     // Level 11: Very strong melt
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
ctx.font = 'bold 16px Arial';
ctx.fillStyle = '#2c3e50';
ctx.fillText(`sea ice melt flux (${data.units || 'm'}) - ${data.year}`, 10, 30);

ctx.font = '12px Arial';
ctx.fillStyle = '#7f8c8d';
ctx.fillText('9 flux levels', 10, 55);

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
ctx.fillStyle = '#666';
ctx.font = '9px Arial';
ctx.fillText('Thinner', miniBarX, miniBarY - 2);
ctx.fillText('Thicker', miniBarX + miniBarWidth - 30, miniBarY - 2);
}

// Update stats for that year at the bottom of the page
function updateOverallStats(data) {
    const fluxData = data.data;
    const overallStatsDiv = document.getElementById('melt-overall-stats');

    if (!overallStatsDiv || !fluxData) return;

    // Flatten the array and filter valid values
    const values = [];
    for (let i = 0; i < fluxData.length; i++) {
        for (let j = 0; j < fluxData[i].length; j++) {
            const val = fluxData[i][j];
            if (val !== null && !isNaN(val) && val > 0) {
                values.push(val);
            }
        }
    }

    if (values.length > 0) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);

        overallStatsDiv.innerHTML = `
            <strong>📊 Statistics for ${data.year}:</strong><br>
            Mean ice flux: ${mean.toFixed(5)} ${data.units || 'm'} | 
            Max: ${max.toFixed(5)} ${data.units || 'm'} | 
            Min: ${min.toFixed(5)} ${data.units || 'm'}<br>
        `;
    } else {
        overallStatsDiv.innerHTML = `📊 No sea ice melt detected in ${data.year}`;
    }
}

function handleMouseMove(event) {
    if (!currentData) return;

    const canvas = document.getElementById('melt-meltCanvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const fluxData = currentData.data;
    if (!fluxData) return;

    const nx = fluxData[0].length;
    const ny = fluxData.length;

    const i = Math.floor(mouseX / width * nx);
    const j = Math.floor(mouseY / height * ny);

    if (i >= 0 && i < nx && j >= 0 && j < ny) {
        let flipped_x = nx - i - 1;
        let flipped_y = ny - j - 1;
        const meltFlux = fluxData[flipped_y][flipped_x];

        updateToolTip(event, meltFlux);
        updatePointStats(i, j, meltFlux);
    }
}

function updateToolTip(event, meltFlux) {
    // Create a tooltip-like display right under the cursor
    const tooltipX = event.pageX - 16;
    const tooltipY = event.pageY - 16;

    // Create tooltip if one doesn't exist yet
    let tooltip = document.querySelector(".tooltip");
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.classList.add("tooltip");
        // Put at the front so that its coordinates are relative to the screen rather than whatever container it's in
        document.body.prepend(tooltip);
    }
    tooltip.style.visibility = 'visible';

    if (meltFlux !== null && !isNaN(meltFlux)) {
        tooltip.innerHTML = `❄️ sea ice melt: ${meltFlux.toFixed(5)} ${currentData.units || 'm'}`;
    } else {
        tooltip.innerHTML = `🌊 No sea ice melt / Land`;
    }

    // Put tooltip under cursor while on canvas
    tooltip.style.left = tooltipX + 'px';
    tooltip.style.top = tooltipY + 'px';
}

function updatePointStats(i, j, meltFlux) {
    // Update point stats at bottom of the document with data of cell being hovered over
    const pointStatsDiv = document.getElementById('melt-point-stats');
    if (!pointStatsDiv) return;

    if (meltFlux !== null && !isNaN(meltFlux)) {
        pointStatsDiv.innerHTML = `
            📍 <strong>Location:</strong> (${i}, ${j}) | 
            <strong>Ice Flux:</strong> ${meltFlux.toFixed(5)} ${currentData.units || 'm'}<br>
            <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
        `;
    } else {
        pointStatsDiv.innerHTML = `
            📍 <strong>Location:</strong> (${i}, ${j}) | 
            <strong>Ice Flux:</strong> 0.000 m <br>
            <span style="font-size: 12px; color: #666;">Hover over map for values | Click year buttons to change time</span>
        `;
    }
}

function createColorbar() {
    const colorbarDiv = document.getElementById('melt-colorbar');
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
        .text("Sea Ice Flux →")
        .style("font-size", "11px")
        .style("text-anchor", "middle")
        .style("fill", "#666");
}