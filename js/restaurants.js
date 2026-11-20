/* ==========================================================
   Khabo Ki? - Restaurant Finder (Stage 7)

   Services used:
   - Mapbox GL JS .................... the map display only (token in js/mapbox-config.js)
   - Nominatim ....................... turns a typed place name into a location
   - Local JSON dataset ............. finds food places around that location
   - Browser Geolocation ............. the visitor's own location (only on request)

   NOTHING is sent anywhere until the visitor presses Search or
   Use My Location. Moving or zooming the map never starts a search.
   ========================================================== */

// ==========================================================
// Settings (change them here)
// ==========================================================
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const RESTAURANT_DATA_URL = "data/khabo_ki_bangladesh.json";
// Map display (Mapbox GL JS). Mapbox always uses [longitude, latitude] order.
const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";
const DHAKA_CENTRE = [90.4125, 23.8103]; // the map starts here...
const DHAKA_ZOOM = 11;                   // ...showing the whole city
const SEARCH_AREA_SOURCE = "search-area"; // map source that holds the radius circle
const CIRCLE_POINTS = 64;                 // the circle is drawn as a 64-sided shape
const MAP_SLOW_MS = 15000;                // warn if the map has not loaded after 15 seconds
const EMPTY_AREA = { type: "FeatureCollection", features: [] };
const START_MESSAGE = "Search for a place, or use your location, to see food places here.";

const NOMINATIM_MIN_GAP_MS = 1000;      // Nominatim policy: at most 1 request per second
const REQUEST_TIMEOUT_MS = 30000;       // give up on a request after 30 seconds
const RESULT_CACHE_MS = 10 * 60 * 1000; // reuse the same search for 10 minutes
const MAX_PLACES_SHOWN = 40;            // how many places are listed and put on the map
const DUPLICATE_DISTANCE_METRES = 50;   // same name closer than this = same place
const ALLOWED_RADIUSES = [1000, 3000, 5000, 10000]; // metres

const LOCATION_CACHE_KEY = "khaboKiLocationCache"; // saved in sessionStorage (cleared when the tab closes)
const MAX_CACHED_LOCATIONS = 30;

// Supported food-place types in the local dataset, with a label and emoji for each
const DATA_TYPE_INFO = {
  restaurant: { label: "Restaurant", emoji: "🍽️" },
  fast_food: { label: "Fast food", emoji: "🍔" },
  cafe: { label: "Café", emoji: "☕" }
};

// ==========================================================
// Page elements and state
// ==========================================================
const locationForm = document.getElementById("location-form");
const locationInput = document.getElementById("location-input");
const radiusSelect = document.getElementById("radius-select");
const searchButton = document.getElementById("search-button");
const locateButton = document.getElementById("locate-button");
const cancelButton = document.getElementById("cancel-button");
const resultsStatus = document.getElementById("results-status");
const restaurantList = document.getElementById("restaurant-list");
const mapElement = document.getElementById("map");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let map = null;               // the Mapbox map
let mapIsReady = false;       // true once the map style has loaded
let originMarker = null;      // marker for the search centre (or the visitor's location)
let openPopup = null;         // the popup that is open right now (only one at a time)
let openPopupMarkerElement = null; // the marker that popup belongs to (Escape returns focus there)
let currentOrigin = null;     // where the last search was centred
let isSearching = false;      // true while a search is running (blocks a second one)
let currentController = null; // lets us cancel the request that is running
let userCancelled = false;    // true if the visitor pressed Cancel
let lastNominatimTime = 0;    // when we last asked Nominatim
let restaurantDataPromise = null; // local JSON is loaded once and reused

const markersByKey = new Map();  // place key -> Mapbox marker
const cardsByKey = new Map();    // place key -> result card
const locationCache = new Map(); // typed text -> location (this session)
const placesCache = new Map();   // location + radius -> places found

// ==========================================================
// 1. Messages and errors
// ==========================================================

// Shows a message in the results panel.
// state: "info", "loading", "success", "empty" or "error" (changes the colour)
function showStatus(state, message) {
  resultsStatus.dataset.state = state;
  resultsStatus.textContent = message;
}

// Makes an Error that carries a short code, so we can show a friendly message later
function createError(code, detail) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  return error;
}

// Turns an error code into a message a visitor can understand
function getFriendlyMessage(error) {
  switch (error.code) {
    case "empty-input":
      return "Please type a place name first, for example Dhanmondi, Dhaka.";
    case "not-found":
      return "We couldn't find \"" + error.detail + "\" in Bangladesh. Check the spelling or add a city, for example Gulshan, Dhaka.";
    case "geo-insecure":
      return "Your location only works on secure pages. Open the site with Live Server (localhost) or over https.";
    case "geo-unsupported":
      return "Your browser doesn't support location. Please type a place name instead.";
    case "geo-denied":
      return "Location permission was denied. You can allow it in your browser's site settings, or type a place name instead.";
    case "geo-unavailable":
      return "We couldn't work out your location. Please try again, or type a place name instead.";
    case "geo-timeout":
      return "Finding your location took too long. Please try again, or type a place name instead.";
    case "timeout":
      return "The search took too long. Try a smaller radius, or try again in a moment.";
    case "network":
      return "We couldn't reach the map service. Check your internet connection and try again.";
    case "location-unavailable":
      return "The place search service is unavailable right now. Please try again in a moment.";
    case "data-unavailable":
      return "We could not load the restaurant database. Check that data/khabo_ki_bangladesh.json exists and run the site with Live Server.";
    case "bad-data":
      return "The restaurant database could not be read. Please check the JSON file.";
    case "bad-response":
      return "The map service sent a reply we couldn't read. Please try again in a moment.";
    case "cancelled":
      return "Search cancelled.";
    case "map-missing":
      return "The Mapbox map library could not be loaded. Check your internet connection and reload the page.";
    case "map-no-token":
      return "The map needs a public Mapbox token. Add it (it starts with pk.) to js/mapbox-config.js and reload the page.";
    case "map-secret-token":
      return "js/mapbox-config.js contains a SECRET token (it starts with sk.). Remove it right away, delete it in your Mapbox account, and use a public token (pk.) instead.";
    case "map-token":
      return "The map couldn't load. Check that the token in js/mapbox-config.js is a valid public token and that its URL restrictions allow this page's address.";
    case "map-failed":
      return "The map couldn't start. Your browser or device may have WebGL turned off.";
    case "map-slow":
      return "The map is taking a long time to load. Check your internet connection and reload the page.";
    default:
      return "Something went wrong. Please try again.";
  }
}

// ==========================================================
// 2. Sending requests safely
// ==========================================================

function sleep(milliseconds) {
  return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
}

// fetch() with a time limit. An AbortController lets us stop the request
// if it takes too long, or if the visitor presses Cancel.
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  currentController = controller;
  cancelButton.hidden = false; // the Cancel button is available while a request runs

  let timedOut = false;
  const timer = setTimeout(function () {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw createError(timedOut && !userCancelled ? "timeout" : "cancelled");
    }
    throw createError("network"); // no internet, blocked, server unreachable...
  } finally {
    clearTimeout(timer);
    currentController = null;
  }
}

// Reads the JSON in a response, or throws a friendly error if it is not JSON
async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    throw createError("bad-response");
  }
}

// ==========================================================
// 3. Finding a location by name (Nominatim)
// ==========================================================

// Nominatim allows at most one request per second, so wait if needed
async function waitForNominatimSlot() {
  const waitTime = NOMINATIM_MIN_GAP_MS - (Date.now() - lastNominatimTime);
  if (waitTime > 0) await sleep(waitTime);
  lastNominatimTime = Date.now();
}

// "Dhanmondi,   Dhaka " and "dhanmondi, dhaka" count as the same search
function makeCacheKey(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

// Keeps just the first parts of a long address, e.g. "Dhanmondi, Dhaka, Dhaka District"
function shortenPlaceName(displayName, fallback) {
  const shortName = String(displayName || "").split(", ").slice(0, 3).join(", ");
  return shortName || fallback;
}

// Saved searches live in sessionStorage, so they survive a page refresh
// but disappear when the tab is closed. If storage is blocked, the Map still works.
function loadLocationCache() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(LOCATION_CACHE_KEY) || "{}");
    Object.keys(saved).forEach(function (key) {
      const place = saved[key];
      if (Number.isFinite(place.lat) && Number.isFinite(place.lon) && typeof place.label === "string") {
        locationCache.set(key, { lat: place.lat, lon: place.lon, label: place.label });
      }
    });
  } catch (error) {
    // Nothing saved, or storage not available. That is fine.
  }
}

function saveLocationToCache(key, location) {
  locationCache.set(key, location);
  if (locationCache.size > MAX_CACHED_LOCATIONS) {
    locationCache.delete(locationCache.keys().next().value); // drop the oldest
  }
  try {
    sessionStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(Object.fromEntries(locationCache)));
  } catch (error) {
    // Storage blocked: the in-memory copy is still used
  }
}

// Turns typed text into { lat, lon, label }. Only called after a button press.
async function lookupLocation(queryText) {
  const cacheKey = makeCacheKey(queryText);
  const cachedLocation = locationCache.get(cacheKey);
  if (cachedLocation) return { ...cachedLocation, isGps: false }; // no request needed

  await waitForNominatimSlot();

  // countrycodes=bd keeps the search inside Bangladesh; limit=1 asks for the best match only
  const params = new URLSearchParams({
    q: queryText,
    format: "jsonv2",
    limit: "1",
    countrycodes: "bd",
    "accept-language": "en"
  });
  const response = await fetchWithTimeout(NOMINATIM_URL + "?" + params, {});

  if (response.status === 429) throw createError("rate-limit");
  if (!response.ok) throw createError("location-unavailable");

  const results = await readJson(response);
  if (!Array.isArray(results)) throw createError("bad-response");
  if (results.length === 0) throw createError("not-found", queryText);

  const lat = parseFloat(results[0].lat);
  const lon = parseFloat(results[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw createError("bad-response");

  const location = { lat: lat, lon: lon, label: shortenPlaceName(results[0].display_name, queryText) };
  saveLocationToCache(cacheKey, location);
  return { ...location, isGps: false };
}

// ==========================================================
// 4. Finding the visitor's location (Geolocation API)
// ==========================================================

// The browser asks the visitor for permission when this runs
function getBrowserLocation() {
  return new Promise(function (resolve, reject) {
    if (!window.isSecureContext) {
      reject(createError("geo-insecure"));
      return;
    }
    if (!("geolocation" in navigator)) {
      reject(createError("geo-unsupported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (position) {
        resolve({ lat: position.coords.latitude, lon: position.coords.longitude, label: "your location", isGps: true });
      },
      function (error) {
        // error.code: 1 = permission denied, 2 = position unavailable, 3 = timed out
        const codes = { 1: "geo-denied", 2: "geo-unavailable", 3: "geo-timeout" };
        reject(createError(codes[error.code] || "geo-unavailable"));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}

// ==========================================================
// 5. Finding food places (local Bangladesh JSON dataset)
// ==========================================================

function getDistanceInMetres(lat1, lon1, lat2, lon2) {
  const toRadians = function (degrees) { return (degrees * Math.PI) / 180; };
  const earthRadius = 6371000;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(metres) {
  if (metres < 1000) return Math.max(10, Math.round(metres / 10) * 10) + " m";
  return (metres / 1000).toFixed(1) + " km";
}

function formatRadius(radius) {
  return radius < 1000 ? radius + " m" : radius / 1000 + " km";
}

function toCoordinate(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function isValidCoordinate(lat, lon) {
  return lat !== null && lon !== null &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 &&
    !(lat === 0 && lon === 0);
}

// Load the JSON once. Every later search reuses the in-memory records.
async function loadRestaurantDatabase() {
  if (!restaurantDataPromise) {
    restaurantDataPromise = fetch(RESTAURANT_DATA_URL, { cache: "force-cache" })
      .then(function (response) {
        if (!response.ok) throw createError("data-unavailable");
        return response.json();
      })
      .then(function (records) {
        if (!Array.isArray(records)) throw createError("bad-data");

        return records.reduce(function (validPlaces, record, index) {
          if (!record || typeof record !== "object") return validPlaces;

          const lat = toCoordinate(record.latitude);
          const lon = toCoordinate(record.longitude);
          const name = typeof record.name === "string" ? record.name.trim() : "";
          const type = String(record.type || "").trim().toLowerCase();
          const typeInfo = DATA_TYPE_INFO[type];

          if (!name || !typeInfo || !isValidCoordinate(lat, lon)) return validPlaces;

          const category = typeof record.category === "string" ? record.category.trim() : "";
          const cuisine = !category || /^unknown$/i.test(category) ? null : category;

          validPlaces.push({
            key: "local/" + index,
            name: name,
            displayName: name,
            categoryLabel: typeInfo.label,
            emoji: typeInfo.emoji,
            lat: lat,
            lon: lon,
            cuisine: cuisine,
            address: null,
            openingHours: null,
            phone: null,
            distance: 0
          });
          return validPlaces;
        }, []);
      })
      .catch(function (error) {
        restaurantDataPromise = null;
        if (error.code) throw error;
        console.error("Could not load local restaurant database:", error);
        throw createError("data-unavailable");
      });
  }
  return restaurantDataPromise;
}

// Find nearby places locally. No Overpass request is made.
async function getFoodPlaces(origin, radius) {
  const cacheKey = origin.lat.toFixed(5) + "," + origin.lon.toFixed(5) + "," + radius;
  const cached = placesCache.get(cacheKey);
  if (cached) return cached;

  const database = await loadRestaurantDatabase();
  const nearby = [];

  database.forEach(function (place) {
    const distance = getDistanceInMetres(origin.lat, origin.lon, place.lat, place.lon);
    if (distance <= radius) nearby.push({ ...place, distance: distance });
  });

  nearby.sort(function (a, b) { return a.distance - b.distance; });
  placesCache.set(cacheKey, nearby);
  return nearby;
}

// ==========================================================
// 6. The map
// ==========================================================

// Checks the public token from js/mapbox-config.js and returns it
function getMapboxToken() {
  const token = typeof MAPBOX_CONFIG !== "undefined" ? String(MAPBOX_CONFIG.accessToken || "").trim() : "";
  if (token.startsWith("sk.")) throw createError("map-secret-token"); // never use a secret token in a website
  if (!token.startsWith("pk.")) throw createError("map-no-token");
  return token;
}

function setupMap(token) {
  mapboxgl.accessToken = token;

  map = new mapboxgl.Map({
    container: mapElement,
    style: MAP_STYLE,
    center: DHAKA_CENTRE,
    zoom: DHAKA_ZOOM
  });
  map.addControl(new mapboxgl.NavigationControl(), "top-right"); // zoom buttons. Attribution is added automatically.

  // The map style has finished loading: add an (empty) layer for the radius circle,
  // then turn the search controls on.
  map.on("load", function () {
    map.addSource(SEARCH_AREA_SOURCE, { type: "geojson", data: EMPTY_AREA });
    map.addLayer({
      id: "search-area-fill", type: "fill", source: SEARCH_AREA_SOURCE,
      paint: { "fill-color": "#2E8B57", "fill-opacity": 0.08 }
    });
    map.addLayer({
      id: "search-area-line", type: "line", source: SEARCH_AREA_SOURCE,
      paint: { "line-color": "#2E8B57", "line-width": 2 }
    });

    mapIsReady = true;
    setControlsDisabled(false);
    showStatus("info", START_MESSAGE);
  });

  // Mapbox reports problems with an "error" event. 401 or 403 means the token was refused.
  map.on("error", function (event) {
    const status = event && event.error && event.error.status;
    if (!mapIsReady && (status === 401 || status === 403)) {
      showStatus("error", getFriendlyMessage(createError("map-token")));
    } else {
      console.warn("Map warning:", event && event.error);
    }
  });

  // If the map still has not loaded after a while, say so instead of waiting forever
  setTimeout(function () {
    if (!mapIsReady && resultsStatus.dataset.state === "loading") {
      showStatus("error", getFriendlyMessage(createError("map-slow")));
    }
  }, MAP_SLOW_MS);
}

// A round marker with an emoji inside (styled in css/map.css).
// A <div> is used on purpose: when a popup is attached, Mapbox adds its own keyboard
// and click handling to the element, so a <button> would trigger it twice.
function createMarkerElement(emoji, className, label) {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = emoji;
  element.title = label;
  element.setAttribute("aria-label", label);
  return element;
}

// Keeps only ONE popup open at a time, and lets the Escape key close it.
// "onOpen" is optional: extra code to run when this popup opens.
function trackPopup(popup, markerElement, onOpen) {
  popup.on("open", function () {
    if (openPopup && openPopup !== popup) openPopup.remove(); // close the previous popup
    openPopup = popup;
    openPopupMarkerElement = markerElement;
    if (onOpen) onOpen();
  });
  popup.on("close", function () {
    if (openPopup === popup) {
      openPopup = null;
      openPopupMarkerElement = null;
    }
  });
}

// Escape closes the open popup and puts keyboard focus back on its marker
function handleEscapeKey(event) {
  if (event.key !== "Escape" || !openPopup) return;
  const markerElement = openPopupMarkerElement;
  openPopup.remove();
  if (markerElement) markerElement.focus();
}

// Mapbox has no "circle of N metres", so we make a many-sided shape around the centre.
// Returns a list of [longitude, latitude] points.
function createCirclePolygon(lon, lat, radiusMetres) {
  const earthRadius = 6371000;
  const toRadians = function (degrees) { return (degrees * Math.PI) / 180; };
  const toDegrees = function (radians) { return (radians * 180) / Math.PI; };

  const angularDistance = radiusMetres / earthRadius;
  const centreLat = toRadians(lat);
  const centreLon = toRadians(lon);
  const ring = [];

  for (let i = 0; i < CIRCLE_POINTS; i++) {
    const bearing = (2 * Math.PI * i) / CIRCLE_POINTS;
    const pointLat = Math.asin(
      Math.sin(centreLat) * Math.cos(angularDistance) +
      Math.cos(centreLat) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const pointLon = centreLon + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centreLat),
      Math.cos(angularDistance) - Math.sin(centreLat) * Math.sin(pointLat)
    );
    ring.push([toDegrees(pointLon), toDegrees(pointLat)]);
  }

  ring.push(ring[0]); // close the shape
  return ring;
}

// Marks the search centre and draws the search radius, then zooms to fit it
function showOrigin(origin, radius) {
  const ring = createCirclePolygon(origin.lon, origin.lat, radius);
  map.getSource(SEARCH_AREA_SOURCE).setData({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: {}
  });

  const label = origin.isGps ? "Your location" : "Search centre: " + origin.label;
  const text = document.createElement("div");
  text.textContent = label;
  // focusAfterOpen: false keeps keyboard focus on the marker. Otherwise Mapbox moves focus
  // into the popup, and the same Enter key press would also activate a link inside it.
  const popup = new mapboxgl.Popup({ offset: 22, maxWidth: "260px", focusAfterOpen: false }).setDOMContent(text);
  const originElement = createMarkerElement("📍", "origin-marker", label);
  trackPopup(popup, originElement);

  originMarker = new mapboxgl.Marker({ element: originElement })
    .setLngLat([origin.lon, origin.lat])
    .setPopup(popup)
    .addTo(map);

  // Zoom so the whole circle is visible
  const bounds = new mapboxgl.LngLatBounds();
  ring.forEach(function (point) { bounds.extend(point); });
  map.fitBounds(bounds, { padding: 24, animate: !prefersReducedMotion });
}

// Moves the map to one place and opens its popup (used when a result card is clicked)
function focusOnPlace(place) {
  const marker = markersByKey.get(place.key);
  if (!marker) return;

  map.easeTo({ center: [place.lon, place.lat], zoom: Math.max(map.getZoom(), 17), animate: !prefersReducedMotion });
  if (!marker.getPopup().isOpen()) marker.togglePopup();
  mapElement.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "nearest" });
}

// Highlights one result card (and scrolls the list to it)
function setActiveCard(key) {
  cardsByKey.forEach(function (card, cardKey) {
    card.classList.toggle("is-active", cardKey === key);
  });
  const activeCard = cardsByKey.get(key);
  if (activeCard) activeCard.scrollIntoView({ behavior: "auto", block: "nearest" });
}

// ==========================================================
// 7. Building the result cards and popups
// ==========================================================
// All dataset text is added with textContent, never as HTML.

// Keeps only digits and a leading "+" so the phone link is safe.
// Returns null if the text does not look like a phone number.
function getPhoneLinkTarget(phoneText) {
  const firstNumber = phoneText.split(/[;,]/)[0];
  const cleaned = firstNumber.replace(/[^\d+]/g, "");
  return /^\+?\d{5,15}$/.test(cleaned) ? cleaned : null;
}

// One row of the details list: <div><dt>Label</dt><dd>Value</dd></div>
function createDetailRow(label, valueNode) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.append(valueNode);
  row.append(term, description);
  return row;
}

// Shows only the details available in the local dataset
function createPlaceDetails(place) {
  const rows = [];

  if (place.cuisine) rows.push(createDetailRow("Cuisine", place.cuisine));
  if (place.address) rows.push(createDetailRow("Address", place.address));
  if (place.openingHours) rows.push(createDetailRow("Opening hours", place.openingHours));

  if (place.phone) {
    const phoneTarget = getPhoneLinkTarget(place.phone);
    if (phoneTarget) {
      const link = document.createElement("a");
      link.href = "tel:" + phoneTarget;
      link.textContent = place.phone;
      rows.push(createDetailRow("Phone", link));
    } else {
      rows.push(createDetailRow("Phone", place.phone));
    }
  }

  if (rows.length === 0) {
    const note = document.createElement("p");
    note.className = "place-note";
    note.textContent = "The dataset currently contains only the name, type, category and coordinates for this place.";
    return note;
  }

  const list = document.createElement("dl");
  list.className = "place-details";
  list.append(...rows);
  return list;
}

// Google Maps directions and location links (open in a new tab)
function createPlaceLinks(place) {
  const destination = place.lat.toFixed(6) + "," + place.lon.toFixed(6);
  const directions = document.createElement("a");
  directions.href = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(destination);
  directions.textContent = "Directions";
  directions.setAttribute("aria-label", "Directions to " + place.displayName + " (opens Google Maps)");

  const viewOnMap = document.createElement("a");
  // Search Google Maps by the restaurant's name, not its raw coordinates.
  // Adding Bangladesh helps Google Maps return the intended country.
  const searchQuery = place.displayName + ", Bangladesh";
  viewOnMap.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(searchQuery);
  viewOnMap.textContent = "View on Google Maps";
  viewOnMap.setAttribute("aria-label", "View " + place.displayName + " on Google Maps");

  [directions, viewOnMap].forEach(function (link) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });

  const container = document.createElement("div");
  container.className = "place-links";
  container.append(directions, viewOnMap);
  return container;
}

// "Restaurant - 350 m away"
function createCategoryLine(place) {
  const line = document.createElement("p");
  line.className = "place-category";
  line.textContent = place.emoji + " " + place.categoryLabel + " \u00B7 " + formatDistance(place.distance) + " away";
  return line;
}

// Content of the popup that opens when a marker is clicked
function createPopupContent(place) {
  const wrapper = document.createElement("div");
  wrapper.className = "popup-content";

  const title = document.createElement("h3");
  title.textContent = place.displayName;

  wrapper.append(title, createCategoryLine(place), createPlaceDetails(place), createPlaceLinks(place));
  return wrapper;
}

// One card in the results list
function createPlaceCard(place) {
  const card = document.createElement("li");
  card.className = "restaurant-card";

  // The name is a real button, so keyboard users can focus the map too
  const heading = document.createElement("h3");
  const nameButton = document.createElement("button");
  nameButton.type = "button";
  nameButton.className = "restaurant-name";
  nameButton.textContent = place.displayName;
  nameButton.setAttribute("aria-label", "Show " + place.displayName + " on the map");
  heading.appendChild(nameButton);

  card.append(heading, createCategoryLine(place), createPlaceDetails(place), createPlaceLinks(place));

  // Clicking the card (but not its links) moves the map to this place
  card.addEventListener("click", function (event) {
    if (event.target.closest("a")) return;
    focusOnPlace(place);
  });

  return card;
}

// Adds a place to the map and to the list
function addPlace(place) {
  // The popup shows the same details as the result card
  // focusAfterOpen: false keeps keyboard focus on the marker (see showOrigin)
  const popup = new mapboxgl.Popup({ offset: 22, maxWidth: "280px", focusAfterOpen: false })
    .setDOMContent(createPopupContent(place));
  const markerElement = createMarkerElement(place.emoji, "food-marker", place.displayName + ", " + place.categoryLabel);
  trackPopup(popup, markerElement, function () { setActiveCard(place.key); }); // also highlights the matching card

  const marker = new mapboxgl.Marker({ element: markerElement })
    .setLngLat([place.lon, place.lat])
    .setPopup(popup)
    .addTo(map);
  markersByKey.set(place.key, marker);

  const card = createPlaceCard(place);
  cardsByKey.set(place.key, card);
  restaurantList.appendChild(card);
}

// ==========================================================
// 8. Running a search
// ==========================================================

function clearResults() {
  markersByKey.forEach(function (marker) { marker.remove(); }); // also removes its popup
  markersByKey.clear();
  if (originMarker) {
    originMarker.remove();
    originMarker = null;
  }
  if (mapIsReady) map.getSource(SEARCH_AREA_SOURCE).setData(EMPTY_AREA); // remove the radius circle
  cardsByKey.clear();
  restaurantList.replaceChildren();
  currentOrigin = null;
}

// Turns the search controls on or off
function setControlsDisabled(disabled) {
  searchButton.disabled = disabled;
  locateButton.disabled = disabled;
  radiusSelect.disabled = disabled;
}

// While a search runs, the controls are off so a second search cannot start.
function setSearching(searching) {
  isSearching = searching;
  setControlsDisabled(searching);
  resultsStatus.setAttribute("aria-busy", String(searching));
  if (!searching) cancelButton.hidden = true;
}

function showPlaces(places, origin, radius) {
  const where = formatRadius(radius) + " of " + origin.label;

  if (places.length === 0) {
    showStatus("empty", "No food places found within " + where + ". Try a larger radius or a different place. " +
      "OpenStreetMap may not have every place mapped yet.");
    return;
  }

  const shownPlaces = places.slice(0, MAX_PLACES_SHOWN);
  shownPlaces.forEach(addPlace);

  if (places.length > shownPlaces.length) {
    showStatus("success", "Found " + places.length + " food places within " + where +
      ". Showing the nearest " + shownPlaces.length + ".");
  } else {
    showStatus("success", "Showing " + shownPlaces.length + (shownPlaces.length === 1 ? " food place" : " food places") +
      " within " + where + ".");
  }
}

// The search itself. "getOrigin" is a function that finds the location
// (by name or by GPS). Both buttons use this same code.
async function runSearch(getOrigin, loadingMessage, buttonToRefocus) {
  if (isSearching) return; // a search is already running
  if (!mapIsReady) return; // the map is still loading

  setSearching(true);
  userCancelled = false;
  clearResults();

  try {
    showStatus("loading", loadingMessage);
    const origin = await getOrigin();
    currentOrigin = origin;

    const radius = ALLOWED_RADIUSES.includes(Number(radiusSelect.value)) ? Number(radiusSelect.value) : 1000;
    showOrigin(origin, radius);

    showStatus("loading", "Checking your location against the local restaurant database...");
    const places = await getFoodPlaces(origin, radius);
    showPlaces(places, origin, radius);
  } catch (error) {
    if (error.code === undefined) console.error("Unexpected error:", error);
    showStatus(error.code === "cancelled" ? "info" : "error", getFriendlyMessage(error));
  } finally {
    setSearching(false);
    // Disabled buttons lose keyboard focus, so put it back
    if (document.activeElement === document.body) buttonToRefocus.focus();
  }
}

// ==========================================================
// 9. Button handlers
// ==========================================================

// Runs when the form is submitted: by pressing the Search button (or Enter in the box)
function handleSearchSubmit(event) {
  event.preventDefault();

  const queryText = locationInput.value.trim();
  if (queryText === "") {
    showStatus("error", getFriendlyMessage(createError("empty-input")));
    locationInput.focus();
    return;
  }

  runSearch(function () { return lookupLocation(queryText); }, "Looking up \"" + queryText + "\"...", searchButton);
}

function handleLocateClick() {
  runSearch(getBrowserLocation, "Waiting for your browser to share your location...", locateButton);
}

function handleCancelClick() {
  userCancelled = true;
  if (currentController) currentController.abort();
}

// Changing the radius never searches by itself. It only explains what to do next.
function handleRadiusChange() {
  if (currentOrigin !== null && !isSearching) {
    showStatus("info", "Radius changed to " + formatRadius(Number(radiusSelect.value)) +
      ". Press Search or Use My Location to update the results.");
  }
}

// ==========================================================
// 10. Start the page
// ==========================================================

function startRestaurantFinder() {
  // Searching needs the map, so the controls stay off until the map has loaded
  setControlsDisabled(true);

  // The Mapbox script could not be loaded (for example, no internet)
  if (typeof mapboxgl === "undefined") {
    showStatus("error", getFriendlyMessage(createError("map-missing")));
    return;
  }

  try {
    setupMap(getMapboxToken());
  } catch (error) {
    // Token problems carry a code. Anything else (such as no WebGL) becomes "map-failed".
    if (error.code === undefined) console.error("Map error:", error);
    showStatus("error", getFriendlyMessage(error.code ? error : createError("map-failed")));
    return;
  }

  showStatus("loading", "Loading the map...");
  loadLocationCache();

  locationForm.addEventListener("submit", handleSearchSubmit);
  locateButton.addEventListener("click", handleLocateClick);
  cancelButton.addEventListener("click", handleCancelClick);
  radiusSelect.addEventListener("change", handleRadiusChange);

  document.addEventListener("keydown", handleEscapeKey);

  // Stop any request that is still running when the visitor leaves the page
  window.addEventListener("pagehide", function () {
    if (currentController) currentController.abort();
  });
}

startRestaurantFinder();
