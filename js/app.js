/* ==========================================================
   Khabo Ki? - main JavaScript
   Handles: mobile menu, smooth scrolling, button actions,
   "coming soon" messages, missing-image fallbacks, food cards,
   favourite hearts and the Favourites page.
   ========================================================== */

// ----- Grab the page elements we need -----
const navToggle = document.getElementById("nav-toggle");
const navMenu = document.getElementById("nav-menu");
const toast = document.getElementById("toast");

let toastTimer; // remembers the timer so messages don't overlap

// ----- Mobile menu -----
function setMenuOpen(isOpen) {
  navMenu.classList.toggle("open", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
}

navToggle.addEventListener("click", function () {
  setMenuOpen(!navMenu.classList.contains("open"));
});

// Close the menu with the Escape key
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") setMenuOpen(false);
});

// ----- Smooth scrolling -----
function scrollToSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) section.scrollIntoView({ behavior: "smooth" });
}

// Every link that starts with "#" scrolls smoothly and closes the mobile menu
document.querySelectorAll('a[href^="#"]').forEach(function (link) {
  link.addEventListener("click", function (event) {
    event.preventDefault();
    scrollToSection(link.getAttribute("href").slice(1));
    setMenuOpen(false);
  });
});

// Buttons with data-scroll-to="section-id" scroll to that section
document.querySelectorAll("[data-scroll-to]").forEach(function (button) {
  button.addEventListener("click", function () {
    scrollToSection(button.dataset.scrollTo);
  });
});

// ----- Temporary "coming soon" messages -----
function showMessage(text) {
  if (!toast) return; // this page has no message bar
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    toast.classList.remove("show");
  }, 3500);
}

// Buttons with data-coming-soon="Feature name" show a placeholder message.
// Later stages will replace these with the real features.
document.querySelectorAll("[data-coming-soon]").forEach(function (button) {
  button.addEventListener("click", function () {
    showMessage(button.dataset.comingSoon + " is coming in a later stage. Stay tuned!");
  });
});

// ----- Missing image fallback -----
// If a photo file is not in the images/ folder yet, show the emoji instead.
function showImageFallback(image) {
  image.closest(".image-frame").classList.add("image-missing");
}

// Sets up the fallback for one image (also used for generated food cards)
function setupImageFallback(image) {
  image.addEventListener("error", function () {
    showImageFallback(image);
  });
  // The image may have already failed before this script ran
  if (image.complete && image.naturalWidth === 0) showImageFallback(image);
}

document.querySelectorAll(".image-frame img").forEach(setupImageFallback);

// ----- Popular foods (built from data/foods.json) -----
// These ids come from the catalogue. Change the list to show other foods.
const POPULAR_FOOD_IDS = [1, 2, 3, 4, 5, 6];

// Emoji shown when a food photo is missing, chosen by category
const CATEGORY_EMOJIS = {
  "Bangladeshi": "🍛",
  "Fast Food": "🍔",
  "Street Food": "🥟",
  "Snacks": "🍟",
  "Desserts": "🍮",
  "Drinks": "🥤"
};

// ----- Favourite (heart) buttons -----
// The saving itself is done by js/favorites.js. These functions only
// draw the heart and keep it in step with the saved list.

// Outline of a heart, drawn inside a 24 x 24 SVG
const HEART_PATH = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

// Makes a heart button look right for the current saved state
function updateFavoriteButton(button) {
  const saved = isFavorite(button.dataset.foodId);
  const label = saved
    ? "Remove " + button.dataset.foodName + " from favourites"
    : "Add " + button.dataset.foodName + " to favourites";

  button.classList.toggle("is-favorite", saved); // filled heart when saved
  button.setAttribute("aria-label", label);
  button.title = saved ? "Remove from favourites" : "Add to favourites";

  // The large button on the food details page also shows its words
  const visibleText = button.querySelector(".favorite-button-text");
  if (visibleText) {
    visibleText.textContent = saved ? "Remove from favourites" : "Add to favourites";
  }
}

// Updates every heart on the page (the same food can appear in more than one place)
function syncFavoriteButtons() {
  document.querySelectorAll(".favorite-button").forEach(updateFavoriteButton);
}

// Runs when a heart is clicked
function handleFavoriteClick(button) {
  const foodId = Number(button.dataset.foodId);
  const isNowFavorite = toggleFavorite(foodId);

  syncFavoriteButtons();

  // Small visual confirmation: the heart pops, and a short message appears
  if (isNowFavorite) {
    button.classList.add("is-popping");
    setTimeout(function () { button.classList.remove("is-popping"); }, 400);
  }
  showMessage(button.dataset.foodName + (isNowFavorite ? " added to favourites" : " removed from favourites"));

  // Tells other code on the page (the Favourites page) that something changed
  document.dispatchEvent(new CustomEvent("favoritesChanged", {
    detail: { foodId: foodId, isFavorite: isNowFavorite }
  }));
}

// Pass true as the second value to also show words next to the heart
// (the food details page does this; the small card hearts do not).
function createFavoriteButton(food, showText = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "favorite-button";
  button.dataset.foodId = food.id;
  button.dataset.foodName = food.name;

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute("d", HEART_PATH);
  icon.appendChild(shape);
  button.appendChild(icon);

  if (showText) {
    button.classList.add("has-text");
    const visibleText = document.createElement("span");
    visibleText.className = "favorite-button-text";
    button.appendChild(visibleText);
  }

  updateFavoriteButton(button);
  button.addEventListener("click", function () {
    handleFavoriteClick(button);
  });
  return button;
}

// Builds one food card. Same structure as the Stage 1 cards, so the
// existing CSS works. textContent is used so food text is never run as HTML.
// The image and the food name both link to the food's details page.
// (The whole card is not a link, so the heart button keeps working.)
// Pass true as the second value to also show the food's description
// (the Explore Foods page does this; the homepage does not).
function createFoodCard(food, showDescription = false) {
  const card = document.createElement("article");
  card.className = "food-card";
  card.dataset.foodId = food.id;
  const detailsUrl = getFoodDetailsUrl(food.id);

  const frame = document.createElement("figure");
  frame.className = "image-frame";
  frame.dataset.emoji = CATEGORY_EMOJIS[food.category] || "🍽️";

  const image = document.createElement("img");
  image.src = food.image;
  image.alt = food.name;
  image.loading = "lazy";
  image.width = 400;
  image.height = 260;
  frame.appendChild(image);
  setupImageFallback(image);

  // Clicking the picture opens the details page. Keyboard users use the
  // name link below instead, so this one is skipped when pressing Tab.
  const imageLink = document.createElement("a");
  imageLink.className = "food-card-image-link";
  imageLink.href = detailsUrl;
  imageLink.tabIndex = -1;
  imageLink.setAttribute("aria-hidden", "true");
  imageLink.appendChild(frame);

  const info = document.createElement("div");
  info.className = "food-info";

  const name = document.createElement("h3");
  const nameLink = document.createElement("a");
  nameLink.href = detailsUrl;
  nameLink.textContent = food.name;
  name.appendChild(nameLink);

  const price = document.createElement("p");
  price.className = "food-price";
  price.textContent = formatPriceRange(food);

  const category = document.createElement("p");
  category.className = "food-category";
  category.textContent = food.category;

  info.append(name);

  if (showDescription) {
    const description = document.createElement("p");
    description.className = "food-description";
    description.textContent = food.description;
    info.append(description);
  }

  info.append(price, category);
  card.append(imageLink, info, createFavoriteButton(food));
  return card;
}

// Loads the catalogue, then shows the popular foods
async function showPopularFoods() {
  const statusMessage = document.getElementById("food-status");
  const foodGrid = document.getElementById("popular-food-grid");

  try {
    await loadFoods();

    // Keep only the foods listed in POPULAR_FOOD_IDS
    const popularFoods = POPULAR_FOOD_IDS
      .map(getFoodById)
      .filter(function (food) { return food !== undefined; });

    popularFoods.forEach(function (food) {
      foodGrid.appendChild(createFoodCard(food));
    });

    statusMessage.hidden = true;
  } catch (error) {
    // The message explains how to fix the problem (use Live Server)
    statusMessage.textContent = error.message;
    statusMessage.classList.add("is-error");
  }
}

// Only run on the homepage (explore.html has no popular foods grid)
if (document.getElementById("popular-food-grid")) {
  showPopularFoods();
}

// ----- Favourites page (favorites.html) -----
let favoritePageReady = false; // becomes true once the foods have loaded

// Shows the count, or the empty message when nothing is left
function updateFavoritePageState() {
  const cardCount = document.getElementById("favorites-grid").children.length;
  document.getElementById("favorites-empty").hidden = cardCount > 0;
  document.getElementById("favorites-count").textContent = cardCount === 0
    ? ""
    : cardCount + (cardCount === 1 ? " favourite food" : " favourite foods");
}

// Builds every favourite card from the saved ids.
// An id that is not in the catalogue is skipped.
function renderFavoriteFoods() {
  const favoriteFoods = getFavorites()
    .map(getFoodById)
    .filter(function (food) { return food !== undefined; });

  document.getElementById("favorites-grid").replaceChildren(
    ...favoriteFoods.map(function (food) { return createFoodCard(food, true); })
  );
  updateFavoritePageState();
}

// Removes one card after its heart was clicked
function removeFavoriteCard(foodId) {
  const grid = document.getElementById("favorites-grid");
  const card = grid.querySelector('article.food-card[data-food-id="' + foodId + '"]');
  if (!card) return;

  const neighbour = card.nextElementSibling || card.previousElementSibling;
  card.remove();
  updateFavoritePageState();

  // Keep keyboard focus on the page instead of losing it
  if (neighbour) {
    neighbour.querySelector(".favorite-button").focus();
  } else {
    document.getElementById("favorites-explore-link").focus();
  }
}

async function showFavoritePage() {
  const statusMessage = document.getElementById("favorites-status");

  try {
    await loadFoods(); // from food-data.js

    statusMessage.hidden = true;
    renderFavoriteFoods();
    favoritePageReady = true;

    // When a heart is un-clicked here, remove its card
    document.addEventListener("favoritesChanged", function (event) {
      if (!event.detail.isFavorite) removeFavoriteCard(event.detail.foodId);
    });
  } catch (error) {
    // The message explains how to fix the problem (use Live Server)
    statusMessage.textContent = error.message;
    statusMessage.classList.add("is-error");
  }
}

// Only run on the favourites page
if (document.getElementById("favorites-grid")) {
  showFavoritePage();
}

// ----- Keeping hearts in step with the saved list -----
// Called when favourites may have been changed from somewhere else.
function refreshFavoritesFromStorage() {
  syncFavoriteButtons();
  if (favoritePageReady) renderFavoriteFoods();
}

// 1. Another browser tab changed the favourites ("storage" fires in the OTHER tabs)
window.addEventListener("storage", function (event) {
  if (event.key === FAVORITES_STORAGE_KEY || event.key === null) {
    refreshFavoritesFromStorage();
  }
});

// 2. The visitor pressed Back and the browser showed a saved copy of the page
window.addEventListener("pageshow", function (event) {
  if (event.persisted) refreshFavoritesFromStorage();
});


// ----- Homepage hero slideshow -----
function initHeroSlideshow() {
  const slideshow = document.querySelector(".hero-slideshow");
  if (!slideshow) return;

  const slides = Array.from(slideshow.querySelectorAll(".hero-slide"));
  const dots = Array.from(slideshow.querySelectorAll(".hero-slide-dot"));
  if (slides.length < 2 || slides.length !== dots.length) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let activeIndex = 0;
  let timerId = null;
  let isPaused = false;

  function showSlide(index) {
    activeIndex = (index + slides.length) % slides.length;

    slides.forEach(function (slide, slideIndex) {
      const isActive = slideIndex === activeIndex;
      slide.classList.toggle("is-active", isActive);
      slide.setAttribute("aria-hidden", String(!isActive));
    });

    dots.forEach(function (dot, dotIndex) {
      const isActive = dotIndex === activeIndex;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-pressed", String(isActive));
    });
  }

  function stopTimer() {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    if (reduceMotion || isPaused || document.hidden) return;
    timerId = window.setInterval(function () {
      showSlide(activeIndex + 1);
    }, 5000);
  }

  dots.forEach(function (dot, index) {
    dot.addEventListener("click", function () {
      showSlide(index);
      startTimer();
    });
  });

  slideshow.addEventListener("mouseenter", function () {
    isPaused = true;
    stopTimer();
  });
  slideshow.addEventListener("mouseleave", function () {
    isPaused = false;
    startTimer();
  });
  slideshow.addEventListener("focusin", function () {
    isPaused = true;
    stopTimer();
  });
  slideshow.addEventListener("focusout", function (event) {
    if (!slideshow.contains(event.relatedTarget)) {
      isPaused = false;
      startTimer();
    }
  });
  document.addEventListener("visibilitychange", startTimer);

  showSlide(0);
  startTimer();
}

initHeroSlideshow();

// ----- Homepage restaurant directory and popular places -----
const HOME_RESTAURANT_DATA_URL = new URL("../data/khabo_ki_bangladesh.json", document.currentScript.src).href;
const HOME_RESTAURANT_PAGE_SIZE = 18;
const HOME_POPULAR_RESTAURANTS = [
  { match: /^KFC$/i, display: "KFC" },
  { match: /^Domino's$/i, display: "Domino's" },
  { match: /^Pizza Hut$/i, display: "Pizza Hut" },
  { match: /^Sultan's Dine$/i, display: "Sultan's Dine" },
  { match: /^Chillox$/i, display: "Chillox" },
  { match: /^North End Coffee Roasters$/i, display: "North End Coffee Roasters" },
  { match: /^Gloria Jean's$/i, display: "Gloria Jean's Coffees" },
  { match: /^Madchef$/i, display: "Madchef" },
  { match: /^Kacchi Bhai$/i, display: "Kacchi Bhai" },
  { match: /^Handi$/i, display: "Handi" },
  { match: /^BFC$/i, display: "BFC" },
  { match: /^Secret Recipe$/i, display: "Secret Recipe" }
];

function homeRestaurantCategory(place) {
  const raw = String(place.category || "").trim();
  if (raw && !/^unknown$/i.test(raw)) {
    return raw.split(/[;_]/).map(function (part) {
      return part.trim().replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
    }).filter(Boolean).join(", ");
  }
  const type = String(place.type || "").toLowerCase();
  return type === "cafe" ? "Cafe" : type === "fast_food" ? "Fast Food" : "Restaurant";
}

function createHomeRestaurantCard(place, popular) {
  const card = document.createElement("article");
  card.className = popular ? "home-restaurant-card is-popular" : "home-restaurant-card";
  const title = document.createElement("h3");
  title.textContent = place.name;
  const label = document.createElement("p");
  label.textContent = place.category;

  card.append(title, label);

  if (!popular) {
    const visitedButton = document.createElement("button");
    visitedButton.type = "button";
    visitedButton.className = "home-visited-toggle";
    visitedButton.addEventListener("click", function () {
      const visited = toggleVisitedPlace(place);
      syncHomeVisitedButton(visitedButton, visited);
    });
    syncHomeVisitedButton(visitedButton, isPlaceVisited(place.key));
    card.appendChild(visitedButton);
  }

  return card;
}

function syncHomeVisitedButton(button, visited) {
  button.classList.toggle("is-visited", visited);
  button.textContent = visited ? "✓ VISITED" : "MARK VISITED";
  button.setAttribute("aria-pressed", String(visited));
  button.setAttribute("aria-label", visited ? "Remove from My Food Journey" : "Mark as visited and add to My Food Journey");
}

async function loadHomepageRestaurants() {
  const directory = document.getElementById("home-restaurant-grid");
  if (!directory) return;
  const status = document.getElementById("home-restaurant-status");
  const search = document.getElementById("home-restaurant-search");
  const moreButton = document.getElementById("home-restaurant-more");
  const popularGrid = document.getElementById("popular-restaurant-grid");
  let allPlaces = [];
  let filteredPlaces = [];
  let visibleCount = HOME_RESTAURANT_PAGE_SIZE;

  try {
    const response = await fetch(HOME_RESTAURANT_DATA_URL);
    if (!response.ok) throw new Error("Restaurant data could not be loaded. Please refresh the page.");
    const records = await response.json();
    if (!Array.isArray(records)) throw new Error("The restaurant dataset has an invalid format.");

    allPlaces = records.reduce(function (places, place, index) {
      const type = String(place && place.type || "").toLowerCase();
      if (!place || typeof place.name !== "string" || !place.name.trim() ||
          !["restaurant", "cafe", "fast_food"].includes(type)) return places;

      const category = String(place.category || "").trim();
      const typeLabel = type === "cafe" ? "Café" : type === "fast_food" ? "Fast food" : "Restaurant";
      places.push({
        key: "local/" + index,
        name: place.name.trim(),
        displayName: place.name.trim(),
        category: homeRestaurantCategory(place),
        categoryLabel: typeLabel,
        cuisine: category && !/^unknown$/i.test(category) ? category : "",
        type: typeLabel,
        lat: Number(place.latitude),
        lon: Number(place.longitude)
      });
      return places;
    }, []);

    const seenPopular = new Set();
    HOME_POPULAR_RESTAURANTS.forEach(function (item) {
      const found = allPlaces.find(function (place) {
        return item.match.test(place.name) && !seenPopular.has(item.display.toLowerCase());
      });
      if (found) {
        seenPopular.add(item.display.toLowerCase());
        popularGrid.appendChild(createHomeRestaurantCard({ name: item.display, category: found.category }, true));
      }
    });

    function renderDirectory() {
      directory.replaceChildren();
      const current = filteredPlaces.slice(0, visibleCount);
      current.forEach(function (place) {
        directory.appendChild(createHomeRestaurantCard(place, false));
      });
      status.textContent = filteredPlaces.length
        ? "Showing " + current.length + " of " + filteredPlaces.length + " restaurants and cafes."
        : "No restaurants matched your search.";
      moreButton.hidden = visibleCount >= filteredPlaces.length;
    }

    function applySearch() {
      const query = search.value.trim().toLowerCase();
      filteredPlaces = !query ? allPlaces : allPlaces.filter(function (place) {
        return place.name.toLowerCase().includes(query) || place.category.toLowerCase().includes(query);
      });
      visibleCount = HOME_RESTAURANT_PAGE_SIZE;
      renderDirectory();
    }

    search.addEventListener("input", applySearch);
    moreButton.addEventListener("click", function () {
      visibleCount += HOME_RESTAURANT_PAGE_SIZE;
      renderDirectory();
    });
    applySearch();
  } catch (error) {
    status.textContent = error.message || "Could not load the restaurant dataset.";
    status.classList.add("is-error");
  }
}

loadHomepageRestaurants();
