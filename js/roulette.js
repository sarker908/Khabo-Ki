/* ==========================================================
   Khabo Ki? - Food Roulette page (Stage 4)

   This file reuses:
   - js/food-data.js: loadFoods(), filterFoodsByCategory(),
                      filterFoodsByMaxBudget(), formatPriceRange()
   - js/app.js:       createFoodCard() (card with the image fallback)

   HOW THE WHEEL WORKS (short version)
   1. The foods that match the filters become equal SVG slices.
   2. JavaScript picks a random slice number FIRST.
   3. It works out how far to turn the wheel so that slice ends up
      under the fixed pointer at the top, then CSS animates the turn.
   ========================================================== */

// ----- Page elements -----
const rouletteFilters = document.getElementById("roulette-filters");
const categorySelect = document.getElementById("category-select");
const budgetSelect = document.getElementById("budget-select");
const wheel = document.getElementById("wheel");
const wheelCount = document.getElementById("wheel-count");
const rouletteStatus = document.getElementById("roulette-status");
const spinButton = document.getElementById("spin-button");
const resultSection = document.getElementById("result-section");
const resultCardHolder = document.getElementById("result-card-holder");
const spinAgainButton = document.getElementById("spin-again-button");
const announcer = document.getElementById("roulette-announcer");
const confettiLayer = document.getElementById("confetti-layer");

// ----- Settings you can change -----
const SPIN_DURATION_MS = 5000;  // how long the spin lasts
const MIN_EXTRA_TURNS = 5;      // the wheel always turns at least this many full times
const EXTRA_TURN_VARIETY = 3;   // ...plus 0 to 2 more, so spins feel different
const CONFETTI_PIECES = 40;

// Slice colours. "text" is the label colour that is easy to read on that slice.
const WHEEL_COLOURS = [
  { background: "#FF6B35", text: "#252525" }, // orange
  { background: "#2E8B57", text: "#ffffff" }, // green
  { background: "#FFB627", text: "#252525" }, // yellow
  { background: "#E63946", text: "#ffffff" }, // red
  { background: "#1B998B", text: "#ffffff" }, // teal
  { background: "#7B5EA7", text: "#ffffff" }  // purple
];

// SVG drawing sizes. The wheel is drawn on a 400 x 400 canvas.
const WHEEL_CENTRE = 200;
const WHEEL_RADIUS = 196;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// Does the visitor prefer less motion? (a browser/system setting)
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

// ----- Page state -----
let eligibleFoods = [];   // foods currently on the wheel
let currentRotation = 0;  // total degrees the wheel has turned so far
let isSpinning = false;   // true while the wheel is turning
let pendingWinner = null; // the food JavaScript picked for the current spin
let finishTimer = null;   // safety timer (see spinWheel)
let confettiTimer = null;

// ==========================================================
// 1. Choosing which foods are on the wheel
// ==========================================================

// Category first, then budget (the same rule as Explore Foods:
// a food is included if its MINIMUM price is within the budget).
function getEligibleFoods() {
  let foods = filterFoodsByCategory(categorySelect.value);

  if (budgetSelect.value !== "any") {
    foods = filterFoodsByMaxBudget(budgetSelect.value, foods);
  }

  return foods;
}

// ==========================================================
// 2. Drawing the wheel (SVG)
// ==========================================================

// Small helper: makes an SVG element and sets its attributes
function createSvgElement(tagName, attributes) {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);
  for (const name in attributes) {
    element.setAttribute(name, attributes[name]);
  }
  return element;
}

// Angles are measured in degrees, clockwise, starting at the TOP (12 o'clock).
// This turns an angle and a distance from the centre into x and y positions.
function getPointOnWheel(angleDegrees, distance) {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: WHEEL_CENTRE + distance * Math.sin(radians),
    y: WHEEL_CENTRE - distance * Math.cos(radians)
  };
}

// Picks a colour for slice number "index". If the last slice would have the
// same colour as the first one (they touch), a different colour is used.
function getSliceColour(index, sliceCount) {
  let colourIndex = index % WHEEL_COLOURS.length;
  const touchesFirstSlice = index === sliceCount - 1 && colourIndex === 0 && sliceCount > 1;
  if (touchesFirstSlice) colourIndex = 3;
  return WHEEL_COLOURS[colourIndex];
}

// More slices means smaller slices, so the label text gets smaller
function getLabelFontSize(sliceCount) {
  if (sliceCount <= 6) return 18;
  if (sliceCount <= 12) return 14;
  if (sliceCount <= 18) return 12;
  return 10.5;
}

// Long names are shortened with "..." so they fit inside the slice
function shortenName(name, fontSize) {
  const maxCharacters = Math.floor(135 / (fontSize * 0.58));
  if (name.length <= maxCharacters) return name;
  return name.slice(0, maxCharacters - 1) + "…";
}

// Builds one coloured slice with its label
function createSlice(food, index, sliceCount) {
  const sliceAngle = 360 / sliceCount;
  const colour = getSliceColour(index, sliceCount);
  const group = createSvgElement("g", {});

  // The slice shape. A single food fills the whole circle.
  let shape;
  if (sliceCount === 1) {
    shape = createSvgElement("circle", { cx: WHEEL_CENTRE, cy: WHEEL_CENTRE, r: WHEEL_RADIUS });
  } else {
    const start = getPointOnWheel(index * sliceAngle, WHEEL_RADIUS);
    const end = getPointOnWheel((index + 1) * sliceAngle, WHEEL_RADIUS);
    // M = move to centre, L = line to the start of the arc,
    // A = draw the curved edge, Z = close the shape
    const path =
      "M " + WHEEL_CENTRE + " " + WHEEL_CENTRE +
      " L " + start.x + " " + start.y +
      " A " + WHEEL_RADIUS + " " + WHEEL_RADIUS + " 0 0 1 " + end.x + " " + end.y + " Z";
    shape = createSvgElement("path", { d: path });
  }
  shape.setAttribute("fill", colour.background);
  shape.setAttribute("stroke", "#ffffff");
  shape.setAttribute("stroke-width", "2");

  // Tooltip with the full name
  const tooltip = createSvgElement("title", {});
  tooltip.textContent = food.name;
  shape.appendChild(tooltip);

  // The label sits along the middle of the slice, reading outwards.
  // We turn it around the centre by the slice's middle angle (minus 90,
  // because SVG rotation starts at 3 o'clock instead of 12 o'clock).
  const middleAngle = (index + 0.5) * sliceAngle;
  const fontSize = getLabelFontSize(sliceCount);
  const label = createSvgElement("text", {
    x: WHEEL_CENTRE + WHEEL_RADIUS - 16,
    y: WHEEL_CENTRE,
    "text-anchor": "end",
    "dominant-baseline": "central",
    "font-size": fontSize,
    "font-weight": "700",
    "font-family": "Poppins, Arial, sans-serif",
    fill: colour.text,
    transform: "rotate(" + (middleAngle - 90) + " " + WHEEL_CENTRE + " " + WHEEL_CENTRE + ")"
  });
  label.textContent = shortenName(food.name, fontSize);

  group.append(shape, label);
  return group;
}

// Draws the wheel for a list of foods
function drawWheel(foods) {
  const svg = createSvgElement("svg", {
    viewBox: "0 0 400 400",
    role: "img",
    "aria-label": "Roulette wheel with " + foods.length + " foods: " +
      foods.map(function (food) { return food.name; }).join(", ")
  });

  foods.forEach(function (food, index) {
    svg.appendChild(createSlice(food, index, foods.length));
  });

  wheel.replaceChildren(svg);
}

// A grey wheel shown while loading, or when no food matches
function drawEmptyWheel(message) {
  const svg = createSvgElement("svg", {
    viewBox: "0 0 400 400",
    role: "img",
    "aria-label": message
  });
  svg.appendChild(createSvgElement("circle", {
    cx: WHEEL_CENTRE, cy: WHEEL_CENTRE, r: WHEEL_RADIUS, fill: "#EFE6DC"
  }));

  const text = createSvgElement("text", {
    x: WHEEL_CENTRE,
    y: WHEEL_CENTRE + 70,
    "text-anchor": "middle",
    "font-size": 18,
    "font-weight": "600",
    "font-family": "Poppins, Arial, sans-serif",
    fill: "#6b6259"
  });
  text.textContent = message;
  svg.appendChild(text);

  wheel.replaceChildren(svg);
}

// Puts the wheel back to its starting position WITHOUT animating
function resetWheelRotation() {
  currentRotation = 0;
  wheel.classList.add("no-transition");
  wheel.style.setProperty("--wheel-rotation", "0deg");
  wheel.offsetWidth; // forces the browser to apply the change right now
  wheel.classList.remove("no-transition");
}

// ==========================================================
// 3. Updating the page when the filters change
// ==========================================================

function refreshWheel() {
  eligibleFoods = getEligibleFoods();
  resetWheelRotation();
  hideResult();

  if (eligibleFoods.length === 0) {
    drawEmptyWheel("No foods match");
    wheelCount.textContent = "0 foods on the wheel";
    // Reuses the message box style from the other pages
    rouletteStatus.textContent =
      "No foods match this category and budget. Try a higher budget or a different category.";
    rouletteStatus.classList.add("is-error");
    rouletteStatus.hidden = false;
    spinButton.disabled = true;
    return;
  }

  drawWheel(eligibleFoods);
  const foodWord = eligibleFoods.length === 1 ? "food" : "foods";
  wheelCount.textContent = eligibleFoods.length + " " + foodWord + " on the wheel";
  rouletteStatus.hidden = true;
  spinButton.disabled = false;
}

// Turns the controls on or off (used while the wheel is spinning)
function setSpinningState(spinning) {
  isSpinning = spinning;
  rouletteFilters.disabled = spinning;
  spinButton.disabled = spinning;
  spinAgainButton.disabled = spinning;
  spinButton.textContent = spinning ? "Spinning..." : "Spin the Wheel";
}

// ==========================================================
// 4. Spinning
// ==========================================================

function spinWheel() {
  // Safety checks: no double spins, and nothing to spin if no food matches
  if (isSpinning) return;
  if (eligibleFoods.length === 0) return;

  setSpinningState(true);
  hideResult();
  wheel.scrollIntoView({ behavior: reducedMotionQuery.matches ? "auto" : "smooth", block: "nearest" });

  // Step 1: pick the winner at random. Every slice has the same chance.
  const winnerIndex = Math.floor(Math.random() * eligibleFoods.length);
  pendingWinner = eligibleFoods[winnerIndex];

  // Step 2: work out the angle that puts the winner's slice under the pointer.
  // The winner's middle is at (winnerIndex + 0.5) * sliceAngle, and the pointer
  // is at angle 0, so the wheel must end up turned by (360 - that angle).
  const sliceAngle = 360 / eligibleFoods.length;
  const targetAngle = (360 - (winnerIndex + 0.5) * sliceAngle) % 360;
  const angleNow = ((currentRotation % 360) + 360) % 360;
  const turnNeeded = (targetAngle - angleNow + 360) % 360;

  // A small random nudge so the pointer does not always stop in the exact
  // middle. It stays inside the slice (at most 35% of a slice either way).
  const nudge = (Math.random() - 0.5) * sliceAngle * 0.7;

  // Step 3: full turns for the show, then the turn that lands on the winner
  const fullTurns = MIN_EXTRA_TURNS + Math.floor(Math.random() * EXTRA_TURN_VARIETY);
  currentRotation += fullTurns * 360 + turnNeeded + nudge;
  wheel.style.setProperty("--wheel-rotation", currentRotation + "deg");

  if (reducedMotionQuery.matches) {
    // No animation, so there is nothing to wait for
    finishSpin();
  } else {
    // Normally the "transitionend" listener (bottom of the file) finishes the
    // spin. This timer is a backup in case that event never arrives.
    finishTimer = setTimeout(finishSpin, SPIN_DURATION_MS + 500);
  }
}

// Runs when the wheel has stopped
function finishSpin() {
  if (!isSpinning || pendingWinner === null) return; // already finished

  clearTimeout(finishTimer);
  const winner = pendingWinner;
  pendingWinner = null;

  setSpinningState(false);
  showResult(winner);
  launchConfetti();
}

// ==========================================================
// 5. Result card
// ==========================================================

function showResult(food) {
  // createFoodCard() comes from app.js, so the card looks like the other pages
  // and keeps the image fallback. true = also show the description.
  resultCardHolder.replaceChildren(createFoodCard(food, true));
  resultSection.hidden = false;

  announcer.textContent =
    "Your pick is " + food.name + ". Category: " + food.category +
    ". Estimated price: " + formatPriceRange(food) + ".";

  spinAgainButton.focus(); // keyboard users land right next to the result
}

function hideResult() {
  resultSection.hidden = true;
  resultCardHolder.replaceChildren();
}

// ==========================================================
// 6. Celebration (confetti)
// ==========================================================

function launchConfetti() {
  if (reducedMotionQuery.matches) return; // respect the reduced-motion setting

  const pieces = [];
  for (let i = 0; i < CONFETTI_PIECES; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";

    // Each piece gets random values for its position, colour and timing
    piece.style.setProperty("--confetti-left", Math.random() * 100 + "%");
    piece.style.setProperty("--confetti-color", WHEEL_COLOURS[i % WHEEL_COLOURS.length].background);
    piece.style.setProperty("--confetti-drift", (Math.random() * 160 - 80) + "px");
    piece.style.setProperty("--confetti-spin", (Math.random() * 720 - 360) + "deg");
    piece.style.setProperty("--confetti-delay", Math.random() * 0.5 + "s");
    piece.style.setProperty("--confetti-duration", (2 + Math.random() * 1.5) + "s");
    pieces.push(piece);
  }
  confettiLayer.replaceChildren(...pieces);

  // Remove the pieces once they have fallen
  clearTimeout(confettiTimer);
  confettiTimer = setTimeout(function () {
    confettiLayer.replaceChildren();
  }, 4500);
}

// ==========================================================
// 7. Start the page
// ==========================================================

async function startRoulettePage() {
  // The spin length is set here so CSS and JavaScript always agree
  wheel.style.setProperty("--spin-duration", SPIN_DURATION_MS + "ms");
  drawEmptyWheel("Loading...");

  try {
    await loadFoods(); // from food-data.js

    rouletteFilters.disabled = false;
    categorySelect.addEventListener("change", refreshWheel);
    budgetSelect.addEventListener("change", refreshWheel);
    spinButton.addEventListener("click", spinWheel);
    spinAgainButton.addEventListener("click", spinWheel);

    // The wheel finished turning: show the result
    wheel.addEventListener("transitionend", function (event) {
      if (event.target === wheel && event.propertyName === "transform") finishSpin();
    });

    refreshWheel();
  } catch (error) {
    // The message explains how to fix the problem (use Live Server)
    drawEmptyWheel("Could not load");
    rouletteStatus.textContent = error.message;
    rouletteStatus.classList.add("is-error");
  }
}

startRoulettePage();
