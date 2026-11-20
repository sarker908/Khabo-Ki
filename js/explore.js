/* ==========================================================
   Khabo Ki? - Explore Foods page (Stage 3)

   This file only controls the page. It reuses:
   - js/food-data.js: loadFoods(), getAllFoods(), filterFoodsByCategory(),
                      filterFoodsByMaxBudget(), searchFoods()
   - js/app.js:       createFoodCard() (cards with the image fallback)
   ========================================================== */

// ----- Page elements -----
const filterPanel = document.getElementById("filter-panel");
const searchInput = document.getElementById("search-input");
const clearSearchButton = document.getElementById("clear-search");
const budgetSelect = document.getElementById("budget-select");
const categoryButtonGroup = document.getElementById("category-buttons");
const categoryButtons = document.querySelectorAll("#category-buttons .chip");
const resultCount = document.getElementById("result-count");
const statusMessage = document.getElementById("explore-status");
const emptyState = document.getElementById("empty-state");
const resetButton = document.getElementById("reset-filters");
const foodGrid = document.getElementById("food-grid");

// ----- Page state -----
let selectedCategory = "All"; // the category button currently selected
let lastRenderKey = null;     // describes what is on screen (see updateResults)
let totalFoods = 0;           // number of foods in the whole catalogue

// Each food card is built once, then reused. This avoids creating
// the same DOM elements again every time the filters change.
const cardCache = new Map(); // food id -> card element

// ----- Cards -----
function getFoodCard(food) {
  if (!cardCache.has(food.id)) {
    cardCache.set(food.id, createFoodCard(food, true)); // true = show description
  }
  return cardCache.get(food.id);
}

// ----- Combined filtering -----
// Each step starts from the result of the step before, so all three
// filters work together: category, then budget, then search.
function getMatchingFoods() {
  let foods = filterFoodsByCategory(selectedCategory);

  if (budgetSelect.value !== "any") {
    foods = filterFoodsByMaxBudget(budgetSelect.value, foods);
  }

  // searchFoods() already ignores capital letters and extra spaces
  foods = searchFoods(searchInput.value, foods);

  return foods;
}

// ----- Showing the results -----
function updateResultCount(shownCount) {
  const foodWord = totalFoods === 1 ? "food" : "foods";
  let text = "Showing " + shownCount + " of " + totalFoods + " " + foodWord;

  // Say which category is selected, unless it is "All"
  if (selectedCategory !== "All") text += " in " + selectedCategory;

  resultCount.textContent = text;
}

function updateResults() {
  // The clear (x) button is only useful when there is text to clear
  clearSearchButton.hidden = searchInput.value === "";

  // This key describes the current filters. If it is the same as the last
  // time (for example the user only typed a space), nothing has changed,
  // so we skip the work.
  const key = JSON.stringify([
    searchInput.value.trim().toLowerCase(),
    selectedCategory,
    budgetSelect.value
  ]);
  if (key === lastRenderKey) return;
  lastRenderKey = key;

  const matchingFoods = getMatchingFoods();

  // Replace the cards on screen with the matching ones
  foodGrid.replaceChildren(...matchingFoods.map(getFoodCard));
  syncFavoriteButtons(); // reused cards may be out of date if favourites changed elsewhere

  emptyState.hidden = matchingFoods.length > 0;
  updateResultCount(matchingFoods.length);
}

// ----- Category buttons -----
function setSelectedCategory(category) {
  selectedCategory = category;

  categoryButtons.forEach(function (button) {
    const isSelected = button.dataset.category === category;
    button.classList.toggle("is-active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

// ----- Reset -----
function resetFilters() {
  searchInput.value = "";
  budgetSelect.value = "any";
  setSelectedCategory("All");
  updateResults();
  searchInput.focus();
}

// ----- Start the page -----
function addEventListeners() {
  // "input" fires on every key press, so results update as the user types
  searchInput.addEventListener("input", updateResults);

  clearSearchButton.addEventListener("click", function () {
    searchInput.value = "";
    updateResults();
    searchInput.focus();
  });

  budgetSelect.addEventListener("change", updateResults);

  // One listener on the group handles clicks on every category button
  categoryButtonGroup.addEventListener("click", function (event) {
    const button = event.target.closest("button[data-category]");
    if (!button) return;
    setSelectedCategory(button.dataset.category);
    updateResults();
  });

  resetButton.addEventListener("click", resetFilters);
}

async function startExplorePage() {
  try {
    await loadFoods(); // from food-data.js
    totalFoods = getAllFoods().length;

    statusMessage.hidden = true;     // hide the loading message
    filterPanel.disabled = false;    // turn the filters on
    addEventListeners();
    updateResults();                 // show every food to begin with
  } catch (error) {
    // The message explains how to fix the problem (use Live Server)
    statusMessage.textContent = error.message;
    statusMessage.classList.add("is-error");
  }
}

startExplorePage();
