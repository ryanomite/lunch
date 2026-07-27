let _map = null;
let _geocoder = null;
let _directionsService = null;
let _placesService = null;

export function init(origin, mapId) {
  const mapOpts = {
    center: { lat: 39.8, lng: -98.5 },
    zoom: 4,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControlOptions: {
      position: google.maps.ControlPosition.RIGHT_CENTER,
    },
    gestureHandling: 'greedy',
  };
  if (mapId) mapOpts.mapId = mapId;

  _map = new google.maps.Map(document.getElementById('map'), mapOpts);
  _geocoder = new google.maps.Geocoder();
  _directionsService = new google.maps.DirectionsService();

  if (origin) _geocodeOrigin(origin);

  return _map;
}

async function _geocodeOrigin(address) {
  try {
    const result = await _geocoder.geocode({ address });
    if (result.results[0]) {
      _map.setCenter(result.results[0].geometry.location);
      _map.setZoom(11);
    }
  } catch (err) {
    console.warn('Geocode failed:', err.message);
  }
}

export function getMap() { return _map; }

export function createAutocomplete(inputEl, opts = {}) {
  return new google.maps.places.Autocomplete(inputEl, {
    fields: ['geometry', 'name', 'formatted_address', 'place_id', 'opening_hours', 'price_level'],
    ...opts,
  });
}

export function fitBoundsToLocations(locations) {
  if (!locations.length) return;
  const valid = locations.filter(l => Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lng)));
  if (!valid.length) return;
  if (valid.length === 1) {
    _map.setCenter({ lat: Number(valid[0].lat), lng: Number(valid[0].lng) });
    _map.setZoom(13);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  valid.forEach(l => bounds.extend({ lat: Number(l.lat), lng: Number(l.lng) }));
  _map.fitBounds(bounds, 60);
}

export function makeMarkerContent(color, iconDef) {
  let inner = '';
  if (iconDef?.path) {
    inner = `<svg x="12" y="12" width="24" height="24" viewBox="0 0 ${iconDef.width} 512"><path fill="white" d="${iconDef.path}"/></svg>`;
  } else if (iconDef?.text) {
    inner = `<text x="24" y="24" text-anchor="middle" dominant-baseline="central" fill="white" font-size="19" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="700">${iconDef.text}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="21" fill="${color}"/>${inner}<circle cx="24" cy="24" r="21" fill="none" stroke="white" stroke-opacity="0.85" stroke-width="2.5"/></svg>`;
  const el = document.createElement('div');
  el.innerHTML = svg;
  el.style.width = '48px';
  el.style.height = '48px';
  el.style.cursor = 'pointer';
  return el;
}

export function getDirections(from, to) {
  return new Promise((resolve, reject) => {
    const toCoords = typeof to === 'string' ? to
      : { lat: typeof to.lat === 'function' ? to.lat() : to.lat, lng: typeof to.lng === 'function' ? to.lng() : to.lng };
    _directionsService.route(
      {
        origin:      typeof from === 'string' ? from : { lat: from.lat, lng: from.lng },
        destination: toCoords,
        travelMode:  google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK') resolve(result);
        else reject(new Error(`Directions API: ${status}`));
      }
    );
  });
}

export function getPlaceDetails(placeId) {
  if (!_placesService) {
    _placesService = new google.maps.places.PlacesService(_map);
  }
  return new Promise((resolve, reject) => {
    _placesService.getDetails(
      { placeId, fields: ['name', 'formatted_address', 'geometry', 'place_id', 'opening_hours', 'price_level'] },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) resolve(place);
        else reject(new Error(`Places: ${status}`));
      }
    );
  });
}
