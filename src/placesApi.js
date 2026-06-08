import { places as fallbackPlaces } from "./data";
import { isSupabaseConfigured, supabase } from "./supabase";

function normalizePlace(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    address: row.address,
    phone: row.phone || "",
    website: row.website || "",
    hours: row.hours || "Horaires non confirmés",
    lat: Number(row.lat),
    lng: Number(row.lng),
    score: Number(row.score || 0),
    distance: Number(row.distance_km || row.distance || 0),
    photo: row.photo_url || row.photo || "",
    tags: row.tags || [],
    equipment: row.equipment || [],
    reviews: row.reviews || [],
  };
}

export async function fetchPublishedPlaces() {
  if (!isSupabaseConfigured) return fallbackPlaces;

  const { data, error } = await supabase
    .from("published_places_with_stats")
    .select("*")
    .order("score", { ascending: false });

  if (error || !data?.length) {
    if (error) console.info("Supabase places fallback:", error.message);
    return fallbackPlaces;
  }

  return data.map(normalizePlace);
}
