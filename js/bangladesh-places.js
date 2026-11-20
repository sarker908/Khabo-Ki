/* ==========================================================
   Khabo Ki? - Bangladesh food places (clustered map layer)

   Adds ~5,500 OpenStreetMap food places to the map that js/restaurants.js
   already created. It does NOT create a second map.

   How it works, in order:
   1. fetch() loads data/khabo_ki_bangladesh.json ONCE.
   2. Records are checked: bad coordinates, unnamed places and non-food
      types (such as internet cafes) are left out. Branches that share a
      name are all kept.
   3. The records become a GeoJSON FeatureCollection (longitude first).
   4. Mapbox draws them from one clustered GeoJSON source. Nearby places
      are grouped into numbered circles that split apart as you zoom in.
      There is no HTML element per place, so thousands of places stay fast.
   5. The type buttons swap which prepared FeatureCollection the source
      shows. The search box looks through every loaded place by name.

   It reuses these helpers from js/restaurants.js: trackPopup (one popup
   at a time, Escape closes it), formatCuisine and createDetailRow.

   Everything is wrapped in a function so its names cannot clash with
   the other scripts on the page.
   ========================================================== */
(function () {
  "use strict";

  // ==========================================================
  // Settings
  // ==========================================================
  const DATA_URL = "data/khabo_ki_bangladesh.json";
  const FETCH_TIMEOUT_MS = 30000;   // give up loading the data after 30 seconds
  const MAP_WAIT_MS = 20000;        // say so if the map has not loaded after 20 seconds
  const MAX_SEARCH_RESULTS = 20;    // results listed under the search box
  const SEARCH_DELAY_MS = 80;       // tiny pause so fast typing does not search on every key
  const MAX_PLACES_IN_POPUP = 5;    // when several places share one spot
  const CLUSTER_MAX_ZOOM = 14;      // above this zoom every place is drawn on its own
  const CLUSTER_RADIUS = 50;        // how close (in pixels) places must be to join a cluster
  const SELECTED_ZOOM = 16;         // zoom used when a search result is chosen

  // OpenStreetMap "type" values that count as food places.
  // A record can hold several values separated by ";" (for example "bank;restaurant").
  // To accept another type, add a line here. Types not listed (such as internet_cafe) are left out.
  const PLACE_TYPES = {
    restaurant: { label: "Restaurant", group: "restaurant" },
    cafe: { label: "Café", group: "cafe" },
    fast_food: { label: "Fast food", group: "fast_food" }
  };

  // The type buttons, their wording and their map colours (also used for the legend dots)
  const GROUPS = {
    restaurant: { label: "Restaurants", color: "#E63946" }, // red
    cafe: { label: "Cafés", color: "#FF9F1C" },             // orange
    fast_food: { label: "Fast food", color: "#2E8B57" }     // green
  };
  const OTHER_COLOR = "#6b6259"; // for a place whose group has no colour (not used with the current data)

  // Map layer names
  const SOURCE_ID = "bd-places";
  const CLUSTER_LAYER = "bd-clusters";
  const COUNT_LAYER = "bd-cluster-count";
  const POINT_LAYER = "bd-points";
  const SELECTED_SOURCE = "bd-selected";
  const SELECTED_LAYER = "bd-selected-ring";

  // The dataset says "Unknown" when the cuisine is not known. That is not a cuisine.
  const UNKNOWN_CUISINE = /^\s*unknown\s*$/i;

  // ==========================================================
  // Page elements
  // ==========================================================
  const searchInput = document.getElementById("places-search-input");
  const searchBox = document.getElementById("places-search-box");
  const clearButton = document.getElementById("places-search-clear");
  const dropdown = document.getElementById("places-search-dropdown");
  const searchSummary = document.getElementById("places-search-summary");
  const searchList = document.getElementById("places-search-list");
  const filterGroup = document.getElementById("places-filter");
  const filterButtons = filterGroup ? filterGroup.querySelectorAll("button[data-group]") : [];
  const statusMessage = document.getElementById("places-status");
  const retryButton = document.getElementById("places-retry");
  const noteMessage = document.getElementById("places-note");

  // ==========================================================
  // State
  // ==========================================================
  let places = [];            // every valid food place: { index, name, typeLabel, group, cuisine, lat, lon }
  let searchKeys = [];        // lowercase names, same order as "places" (built once)
  let nameCounts = new Map(); // lowercase name -> how many places have it
  let collections = null;     // ready-made GeoJSON: { all, restaurant, cafe, fast_food }
  let activeGroup = "all";    // the selected type button
  let map = null;             // the EXISTING map from js/restaurants.js
  let layersAdded = false;
  let popup = null;           // one popup, reused for every place
  let openPlaces = [];        // the places shown in the popup right now
  let dataPromise = null;     // the loading request (so the file is only fetched once)
  let searchTimer = null;
  let loadStartedAt = 0;

  // ==========================================================
  // 1. Loading the data (once)
  // ==========================================================

  // Reads the JSON file. Throws an Error with a message a visitor can understand.
  async function fetchPlaceRecords() {
    if (window.location.protocol === "file:") {
      throw new Error("Food places can't load when the page is opened as a file. " +
        "Please run the website with VS Code Live Server (or another local server).");
    }

    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(DATA_URL, { signal: controller.signal });
    } catch (error) {
      console.error("Food place data request failed:", error);
      throw new Error("We couldn't reach the food place data. Check your internet connection and try again.");
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404) {
      throw new Error("The food place data file couldn't be found (" + DATA_URL + ").");
    }
    if (!response.ok) {
      throw new Error("The server couldn't send the food place data (status " + response.status + ").");
    }

    let records;
    try {
      records = await response.json();
    } catch (error) {
      console.error("Food place data is not valid JSON:", error);
      throw new Error("The food place data file is damaged or isn't valid JSON.");
    }
    if (!Array.isArray(records)) {
      throw new Error("The food place data file must contain a list of places.");
    }
    return records;
  }

  // Loads and prepares the data. Asking again returns the same request, so the file is never fetched twice.
  function loadPlaces() {
    if (dataPromise) return dataPromise;
    dataPromise = fetchPlaceRecords().then(preparePlaces);
    dataPromise.catch(function () { dataPromise = null; }); // after a failure, "Try again" may fetch again
    return dataPromise;
  }

  // ==========================================================
  // 2. Cleaning the records
  // ==========================================================

  // Turns a value from the file into a number, or null if it is not a usable number.
  // (An empty string is NOT treated as 0.)
  function toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "") {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }
    return null;
  }

  // Latitude -90..90, longitude -180..180, and not the empty-data spot (0, 0)
  function hasValidCoordinates(lat, lon) {
    if (lat === null || lon === null) return false;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
    return !(lat === 0 && lon === 0);
  }

  // Finds the food type inside a value like "bank;restaurant". Returns null if there is none.
  function findFoodType(typeValue) {
    const parts = String(typeValue || "").split(";");
    for (const part of parts) {
      const info = PLACE_TYPES[part.trim().toLowerCase()];
      if (info) return info;
    }
    return null;
  }

  // Lower-case, trimmed text with one form of each accented/Bangla character.
  // Used for searching, so "KFC", "kfc" and "Kfc" all match.
  function normaliseText(text) {
    return String(text).normalize("NFC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  }

  // Checks every record and builds the lists used by the map and the search.
  function preparePlaces(records) {
    const kept = [];
    const left = { badCoordinates: 0, unnamed: 0, notFood: 0, notFoodTypes: new Map() };

    records.forEach(function (record) {
      if (!record || typeof record !== "object") { left.badCoordinates++; return; }

      const lat = toNumber(record.latitude);
      const lon = toNumber(record.longitude);
      if (!hasValidCoordinates(lat, lon)) { left.badCoordinates++; return; }

      const name = typeof record.name === "string" ? record.name.trim() : "";
      if (name === "") { left.unnamed++; return; }

      const type = findFoodType(record.type);
      if (!type) {
        left.notFood++;
        const typeText = String(record.type);
        left.notFoodTypes.set(typeText, (left.notFoodTypes.get(typeText) || 0) + 1);
        return;
      }

      // Missing cuisine stays missing. Nothing is made up.
      const cuisineText = typeof record.category === "string" ? record.category.trim() : "";
      const cuisine = cuisineText === "" || UNKNOWN_CUISINE.test(cuisineText) ? null : cuisineText;

      // No de-duplication on purpose: branches with the same name are separate places.
      kept.push({ index: kept.length, name: name, typeLabel: type.label, group: type.group, cuisine: cuisine, lat: lat, lon: lon });
    });

    places = kept;
    searchKeys = kept.map(function (place) { return normaliseText(place.name); });
    nameCounts = new Map();
    searchKeys.forEach(function (key) { nameCounts.set(key, (nameCounts.get(key) || 0) + 1); });
    collections = buildCollections(kept);

    const excluded = records.length - kept.length;
    console.info("Food places: " + kept.length + " kept, " + excluded + " left out of " + records.length +
      " (bad coordinates: " + left.badCoordinates + ", unnamed: " + left.unnamed + ", not a food type: " + left.notFood +
      (left.notFoodTypes.size ? " [" + Array.from(left.notFoodTypes, function (pair) { return pair[0] + " x" + pair[1]; }).join(", ") + "]" : "") + ")");

    return { total: records.length, kept: kept.length, excluded: excluded, left: left };
  }

  // ==========================================================
  // 3. GeoJSON
  // ==========================================================

  // GeoJSON always puts LONGITUDE first, then latitude.
  function createFeature(place) {
    const properties = { i: place.index, name: place.name, type: place.typeLabel, group: place.group };
    if (place.cuisine) properties.cuisine = place.cuisine;
    return { type: "Feature", geometry: { type: "Point", coordinates: [place.lon, place.lat] }, properties: properties };
  }

  // One ready-made FeatureCollection for "all" and one for each type.
  // Switching the filter later just hands Mapbox the matching one. Nothing is rebuilt.
  function buildCollections(list) {
    const byGroup = {};
    Object.keys(GROUPS).forEach(function (group) { byGroup[group] = []; });
    const everything = [];

    list.forEach(function (place) {
      const feature = createFeature(place);
      everything.push(feature);
      if (byGroup[place.group]) byGroup[place.group].push(feature);
    });

    const result = { all: { type: "FeatureCollection", features: everything } };
    Object.keys(byGroup).forEach(function (group) {
      result[group] = { type: "FeatureCollection", features: byGroup[group] };
    });
    return result;
  }

  // ==========================================================
  // 4. The map layers (added to the existing map)
  // ==========================================================

  // Mapbox expression: pick a colour from the place's "group"
  function colorByGroup() {
    const expression = ["match", ["get", "group"]];
    Object.keys(GROUPS).forEach(function (group) { expression.push(group, GROUPS[group].color); });
    expression.push(OTHER_COLOR);
    return expression;
  }

  function addLayers() {
    if (layersAdded) return;

    // One source. "cluster: true" makes Mapbox group nearby points and count them.
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: collections.all,
      cluster: true,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterRadius: CLUSTER_RADIUS
    });

    // Numbered circles: bigger and darker when they hold more places
    map.addLayer({
      id: CLUSTER_LAYER, type: "circle", source: SOURCE_ID, filter: ["has", "point_count"],
      paint: {
        "circle-color": ["step", ["get", "point_count"], "#7B5EA7", 100, "#5B3F8C", 750, "#3D2A63"],
        "circle-radius": ["step", ["get", "point_count"], 16, 50, 21, 250, 27, 1000, 33],
        "circle-stroke-width": 3,
        "circle-stroke-color": "rgba(255, 255, 255, 0.85)"
      }
    });

    // The number inside each circle
    map.addLayer({
      id: COUNT_LAYER, type: "symbol", source: SOURCE_ID, filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 13,
        "text-allow-overlap": true
      },
      paint: { "text-color": "#ffffff" }
    });

    // Single places (not in a cluster): red restaurants, orange cafes, green fast food
    map.addLayer({
      id: POINT_LAYER, type: "circle", source: SOURCE_ID, filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": colorByGroup(),
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3.5, 12, 6, 16, 9],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff"
      }
    });

    // A dark ring around the place that was chosen from search or clicked
    map.addSource(SELECTED_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: SELECTED_LAYER, type: "circle", source: SELECTED_SOURCE,
      paint: {
        "circle-radius": 13,
        "circle-color": "rgba(255, 255, 255, 0)",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#252525"
      }
    });

    // One popup for all places
    popup = new mapboxgl.Popup({ offset: 14, maxWidth: "290px", focusAfterOpen: false });
    if (typeof trackPopup === "function") trackPopup(popup, null); // from restaurants.js: one popup at a time + Escape
    popup.on("close", function () {
      openPlaces = [];
      clearSelectedRing();
    });

    map.on("click", CLUSTER_LAYER, handleClusterClick);
    map.on("click", POINT_LAYER, handlePointClick);
    [CLUSTER_LAYER, POINT_LAYER].forEach(function (layer) {
      map.on("mouseenter", layer, function () { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, function () { map.getCanvas().style.cursor = ""; });
    });

    layersAdded = true;
  }

  // The existing emoji markers (from the nearby search) sit on top of the map.
  // A click on one of them must not also count as a click on the layer underneath.
  function clickWasOnMarker(event) {
    const target = event.originalEvent && event.originalEvent.target;
    return Boolean(target && target.closest && target.closest(".mapboxgl-marker, .mapboxgl-popup"));
  }

  // Clicking a numbered circle zooms in to the level where it splits apart
  function handleClusterClick(event) {
    if (clickWasOnMarker(event) || !event.features || !event.features.length) return;

    const feature = event.features[0];
    map.getSource(SOURCE_ID).getClusterExpansionZoom(feature.properties.cluster_id, function (error, zoom) {
      if (error) return;
      map.easeTo({
        center: feature.geometry.coordinates,
        zoom: zoom,
        animate: !prefersReducedMotion()
      });
    });
  }

  // Clicking a single place opens its popup
  function handlePointClick(event) {
    if (clickWasOnMarker(event) || !event.features || !event.features.length) return;

    // Several places can sit at exactly the same spot. Collect them all (without repeats).
    const seen = new Set();
    const clicked = [];
    event.features.forEach(function (feature) {
      const place = places[feature.properties.i];
      if (place && !seen.has(place.index)) {
        seen.add(place.index);
        clicked.push(place);
      }
    });
    if (clicked.length) showPopup(clicked);
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // ==========================================================
  // 5. The popup (built with textContent only)
  // ==========================================================

  function createPlaceBlock(place) {
    const block = document.createElement("div");
    block.className = "dataset-place";

    const title = document.createElement("h3");
    title.textContent = place.name;

    const list = document.createElement("dl");
    list.className = "place-details";
    list.append(createDetailRow("Type", place.typeLabel));
    // Only a real cuisine is shown. "Unknown" in the data is shown as "not listed".
    list.append(createDetailRow("Cuisine", place.cuisine ? formatCuisine(place.cuisine) : "Not listed"));

    block.append(title, list);
    return block;
  }

  function createPopupContent(list) {
    const wrapper = document.createElement("div");
    wrapper.className = "popup-content";

    if (list.length > 1) {
      const note = document.createElement("p");
      note.className = "place-note";
      note.textContent = list.length + " places share this spot.";
      wrapper.appendChild(note);
    }

    list.slice(0, MAX_PLACES_IN_POPUP).forEach(function (place) {
      wrapper.appendChild(createPlaceBlock(place));
    });

    if (list.length > MAX_PLACES_IN_POPUP) {
      const more = document.createElement("p");
      more.className = "place-note";
      more.textContent = "and " + (list.length - MAX_PLACES_IN_POPUP) + " more.";
      wrapper.appendChild(more);
    }
    return wrapper;
  }

  function showSelectedRing(place) {
    map.getSource(SELECTED_SOURCE).setData({ type: "FeatureCollection", features: [createFeature(place)] });
  }

  function clearSelectedRing() {
    if (map && map.getSource(SELECTED_SOURCE)) {
      map.getSource(SELECTED_SOURCE).setData({ type: "FeatureCollection", features: [] });
    }
  }

  function showPopup(list) {
    const first = list[0];
    popup.setLngLat([first.lon, first.lat]).setDOMContent(createPopupContent(list)).addTo(map);
    openPlaces = list; // set after addTo, because replacing an open popup fires "close" first
    showSelectedRing(first);
  }

  // ==========================================================
  // 6. Filtering by type
  // ==========================================================

  function formatNumber(number) {
    return number.toLocaleString("en-US");
  }

  // The "Showing ..." line under the filters
  function updateCountMessage() {
    const shown = collections[activeGroup].features.length;
    const text = activeGroup === "all"
      ? "Showing all " + formatNumber(shown) + " food places"
      : "Showing " + formatNumber(shown) + " " + GROUPS[activeGroup].label.toLowerCase() + " (of " + formatNumber(places.length) + " food places)";
    setStatus("success", text + ".");
  }

  function updateFilterButtons() {
    filterButtons.forEach(function (button) {
      const isActive = button.dataset.group === activeGroup;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function fillFilterCounts() {
    filterButtons.forEach(function (button) {
      const group = button.dataset.group;
      const countElement = button.querySelector(".chip-count");
      if (countElement) countElement.textContent = "(" + formatNumber(collections[group].features.length) + ")";
    });
  }

  // Changes the type shown on the map. Does nothing if it is already selected.
  function applyFilter(group) {
    if (!collections[group] || group === activeGroup) return;

    activeGroup = group;
    map.getSource(SOURCE_ID).setData(collections[group]); // clusters and counts are recalculated by Mapbox

    // Close a popup whose place is no longer on the map
    if (group !== "all" && openPlaces.length && openPlaces.every(function (place) { return place.group !== group; })) {
      popup.remove();
    }

    updateFilterButtons();
    updateCountMessage();
  }

  // ==========================================================
  // 7. Searching by name
  // ==========================================================

  function getMapCentreDistance(place) {
    const centre = map.getCenter();
    return getDistanceInMetres(centre.lat, centre.lng, place.lat, place.lon); // from restaurants.js
  }

  // Looks through EVERY loaded place. Names that start with the text come first,
  // then names that contain it. Places with the same name are ordered nearest the map centre first.
  function findMatches(query) {
    const startsWith = [];
    const contains = [];

    for (let i = 0; i < searchKeys.length; i++) {
      const position = searchKeys[i].indexOf(query);
      if (position === 0) startsWith.push(i);
      else if (position > 0) contains.push(i);
    }

    const distanceCache = new Map();
    const distanceOf = function (i) {
      if (!distanceCache.has(i)) distanceCache.set(i, getMapCentreDistance(places[i]));
      return distanceCache.get(i);
    };
    const byNameThenDistance = function (a, b) {
      if (searchKeys[a] !== searchKeys[b]) return searchKeys[a] < searchKeys[b] ? -1 : 1;
      return distanceOf(a) - distanceOf(b);
    };

    startsWith.sort(byNameThenDistance);
    contains.sort(byNameThenDistance);
    return startsWith.concat(contains);
  }

  function hideDropdown() {
    dropdown.hidden = true;
    searchInput.setAttribute("aria-expanded", "false");
  }

  function showDropdown() {
    dropdown.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
  }

  function createResultItem(place) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "place-result";
    button.dataset.placeIndex = place.index;

    const name = document.createElement("span");
    name.className = "place-result-name";
    name.textContent = place.name;

    // Type, cuisine (only if known) and the exact position, so same-name branches can be told apart
    const detailParts = [place.typeLabel];
    if (place.cuisine) detailParts.push(formatCuisine(place.cuisine));
    detailParts.push(place.lat.toFixed(4) + ", " + place.lon.toFixed(4));
    const details = document.createElement("span");
    details.className = "place-result-meta";
    details.textContent = detailParts.join(" \u00B7 ");

    button.append(name, details);

    const sameName = nameCounts.get(normaliseText(place.name));
    if (sameName > 1) {
      const branches = document.createElement("span");
      branches.className = "place-result-meta";
      branches.textContent = sameName + " places have this name";
      button.appendChild(branches);
    }

    item.appendChild(button);
    return item;
  }

  function runSearch() {
    const query = normaliseText(searchInput.value);
    clearButton.hidden = searchInput.value === "";

    if (query === "") {
      hideDropdown();
      searchList.replaceChildren();
      return;
    }

    const matches = findMatches(query);
    const shown = matches.slice(0, MAX_SEARCH_RESULTS);
    searchList.replaceChildren(...shown.map(function (index) { return createResultItem(places[index]); }));

    if (matches.length === 0) {
      searchSummary.textContent = "No food places match \u201C" + searchInput.value.trim() + "\u201D.";
    } else if (matches.length > shown.length) {
      searchSummary.textContent = formatNumber(matches.length) + " matches. Showing the first " + shown.length + ". Type more to narrow them down.";
    } else {
      searchSummary.textContent = matches.length + (matches.length === 1 ? " match." : " matches.");
    }
    showDropdown();
  }

  function scheduleSearch() {
    clearButton.hidden = searchInput.value === "";
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, SEARCH_DELAY_MS);
  }

  // Moves the map to a place and opens its popup
  function selectPlace(index) {
    const place = places[index];
    if (!place) return;

    // A place that the current filter hides would not be visible, so show everything again
    if (activeGroup !== "all" && place.group !== activeGroup) applyFilter("all");

    hideDropdown();
    showPopup([place]);
    map.flyTo({
      center: [place.lon, place.lat],
      zoom: Math.max(map.getZoom(), SELECTED_ZOOM),
      animate: !prefersReducedMotion()
    });

    // On a phone the map can be off screen. Bring it into view.
    const mapElement = document.getElementById("map");
    if (mapElement) mapElement.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "nearest" });
  }

  function handleResultClick(event) {
    const button = event.target.closest("button[data-place-index]");
    if (button) selectPlace(Number(button.dataset.placeIndex));
  }

  // Arrow keys move through the results, Escape closes the list
  function handleSearchKeys(event) {
    const buttons = Array.from(searchList.querySelectorAll("button"));

    if (event.key === "Escape" && !dropdown.hidden) {
      hideDropdown();
      searchInput.focus();
      event.stopPropagation();
      return;
    }
    if (event.key === "ArrowDown" && event.target === searchInput && buttons.length && !dropdown.hidden) {
      event.preventDefault();
      buttons[0].focus();
      return;
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && event.target.matches("button.place-result")) {
      event.preventDefault();
      const position = buttons.indexOf(event.target) + (event.key === "ArrowDown" ? 1 : -1);
      if (position < 0) searchInput.focus();
      else if (position < buttons.length) buttons[position].focus();
    }
  }

  // ==========================================================
  // 8. Messages and starting up
  // ==========================================================

  // state: "loading", "success", "error" (changes the colour and the icon)
  function setStatus(state, message) {
    statusMessage.dataset.state = state;
    statusMessage.textContent = message;
  }

  function setControlsDisabled(disabled) {
    searchInput.disabled = disabled;
    filterButtons.forEach(function (button) { button.disabled = disabled; });
  }

  function colourLegendDots() {
    document.querySelectorAll(".legend-dot[data-group]").forEach(function (dot) {
      const group = GROUPS[dot.dataset.group];
      if (group) dot.style.setProperty("--dot-color", group.color); // one place for each colour
    });
  }

  // Runs when BOTH the data and the map are ready
  function start(summary) {
    addLayers();
    fillFilterCounts();
    updateFilterButtons();
    setControlsDisabled(false);
    updateCountMessage();
    retryButton.hidden = true;

    if (summary.excluded > 0) {
      noteMessage.textContent = formatNumber(summary.excluded) + " of " + formatNumber(summary.total) +
        " records were left out because they aren't food places (for example internet cafés), have no name, or have no valid location.";
    }
  }

  function showLoadError(error) {
    setStatus("error", error.message);
    retryButton.hidden = false;
    setControlsDisabled(true);
  }

  // Resolves with the existing map once its style has loaded
  function waitForMap() {
    return new Promise(function (resolve) {
      const existing = typeof window.map !== "undefined" ? window.map : null; // (not used: "map" is a script-level variable)
      void existing;
      if (typeof mapIsReady !== "undefined" && mapIsReady) { resolve(globalMap()); return; }
      document.addEventListener("khaboMapReady", function (event) { resolve(event.detail.map); }, { once: true });
    });
  }

  // The map created by js/restaurants.js (a script-level variable named "map" there)
  function globalMap() {
    // eslint-disable-next-line no-undef
    return typeof mapRef === "function" ? mapRef() : null;
  }

  function begin() {
    if (!searchInput) return; // this page has no places panel

    colourLegendDots();
    setControlsDisabled(true);
    setStatus("loading", "Loading food places...");
    retryButton.hidden = true;
    loadStartedAt = Date.now();

    // Without the existing map there is nothing to add the places to
    if (typeof mapboxgl === "undefined" || typeof mapIsReady === "undefined") {
      setStatus("error", "The map isn't available, so food places can't be shown. See the message about the map above.");
      return;
    }

    // The map may still be loading, so give up waiting (but keep listening) after a while
    const waitTimer = setTimeout(function () {
      if (!layersAdded && statusMessage.dataset.state === "loading") {
        setStatus("error", "The map is taking a long time to load, so food places can't be shown yet.");
      }
    }, MAP_WAIT_MS);

    // Load the data and wait for the map at the same time
    Promise.all([loadPlaces(), waitForMap()]).then(function (results) {
      clearTimeout(waitTimer);
      map = results[1];
      start(results[0]);
    }).catch(function (error) {
      clearTimeout(waitTimer);
      showLoadError(error);
    });
  }

  // ----- Events -----
  if (searchInput) {
    searchInput.addEventListener("input", scheduleSearch);
    searchInput.addEventListener("focus", function () { if (searchInput.value.trim() !== "" && places.length) runSearch(); });
    searchInput.addEventListener("keydown", handleSearchKeys);
    searchList.addEventListener("keydown", handleSearchKeys);
    searchList.addEventListener("click", handleResultClick);
    clearButton.addEventListener("click", function () {
      searchInput.value = "";
      runSearch();
      searchInput.focus();
    });
    // Clicking anywhere outside the search box closes the results
    document.addEventListener("click", function (event) {
      if (!searchBox.contains(event.target)) hideDropdown();
    });
    filterGroup.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-group]");
      if (button && !button.disabled && layersAdded) applyFilter(button.dataset.group);
    });
    retryButton.addEventListener("click", begin);
  }

  begin();
})();
