Using the basic instructions from CORE.md, I'd like to create a new app for planning family lunch locations.


# Branding/Imagery

- App will be called "Lunch"
- Overall look should be clean and material-styled. Keep colors to theme colors below, and prefer white text and icons against the secondary-color background for all buttons and menu elements.
- Do NOT use emoji *except* for when specifically asked; instead, we'll use FontAwesome icons, loaded via their free CDN kit.
- Icons are all available in the root folder of this project. Use logo-icon.svg for the favicon and installable app icon (since it has the background already in it), and logo-white.svg for the splash screen icon (ensure the background is the primary seafoam color)
- Colors:

Use the following theme, and ensure that colors remain abstract variables (in case we change our mind down the road):

```
:root {
  /* Brand Theme Tokens */
  --color-primary:     #8BCFC5; /* Main brand / Splash background / navbars / table headers/ footers (Seafoam) */
  --color-secondary:   #F38DC8; /* Titles, button backgrounds (Bright Pink) */
  --color-tertiary:    #FFF9A0; /* Background highlights & cards (Sunshine Yellow) */
  --color-accent:      #F9C3EF; /* Subtle accents & secondary highlights (Soft Pink) */
  --color-background:  #FFFFFF; /* Canvas/app background (Pure White) */

  /* Text & Contrast Tokens */
  --color-text-main:   #2B2B2B; /* High-contrast readable text */
  --color-text-light:  #FFFFFF; /* Text for dark/vibrant button backgrounds */
}
```

- Fonts: use sans-serif font globally. We should keep body and title fonts abstracted as CSS variables, even though for the first version they'll probably be the same generic sans-serif typeface.
- Splash screen will be primary color (seafoam) background with a white logo (logo-white.svg) and no title text (since the logo contains the word "Lunch" anyway, so this is redundant).
- Interface should be mobile-first and responsive, with a horizontal navbar at the top with a hamburger menu; per theme instructions, all navbar icons and text will be white against the primary background.

# Interface

This app is basically a manually-curated database of restaurants, added by users. There will be the following pages, navigable via the hamburger menu:

1) Restaurants (primary view)

- Header section, letting users filter (by tag(s), wait time, distance (essentially drive time: "close (<5 min), medium (5-15 minutes), long (15+)"), favorite stars, visited status (never visited, not recently visited — "recently" means within the last 90 days)), sort (by the same parameters, but also add a "shuffle" that just sorts results randomly), and search (text search of restaurant name), and a button to add a new restaurant idea.
    - The star filter is a single dropdown: "Any", minimum-count options ("1+", "2+", ...), and a per-user section ("Starred by Mom", "Starred by Dad", etc., built dynamically from the users table) showing only restaurants that family member has starred. Note: a star is a per-user favorite (like a heart), NOT a rating — a user either stars a restaurant or doesn't.

- Below that, there will be two tabs available, one for that shows restaurants as a table, and one that shows restaurants on a Google Map. Both will fill available space.

- The restaurant table will show rows for each restaurant matching the filters/search:
    - Restaurant name
    - Distance (more below on that)
    - Last visited date
    - Total visits
    - Stars (show a star icon for each user that has favorited that restaurant, in that user's color).
    - Restaurants can be edited (show a little pencil icon) and deleted (confirm, then soft-delete; deleted restaurants can be restored from a "Recently deleted" list on the Configuration page)
    - Visit toggle icon (checkmark) - marks that restaurant as visited today (today only, no date picker; past visits can only be seeded via the "last visit date" field when adding a restaurant). If another user has already marked a restaurant as visited on the same date, only track the original visit (one visit per restaurant per day, family-wide). If the interface already shows it as visited and the user taps again, prompt them and remove the visit from the database.
    - Finally, user can add/remove their favorite star to restaurants they love. 

- The restaurant map will show all restaurants that match the current filters as pins on the map, with the first tags' fontawesome icon as the pin icon, and a small label of the restaurant name above the pin. The map will automatically scale (on initial load and when filters change) to fit all necessary pins, but user can zoom in as needed.

- Adding/editing a restaurant will pop up an editor modal. 
    - Users can start typing a restaurant name, but the interface will search for matching locations in Google Maps API. 
    - System will automatically note the address and lat/lon of the matching location
    - System will also need to calculate "distance" (which is really drive time) of that location from our church, whose address should be configured as a global setting that is echoed into the Javascript interface. Users can manually set or override the distance value if needed, but by default it is calculated client-side via the Google Maps Directions API (plain driving duration, no traffic modeling). Changing the origin address later does NOT recalculate distances for existing restaurants — only newly added/edited ones.
    - User can add one or more tags to the restaurant using a dropdown. Tags typically represent fare (Chinese, Greek, American), but can also indicate things like "Outdoor" (for outdoor dining), etc. Users cannot add new tags here, but must go to the settings screen. 
    - Average wait time (dropdown: "Fast food", "5-15 minutes", "15-30 minutes", "30+ minutes"). Manual entry only — Google does not expose wait/popular times via any API.
    - Hours (on Sunday) - stored as a simple text field, like "9am-9pm". Auto-fill from Google Places opening hours data when available, but keep it editable.
    - Price tier - auto-filled from Google Places price level where available (shown as $-$$$$), but editable
    - Notes - free text (e.g. "kids menu good", "closed Sundays")
    - Can prepopulate last visit date, if known

- "Distance" - as mentioned before, we'll always just store and present distance as drive time in minutes (integer) from church to that location. 

2) A "stats" page, that shows:

    - A top restaurant leaderboard (top 10 all-time visits, also showing a bar graph)
    - New and unvisited (most recent 5)
    - Recent visits - a simple table of the last 10 visits (restaurant, date, who logged it), just to refresh memory

3) Finally, there is a Configuration page (accessible by all users, since we trust everyone) that lets users configure:

    - "Origin" address (we won't call it church, even if that's what it is), used to calculate drive time ("distance") to each restaurant
    - User colors - each users' star color can be changed in one place
    - Tags - users can add/edit available tags. Each tag gets a FontAwesome icon, which the user specifies by typing the icon's name (they research it themselves; provide a convenience link to the FontAwesome free-icon search: https://fontawesome.com/search?ic=free-collection). A live preview of the entered icon should be shown if it resolves.
    - Recently deleted restaurants - a restore list for soft-deleted entries


4) When a user first uses the app, prompt them for their name (just first name) and favorite color (from a dropdown, with lots of choices); that color will be used for favorite star icon colors. Ensure the user's name is in in title case ("Ryan", not "ryan"), and we'll use that as the user identifier, both on the frontend and backend, and in all API calls. Store the user's name in localStorage permanantly, so the user doesn't have to identify themselves again. Again, there is no authentication, so we trust users to self-identify. If a user identifies with the same name on two different devices or browsers, the backend will just assume it's the same user. There is deliberately no "switch user" UI — identity is set once per device/browser.

# Database

Create SQL tables for:
- Users
    - Name
    - Favorite color
    - Timestamps: Last usage, last edit
    - Admin status (we may use that down the road)
- Restaurants (include columns for price tier, notes, and soft-delete (deleted_at))
- Tags
- Visits (a log, but only one visit to a restaurant per day - ignore others)
- Favorites (the per-user stars: a join of user to restaurant)
- Settings / global config (origin address, etc.) - simple key/value store; values can be JSON if that helps

Ensure all entries have a column for each user created the record, along with timestamps.

# Deployment

- Per CORE.md: Docker container on CapRover, deployed via GitHub webhook on `main`. Production domain: lunch.app.ryanroper.com — add it as an allowed HTTP referrer on the existing Google Maps API key, and ensure the Maps JavaScript, Places, and Directions APIs are all enabled on that key's project.
- The shared MariaDB container on CapRover already exists; this app just needs its own database and user provisioned on it.
