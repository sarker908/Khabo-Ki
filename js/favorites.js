/* ==========================================================
   Khabo Ki? - favourites storage (Stage 5)

   Saves the user's favourite foods in the browser's localStorage.
   ONLY food ids are stored (for example [1, 5, 12]), never whole
   food objects. The food details always come from data/foods.json.

   This file does not touch the page. Load it BEFORE app.js.
   ========================================================== */

// The name under which the list is saved in localStorage
const FAVORITES_STORAGE_KEY = "khaboKiFavorites";

// If localStorage is blocked (some private modes), favourites are kept
// here instead, so the hearts still work until the page is closed.
let memoryFavorites = null;

// Turns whatever was stored into a clean list of food ids.
// Anything that is not a positive whole number is ignored, and duplicates are removed.
function cleanFavoriteIds(value) {
  if (!Array.isArray(value)) return [];

  const ids = [];
  value.forEach(function (id) {
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

// ----- Read -----
// Returns a list of favourite food ids. Never throws: if the saved data is
// missing, blocked or corrupted, it simply returns an empty list.
function getFavorites() {
  if (memoryFavorites !== null) return [...memoryFavorites];

  try {
    const savedText = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (savedText === null) return [];
    return cleanFavoriteIds(JSON.parse(savedText));
  } catch (error) {
    // JSON.parse fails on corrupted text, and localStorage can be blocked
    console.warn("Could not read favourites, starting with an empty list.", error);
    return [];
  }
}

// ----- Write (used by the functions below) -----
function saveFavorites(ids) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
    memoryFavorites = null;
  } catch (error) {
    // Storage is full or blocked: keep the list in memory for this visit
    console.warn("Could not save favourites to localStorage.", error);
    memoryFavorites = ids;
  }
}

// ----- Check -----
function isFavorite(foodId) {
  return getFavorites().includes(Number(foodId));
}

// ----- Add -----
function addFavorite(foodId) {
  const id = Number(foodId);
  if (!Number.isInteger(id) || id <= 0) return; // ignore invalid ids

  const favorites = getFavorites();
  if (!favorites.includes(id)) {
    favorites.push(id);
    saveFavorites(favorites);
  }
}

// ----- Remove -----
function removeFavorite(foodId) {
  const id = Number(foodId);
  const favorites = getFavorites().filter(function (savedId) {
    return savedId !== id;
  });
  saveFavorites(favorites);
}

// ----- Toggle -----
// Adds the food if it is not a favourite, removes it if it is.
// Returns true if the food is a favourite AFTER the change.
function toggleFavorite(foodId) {
  if (isFavorite(foodId)) {
    removeFavorite(foodId);
    return false;
  }
  addFavorite(foodId);
  return true;
}
