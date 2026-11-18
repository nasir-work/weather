# Atmos Weather Dashboard

Local, responsive weather dashboard using live Open-Meteo, MET Norway Locationforecast, and DMI Forecast EDR data. No API keys are required.

## Run locally

Requires Node.js 20 or newer.

```powershell
npm start
```

Open <http://localhost:4173>. Browser geolocation works on localhost. The first visit requests location permission. If permission is denied or unavailable, Atmos uses Copenhagen (55.6761, 12.5683). Search for another place in the top bar; the last manually selected place and preferences are stored in this browser's local storage.

## Install on Android

Deploy the app to an HTTPS URL, open that URL in Chrome on Android, then choose **Install app** from the browser menu. Chrome may also show the app's own **Install app** button once its install criteria are met. The installed app opens in a standalone window. The web app manifest and service worker cache the interface shell; live forecasts still require a network connection. For local development, `http://localhost:4173` is treated as a secure context, but a phone cannot use the computer's localhost address—deploy it over HTTPS or use an HTTPS development tunnel.

## Render deployment

The included `render.yaml` configures a Node web service on Render's free plan. Put this folder at the root of a Git repository, connect that repository to Render, and create a Blueprint from `render.yaml`. Render will ask for `MET_USER_AGENT`; use a unique app URL and contact, for example `AtmosWeatherDashboard/1.0 (https://YOUR-SERVICE.onrender.com; mailto:YOUR-EMAIL)`. The service exposes the Node API and dashboard on the same HTTPS origin. The free web service may spin down after inactivity, so its first request after idle can take longer.

For MET Norway, set `MET_USER_AGENT` to a unique application identifier and a contact address before deployment. Example:

```powershell
$env:MET_USER_AGENT = 'AtmosWeatherDashboard/1.0 (https://your-domain.example; mailto:you@example.com)'
npm start
```

Serve the app behind HTTPS in production. The app makes provider requests through the small Node server, which sets the MET Norway User-Agent and caches successful JSON responses for ten minutes. Configure the reverse proxy to forward `/api/*` and static paths to this Node process.

## APIs used

- **DMI HARMONIE DINI SF**, documented Forecast EDR `/v1/forecastedr/collections/harmonie_dini_sf/position` with `crs=crs84`. The collection metadata is the authority for accepted parameter names.
- **MET Norway Locationforecast 2.0**, `/weatherapi/locationforecast/2.0/complete`.
- **Open-Meteo Forecast API**, `/v1/forecast`, best-match model, automatic timezone, hourly and daily variables. Its Geocoding API resolves manual place searches.
- **OpenStreetMap Nominatim reverse geocoding** identifies the nearest named area after device location is granted.

## Data and known limitations

- Open-Meteo supplies the dashboard's 7-day hourly and daily views. The hourly view defaults to 48 hours and can expand to the full seven days.
- MET Norway provides up to nine days and apparent temperature; its API may omit precipitation probability for some steps. Values remain unavailable when omitted.
- DMI HARMONIE EDR currently provides only the available model time range (usually about 60 hours). Its collection does not expose apparent temperature or snow probability in the queried surface variables. Those are shown as unavailable rather than inferred.
- DMI can return HTTP 429 when its service is busy. A provider error is shown independently and does not block the other forecasts. The first combined request during this build returned a transient 429; a subsequent live request succeeded.
- Provider model cycles are not synchronized. The comparison uses each provider's nearest forecast step to the current time and displays consensus only for available temperatures. Consensus is the median; it is a calculated summary.
- The current conditions panel uses Open-Meteo's `current` response (model-based current weather), not a nearby observation station.
- Official warning feeds are not included; recommendations are clearly presented as application-generated guidance.
- Nominatim and public forecast APIs are external services. Location is requested only on launch when automatic detection is enabled or when the location button is pressed. Location is used to request weather and geocoding only; no location history is sent or stored by the server.
- Open-Meteo forecast and place-search calls run directly from each user's browser. Render's shared outbound IPs can encounter Open-Meteo rate limits earlier than expected; direct browser requests use the visitor's own connection. MET Norway and DMI remain server-side so their source-specific request handling stays centralized.

## Checks performed

- `node --check server.js` and `node --check app.js`.
- Live localhost API smoke check against Open-Meteo and MET Norway at Copenhagen coordinates.
- Live DMI EDR request and collection metadata check. The metadata query verified supported HARMONIE parameter names; the final live data request succeeded with 61 hourly time steps.
- Browser rendering on Android Chrome, denial behavior, and interaction testing require a browser/device session with geolocation permission controls; they were not available in this environment.
