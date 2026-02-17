# Network Delay Visualizer

🚧 **Work in Progress** 🚧

An interactive, browser based tool that models end to end network delay and visualizes how each delay component contributes to total latency.

This project is currently under active development as part of a graduate level Computer Networks course. Core functionality is being implemented incrementally, with a focus on correctness, clarity, and accessibility.

---

## Overview

Network delay is a fundamental concept in computer networks, but it is often difficult to build intuition using equations alone. This tool allows users to adjust common network parameters and immediately see how transmission, propagation, processing, and queueing delays contribute to total end-to-end latency.

The goal of the project is accessibility. Any student should be able to use the tool directly in a web browser with no installation or setup required.

---

## Features (Planned and In Progress)

- Adjustable network parameters:
  - Packet size
  - Link bandwidth
  - Propagation distance
  - Propagation speed
  - Number of hops
  - Processing delay per hop
  - Queueing delay per hop
- Delay calculations:
  - Transmission delay
  - Propagation delay
  - Processing delay
  - Queueing delay
  - Total end to end delay
- Visualization:
  - Delay breakdown by component
  - Optional per hop view

---

## Tech Stack

- HTML, CSS, JavaScript
- Visualization library: Chart.js or Plotly.js
- Hosted as a static site using GitHub Pages

---

