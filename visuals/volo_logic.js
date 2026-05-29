import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getCurrentYear, getCurrentMonth } from './sliders_setup.js';

let svg = null;
let data = null;
let timeSeriesDataGlobal = null;
let xScale = null;
let yScale = null;

// Set up dimensions
const margin = { top: 20, right: 30, bottom: 50, left: 60 };
const width = 900 - margin.left - margin.right;
const height = 500 - margin.top - margin.bottom;

document.addEventListener('DOMContentLoaded', function () {
    initializeVoloCanvas();
});

// Load and visualize ocean volume data
async function initializeVoloCanvas() {
    console.log("starting volo canvas");
    // Load the JSON data
    data = await d3.json("./data/volo_data/ocean_volume_data.json");

    // Convert the object to an array of {date, value} pairs
    timeSeriesDataGlobal = Object.entries(data).map(([date, value]) => ({
        date: new Date(date),
        value: parseFloat(value)
    })).sort((a, b) => a.date - b.date);

    // Create SVG container
    svg = d3.select("#volo-container")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Set up scales
    xScale = d3.scaleTime()
        .domain(d3.extent(timeSeriesDataGlobal, d => d.date))
        .range([0, width]);

    yScale = d3.scaleLinear()
        .domain(d3.extent(timeSeriesDataGlobal, d => d.value))
        .range([height, 0]);

    // Add axes
    const xAxis = d3.axisBottom(xScale)
        .tickFormat(d3.timeFormat("%Y-%m"));

    const yAxis = d3.axisLeft(yScale);

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(xAxis)
        .selectAll("text")
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end");

    svg.append("g")
        .call(yAxis);

    // Add axis labels
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height + 40)
        .attr("text-anchor", "middle")
        .style("fill", "#666")
        .text("Date");

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -40)
        .attr("text-anchor", "middle")
        .style("fill", "#666")
        .text("Ocean Volume");

    // Graph time series data
    const line = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScale(d.value));

    svg.append("path")
        .datum(timeSeriesDataGlobal)
        .attr("class", "line")
        .attr("d", line)
        .style("fill", "none")
        .style("stroke", "#3498db")
        .style("stroke-width", 2);

    // Add title
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", -5)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .text("Ocean Volume Over Time");

    // Find the current data point (latest date)
    const initialDate = new Date("1850-01"); // initial placeholder date
    const initialValue = data[initialDate];

    // Draw vertical line at current date
    const currentX = xScale(initialDate);
    const currentY = yScale(initialValue);

    // Add slider line
    svg.append("line")
        .attr("x1", currentX)
        .attr("y1", 0)
        .attr("x2", currentX)
        .attr("y2", height)
        .attr("stroke", "#ff6b6b")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5")
        .attr("class", "current-line");

    // Add slider dot
    svg.append("circle")
        .attr("class", "current-point")
        .attr("cx", currentX)
        .attr("cy", currentY)
        .attr("r", 4)
        .attr("fill", "#ff6b6b");

        // Create overlay to capture mouse movements
    const overlay = svg.append("rect")
        .attr("class", "overlay")
        .attr("width", width)
        .attr("height", height)
        .style("fill", "none")
        .style("pointer-events", "all")
        .style("cursor", "crosshair");

    // Add mouse hover line 
    const hoverLine = svg.append("line")
        .attr("class", "hover-line")
        .style("pointer-events", "none") // Stops mouse from hovering over it and getting rid of tooltip
        .attr("x1", 0)
        .attr("x2", 0)
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "#89CFF0")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5");

    // Add mouse hover point
    const hoverPoint = svg.append("circle")
        .attr("class", "hover-point")
        .attr("r", 5)
        .attr("fill", "#89CFF0")
        .attr("stroke", "white")
        .attr("stroke-width", 2);

    // Add hover event listener
    overlay.on('mousemove', handleMouseMove);
    overlay.on('mouseleave', () => {
        const tooltip = document.querySelector("#volo-tooltip");
        tooltip.style.visibility = 'hidden';
        console.log("hiding volo tooltip");
    });
}

function handleMouseMove(event) {
    // Get mouse position relative to the SVG
    const [mouseX, mouseY] = d3.pointer(event);

    function findClosestDate(mouseX) {
        const mouseDate = xScale.invert(mouseX);
        const formatMonthYear = d3.timeFormat("%Y-%m");
        return formatMonthYear(mouseDate);
    }

    const mouseDateStr = findClosestDate(mouseX);
    console.log("closest point:");
    console.log(mouseDateStr);

    updateToolTip(event, mouseDateStr);
    updateHoverLine(mouseDateStr);
}

function updateHoverLine(mouseDateStr) {
    // Get pixel coordinates
    const x = xScale(new Date(mouseDateStr));
    const y = yScale(data[mouseDateStr]);

    console.log(x, y);

    // Update hover vertical line
    svg.select('.hover-line')
        .transition()
        .duration(10)
        .attr('x1', x)
        .attr('x2', x)
        .style('opacity', 0.8);

    // Update hover point
    svg.select('.hover-point')
        .transition()
        .duration(10)
        .attr('cx', x)
        .attr('cy', y)
        .style('opacity', 1);
}


function updateToolTip(event, mouseDateStr) {
    // Create a tooltip-like display right under the cursor
    const tooltipX = event.pageX;
    const tooltipY = event.pageY;

    // Create tooltip if one doesn't exist yet
    let tooltip = document.querySelector("#volo-tooltip");
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.classList.add("tooltip");
        tooltip.id = "volo-tooltip";
        // Put at the front so that its coordinates are relative to the screen rather than whatever container it's in
        document.body.prepend(tooltip);
    }
    tooltip.style.visibility = 'visible';
    console.log("showing volo tooltip");

    const date = d3.timeParse("%Y-%m")(mouseDateStr);
    const humanReadable = d3.timeFormat("%B %Y")(date);

    tooltip.innerHTML = `${humanReadable}: ${data[mouseDateStr]}`;

    // Put tooltip under cursor while on canvas
    tooltip.style.left = tooltipX + 'px';
    tooltip.style.top = tooltipY + 'px';
}

export async function updateSliderLine() {
    if (data === null) {
        return;
    }

    const year = getCurrentYear();
    const month = getCurrentMonth();

    // Build a date like YYYY-MM (month may be 1-12)
    const monthStr = String(month).padStart(2, '0');
    const targetDateStr = `${year}-${monthStr}`;
    const targetDate = new Date(targetDateStr);

    const value = data[targetDateStr]

    const x = xScale(targetDate);
    const y = yScale(value);

    svg.select('.current-line')
        .transition()
        .duration(50)
        .ease(d3.easeCubicInOut)
        .attr('x1', x)
        .attr('x2', x);
    
    console.log(x, y);

    svg.select('.current-point')
        .transition()
        .duration(50)
        .ease(d3.easeCubicInOut)
        .attr('cx', x)
        .attr('cy', y);
}