const SPEED_OF_LIGHT = 299_792_458;

const defaults = {
  packetSize: 1500,
  bandwidthMbps: 100,
  distanceKm: 250,
  propagationFactor: 0.67,
  hops: 4,
  processingMs: 0.3,
  queueingMs: 1.2,
  packetLossPercent: 0,
  jitterMs: 0,
  packetCount: 1,
};

const componentColors = {
  transmission: "#0f766e",
  propagation: "#c2410c",
  processing: "#6d28d9",
  queueing: "#2563eb",
};

const componentLabels = {
  transmission: "Transmission",
  propagation: "Propagation",
  processing: "Processing",
  queueing: "Queueing",
};

const SIMULATION_NODE_SIZE = 98;
const SIMULATION_NODE_MARGIN = 20;
const SIMULATION_NODE_GAP = 132;
const SIMULATION_ROW_GAP = 150;

const inputLimits = {
  packetSize: { min: 1, max: 1_000_000 },
  bandwidthMbps: { min: 0.001, max: 1_000_000 },
  distanceKm: { min: 0, max: 40_075 },
  propagationFactor: { min: 0.01, max: 1 },
  hops: { min: 0, max: 20 },
  processingMs: { min: 0, max: 10_000 },
  queueingMs: { min: 0, max: 10_000 },
  packetLossPercent: { min: 0, max: 100 },
  jitterMs: { min: 0, max: 10_000 },
  packetCount: { min: 1, max: 100 },
};

const form = document.getElementById("controls");
const resetButton = document.getElementById("resetButton");
const summaryGrid = document.getElementById("summaryGrid");
const totalDelayLabel = document.getElementById("totalDelayLabel");
const stackedBar = document.getElementById("stackedBar");
const legend = document.getElementById("legend");
const hopBars = document.getElementById("hopBars");
const perHopLabel = document.getElementById("perHopLabel");
const detailTable = document.getElementById("detailTable");
const simulationStatus = document.getElementById("simulationStatus");
const simulationPath = document.getElementById("simulationPath");
const simulationTimeline = document.getElementById("simulationTimeline");
const packetLayer = document.getElementById("packetLayer");
const sendButton = document.getElementById("sendButton");
const toggleLoopButton = document.getElementById("toggleLoopButton");
const stopButton = document.getElementById("stopButton");
const simulationCard = document.querySelector(".simulation-card");
const simulationPaneBody = document.getElementById("simulationPaneBody");
const toggleSimulationPane = document.getElementById("toggleSimulationPane");
const toggleAdvancedView = document.getElementById("toggleAdvancedView");
const advancedLinksPanel = document.getElementById("advancedLinksPanel");
const advancedLinkGrid = document.getElementById("advancedLinkGrid");
const linkOverridesPanel = document.getElementById("linkOverridesPanel");

const simulationState = {
  runId: 0,
  loopEnabled: false,
  active: false,
  model: null,
  paneOpen: true,
};

let advancedLinkOverrides = [];
let advancedPanelSignature = "";
let advancedModeEnabled = false;

function readInputs() {
  const rawValues = Object.fromEntries(new FormData(form).entries());
  const hops = readLimitedInteger("hops", rawValues.hops);
  const bandwidthMbps = readLimitedNumber("bandwidthMbps", rawValues.bandwidthMbps);
  const distanceKm = readLimitedNumber("distanceKm", rawValues.distanceKm);

  return {
    packetSize: readLimitedNumber("packetSize", rawValues.packetSize),
    bandwidthMbps,
    distanceKm,
    propagationFactor: readLimitedNumber("propagationFactor", rawValues.propagationFactor),
    hops,
    processingMs: readLimitedNumber("processingMs", rawValues.processingMs),
    queueingMs: readLimitedNumber("queueingMs", rawValues.queueingMs),
    packetLossPercent: readLimitedNumber("packetLossPercent", rawValues.packetLossPercent),
    jitterMs: readLimitedNumber("jitterMs", rawValues.jitterMs),
    packetCount: readLimitedInteger("packetCount", rawValues.packetCount),
    useAdvancedLinks: advancedModeEnabled,
    linkOverrides: readAdvancedLinkOverrides(hops + 1, { bandwidthMbps, distanceKm }, advancedModeEnabled),
  };
}

function readLimitedNumber(name, value) {
  const limit = inputLimits[name];
  const limited = clampNumber(value, limit.min, limit.max, defaults[name]);
  syncLimitedFieldValue(name, limited);
  return limited;
}

function readLimitedInteger(name, value) {
  const limit = inputLimits[name];
  const numeric = Number(value);
  const rounded = Number.isFinite(numeric) ? Math.round(numeric) : defaults[name];
  const limited = clampNumber(rounded, limit.min, limit.max, defaults[name]);
  syncLimitedFieldValue(name, limited);
  return limited;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, numeric));
}

function syncLimitedFieldValue(name, value) {
  const field = form.elements.namedItem(name);

  if (field && field.value !== String(value)) {
    field.value = value;
  }
}

function calculateDelay(inputs) {
  const packetBits = inputs.packetSize * 8;
  const propagationSpeed = inputs.propagationFactor * SPEED_OF_LIGHT;
  const linkCount = inputs.hops + 1;
  const deviceCount = inputs.hops;
  const linkDelays = inputs.linkOverrides.map((link, index) => {
    const bandwidthBps = link.bandwidthMbps * 1_000_000;
    const distanceMeters = link.distanceKm * 1000;
    return {
      index,
      bandwidthMbps: link.bandwidthMbps,
      distanceKm: link.distanceKm,
      bandwidthBps,
      distanceMeters,
      transmission: packetBits / bandwidthBps,
      propagation: propagationSpeed > 0 ? distanceMeters / propagationSpeed : 0,
    };
  });

  const totalTransmission = linkDelays.reduce((sum, link) => sum + link.transmission, 0);
  const totalPropagation = linkDelays.reduce((sum, link) => sum + link.propagation, 0);
  const averageTransmission = linkCount > 0 ? totalTransmission / linkCount : 0;
  const averagePropagation = linkCount > 0 ? totalPropagation / linkCount : 0;
  const perDeviceSeconds = {
    processing: inputs.processingMs / 1000,
    queueing: inputs.queueingMs / 1000,
  };
  const packetLossProbability = Math.min(inputs.packetLossPercent / 100, 1);
  const pathLossProbability = 1 - Math.pow(1 - packetLossProbability, linkCount);
  const maxJitterSeconds = (inputs.jitterMs / 1000) * linkCount;
  const averageJitterSeconds = maxJitterSeconds / 2;

  const totalSeconds = {
    transmission: totalTransmission,
    propagation: totalPropagation,
    processing: perDeviceSeconds.processing * deviceCount,
    queueing: perDeviceSeconds.queueing * deviceCount,
  };

  const totalDelay = Object.values(totalSeconds).reduce((sum, value) => sum + value, 0);
  const perDeviceDelay = perDeviceSeconds.processing + perDeviceSeconds.queueing;
  const perLinkDelay = averageTransmission + averagePropagation;

  return {
    inputs,
    linkCount,
    deviceCount,
    packetBits,
    propagationSpeed,
    linkDelays,
    perHopSeconds: {
      transmission: averageTransmission,
      propagation: averagePropagation,
      processing: perDeviceSeconds.processing,
      queueing: perDeviceSeconds.queueing,
    },
    totalSeconds,
    totalDelay,
    perDeviceDelay,
    perLinkDelay,
    packetLossProbability,
    pathLossProbability,
    deliveryProbability: 1 - pathLossProbability,
    maxJitterSeconds,
    averageJitterSeconds,
  };
}

function render(model) {
  renderSummary(model);
  renderBreakdown(model);
  renderHopBars(model);
  renderTable(model);
  renderSimulation(model);
}

function renderSummary(model) {
  const summaryItems = [
    {
      label: "Total End-to-End Delay",
      value: formatDuration(model.totalDelay),
      detail: describePath(model),
    },
    {
      label: "Per-Link Travel",
      value: formatDuration(model.perLinkDelay),
      detail: model.inputs.useAdvancedLinks
        ? `Average across ${model.linkCount} custom links`
        : model.linkCount === 1
          ? "Single direct link"
          : `Repeated across ${model.linkCount} links`,
    },
    {
      label: "Transmission Per Link",
      value: formatDuration(model.perHopSeconds.transmission),
      detail: model.inputs.useAdvancedLinks
        ? "Average transmission across custom links"
        : `${formatBits(model.packetBits)} sent at ${formatBandwidth(model.inputs.bandwidthMbps * 1_000_000)}`,
    },
    {
      label: "Processing + Queueing Per Device",
      value: formatDuration(model.perDeviceDelay),
      detail: model.deviceCount === 0
        ? "No intermediate devices on this path"
        : `Repeated at ${model.deviceCount} intermediate devices`,
    },
    {
      label: "Propagation Per Link",
      value: formatDuration(model.perHopSeconds.propagation),
      detail: model.inputs.useAdvancedLinks
        ? "Average propagation across custom links"
        : `${model.inputs.distanceKm} km at ${model.inputs.propagationFactor}c`,
    },
    {
      label: "Path Delivery Probability",
      value: formatPercent(model.deliveryProbability),
      detail: `${formatPercent(model.pathLossProbability)} loss across ${model.linkCount} links`,
    },
    {
      label: "Possible Extra Jitter",
      value: formatDuration(model.maxJitterSeconds),
      detail: model.inputs.jitterMs > 0
        ? `Up to ${model.inputs.jitterMs.toFixed(2)} ms added per link`
        : "No jitter configured",
    },
    {
      label: "Packets Per Run",
      value: `${model.inputs.packetCount}`,
      detail: model.inputs.packetCount === 1 ? "Single packet simulation" : "Packet train simulation",
    },
  ];

  summaryGrid.innerHTML = summaryItems
    .map(
      (item) => `
        <article class="summary-card">
          <p>${item.label}</p>
          <strong class="summary-value">${item.value}</strong>
          <p>${item.detail}</p>
        </article>
      `,
    )
    .join("");
}

function renderBreakdown(model) {
  const entries = Object.entries(model.totalSeconds);

  totalDelayLabel.textContent = `${formatDuration(model.totalDelay)} total`;

  stackedBar.innerHTML = entries
    .map(([key, value]) => {
      const width = model.totalDelay === 0 ? 0 : (value / model.totalDelay) * 100;
      return `<div class="stacked-bar-segment" style="width:${width}%; background:${componentColors[key]};"></div>`;
    })
    .join("");

  legend.innerHTML = entries
    .map(([key, value]) => {
      const percentage = model.totalDelay === 0 ? 0 : (value / model.totalDelay) * 100;
      return `
        <div class="legend-item">
          <span class="swatch" style="background:${componentColors[key]};"></span>
          <div class="legend-text">
            <strong>${componentLabels[key]}</strong>
            <span>${formatDuration(value)} · ${percentage.toFixed(1)}%</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderHopBars(model) {
  perHopLabel.textContent = describePath(model);

  const deviceSegments = [
    ["processing", model.perHopSeconds.processing],
    ["queueing", model.perHopSeconds.queueing],
  ]
    .map(([key, value]) => {
      const width = model.perDeviceDelay === 0 ? 0 : (value / model.perDeviceDelay) * 100;
      return `<div class="stacked-bar-segment" style="width:${width}%; background:${componentColors[key]};"></div>`;
    })
    .join("");

  const linkSegments = [
    ["transmission", model.perHopSeconds.transmission],
    ["propagation", model.perHopSeconds.propagation],
  ]
    .map(([key, value]) => {
      const width = model.perLinkDelay === 0 ? 0 : (value / model.perLinkDelay) * 100;
      return `<div class="stacked-bar-segment" style="width:${width}%; background:${componentColors[key]};"></div>`;
    })
    .join("");

  const linkRows = Array.from({ length: model.linkCount }, (_, index) => {
    const link = model.linkDelays[index];
    const linkTotal = link.transmission + link.propagation;
    const rowSegments = [
      ["transmission", link.transmission],
      ["propagation", link.propagation],
    ]
      .map(([key, value]) => {
        const width = linkTotal === 0 ? 0 : (value / linkTotal) * 100;
        return `<div class="stacked-bar-segment" style="width:${width}%; background:${componentColors[key]};"></div>`;
      })
      .join("");

    return `
      <div class="hop-row">
        <span class="hop-label">Link ${index + 1}</span>
        <div class="hop-track">${rowSegments}</div>
        <span class="hop-total">${formatDuration(linkTotal)}</span>
      </div>
    `;
  }).join("");

  const deviceRows = Array.from({ length: model.deviceCount }, (_, index) => {
    return `
      <div class="hop-row">
        <span class="hop-label">Device ${index + 1}</span>
        <div class="hop-track">${deviceSegments}</div>
        <span class="hop-total">${formatDuration(model.perDeviceDelay)}</span>
      </div>
    `;
  }).join("");

  hopBars.innerHTML = linkRows + deviceRows;
}

function renderTable(model) {
  const rows = [
    {
      name: "Transmission",
      perHop: model.perHopSeconds.transmission,
      total: model.totalSeconds.transmission,
      formula: model.inputs.useAdvancedLinks ? "Σ(L / R_link i)" : "(hops + 1) × (L / R)",
    },
    {
      name: "Propagation",
      perHop: model.perHopSeconds.propagation,
      total: model.totalSeconds.propagation,
      formula: model.inputs.useAdvancedLinks ? "Σ(d_link i / s)" : "(hops + 1) × (d / s)",
    },
    {
      name: "Processing",
      perHop: model.perHopSeconds.processing,
      total: model.totalSeconds.processing,
      formula: "hops × input",
    },
    {
      name: "Queueing",
      perHop: model.perHopSeconds.queueing,
      total: model.totalSeconds.queueing,
      formula: "hops × input",
    },
    {
      name: "Total",
      perHop: model.perLinkDelay + model.perDeviceDelay,
      total: model.totalDelay,
      formula: "(hops + 1) × link + hops × device",
    },
    {
      name: "Packet Loss",
      perHop: model.packetLossProbability,
      total: model.pathLossProbability,
      formula: "1 - (1 - p)^links",
    },
    {
      name: "Jitter",
      perHop: model.inputs.jitterMs / 1000,
      total: model.maxJitterSeconds,
      formula: "up to links × jitter",
    },
  ];

  detailTable.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.name}</td>
          <td>${formatTableValue(row.name, row.perHop)}</td>
          <td>${formatTableValue(row.name, row.total)}</td>
          <td class="formula-cell">${row.formula}</td>
        </tr>
      `,
    )
    .join("");
}

function renderSimulation(model) {
  if (!simulationState.paneOpen) {
    simulationState.model = model;
    return;
  }

  resetSimulationView("Ready to simulate", false);
  simulationState.model = model;

  const nodeCount = model.inputs.hops + 2;
  const viewportWidth = simulationPath.parentElement?.clientWidth || simulationPath.clientWidth || simulationPath.offsetWidth || 800;
  const edgePadding = SIMULATION_NODE_SIZE / 2 + SIMULATION_NODE_MARGIN;
  const maxColumns = Math.max(2, Math.floor((viewportWidth - edgePadding * 2) / SIMULATION_NODE_GAP) + 1);
  const columnCount = Math.min(nodeCount, maxColumns);
  const rowCount = Math.ceil(nodeCount / columnCount);
  const minimumPathWidth = edgePadding * 2 + (columnCount - 1) * SIMULATION_NODE_GAP;
  const stageWidth = Math.max(viewportWidth, minimumPathWidth);
  const stageHeight = 84 + (rowCount - 1) * SIMULATION_ROW_GAP + 84;
  const usableWidth = Math.max(160, stageWidth - edgePadding * 2);
  const centerY = 84;

  simulationPath.style.width = `${stageWidth}px`;
  simulationPath.style.height = `${stageHeight}px`;
  packetLayer.style.width = `${stageWidth}px`;
  packetLayer.style.height = `${stageHeight}px`;

  const positions = Array.from({ length: nodeCount }, (_, index) => {
    if (columnCount === 1) {
      return {
        x: stageWidth / 2,
        y: centerY,
      };
    }

    const row = Math.floor(index / columnCount);
    const column = index % columnCount;
    const visualColumn = row % 2 === 0 ? column : columnCount - 1 - column;

    return {
      x: edgePadding + (usableWidth * visualColumn) / (columnCount - 1),
      y: centerY + row * SIMULATION_ROW_GAP,
    };
  });

  simulationPath.innerHTML = buildSimulationLinks(positions, centerY) + buildSimulationNodes(positions, centerY);
  renderSimulationTimeline(model);
}

function buildSimulationLinks(positions) {
  return positions
    .slice(0, -1)
    .map((source, index) => {
      const target = positions[index + 1];
      const width = Math.hypot(target.x - source.x, target.y - source.y);
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      return `
        <div
          class="path-link"
          style="left:${source.x}px; top:${source.y}px; width:${width}px; transform: translateY(-50%) rotate(${angle}rad);"
        ></div>
      `;
    })
    .join("");
}

function buildSimulationNodes(positions) {
  return positions
    .map((position, index) => {
      const label = index === 0 ? "Source" : index === positions.length - 1 ? "Destination" : `Device ${index}`;
      const sublabel = index === 0 || index === positions.length - 1 ? "host" : "router";
      return `
        <div class="path-node" data-node-index="${index}" style="left:${position.x}px; top:${position.y}px;">
          <div class="path-node-copy">
            <strong>${label}</strong>
            <span>${sublabel}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderSimulationTimeline(model) {
  const baseSegments = [
    {
      key: "linkTravel",
      label: model.linkCount === 1 ? "Direct Link Travel" : "Link Travel",
      duration: model.perHopSeconds.transmission + model.perHopSeconds.propagation,
      color: "linear-gradient(90deg, #0f766e, #c2410c)",
    },
  ];

  if (model.deviceCount > 0) {
    baseSegments.push(
      {
        key: "queueing",
        label: "Queueing",
        duration: model.perHopSeconds.queueing,
        color: componentColors.queueing,
      },
      {
        key: "processing",
        label: "Processing",
        duration: model.perHopSeconds.processing,
        color: componentColors.processing,
      },
    );
  }

  const longest = Math.max(...baseSegments.map((segment) => segment.duration), 0);

  simulationTimeline.innerHTML = baseSegments
    .map((segment) => {
      const width = longest === 0 ? 0 : (segment.duration / longest) * 100;
      return `
        <div class="timeline-step" data-phase-key="${segment.key}">
          <span class="timeline-label">${segment.label}</span>
          <div class="timeline-track">
            <div class="timeline-fill" style="width:${width}%; background:${segment.color};"></div>
          </div>
          <span class="timeline-duration">${formatDuration(segment.duration)}</span>
        </div>
      `;
    })
    .join("");
}

async function startSimulation() {
  if (!simulationState.model) {
    return;
  }

  const runId = ++simulationState.runId;
  simulationState.active = true;
  sendButton.disabled = true;

  const model = simulationState.model;
  const positions = Array.from(simulationPath.querySelectorAll(".path-node")).map((node) => ({
    x: Number.parseFloat(node.style.left),
    y: Number.parseFloat(node.style.top),
  }));

  if (positions.length < 2) {
    stopSimulation();
    return;
  }

  createPacketElements(model.inputs.packetCount);
  setActiveNode(0);
  const results = {
    delivered: 0,
    lost: 0,
  };
  const launchGapMs = calculateLaunchGapMs(model.inputs.packetCount);
  const tasks = Array.from({ length: model.inputs.packetCount }, (_, packetIndex) =>
    runPacketJourney(runId, packetIndex, positions, model, results, launchGapMs * packetIndex),
  );

  await Promise.all(tasks);

  if (!isRunCurrent(runId)) {
    return;
  }

  setSimulationStatus(buildSimulationSummary(model.inputs.packetCount, results));
  sendButton.disabled = false;
  simulationState.active = false;

  if (simulationState.loopEnabled) {
    await delay(500);
    if (simulationState.loopEnabled && !simulationState.active && isRunCurrent(runId)) {
      startSimulation();
    }
  }
}

async function runPacketJourney(runId, packetIndex, positions, model, results, launchDelayMs) {
  const packet = getPacketElement(packetIndex);

  if (!packet) {
    return;
  }

  if (launchDelayMs > 0) {
    await delay(launchDelayMs);
  }

  if (!isRunCurrent(runId)) {
    return;
  }

  showPacket(packet);
  clearPacketLoss(packet);
  movePacketElementTo(packet, positions[0]);

  for (let linkIndex = 0; linkIndex < model.linkCount; linkIndex += 1) {
    const source = positions[linkIndex];
    const target = positions[linkIndex + 1];
    const jitterSeconds = randomJitterSeconds(model.inputs.jitterMs);
    const linkTravelSeconds = model.linkDelays[linkIndex].transmission + model.linkDelays[linkIndex].propagation + jitterSeconds;
    const packetLost = Math.random() < model.packetLossProbability;
    const lossTarget = {
      x: source.x + (target.x - source.x) * 0.55,
      y: source.y + (target.y - source.y) * 0.55 + packetYOffset(packetIndex),
    };
    const start = {
      x: source.x,
      y: source.y + packetYOffset(packetIndex),
    };
    const end = packetLost
      ? lossTarget
      : {
          x: target.x,
          y: target.y + packetYOffset(packetIndex),
        };

    if (!(await runSimulationPhase(
      runId,
      "linkTravel",
      buildLinkStatusLabel(linkIndex, jitterSeconds, packetLost),
      start,
      end,
      linkTravelSeconds,
      packet,
    ))) {
      return;
    }

    if (packetLost) {
      await animatePacketDrop(runId, packet, end);
      results.lost += 1;
      return;
    }

    setActiveNode(linkIndex + 1);

    if (linkIndex === model.linkCount - 1) {
      results.delivered += 1;
      await settleDeliveredPacket(runId, packet);
      return;
    }

    if (!(await runSimulationPhase(
      runId,
      "queueing",
      `Device ${linkIndex + 1}: queueing`,
      end,
      end,
      model.perHopSeconds.queueing,
      packet,
    ))) {
      return;
    }
    if (!(await runSimulationPhase(
      runId,
      "processing",
      `Device ${linkIndex + 1}: processing`,
      end,
      end,
      model.perHopSeconds.processing,
      packet,
    ))) {
      return;
    }
  }
}

async function runSimulationPhase(runId, phaseKey, label, start, end, durationSeconds, packetElement) {
  if (!isRunCurrent(runId)) {
    return false;
  }

  void label;
  setActivePhase(phaseKey);

  const animationMs = mapDurationToAnimationMs(phaseKey, durationSeconds);

  if (phaseKey === "linkTravel") {
    await animatePacket(runId, start, end, animationMs, packetElement);
  } else {
    movePacketElementTo(packetElement, start);
    await waitForRun(runId, animationMs);
  }

  return isRunCurrent(runId);
}

function mapDurationToAnimationMs(phaseKey, durationSeconds) {
  if (durationSeconds <= 0) {
    return phaseKey === "linkTravel" ? 180 : 100;
  }

  const networkMs = durationSeconds * 1000;

  if (phaseKey === "linkTravel") {
    return clampVisualDuration(220 + Math.sqrt(networkMs) * 240, 220, 3200);
  }

  if (phaseKey === "queueing") {
    return clampVisualDuration(120 + Math.sqrt(networkMs) * 170, 120, 1800);
  }

  return clampVisualDuration(120 + Math.sqrt(networkMs) * 150, 120, 1500);
}

function clampVisualDuration(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function animatePacket(runId, start, end, durationMs, packetElement) {
  return new Promise((resolve) => {
    const startedAt = performance.now();

    function step(now) {
      if (!isRunCurrent(runId)) {
        resolve();
        return;
      }

      const progress = durationMs === 0 ? 1 : Math.min(1, (now - startedAt) / durationMs);
      const eased = easeInOutCubic(progress);
      movePacketElementTo(packetElement, {
        x: start.x + (end.x - start.x) * eased,
        y: start.y + (end.y - start.y) * eased,
      });

      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }

      resolve();
    }

    requestAnimationFrame(step);
  });
}

function waitForRun(runId, durationMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, isRunCurrent(runId) ? durationMs : 0);
  });
}

function hidePacket() {
  packetLayer.innerHTML = "";
  clearActiveSimulationStates();
}

function createPacketElements(count) {
  const profile = getPacketVisualProfile(count);
  packetLayer.innerHTML = Array.from({ length: count }, (_, index) => {
    return `
      <div
        class="packet"
        data-packet-index="${index}"
        style="--packet-size:${profile.sizePx}px; --packet-glow:${profile.glowPx}px;"
      ></div>
    `;
  }).join("");
}

function getPacketElement(index) {
  return packetLayer.querySelector(`[data-packet-index="${index}"]`);
}

function movePacketElementTo(packetElement, position) {
  if (!packetElement) {
    return;
  }

  packetElement.style.left = `${position.x}px`;
  packetElement.style.top = `${position.y}px`;
}

function showPacket(packetElement) {
  packetElement.classList.add("is-visible");
  packetElement.classList.remove("is-fading", "is-arrived");
}

function clearPacketLoss(packetElement) {
  packetElement.classList.remove("is-lost");
}

function markPacketElementLost(packetElement) {
  packetElement.classList.add("is-lost");
}

async function animatePacketDrop(runId, packetElement, startPosition) {
  markPacketElementLost(packetElement);

  await new Promise((resolve) => {
    const startedAt = performance.now();
    const durationMs = 560;

    function step(now) {
      if (!isRunCurrent(runId)) {
        resolve();
        return;
      }

      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = easeInCubic(progress);
      movePacketElementTo(packetElement, {
        x: startPosition.x,
        y: startPosition.y + eased * 90,
      });
      packetElement.style.opacity = `${1 - progress * 0.9}`;

      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }

      resolve();
    }

    requestAnimationFrame(step);
  });

  hidePacketElement(packetElement);
}

async function settleDeliveredPacket(runId, packetElement) {
  if (!isRunCurrent(runId)) {
    return;
  }

  packetElement.classList.add("is-arrived");
  await delay(420);
  hidePacketElement(packetElement);
}

function hidePacketElement(packetElement) {
  if (!packetElement) {
    return;
  }

  packetElement.classList.remove("is-visible", "is-lost", "is-fading", "is-arrived");
  packetElement.style.opacity = "";
}

function packetYOffset(packetIndex) {
  if (packetIndex === 0) {
    return 0;
  }

  const packetCount = simulationState.model?.inputs.packetCount || 1;
  const profile = getPacketVisualProfile(packetCount);
  const laneIndex = Math.floor((packetIndex + 1) / 2);
  const direction = packetIndex % 2 === 0 ? 1 : -1;
  const bandCycle = laneIndex % profile.bandCount;
  const bandShift = Math.floor(laneIndex / profile.bandCount) * profile.stackOffsetPx;
  return direction * (bandCycle * profile.spacingPx + bandShift);
}

function calculateLaunchGapMs(packetCount) {
  if (packetCount <= 1) {
    return 0;
  }

  return clampVisualDuration(1800 / packetCount, 18, 240);
}

function getPacketVisualProfile(packetCount) {
  if (packetCount >= 80) {
    return {
      sizePx: 8,
      glowPx: 2,
      spacingPx: 6,
      bandCount: 8,
      stackOffsetPx: 3,
    };
  }

  if (packetCount >= 40) {
    return {
      sizePx: 10,
      glowPx: 3,
      spacingPx: 7,
      bandCount: 7,
      stackOffsetPx: 4,
    };
  }

  if (packetCount >= 16) {
    return {
      sizePx: 13,
      glowPx: 4,
      spacingPx: 9,
      bandCount: 6,
      stackOffsetPx: 5,
    };
  }

  if (packetCount >= 6) {
    return {
      sizePx: 17,
      glowPx: 5,
      spacingPx: 11,
      bandCount: 5,
      stackOffsetPx: 6,
    };
  }

  return {
    sizePx: 22,
    glowPx: 6,
    spacingPx: 12,
    bandCount: 4,
    stackOffsetPx: 7,
  };
}

function clearActiveSimulationStates() {
  simulationPath.querySelectorAll(".path-node").forEach((node) => {
    node.classList.remove("is-active");
  });

  simulationTimeline.querySelectorAll(".timeline-step").forEach((step) => {
    step.classList.remove("is-active");
  });
}

function setActiveNode(index) {
  simulationPath.querySelectorAll(".path-node").forEach((node) => {
    node.classList.toggle("is-active", Number(node.dataset.nodeIndex) === index);
  });
}

function setActivePhase(key) {
  simulationTimeline.querySelectorAll(".timeline-step").forEach((step) => {
    step.classList.toggle("is-active", step.dataset.phaseKey === key);
  });
}

function setSimulationStatus(message) {
  if (simulationStatus) {
    simulationStatus.textContent = message;
  }
}

function setSimulationPane(open) {
  simulationState.paneOpen = open;
  simulationCard.classList.toggle("is-collapsed", !open);
  toggleSimulationPane.setAttribute("aria-expanded", String(open));
  toggleSimulationPane.textContent = open ? "Hide Pane" : "Open Pane";

  if (!open) {
    stopSimulation();
    return;
  }

  if (simulationState.model) {
    renderSimulation(simulationState.model);
  }
}

function stopSimulation() {
  resetSimulationView("Simulation stopped", true);
}

function resetSimulationView(message, disableLoop) {
  simulationState.runId += 1;
  simulationState.active = false;

  if (disableLoop) {
    simulationState.loopEnabled = false;
  }

  sendButton.disabled = false;
  toggleLoopButton.textContent = simulationState.loopEnabled ? "Stop Auto Play" : "Start Auto Play";
  setSimulationStatus(message);
  hidePacket();
}

function isRunCurrent(runId) {
  return simulationState.runId === runId;
}

function delay(durationMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function easeInOutCubic(progress) {
  if (progress < 0.5) {
    return 4 * progress * progress * progress;
  }

  return 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function easeInCubic(progress) {
  return progress * progress * progress;
}

function formatDuration(seconds) {
  if (seconds >= 1) {
    return `${seconds.toFixed(3)} s`;
  }

  const milliseconds = seconds * 1000;
  if (milliseconds >= 1) {
    return `${milliseconds.toFixed(3)} ms`;
  }

  const microseconds = milliseconds * 1000;
  if (microseconds >= 1) {
    return `${microseconds.toFixed(3)} µs`;
  }

  return `${(microseconds * 1000).toFixed(3)} ns`;
}

function formatBits(bits) {
  if (bits >= 1_000_000) {
    return `${(bits / 1_000_000).toFixed(2)} Mb`;
  }

  if (bits >= 1000) {
    return `${(bits / 1000).toFixed(2)} Kb`;
  }

  return `${bits} b`;
}

function formatBandwidth(bps) {
  if (bps >= 1_000_000_000) {
    return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  }

  if (bps >= 1_000_000) {
    return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  }

  return `${bps.toFixed(0)} bps`;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatTableValue(rowName, value) {
  if (rowName === "Packet Loss") {
    return formatPercent(value);
  }

  return formatDuration(value);
}

function randomJitterSeconds(jitterMs) {
  return jitterMs > 0 ? (Math.random() * jitterMs) / 1000 : 0;
}

function buildLinkStatusLabel(linkIndex, jitterSeconds, packetLost) {
  const jitterLabel = jitterSeconds > 0 ? ` + ${formatDuration(jitterSeconds)} jitter` : "";
  const lossLabel = packetLost ? " · loss triggered" : "";
  return `Link ${linkIndex + 1}: transmitting + propagating${jitterLabel}${lossLabel}`;
}

function buildSimulationSummary(packetCount, results) {
  if (packetCount === 1) {
    return results.delivered === 1 ? "1 packet delivered" : "1 packet lost";
  }

  return `${results.delivered} delivered · ${results.lost} lost`;
}

function describePath(model) {
  if (model.deviceCount === 0) {
    return "Direct path: source to destination over 1 link";
  }

  return `${model.deviceCount} intermediate devices and ${model.linkCount} links`;
}

function readAdvancedLinkOverrides(linkCount, defaultsForLinks, useAdvanced) {
  const rows = Array.from({ length: linkCount }, (_, index) => {
    const saved = advancedLinkOverrides[index] || defaultsForLinks;
    const bandwidthField = form.elements.namedItem(`linkBandwidthMbps-${index}`);
    const distanceField = form.elements.namedItem(`linkDistanceKm-${index}`);

    if (!useAdvanced || !bandwidthField || !distanceField) {
      return {
        bandwidthMbps: saved.bandwidthMbps,
        distanceKm: saved.distanceKm,
      };
    }

    const bandwidthMbps = clampNumber(
      bandwidthField.value,
      inputLimits.bandwidthMbps.min,
      inputLimits.bandwidthMbps.max,
      defaultsForLinks.bandwidthMbps,
    );
    const distanceKm = clampNumber(
      distanceField.value,
      inputLimits.distanceKm.min,
      inputLimits.distanceKm.max,
      defaultsForLinks.distanceKm,
    );

    bandwidthField.value = bandwidthMbps;
    distanceField.value = distanceKm;

    return { bandwidthMbps, distanceKm };
  });

  advancedLinkOverrides = rows;
  return rows;
}

function syncAdvancedLinkRows(inputs = readInputs()) {
  const linkCount = inputs.hops + 1;
  const defaultsForLinks = {
    bandwidthMbps: inputs.bandwidthMbps,
    distanceKm: inputs.distanceKm,
  };
  const nextSignature = `${linkCount}:${advancedModeEnabled}:${defaultsForLinks.bandwidthMbps}:${defaultsForLinks.distanceKm}`;

  advancedLinkOverrides = Array.from({ length: linkCount }, (_, index) => {
    return advancedLinkOverrides[index] || defaultsForLinks;
  });

  form.classList.toggle("is-basic", !advancedModeEnabled);
  form.classList.toggle("is-advanced", advancedModeEnabled);
  if (linkOverridesPanel) {
    linkOverridesPanel.setAttribute("aria-hidden", String(!advancedModeEnabled));
  }

  if (advancedPanelSignature === nextSignature) {
    return;
  }

  advancedPanelSignature = nextSignature;
  advancedLinkGrid.innerHTML = Array.from({ length: linkCount }, (_, index) => {
    const link = advancedLinkOverrides[index];
    const routeLabel =
      linkCount === 1
        ? "Source to destination"
        : index === 0
          ? "Source to device 1"
          : index === linkCount - 1
            ? "Last device to destination"
            : `Device ${index} to device ${index + 1}`;

    return `
      <article class="advanced-link-card">
        <div class="advanced-link-header">
          <strong>Link ${index + 1}</strong>
          <span class="advanced-link-meta">${routeLabel}</span>
        </div>
        <div class="advanced-link-inputs">
          <label class="control">
            <span>Bandwidth</span>
            <div class="control-input">
              <input
                name="linkBandwidthMbps-${index}"
                type="number"
                min="${inputLimits.bandwidthMbps.min}"
                max="${inputLimits.bandwidthMbps.max}"
                step="0.001"
                value="${link.bandwidthMbps}"
              />
              <span class="unit">Mbps</span>
            </div>
          </label>
          <label class="control">
            <span>Distance</span>
            <div class="control-input">
              <input
                name="linkDistanceKm-${index}"
                type="number"
                min="${inputLimits.distanceKm.min}"
                max="${inputLimits.distanceKm.max}"
                step="0.1"
                value="${link.distanceKm}"
              />
              <span class="unit">km</span>
            </div>
          </label>
        </div>
      </article>
    `;
  }).join("");
}

function update() {
  syncAdvancedLinkRows();
  const model = calculateDelay(readInputs());
  render(model);
}

function setAdvancedMode(enabled) {
  advancedModeEnabled = enabled;
  toggleAdvancedView.textContent = enabled ? "Back To Basic View" : "Open Advanced View";
  advancedPanelSignature = "";
  syncAdvancedLinkRows();
}

function resetDefaults() {
  Object.entries(defaults).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) {
      field.value = value;
    }
  });

  advancedModeEnabled = false;
  advancedLinkOverrides = [];
  advancedPanelSignature = "";
  toggleAdvancedView.textContent = "Open Advanced View";
  update();
}

form.addEventListener("input", update);
resetButton.addEventListener("click", resetDefaults);
sendButton.addEventListener("click", () => {
  if (!simulationState.active) {
    startSimulation();
  }
});
toggleLoopButton.addEventListener("click", () => {
  simulationState.loopEnabled = !simulationState.loopEnabled;
  toggleLoopButton.textContent = simulationState.loopEnabled ? "Stop Auto Play" : "Start Auto Play";

  if (simulationState.loopEnabled && !simulationState.active) {
    startSimulation();
  }
});
stopButton.addEventListener("click", stopSimulation);
toggleSimulationPane.addEventListener("click", () => {
  setSimulationPane(!simulationState.paneOpen);
});
toggleAdvancedView.addEventListener("click", () => {
  setAdvancedMode(!advancedModeEnabled);
  update();
});
window.addEventListener("resize", () => {
  if (simulationState.model && simulationState.paneOpen) {
    renderSimulation(simulationState.model);
  }
});

resetDefaults();
