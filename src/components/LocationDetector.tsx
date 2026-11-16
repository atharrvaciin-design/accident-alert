import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, RefreshCw, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react';
import { Coordinates } from '../types';

interface LocationAddressDetails {
  country_code?: string;
  country?: string;
  state?: string;
  city?: string;
  town?: string;
  village?: string;
}

interface LocationDetectorProps {
  coordinates: Coordinates | null;
  address: string;
  onLocationFound: (
    coords: Coordinates,
    resolvedAddress: string,
    details?: LocationAddressDetails
  ) => void;
}

export const LocationDetector: React.FC<LocationDetectorProps> = ({
  coordinates,
  address,
  onLocationFound,
}) => {
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const fetchAddress = async (lat: number, lon: number) => {
    try {
      const response = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`);
      if (response.ok) {
        const data = await response.json();
        return {
          address: data.address || `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
          details: data.details as LocationAddressDetails | undefined,
        };
      }
    } catch (e) {
      console.warn('Address lookup error:', e);
    }
    return {
      address: `Lat: ${lat.toFixed(5)}, Lng: ${lon.toFixed(5)}`,
      details: undefined,
    };
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords: Coordinates = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };

        const result = await fetchAddress(coords.latitude, coords.longitude);
        onLocationFound(coords, result.address, result.details);
        setIsLocating(false);
      },
      async (err) => {
        console.warn('GPS location error:', err.message);
        setGeoError('GPS signal weak or permission required. Using approximate emergency default.');
        // Fallback default coordinates (e.g. city center)
        const fallbackCoords: Coordinates = {
          latitude: 37.774929,
          longitude: -122.419416,
          accuracy: 50,
        };
        const result = await fetchAddress(fallbackCoords.latitude, fallbackCoords.longitude);
        onLocationFound(
          fallbackCoords,
          result.address || 'Market St & 8th St, San Francisco, CA',
          result.details || { country_code: 'us', country: 'United States', state: 'California', city: 'San Francisco' }
        );
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  };

  // Run initial auto-detection on mount
  useEffect(() => {
    if (!coordinates) {
      detectLocation();
    }
  }, []);

  const googleMapsUrl = coordinates
    ? `https://www.google.com/maps?q=${coordinates.latitude},${coordinates.longitude}`
    : '#';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-300 rounded-xl">
            <MapPin className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-blue-950 dark:text-white">Automatic Live Location</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Real-time GPS lock for emergency response units</p>
          </div>
        </div>

        <button
          type="button"
          onClick={detectLocation}
          disabled={isLocating}
          className="p-2 text-slate-600 dark:text-slate-300 hover:text-blue-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition flex items-center gap-1 text-xs font-semibold cursor-pointer disabled:opacity-50"
          title="Refresh GPS Location"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin text-blue-600 dark:text-blue-400' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {geoError && (
        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{geoError}</span>
        </div>
      )}

      {coordinates ? (
        <div className="space-y-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                Detected Address
              </span>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 break-words leading-relaxed">
                {address || 'Fetching street address...'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">Latitude</span>
              <div className="font-mono font-semibold text-slate-700 dark:text-slate-300">{coordinates.latitude.toFixed(6)}°</div>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">Longitude</span>
              <div className="font-mono font-semibold text-slate-700 dark:text-slate-300">{coordinates.longitude.toFixed(6)}°</div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Navigation className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              GPS Accuracy: ±{Math.round(coordinates.accuracy || 10)}m
            </span>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <span>View on Google Maps</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      ) : (
        <div className="py-4 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
          <span>Detecting your satellite coordinates...</span>
        </div>
      )}
    </div>
  );
};
