/* ==========================================================
   Khabo Ki? - food catalogue helpers (Stage 2)

   This file loads data/foods.json and provides small functions
   to read, filter and search the foods. It does NOT touch the
   page. Other scripts (like app.js) call these functions.

   Load order in index.html: food-data.js must come BEFORE app.js.
   ========================================================== */

// Where the catalogue file lives (relative to index.html)
const FOOD_DATA_URL = "data/foods.json";

// Shown to the user when the catalogue cannot be loaded
const FOOD_LOAD_ERROR_MESSAGE =
  "We couldn't load the food catalogue. Please run this website with " +
  "VS Code Live Server (or another local server) instead of opening " +
  "index.html directly from your files.";

// The catalogue is stored here after it has been loaded once
let allFoods = [];

// ----- 1. Load the data -----
// "async" lets us wait for the file without freezing the page.
// Use it like:  await loadFoods();
async function loadFoods() {
  // If we already loaded the foods, reuse them instead of fetching again
  if (allFoods.length > 0) return allFoods;

  // Browsers block fetch() for files opened with file:// (double-clicking
  // index.html), so we can explain the problem straight away.
  if (window.location.protocol === "file:") {
    throw new Error(FOOD_LOAD_ERROR_MESSAGE);
  }

  try {
    const response = await fetch(FOOD_DATA_URL);

    // A 404 (file not found) or similar is not an exception, so check it
    if (!response.ok) {
      throw new Error("Server answered with status " + response.status);
    }

    const foods = await response.json();

    // Make sure the file really contains a list of foods
    if (!Array.isArray(foods)) {
      throw new Error("foods.json must contain a list (array) of foods");
    }

    allFoods = foods;
    return allFoods;
  } catch (error) {
    // Technical details go to the console for the developer...
    console.error("Food catalogue error:", error);
    // ...and a friendly message goes to the user
    throw new Error(FOOD_LOAD_ERROR_MESSAGE);
  }
}

// ----- 2. Read the data -----
// Every function below works on the foods already loaded by loadFoods().
// Each one also accepts an optional list, so later you can combine them:
//   filterFoodsByMaxBudget(200, filterFoodsByCategory("Snacks"))

// Return all foods (a copy, so other code cannot change the original list)
function getAllFoods() {
  return [...allFoods];
}

// Find one food by its id. Returns the food, or undefined if not found.
function getFoodById(id) {
  return allFoods.find(function (food) {
    return food.id === Number(id); // Number() lets "5" work as well as 5
  });
}

// Keep only foods in one category, e.g. "Street Food".
// "All" (or an empty value) returns every food.
function filterFoodsByCategory(category, foodList = allFoods) {
  if (!category || category.toLowerCase() === "all") return [...foodList];

  return foodList.filter(function (food) {
    return food.category.toLowerCase() === category.toLowerCase();
  });
}

// Keep foods that can be bought within a budget (in BDT).
// A food counts if its cheapest estimated price is within the budget.
function filterFoodsByMaxBudget(maxBudget, foodList = allFoods) {
  const budget = Number(maxBudget);
  if (Number.isNaN(budget)) return [...foodList]; // ignore invalid input

  return foodList.filter(function (food) {
    return food.minPrice <= budget;
  });
}

// Search by name or tags, ignoring capital letters.
// "biryani" finds Kacchi Biryani; "cheap" finds foods tagged "cheap".
function searchFoods(searchText, foodList = allFoods) {
  const text = String(searchText).trim().toLowerCase();
  if (text === "") return [...foodList]; // empty search shows everything

  return foodList.filter(function (food) {
    const nameMatches = food.name.toLowerCase().includes(text);
    const tagMatches = food.tags.some(function (tag) {
      return tag.toLowerCase().includes(text);
    });
    return nameMatches || tagMatches;
  });
}

// ----- 3. Display helper -----
// Turns a food's prices into text, e.g. "৳350 – ৳550"
function formatPriceRange(food) {
  if (food.minPrice === food.maxPrice) return "৳" + food.minPrice;
  return "৳" + food.minPrice + " – ৳" + food.maxPrice;
}

// The address of a food's details page, e.g. "food-details.html?id=1".
// The ?id=1 part is a "query parameter" that the details page reads.
function getFoodDetailsUrl(foodId) {
  return "food-details.html?id=" + encodeURIComponent(foodId);
}

// ----- 4. Related foods -----
// Up to "maxCount" foods to suggest on a details page.
// Foods from the SAME category come first (never the food itself).
// If there are not enough, the list is filled with foods from other categories.
function getRelatedFoods(food, maxCount = 3) {
  const sameCategory = filterFoodsByCategory(food.category).filter(function (otherFood) {
    return otherFood.id !== food.id;
  });

  const otherCategories = allFoods.filter(function (otherFood) {
    return otherFood.id !== food.id && otherFood.category !== food.category;
  });

  return [...sameCategory, ...otherCategories].slice(0, maxCount);
}
