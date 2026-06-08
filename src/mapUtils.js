export const LILLE_CENTER = { lat: 50.6372, lng: 3.0633 };

export function scoreLabel(score) {
  if (score >= 85) return ["Kids First", "score-first", "🟢"];
  if (score >= 70) return ["Kids Friendly", "score-friendly", "🟡"];
  return ["Kids OK", "score-ok", "⚪"];
}

export function scoreColor(score) {
  if (score >= 85) return { fill: "#47c878", stroke: "#187344" };
  if (score >= 70) return { fill: "#ffd966", stroke: "#b58400" };
  return { fill: "#ffffff", stroke: "#d6d6cb" };
}

export function googlePinIcon(score) {
  const color = scoreColor(score);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <path d="M24 4C14.6 4 7 11.4 7 20.6c0 11.8 15.3 22.5 16 23a2 2 0 0 0 2 0c.7-.5 16-11.2 16-23C41 11.4 33.4 4 24 4Z" fill="${color.fill}" stroke="${color.stroke}" stroke-width="3"/>
    </svg>
  `;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(44, 44),
    labelOrigin: new window.google.maps.Point(22, 19),
  };
}

export function googleMapsKey() {
  return (
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    window.KIDS_FRIENDLY_GOOGLE_MAPS_KEY ||
    new URLSearchParams(window.location.search).get("gmapsKey") ||
    localStorage.getItem("googleMapsApiKey") ||
    ""
  );
}

export function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve();
  if (window.__kidsFriendlyGoogleMapsPromise) return window.__kidsFriendlyGoogleMapsPromise;

  const key = googleMapsKey();
  if (!key) return Promise.reject(new Error("Missing Google Maps API key"));

  window.__kidsFriendlyGoogleMapsPromise = new Promise((resolve, reject) => {
    window.initKidsFriendlyGoogleMap = () => resolve();

    const existingScript = document.querySelector("script[data-kids-friendly-google-maps]");
    if (existingScript) return;

    const script = document.createElement("script");
    script.dataset.kidsFriendlyGoogleMaps = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=initKidsFriendlyGoogleMap&loading=async`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      window.__kidsFriendlyGoogleMapsPromise = null;
      reject(new Error("Google Maps failed to load"));
    };
    document.head.append(script);
  });

  return window.__kidsFriendlyGoogleMapsPromise;
}
