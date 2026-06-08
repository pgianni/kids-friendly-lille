import React, { useEffect, useMemo, useRef, useState } from "react";
import { boards, categoryMeta, filters, places } from "./data";
import { googleMapStyle } from "./googleMapStyle";
import { LILLE_CENTER, googlePinIcon, loadGoogleMaps, scoreLabel } from "./mapUtils";
import { isSupabaseConfigured, supabase } from "./supabase";

function PlaceCard({ place, onOpen, stacked = false }) {
  const [label, scoreClass, dot] = scoreLabel(place.score);
  return (
    <button className={stacked ? "stack-card" : "place-card"} type="button" onClick={() => onOpen(place.id)}>
      <img src={place.photo} alt="" loading="lazy" />
      <span className={stacked ? "stack-card-body" : "place-card-body"}>
        <span className="place-meta">
          {categoryMeta[place.category].icon} {place.category} · {place.distance.toFixed(1)} km
        </span>
        <h3>{place.name}</h3>
        <span className={`score-pill ${scoreClass}`}>
          {dot} {place.score}/100 · {label}
        </span>
      </span>
    </button>
  );
}

function PlaceSheet({ place, favorite, onClose, onFavorite, onContribute }) {
  if (!place) return <aside className="sheet" aria-hidden="true" />;
  const [label, scoreClass, dot] = scoreLabel(place.score);

  return (
    <aside className="sheet is-open" aria-hidden="false">
      <div className="sheet-handle" />
      <div className="hero">
        <img src={place.photo} alt="" />
        <button className="sheet-close" type="button" onClick={onClose} aria-label="Fermer la fiche">
          ×
        </button>
        <div className="hero-content">
          <span className={`score-pill ${scoreClass}`}>
            {dot} {place.score} / 100 · {label}
          </span>
          <h2>{place.name}</h2>
          <p>
            {categoryMeta[place.category].icon} {place.category} · {place.distance.toFixed(1)} km
          </p>
          <div className="hero-actions">
            <button className="action-btn" type="button" onClick={onFavorite}>
              {favorite ? "❤️ Retirer" : "♡ Ajouter"}
            </button>
            <a className="secondary-btn" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`} target="_blank" rel="noreferrer">
              📍 Itinéraire
            </a>
          </div>
        </div>
      </div>

      <section className="sheet-section">
        <h3>Équipements</h3>
        <div className="equipment-list">
          {place.equipment.map(([icon, name, count]) => (
            <div className="equipment-item" key={name}>
              <span>{icon}</span>
              <strong>{name}</strong>
              <small>{count} parents</small>
            </div>
          ))}
        </div>
        <div className="action-row sheet-actions">
          <button className="secondary-btn" type="button" onClick={() => onContribute("Table à langer")}>
            🚼 Confirmer
          </button>
          <button className="secondary-btn" type="button" onClick={() => onContribute("Chaise bébé")}>
            🪑 Confirmer
          </button>
        </div>
      </section>

      <section className="sheet-section">
        <h3>Avis parents</h3>
        <div className="reviews">
          {place.reviews.map((review) => (
            <article className="review-card" key={`${review.author}-${review.age}`}>
              <strong>{review.author}</strong>
              <div className="review-grid">
                <div><span>Accueil</span>{"★".repeat(review.welcome)}{"☆".repeat(5 - review.welcome)}</div>
                <div><span>Confort</span>{"★".repeat(review.comfort)}{"☆".repeat(5 - review.comfort)}</div>
                <div><span>Équipements</span>{"★".repeat(review.gear)}{"☆".repeat(5 - review.gear)}</div>
                <div><span>Âge</span>{review.age}</div>
              </div>
              <p>{review.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sheet-section">
        <h3>Informations</h3>
        <div className="info-list">
          <div>📍 {place.address}</div>
          <div>🕒 {place.hours}</div>
          <a href={`tel:${place.phone.replaceAll(" ", "")}`}>☎ {place.phone}</a>
          <a href={place.website} target="_blank" rel="noreferrer">🌐 Site web</a>
        </div>
      </section>
    </aside>
  );
}

export default function App() {
  const mapEl = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const clusterMarker = useRef(null);
  const userMarker = useRef(null);
  const providerBadge = useRef(null);
  const mapType = useRef(null);

  const [activeView, setActiveView] = useState("mapView");
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(12);
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  const [favorites, setFavorites] = useState(() => new Set(JSON.parse(localStorage.getItem("kidsFriendlyFavorites") || "[]")));
  const [user, setUser] = useState(null);
  const [toast, setToast] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [contribution, setContribution] = useState(null);
  const [board, setBoard] = useState("week");

  const visiblePlaces = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return places.filter((place) => {
      const matchesQuery = !needle || [place.name, place.address, place.category].join(" ").toLowerCase().includes(needle);
      const matchesFilters = [...activeFilters].every((filter) => place.tags.includes(filter) || place.category === filter);
      return matchesQuery && matchesFilters;
    });
  }, [activeFilters, query]);

  const selectedPlace = places.find((place) => place.id === selectedPlaceId);
  const signedIn = Boolean(user);

  function showToast(message) {
    setToast(message);
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => setToast(""), 2300);
  }

  function requireAuth(action) {
    if (signedIn) action();
    else {
      setPendingAction(() => action);
      setAuthMode("signin");
      setAuthOpen(true);
    }
  }

  function clearMapMarkers() {
    if (mapType.current === "google") {
      markers.current.forEach((marker) => marker.setMap(null));
      if (clusterMarker.current) clusterMarker.current.setMap(null);
    }
    if (mapType.current === "leaflet") {
      markers.current.forEach((marker) => marker.remove());
      if (clusterMarker.current) clusterMarker.current.remove();
    }
    markers.current = [];
    clusterMarker.current = null;
  }

  function setProviderBadge(text) {
    if (!providerBadge.current) {
      providerBadge.current = document.createElement("div");
      providerBadge.current.className = "map-provider";
      mapEl.current.append(providerBadge.current);
    }
    providerBadge.current.textContent = text;
  }

  function setMapZoom(nextZoom) {
    const safeZoom = Math.max(9, Math.min(17, nextZoom));
    setZoom(safeZoom);
    if (mapType.current === "google") map.current.setZoom(safeZoom);
    if (mapType.current === "leaflet") map.current.setZoom(safeZoom);
  }

  function fitPlaces(items) {
    if (!map.current || items.length <= 1) return;
    if (mapType.current === "google") {
      const bounds = new window.google.maps.LatLngBounds();
      items.forEach((place) => bounds.extend({ lat: place.lat, lng: place.lng }));
      map.current.fitBounds(bounds, 54);
    }
    if (mapType.current === "leaflet") {
      map.current.fitBounds(items.map((place) => [place.lat, place.lng]), { padding: [28, 28], maxZoom: 13 });
    }
  }

  function renderCluster(items) {
    const center = items.reduce((acc, place) => ({ lat: acc.lat + place.lat / items.length, lng: acc.lng + place.lng / items.length }), { lat: 0, lng: 0 });
    if (mapType.current === "google") {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="58" height="58" viewBox="0 0 58 58"><circle cx="29" cy="29" r="26" fill="#006b5f" stroke="#ffffff" stroke-width="4"/></svg>`;
      const marker = new window.google.maps.Marker({
        position: center,
        map: map.current,
        icon: { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new window.google.maps.Size(58, 58), labelOrigin: new window.google.maps.Point(29, 30) },
        label: { text: String(items.length), color: "#ffffff", fontWeight: "900" },
      });
      marker.addListener("click", () => setMapZoom(12));
      clusterMarker.current = marker;
    }
    if (mapType.current === "leaflet") {
      clusterMarker.current = window.L.marker([center.lat, center.lng], {
        icon: window.L.divIcon({ className: "leaflet-cluster-icon", html: String(items.length), iconSize: [58, 58], iconAnchor: [29, 29] }),
      }).addTo(map.current).on("click", () => setMapZoom(12));
    }
  }

  function renderMapMarkers(items) {
    if (!map.current) return;
    clearMapMarkers();
    if (zoom <= 10 && items.length > 3) {
      renderCluster(items);
      return;
    }

    if (mapType.current === "google") {
      items.forEach((place) => {
        const marker = new window.google.maps.Marker({
          position: { lat: place.lat, lng: place.lng },
          map: map.current,
          title: `${place.name} - ${place.score}/100`,
          icon: googlePinIcon(place.score),
          label: { text: categoryMeta[place.category].icon, fontSize: "20px" },
          optimized: false,
        });
        marker.addListener("click", () => openPlace(place.id));
        markers.current.push(marker);
      });
    }

    if (mapType.current === "leaflet") {
      items.forEach((place) => {
        const [, scoreClass] = scoreLabel(place.score);
        const marker = window.L.marker([place.lat, place.lng], {
          title: `${place.name} - ${place.score}/100`,
          icon: window.L.divIcon({ className: `leaflet-kf-icon ${scoreClass}`, html: `<span>${categoryMeta[place.category].icon}</span>`, iconSize: [44, 44], iconAnchor: [22, 38] }),
        }).addTo(map.current).on("click", () => openPlace(place.id));
        markers.current.push(marker);
      });
    }
  }

  function refreshMapLayout() {
    if (!map.current) return;
    if (mapType.current === "google") window.google.maps.event.trigger(map.current, "resize");
    if (mapType.current === "leaflet") map.current.invalidateSize();
  }

  function openPlace(id) {
    const place = places.find((item) => item.id === id);
    setSelectedPlaceId(id);
    if (!place || !map.current) return;
    if (mapType.current === "google") map.current.panTo({ lat: place.lat, lng: place.lng });
    if (mapType.current === "leaflet") map.current.setView([place.lat, place.lng], Math.max(zoom, 13), { animate: true });
  }

  function locateUser() {
    if (!navigator.geolocation) {
      showToast("Géolocalisation indisponible.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (mapType.current === "google") {
          if (userMarker.current) userMarker.current.setMap(null);
          userMarker.current = new window.google.maps.Marker({
            position: pos,
            map: map.current,
            title: "Votre position",
            icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#1b6cff", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 4 },
          });
          map.current.panTo(pos);
        }
        if (mapType.current === "leaflet") {
          if (userMarker.current) userMarker.current.remove();
          userMarker.current = window.L.circleMarker([pos.lat, pos.lng], { radius: 8, fillColor: "#1b6cff", fillOpacity: 1, color: "#ffffff", weight: 4 }).addTo(map.current);
          map.current.panTo([pos.lat, pos.lng]);
        }
        showToast("Carte centrée sur votre position.");
      },
      () => showToast("Position non autorisée. Lille centre affiché."),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
    );
  }

  useEffect(() => {
    document.body.classList.toggle("map-active", activeView === "mapView");
    if (activeView === "mapView") window.setTimeout(() => { refreshMapLayout(); fitPlaces(visiblePlaces); }, 80);
  }, [activeView]);

  useEffect(() => {
    let disposed = false;
    async function initMap() {
      try {
        await loadGoogleMaps();
        if (disposed) return;
        mapType.current = "google";
        map.current = new window.google.maps.Map(mapEl.current, {
          center: LILLE_CENTER,
          zoom,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          mapTypeControl: false,
          styles: googleMapStyle,
        });
        map.current.addListener("zoom_changed", () => setZoom(Math.round(map.current.getZoom())));
        map.current.addListener("click", () => setSelectedPlaceId(null));
        setProviderBadge("Google Maps");
      } catch {
        if (disposed || !window.L) return;
        mapType.current = "leaflet";
        map.current = window.L.map(mapEl.current, { center: [LILLE_CENTER.lat, LILLE_CENTER.lng], zoom, zoomControl: false, attributionControl: true });
        window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map.current);
        map.current.on("zoomend", () => setZoom(Math.round(map.current.getZoom())));
        map.current.on("click", () => setSelectedPlaceId(null));
        setProviderBadge("OpenStreetMap - ajoute ?gmapsKey=... pour Google Maps");
      }
      window.setTimeout(() => { refreshMapLayout(); fitPlaces(visiblePlaces); renderMapMarkers(visiblePlaces); locateUser(); }, 120);
    }
    initMap();
    window.addEventListener("resize", refreshMapLayout);
    return () => {
      disposed = true;
      window.removeEventListener("resize", refreshMapLayout);
      if (mapType.current === "leaflet") map.current?.remove();
      clearMapMarkers();
    };
  }, []);

  useEffect(() => {
    renderMapMarkers(visiblePlaces);
  }, [visiblePlaces, zoom]);

  useEffect(() => {
    localStorage.setItem("kidsFriendlyFavorites", JSON.stringify([...favorites]));
  }, [favorites]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUser(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  function toggleFilter(id) {
    setActiveFilters((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    window.setTimeout(() => fitPlaces(visiblePlaces), 0);
  }

  function toggleFavorite() {
    if (!selectedPlace) return;
    requireAuth(() => {
      setFavorites((current) => {
        const next = new Set(current);
        if (next.has(selectedPlace.id)) {
          next.delete(selectedPlace.id);
          showToast("Lieu retiré des favoris.");
        } else {
          next.add(selectedPlace.id);
          showToast("Lieu ajouté aux favoris.");
        }
        return next;
      });
    });
  }

  async function submitLogin(event) {
    event.preventDefault();
    setAuthError("");

    if (!isSupabaseConfigured) {
      setAuthError("Supabase n'est pas encore configuré. Ajoute VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");
    setAuthLoading(true);

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          setAuthOpen(false);
          showToast("Compte créé et connecté.");
          if (pendingAction) pendingAction();
          setPendingAction(null);
        } else {
          setAuthOpen(false);
          showToast("Compte créé. Vérifie ton email pour valider l'inscription.");
        }
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setAuthOpen(false);
      showToast("Connecté.");
      if (pendingAction) pendingAction();
      setPendingAction(null);
    } catch (error) {
      setAuthError(error.message || "Connexion impossible.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleAccountClick() {
    if (!signedIn) {
      setAuthMode("signin");
      setAuthOpen(true);
      return;
    }

    if (isSupabaseConfigured) await supabase.auth.signOut();
    setUser(null);
    showToast("Compte déconnecté.");
  }

  return (
    <>
      <div className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">MEL en famille</p>
            <h1>Kids Friendly Lille</h1>
          </div>
          <button className="icon-btn" type="button" aria-label="Compte" onClick={handleAccountClick}>
            <span>👤</span>
          </button>
        </header>

        <main>
          <section className={`view view-map ${activeView === "mapView" ? "is-active" : ""}`} id="mapView" aria-labelledby="mapTitle">
            <div className="search-row">
              <label className="search-box" htmlFor="searchInput">
                <span>⌕</span>
                <input id="searchInput" type="search" placeholder="Lieu, quartier, équipement" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <button className="icon-btn locate" type="button" aria-label="Me localiser" onClick={locateUser}>⌖</button>
            </div>

            <div className="filter-strip" aria-label="Filtres rapides">
              {filters.map((filter) => (
                <button className={`chip ${activeFilters.has(filter.id) ? "is-active" : ""}`} type="button" key={filter.id} onClick={() => toggleFilter(filter.id)}>
                  {filter.icon} {filter.label}
                </button>
              ))}
            </div>

            <div className="map-panel" aria-labelledby="mapTitle">
              <h2 id="mapTitle" className="sr-only">Carte</h2>
              <div className="map-canvas" ref={mapEl} role="application" aria-label="Carte interactive des lieux Kids Friendly" />
            </div>

            <div className="place-rail" aria-label="Lieux recommandés">
              {visiblePlaces.length ? visiblePlaces.map((place) => <PlaceCard key={place.id} place={place} onOpen={openPlace} />) : <div className="empty-state">Aucun lieu ne correspond à ces filtres.</div>}
            </div>
          </section>

          <section className={`view ${activeView === "favoritesView" ? "is-active" : ""}`} id="favoritesView" aria-labelledby="favoritesTitle">
            <div className="section-head"><p className="eyebrow">Favoris</p><h2 id="favoritesTitle">Mes lieux</h2></div>
            <div className="stack-list">
              {places.filter((place) => favorites.has(place.id)).length ? places.filter((place) => favorites.has(place.id)).map((place) => <PlaceCard key={place.id} place={place} onOpen={openPlace} stacked />) : <div className="empty-state">Aucun favori enregistré.</div>}
            </div>
          </section>

          <section className={`view ${activeView === "leaderboardView" ? "is-active" : ""}`} id="leaderboardView" aria-labelledby="leaderboardTitle">
            <div className="section-head"><p className="eyebrow">Communauté</p><h2 id="leaderboardTitle">Classement</h2></div>
            <div className="segment" role="tablist" aria-label="Période">
              {["week", "month", "global"].map((key) => <button className={board === key ? "is-selected" : ""} key={key} type="button" onClick={() => setBoard(key)}>{key === "week" ? "Semaine" : key === "month" ? "Mois" : "Global"}</button>)}
            </div>
            <div className="leaderboard">
              {boards[board].map(([name, points, badge], index) => <article className="leader-row" key={name}><strong>#{index + 1}</strong><div><strong>{name}</strong><span>{badge}</span></div><strong>{points}</strong></article>)}
            </div>
            <div className="badge-grid">
              <article><strong>Explorateur</strong><span>12 validations</span></article>
              <article><strong>Parent Expert</strong><span>40 validations</span></article>
              <article><strong>Ambassadeur Lille</strong><span>100 validations MEL</span></article>
              <article><strong>Chasseur de pépites</strong><span>5 lieux publiés</span></article>
            </div>
          </section>

          <section className={`view ${activeView === "submitView" ? "is-active" : ""}`} id="submitView" aria-labelledby="submitTitle">
            <div className="section-head"><p className="eyebrow">Contribution</p><h2 id="submitTitle">Proposer un lieu</h2></div>
            <form className="submit-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; requireAuth(() => { form.reset(); showToast("Proposition envoyée pour validation admin."); }); }}>
              <label>Nom du lieu<input required name="name" placeholder="Ex. Café poussette" /></label>
              <label>Adresse<input required name="address" placeholder="Rue, ville" /></label>
              <label>Catégorie<select name="category">{Object.keys(categoryMeta).map((category) => <option key={category}>{category}</option>)}</select></label>
              <label>Pourquoi ce lieu ?<textarea name="note" rows="4" placeholder="Équipements, accueil, accès poussette" /></label>
              <button className="primary-btn" type="submit">Envoyer pour validation</button>
            </form>
          </section>
        </main>

        <nav className="bottom-nav" aria-label="Navigation principale">
          {[["mapView", "🗺", "Carte"], ["favoritesView", "❤️", "Favoris"], ["leaderboardView", "🏆", "Top"], ["submitView", "＋", "Lieu"]].map(([id, icon, label]) => (
            <button className={activeView === id ? "is-active" : ""} key={id} type="button" onClick={() => { setActiveView(id); setSelectedPlaceId(null); }}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>
      </div>

      <PlaceSheet
        place={selectedPlace}
        favorite={selectedPlace ? favorites.has(selectedPlace.id) : false}
        onClose={() => setSelectedPlaceId(null)}
        onFavorite={toggleFavorite}
        onContribute={(equipment) => requireAuth(() => setContribution({ place: selectedPlace.name, equipment }))}
      />

      {authOpen && (
        <dialog className="modal" open>
          <form className="modal-card" onSubmit={submitLogin}>
            <button className="close-btn" type="button" onClick={() => { setAuthOpen(false); setAuthError(""); }} aria-label="Fermer">×</button>
            <p className="eyebrow">Supabase Auth</p>
            <h2>{authMode === "signin" ? "Connexion" : "Créer un compte"}</h2>
            <label>Email<input name="email" type="email" required placeholder="parent@example.com" /></label>
            <label>Mot de passe<input name="password" type="password" required minLength="6" placeholder="••••••••" /></label>
            {authError && <p className="form-error">{authError}</p>}
            <button className="primary-btn" disabled={authLoading}>{authLoading ? "Patiente..." : authMode === "signin" ? "Se connecter" : "Créer le compte"}</button>
            <button className="text-btn" type="button" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthError(""); }}>
              {authMode === "signin" ? "Créer un compte" : "J'ai déjà un compte"}
            </button>
          </form>
        </dialog>
      )}

      {contribution && (
        <dialog className="modal" open>
          <form className="modal-card" onSubmit={(event) => { event.preventDefault(); setContribution(null); showToast("Validation ajoutée. +5 points."); }}>
            <button className="close-btn" type="button" onClick={() => setContribution(null)} aria-label="Fermer">×</button>
            <p className="eyebrow">{contribution.place}</p>
            <h2>Y a-t-il : {contribution.equipment} ?</h2>
            <div className="quick-vote">
              <button type="submit">Oui</button>
              <button type="submit">Non</button>
              <button type="submit">Je ne sais pas</button>
            </div>
          </form>
        </dialog>
      )}

      <div className={`toast ${toast ? "is-visible" : ""}`} role="status" aria-live="polite">{toast}</div>
    </>
  );
}
