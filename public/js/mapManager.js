let _map = null;
let _geocoder = null;
let _directionsService = null;
let _placesService = null;

export function init() {
  _map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 39.8, lng: -98.5 },
    zoom: 4,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControlOptions: {
      position: google.maps.ControlPosition.RIGHT_CENTER,
    },
    gestureHandling: 'greedy',
  });

  _geocoder = new google.maps.Geocoder();
  _directionsService = new google.maps.DirectionsService();

  return _map;
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
  if (locations.length === 1) {
    _map.setCenter({ lat: locations[0].lat, lng: locations[0].lng });
    _map.setZoom(13);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  locations.forEach(l => bounds.extend({ lat: l.lat, lng: l.lng }));
  _map.fitBounds(bounds, 60);
}

export function makeMarkerIcon(color, iconDef) {
  let inner = '';
  if (iconDef?.path) {
    inner = `<svg x="12" y="12" width="24" height="24" viewBox="0 0 ${iconDef.width} 512"><path fill="white" d="${iconDef.path}"/></svg>`;
  } else if (iconDef?.text) {
    inner = `<text x="24" y="24" text-anchor="middle" dominant-baseline="central" fill="white" font-size="19" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="700">${iconDef.text}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="21" fill="${color}"/>${inner}<circle cx="24" cy="24" r="21" fill="none" stroke="white" stroke-opacity="0.85" stroke-width="2.5"/></svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(48, 48),
    anchor:     new google.maps.Point(24, 24),
  };
}

export function getDirections(from, to) {
  return new Promise((resolve, reject) => {
    _directionsService.route(
      {
        origin:      typeof from === 'string' ? from : { lat: from.lat, lng: from.lng },
        destination: typeof to === 'string'   ? to   : { lat: to.lat,   lng: to.lng   },
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
