import { WeatherHazardInfo } from '../types';

// Default EMS Headquarters coordinates (or dynamic reference point)
const DEFAULT_EMS_STATION = {
  latitude: 37.7749,
  longitude: -122.4194,
  name: 'Central EMS Response Station #1',
};

/**
 * Compute Haversine distance in kilometers between two GPS coordinates
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number = DEFAULT_EMS_STATION.latitude,
  lon2: number = DEFAULT_EMS_STATION.longitude
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Calculate realistic emergency responder ETA in minutes
 * Average urban emergency speed = 40 km/h + 2 min turnout prep
 */
export function calculateResponderEta(
  reportLat: number,
  reportLng: number,
  stationLat?: number,
  stationLng?: number
): { distanceKm: number; etaMinutes: number } {
  const distanceKm = calculateDistanceKm(
    reportLat,
    reportLng,
    stationLat ?? DEFAULT_EMS_STATION.latitude,
    stationLng ?? DEFAULT_EMS_STATION.longitude
  );

  // Speed = 40 km/h -> 1 km takes 1.5 min, plus 2 min preparation
  const etaMinutes = Math.max(3, Math.round(distanceKm * 1.5 + 2));
  return { distanceKm, etaMinutes };
}

/**
 * Fetch real-time weather at accident site using Open-Meteo
 */
export async function fetchWeatherHazard(
  latitude: number,
  longitude: number
): Promise<WeatherHazardInfo | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(
      4
    )}&longitude=${longitude.toFixed(
      4
    )}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m`;

    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    const current = data.current;

    const weatherCode = current?.weather_code ?? 0;
    const tempC = Math.round(current?.temperature_2m ?? 20);
    const humidity = Math.round(current?.relative_humidity_2m ?? 50);
    const precipitationMm = current?.precipitation ?? 0;
    const windKph = Math.round(current?.wind_speed_10m ?? 12);

    let conditionText = 'Clear / Dry';
    let isHazardous = false;
    let hazardReason: string | undefined;

    if (weatherCode >= 95) {
      conditionText = 'Severe Thunderstorm';
      isHazardous = true;
      hazardReason = 'Thunderstorm & Lightning Hazard — Slippery Roadway';
    } else if (weatherCode >= 71) {
      conditionText = 'Snow / Freezing Conditions';
      isHazardous = true;
      hazardReason = 'Icy Roadway / Snow Hazard — Reduced Braking Traction';
    } else if (weatherCode >= 51 || precipitationMm > 0.5) {
      conditionText = 'Rain / Wet Roadway';
      isHazardous = true;
      hazardReason = 'Wet Pavement & Hydroplaning Hazard';
    } else if (weatherCode === 45 || weatherCode === 48) {
      conditionText = 'Fog / Reduced Visibility';
      isHazardous = true;
      hazardReason = 'Dense Fog — Critical Visibility Impairment';
    } else if (windKph > 45) {
      conditionText = 'High Winds';
      isHazardous = true;
      hazardReason = 'High Cross-Winds Alert';
    } else if (weatherCode >= 1 && weatherCode <= 3) {
      conditionText = 'Partly Cloudy';
    }

    return {
      tempC,
      weatherCode,
      conditionText,
      windKph,
      humidity,
      precipitationMm,
      isHazardous,
      hazardReason,
    };
  } catch (e) {
    console.warn('Weather hazard fetch error (non-fatal):', e);
    return null;
  }
}
