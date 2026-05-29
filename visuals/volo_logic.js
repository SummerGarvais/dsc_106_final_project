import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { getCurrentYear, getCurrentMonth } from './sliders_setup.js';

document.addEventListener('DOMContentLoaded', function () {
    initializeVoloCanvas();
});

// Load and visualize ocean volume data
async function initializeVoloCanvas() {
    console.log("starting volo canvas");
    // Load the JSON data
    const data = await d3.json("./data/volo_data/ocean_volume_data.json");

    // Convert the object to an array of {date, value} pairs
    const timeSeriesData = Object.entries(data).map(([date, value]) => ({
        date: new Date(date),
        value: parseFloat(value)
    })).sort((a, b) => a.date - b.date);

    // Set up dimensions
    const margin = { top: 20, right: 30, bottom: 50, left: 60 };
    const width = 900 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    // Create SVG container
    const svg = d3.select("#volo-container")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Set up scales
    const xScale = d3.scaleTime()
        .domain(d3.extent(timeSeriesData, d => d.date))
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain(d3.extent(timeSeriesData, d => d.value))
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

    // Add the line
    const line = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScale(d.value));

    svg.append("path")
        .datum(timeSeriesData)
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
    const currentDate = new Date("1850-01"); // Today's date
    let currentDataPoint = timeSeriesData[0]; // Default to first point

    // Find the closest data point to today's date
    let minDiff = Math.abs(currentDate - timeSeriesData[0].date);
    for (let i = 1; i < timeSeriesData.length; i++) {
        const diff = Math.abs(currentDate - timeSeriesData[i].date);
        if (diff < minDiff) {
            minDiff = diff;
            currentDataPoint = timeSeriesData[i];
        }
    }

    // Draw vertical line at current date
    const currentX = xScale(currentDataPoint.date);
    const currentY = yScale(currentDataPoint.value);

    // Add vertical line
    svg.append("line")
        .attr("x1", currentX)
        .attr("y1", 0)
        .attr("x2", currentX)
        .attr("y2", height)
        .attr("stroke", "#ff6b6b")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,5")
        .attr("class", "current-line")
}

function updateLine() {
}