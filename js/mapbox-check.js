/* ==========================================================
   Khabo Ki? - Mapbox coverage check (temporary developer tool)

   Uses ONLY endpoints from Mapbox's documentation:
   - GET /search/searchbox/v1/list/category      (is "restaurant" a valid category id?)
   - GET /search/searchbox/v1/category/{id}      (restaurants near a point, with coordinates)
   - GET /search/geocode/v6/forward              (finding Dhaka places by name)
   - GET /directions/v5/mapbox/{profile}/{coordinates}   (routes)

   Nothing runs until the button is pressed.
   ========================================================== */

const MAPBOX_API_URL = "https://api.mapbox.com";
const SEARCH_BOX_RESULT_LIMIT = 25;   // the most the category endpoint allows
const SEARCH_AREA_DEGREES = 0.03;     // about 3 km around each test point

// Category ids we want to confirm exist (they come from Mapbox's own list)
const CATEGORIES_TO_CONFIRM = ["restaurant", "food_and_drink", "food", "cafe", "fast_food", "food_court"];

// Test points as longitude, latitude (Mapbox always uses longitude first)
const TEST_LOCATIONS = [
  { name: "Control: Ann Arbor, USA (documented as supported)", lon: -83.7430, lat: 42.2808, inBangladesh: false },
  { name: "Dhanmondi, Dhaka", lon: 90.3742, lat: 23.7461, inBangladesh: true },
  { name: "Gulshan 2, Dhaka", lon: 90.4150, lat: 23.7925, inBangladesh: true },
  { name: "Motijheel, Dhaka", lon: 90.4172, lat: 23.7330, inBangladesh: true },
  { name: "Chattogram city centre", lon: 91.7832, lat: 22.3569, inBangladesh: true }
];

const runCheckButton = document.getElementById("run-check-button");
const checkVerdict = document.getElementById("check-verdict");
const checkResults = document.getElementById("check-results");

let isChecking = false;

// ----- Showing results -----
// state: "success", "error", "empty" (a warning) or "info"
function addResult(state, title, detailLines) {
  const item = document.createElement("li");

  const heading = document.createElement("p");
  heading.className = "results-status";
  heading.dataset.state = state;
  heading.textContent = title;
  item.appendChild(heading);

  (detailLines || []).forEach(function (line) {
    const detail = document.createElement("p");
    detail.className = "place-note";
    detail.textContent = line;
    item.appendChild(detail);
  });

  checkResults.appendChild(item);
}

function showVerdict(state, message) {
  checkVerdict.dataset.state = state;
  checkVerdict.textContent = message;
}

// ----- Token -----
// Stops early with a clear message if the token is missing or unsafe
function getPublicToken() {
  const token = typeof MAPBOX_CONFIG !== "undefined" ? String(MAPBOX_CONFIG.accessToken || "").trim() : "";

  if (token.startsWith("sk.")) {
    throw new Error("That is a SECRET token (it starts with sk.). Remove it from js/mapbox-config.js right away, " +
      "delete it in your Mapbox account, and use a public token (pk.) instead.");
  }
  if (!token.startsWith("pk.")) {
    throw new Error("Add your public Mapbox token (it starts with pk.) to js/mapbox-config.js first.");
  }
  return token;
}

// ----- Sending a request -----
async function callMapbox(token, path, params) {
  const url = new URL(MAPBOX_API_URL + path);
  Object.keys(params || {}).forEach(function (name) {
    url.searchParams.set(name, params[name]);
  });
  url.searchParams.set("access_token", token);

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error("Network error. Check your internet connection (or an ad blocker).");
  }

  if (response.status === 401) throw new Error("401: Mapbox did not accept the token. Check that it is a valid public token.");
  if (response.status === 403) throw new Error("403: Forbidden. The token's URL restrictions may not include this page's address, or there is an account issue.");
  if (response.status === 429) throw new Error("429: Too many requests. Wait a minute and try again.");
  if (!response.ok) throw new Error("HTTP " + response.status + " from Mapbox.");

  try {
    return await response.json();
  } catch (error) {
    throw new Error("Mapbox sent a reply that could not be read.");
  }
}

function describePoint(feature) {
  const lon = feature.geometry.coordinates[0].toFixed(5);
  const lat = feature.geometry.coordinates[1].toFixed(5);
  return feature.properties.name + " (" + lat + ", " + lon + ")";
}

function hasUsableCoordinates(feature) {
  const coordinates = feature && feature.geometry && feature.geometry.coordinates;
  return Array.isArray(coordinates) && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1]);
}

// ----- The individual checks -----

// 1. Is "restaurant" a real category id?
async function checkCategoryList(token) {
  const data = await callMapbox(token, "/search/searchbox/v1/list/category", { language: "en" });
  const knownIds = (data.listItems || []).map(function (item) { return item.canonical_id; });

  const lines = CATEGORIES_TO_CONFIRM.map(function (id) {
    return id + ": " + (knownIds.includes(id) ? "valid category id" : "NOT in Mapbox's category list");
  });
  const restaurantIsValid = knownIds.includes("restaurant");
  addResult(restaurantIsValid ? "success" : "error",
    restaurantIsValid ? "Category id \"restaurant\" is valid (" + knownIds.length + " categories listed)"
                      : "Category id \"restaurant\" was NOT found in the category list", lines);
  return restaurantIsValid;
}

// 2. Restaurants near one test point. Returns how many usable results were found.
async function checkCategorySearch(token, location, categoryId) {
  const bbox = [
    location.lon - SEARCH_AREA_DEGREES, location.lat - SEARCH_AREA_DEGREES,
    location.lon + SEARCH_AREA_DEGREES, location.lat + SEARCH_AREA_DEGREES
  ].join(",");

  const data = await callMapbox(token, "/search/searchbox/v1/category/" + categoryId, {
    proximity: location.lon + "," + location.lat,
    bbox: bbox,
    limit: SEARCH_BOX_RESULT_LIMIT,
    language: "en"
  });

  const usable = (data.features || []).filter(hasUsableCoordinates);
  const title = location.name + " / " + categoryId + ": " + usable.length + " result" + (usable.length === 1 ? "" : "s") + " with coordinates";
  const samples = usable.slice(0, 5).map(describePoint);
  addResult(usable.length > 0 ? "success" : "empty", title, samples);
  return usable.length;
}

// 3. Finding a Dhaka place by name (Geocoding v6 has addresses and places, no restaurants)
async function checkGeocoding(token, searchText) {
  const data = await callMapbox(token, "/search/geocode/v6/forward", {
    q: searchText, country: "BD", limit: 3, language: "en"
  });
  const features = (data.features || []).filter(hasUsableCoordinates);
  const lines = features.map(function (feature) {
    return describePoint(feature) + " [" + feature.properties.feature_type + "]";
  });
  addResult(features.length > 0 ? "success" : "empty",
    "Geocoding \"" + searchText + "\" in Bangladesh: " + features.length + " result" + (features.length === 1 ? "" : "s"), lines);
  return features.length;
}

// 4. A route between two Dhaka points (coordinates are longitude,latitude)
async function checkDirections(token, profile) {
  const from = TEST_LOCATIONS[1];
  const to = TEST_LOCATIONS[2];
  const coordinates = from.lon + "," + from.lat + ";" + to.lon + "," + to.lat;

  const data = await callMapbox(token, "/directions/v5/mapbox/" + profile + "/" + coordinates, {});
  const route = data.routes && data.routes[0];
  const worked = data.code === "Ok" && route && Number.isFinite(route.distance);

  addResult(worked ? "success" : "error",
    "Directions (" + profile + ") Dhanmondi to Gulshan 2: " + (worked ? "route found" : "no route (" + data.code + ")"),
    worked ? [(route.distance / 1000).toFixed(1) + " km, about " + Math.round(route.duration / 60) + " minutes"] : []);
  return worked;
}

// Runs a check but keeps going if it fails, so one error does not hide the rest
async function runSafely(label, checkFunction) {
  try {
    return await checkFunction();
  } catch (error) {
    addResult("error", label + ": " + error.message);
    return null;
  }
}

// ----- Putting it together -----
async function runCoverageCheck() {
  if (isChecking) return;

  let token;
  try {
    token = getPublicToken();
  } catch (error) {
    showVerdict("error", error.message);
    return;
  }

  isChecking = true;
  runCheckButton.disabled = true;
  checkResults.replaceChildren();
  showVerdict("loading", "Running checks...");

  const categoryIsValid = await runSafely("Category list", function () { return checkCategoryList(token); });

  let controlCount = 0;
  let bangladeshCount = 0;
  for (const location of TEST_LOCATIONS) {
    for (const categoryId of ["restaurant", "food_and_drink"]) {
      const count = await runSafely(location.name + " / " + categoryId, function () {
        return checkCategorySearch(token, location, categoryId);
      });
      // Only the "restaurant" category counts towards the verdict
      if (categoryId === "restaurant" && count !== null) {
        if (location.inBangladesh) bangladeshCount += count; else controlCount += count;
      }
    }
  }

  await runSafely("Geocoding", function () { return checkGeocoding(token, "Dhanmondi, Dhaka"); });
  await runSafely("Geocoding", function () { return checkGeocoding(token, "Gulshan, Dhaka"); });
  const drivingWorks = await runSafely("Directions (driving)", function () { return checkDirections(token, "driving"); });
  const walkingWorks = await runSafely("Directions (walking)", function () { return checkDirections(token, "walking"); });

  // The verdict is a rough guide, not a guarantee
  if (controlCount === 0) {
    showVerdict("error", "Inconclusive: even the USA control search returned nothing. Fix the errors above first " +
      "(token, URL restrictions or account), then run the check again.");
  } else if (bangladeshCount === 0) {
    showVerdict("empty", "Mapbox returned NO restaurants for the Bangladesh test areas, although the control search worked. " +
      "Mapbox's restaurant search does not cover Bangladesh, so migrating the Restaurant Finder would leave it empty. " +
      "Do not remove the Leaflet/Overpass version.");
  } else if (bangladeshCount < 20) {
    showVerdict("empty", "Mapbox found only " + bangladeshCount + " restaurants across " +
      TEST_LOCATIONS.filter(function (l) { return l.inBangladesh; }).length +
      " Bangladesh test areas. Coverage is sparse and many places would be missing. Compare with the OpenStreetMap version before deciding.");
  } else {
    showVerdict("success", "Mapbox returned " + bangladeshCount + " restaurants across the Bangladesh test areas. " +
      "Coverage looks usable. Compare a few names against places you know before migrating." +
      (categoryIsValid && drivingWorks && walkingWorks ? " Directions also worked." : ""));
  }

  runCheckButton.disabled = false;
  isChecking = false;
}

runCheckButton.addEventListener("click", runCoverageCheck);
