Using the basic instructions from CORE.md, I'd like to create a new app for planning family lunch locations.


# Branding/Imagery

- App will be called "Lunch"
- Overall look should be clean and material-styled. Keep colors to theme colors below, and prefer white text and icons against the secondary-color background for all buttons and menu elements.
- Do NOT use emoji *except* for when specifically asked; instead, we'll 
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

- Header section, letting users filter (by tag(s), wait time, distance (essentially drive time: "close (<5 min), medium (5-15 minutes), long (15+)"), number of favorite stars (we have 6 family members/users that can star their favorite restaurants), visited status (never visited, not recently visited)), sort (by the same parameters, but also add a "shuffle" that just sorts results randomly), and search (text search of restaurant name), and a button to add a new restaurant idea.

- Below that, there will be two tabs available, one for that shows restaurants as a table, and one that shows restaurants on a Google Map. Both will fill available space.

- The restaurant table will show rows for each restaurant matching the filters/search:
    - Restaurant name
    - Distance (more below on that)
    - Last visited date
    - Total visits
    - Stars (show star icons for each user that has favorited that restaurant). 
    - Restaurants can be edited (show a little pencil icon) and deleted (confirm, and then only soft-delete - so we can undo it if needed)
    - Visit toggle icon (checkmark) - marks that restaurant as visited. If another user has already marked a restaurant as visited on the same date, only track the original visit. If the interface already shows it as visited and the user taps again, prompt them and remove the visit from the database.
    - Finally, user can add/remove their favorite star to restaurants they love. 

- The restaurant map will show all restaurants that match the current filters as pins on the map, with the first tags' fontawesome icon as the pin icon, and a small label of the restaurant name above the pin. The map will automatically scale (on initial load and when filters change) to fit all necessary pins, but user can zoom in as needed.

- Adding/editing a restaurant will pop up an editor modal. 
    - Users can start typing a restaurant name, but the interface will search for matching locations in Google Maps API. 
    - System will automatically note the address and lat/lon of the matching location
    - System will also need to calculate "distance" (which is really drive time) of that location from our church, whose address should be configured as a global setting that is echoed into the Javascript interface. Users can manually set or override the distance value if needed, but try to use Google Maps directions to calculate the drive time.
    - User can add one or more tags to the restaurant using a dropdown. Tags typically represent fare (Chinese, Greek, American), but can also indicate things like "Outdoor" (for outdoor dining), etc. Users cannot add new tags here, but must go to the settings screen. 
    - Average wait time (dropdown: "Fast food", "5-15 minutes", "15-30 minutes", "30+ minutes"). It'd be great if we could pull this from Google Maps, too, but I'm pessimistic - and it should be manually editable.
    - Hours (on Sunday) - we'll just store this as a text field, like "9am-9pm". Again, it'd be nice to pull from Google, but no worries.
    - Can prepopulate last visit date, if known

- "Distance" - as mentioned before, we'll always just store and present distance as drive time in minutes (integer) from church to that location. 

2) A "stats" page, that shows:

    - A top restaurant leaderboard (top 10 all-time visits, also showing a bar graph)
    - New and unvisited (most recent 5)

3) Finally, there is a Configuration page (accessible by all users, since we trust everyone) that lets users configure:

    - "Origin" address (we won't call it church, even if that's what it is), used to calculate drive time ("distance") to each restaurant
    - User colors - each users' star color can be changed in one place
    - Tags - users can add/edit available tags, choosing a fontawesome icon for each


4) When a user first uses the app, prompt them for their name (just first name) and favorite color (from a dropdown, with lots of choices); that color will be used for favorite star icon colors. Ensure the user's name is in in title case ("Ryan", not "ryan"), and we'll use that as the user identifier, both on the frontend and backend, and in all API calls. Store the user's name in localStorage permanantly, so the user doesn't have to identify themselves again. Again, there is no authentication, so we trust users to self-identify. If a user identifies with the same name on two different devices or browsers, the backend will just assume it's the same user.

# Database

Create SQL tables for:
- Users
    - Name
    - Favorite color
    - Timestamps: Last usage, last edit
    - Admin status (we may use that down the road)
- Restaurants
- Tags
- Visits (a log, but only one visit to a restaurant per day - ignore others)
- Global settings (origin address, etc.) - if it helps, we can stuff these into a big JSON object.

Ensure all entries have a column for each user created the record, along with timestamps.
