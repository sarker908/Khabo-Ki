/* ==========================================================
   Khabo Ki? - Mapbox configuration

   Put your PUBLIC Mapbox token here. A public token starts with "pk."

   SECURITY RULES
   1. NEVER put a secret token (it starts with "sk.") in this file or
      anywhere in the website. Anyone can read these files in the browser.
   2. A public token is meant to be visible, so protect it with URL
      restrictions in your Mapbox account (Access tokens page):
        - while developing: allow your local server address (localhost)
        - before publishing: allow only your GitHub Pages address
   3. Mapbox does NOT allow URL restrictions on your account's
      "Default public token". Create a NEW public token, add the URL
      restrictions to that one, and paste the new token below.
   4. A token with URL restrictions returns "403" in tools such as curl
      or Postman. That is expected: it only works from the allowed sites.
   ========================================================== */

const MAPBOX_CONFIG = {
  accessToken: "pk.eyJ1Ijoibmlsb3ktc2Fya2VyNzgiLCJhIjoiY213bjhpcGxrMDgyNDJ6c2Q5NTZybnp4MSJ9.Cpsx0FG9ccU5n40B1fkMxA"
};
