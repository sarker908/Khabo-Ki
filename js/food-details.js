/* ==========================================================
   Khabo Ki? - Food Details page (Stage 6)

   One page shows ANY food. The food is chosen by the address:
     food-details.html?id=1   ->  food number 1
     food-details.html?id=7   ->  food number 7

   This file reuses:
   - js/food-data.js: loadFoods(), getFoodById(), getRelatedFoods(),
                      formatPriceRange()
   - js/app.js:       createFavoriteButton(), createFoodCard(),
                      setupImageFallback(), CATEGORY_EMOJIS
   ========================================================== */

// ----- Page elements -----
const detailsStatus = document.getElementById("details-status");
const detailsError = document.getElementById("details-error");
const errorTitle = document.getElementById("error-title");
const errorMessage = document.getElementById("error-message");
const foodDetails = document.getElementById("food-details");
const breadcrumbCurrent = document.getElementById("breadcrumb-current");

// ----- 1. Reading the food id from the address -----
// URLSearchParams reads the part after the "?" in the address bar.
// Returns the id as text, or null if there is none.
function getFoodIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

// ----- 2. Error message -----
function showError(title, message) {
  detailsStatus.hidden = true;
  foodDetails.hidden = true;
  document.getElementById("related-section").hidden = true;

  errorTitle.textContent = title;
  errorMessage.textContent = message;
  detailsError.hidden = false;

  breadcrumbCurrent.textContent = title;
  document.title = title + " | Khabo Ki?";
}

// ----- 3. Showing the food -----
function showFood(food) {
  // Picture. The emoji is shown if the photo file is missing.
  const frame = document.getElementById("details-image-frame");
  const image = document.getElementById("details-image");
  frame.dataset.emoji = CATEGORY_EMOJIS[food.category] || "🍽️";
  image.src = food.image;
  image.alt = food.name;
  setupImageFallback(image); // from app.js

  // Text. textContent is used so food data is never run as HTML.
  document.getElementById("details-category").textContent = food.category;
  document.getElementById("details-name").textContent = food.name;
  document.getElementById("details-description").textContent = food.description;
  document.getElementById("details-price").textContent = formatPriceRange(food);

  // Tags
  const tagList = document.getElementById("details-tags");
  tagList.replaceChildren(...food.tags.map(function (tag) {
    const item = document.createElement("li");
    item.className = "tag";
    item.textContent = tag;
    return item;
  }));

  // Favourites button: the same button the cards use, with words added.
  // app.js keeps it in step with localStorage and other pages.
  const actions = document.getElementById("details-actions");
  actions.prepend(createFavoriteButton(food, true));

  // Page title and breadcrumb
  breadcrumbCurrent.textContent = food.name;
  document.title = food.name + " | Khabo Ki?";

  detailsStatus.hidden = true;
  foodDetails.hidden = false;
}

// ----- 4. Related foods -----
function showRelatedFoods(food) {
  const relatedFoods = getRelatedFoods(food, 3); // from food-data.js
  if (relatedFoods.length === 0) return; // nothing to suggest

  document.getElementById("related-grid").replaceChildren(
    ...relatedFoods.map(function (relatedFood) { return createFoodCard(relatedFood); })
  );
  document.getElementById("related-section").hidden = false;
}

// ----- 5. Start the page -----
async function startDetailsPage() {
  const idText = getFoodIdFromUrl();

  // Check the id BEFORE loading anything
  if (idText === null || idText.trim() === "") {
    showError("No food selected", "Choose a food from Explore Foods to see its details.");
    return;
  }
  // Only whole numbers are allowed (this rejects "abc", "-1", "1.5" and "0x1")
  if (!/^[0-9]+$/.test(idText.trim())) {
    showError("That food link doesn't look right", "Food ids are whole numbers, like food-details.html?id=1.");
    return;
  }

  try {
    await loadFoods(); // from food-data.js
  } catch (error) {
    // The message explains how to fix the problem (use Live Server)
    showError("We couldn't load the food", error.message);
    return;
  }

  const food = getFoodById(idText.trim()); // from food-data.js
  if (food === undefined) {
    showError("Food not found", "We couldn't find a food with id " + idText.trim() + ". It may have been removed.");
    return;
  }

  showFood(food);
  showRelatedFoods(food);
}

startDetailsPage();
