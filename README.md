# Network Delay Visualizer

An interactive, browser based tool that models end to end network delay and visualizes how each delay component contributes to total latency.

---

## Overview

Network delay is a fundamental concept in computer networks, but it is often difficult to build intuition using equations alone. This tool allows users to adjust common network parameters and immediately see how transmission, propagation, processing, and queueing delays contribute to total end-to-end latency.

The goal is accessibility. Students can use the tool directly in a web browser with no installation or setup required.

---

## Features

A static web app built with plain HTML, CSS, and JavaScript. It includes:

- Adjustable inputs for:
  - Packet size
  - Link bandwidth
  - Distance per link
  - Propagation speed as a fraction of the speed of light
  - Hop count as number of intermediate devices
  - Processing delay per device
  - Queueing delay per device
- Automatic calculations for:
  - Transmission delay
  - Propagation delay
  - Processing delay
  - Queueing delay
  - Total end-to-end delay
- Visual output for:
  - Delay breakdown by component
  - Repeated per-hop delay view
  - Table of per-hop and across-path values

## Running Locally

No build step is required right now.

1. Clone the repository.
2. Open `index.html` in a browser.
3. Open `formulas.html` for the math reference page.

Because the project is a static site, it is also a good fit for GitHub Pages.

## Implementation Notes

- The current model assumes each link has the same distance and bandwidth, and each intermediate device has the same processing delay and queueing delay.
- End-to-end delay is computed as:

```text
total delay = (hops + 1) × (transmission + propagation) + hops × (processing + queueing)
```

- Transmission delay uses `L / R`.
- Propagation delay uses `d / s`.

---

## Tech Stack

- HTML, CSS, JavaScript
- Visualization rendered directly in the page without a separate chart dependency
- Hosted as a static site using GitHub Pages

---
