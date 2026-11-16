import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AccidentReport } from '../types';
import { ExternalLink, Navigation } from 'lucide-react';

interface AccidentMapProps {
  reports: AccidentReport[];
  selectedReport: AccidentReport | null;
  onSelectReport: (report: AccidentReport) => void;
  centerCoordinates?: { lat: number; lng: number } | null;
}

export const AccidentMap: React.FC<AccidentMapProps> = ({
  reports,
  selectedReport,
  onSelectReport,
  centerCoordinates,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialLat = centerCoordinates?.lat ?? 37.7749;
      const initialLng = centerCoordinates?.lng ?? -122.4194;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 13,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clear old markers
    Object.values(markersRef.current).forEach((marker) => marker.remove());
    markersRef.current = {};

    if (reports.length === 0 && centerCoordinates) {
      const userIcon = L.divIcon({
        className: 'custom-user-marker',
        html: `
          <div class="relative flex items-center justify-center">
            <div class="w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg"></div>
            <div class="absolute w-8 h-8 bg-blue-500 rounded-full animate-ping opacity-40"></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const userMarker = L.marker([centerCoordinates.lat, centerCoordinates.lng], { icon: userIcon }).addTo(map);
      userMarker.bindPopup('<b>Your Current Location</b><br>GPS Active').openPopup();
      markersRef.current['user-loc'] = userMarker;
      map.setView([centerCoordinates.lat, centerCoordinates.lng], 14);
      return;
    }

    const bounds = L.latLngBounds([]);

    reports.forEach((report) => {
      if (typeof report.latitude !== 'number' || typeof report.longitude !== 'number') return;

      const isHighPriority = report.priority === 'High' || report.priority === 'Critical';
      const isResolved = report.status === 'Resolved';
      const isInProgress = report.status === 'In Progress';
      // Pinging animation specifically for any report marked as 'Pending' to draw immediate attention
      const isPending = report.status === 'Pending' || (!isResolved && !isInProgress);

      let bgClass = 'bg-amber-500 border-amber-200';
      let pingColorClass = 'bg-amber-400';

      if (isResolved) {
        bgClass = 'bg-green-600 border-green-200';
      } else if (isInProgress) {
        bgClass = 'bg-blue-600 border-blue-200';
      } else {
        // Pending
        if (isHighPriority) {
          bgClass = 'bg-red-600 border-red-200';
          pingColorClass = 'bg-red-500';
        } else {
          bgClass = 'bg-amber-500 border-amber-200';
          pingColorClass = 'bg-amber-400';
        }
      }

      const isSelected = selectedReport?.id === report.id;

      const markerHtml = `
        <div class="relative flex items-center justify-center cursor-pointer group overflow-visible">
          ${
            isPending
              ? `
                <div class="absolute -inset-2 rounded-full ${pingColorClass} opacity-60 animate-subtle-ping pointer-events-none"></div>
                <div class="absolute -inset-2 rounded-full ${pingColorClass} opacity-40 animate-subtle-ping-delayed pointer-events-none"></div>
              `
              : ''
          }
          <div class="relative flex items-center justify-center w-8 h-8 rounded-full ${bgClass} text-white shadow-md border-2 ${
            isSelected ? 'scale-125 ring-4 ring-yellow-400 shadow-yellow-500/50' : ''
          } transition-transform">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
          <div class="absolute -bottom-5 text-[10px] font-bold bg-slate-900 text-white px-1.5 py-0.5 rounded shadow whitespace-nowrap pointer-events-none">
            ${report.reportId.slice(-4)}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-accident-marker',
        html: markerHtml,
        iconSize: [36, 44],
        iconAnchor: [18, 36],
        popupAnchor: [0, -36],
      });

      const marker = L.marker([report.latitude, report.longitude], { icon: customIcon }).addTo(map);

      const popupContent = document.createElement('div');
      popupContent.className = 'p-1 min-w-[210px] max-w-[260px] text-slate-800 dark:text-slate-100';
      popupContent.innerHTML = `
        <div class="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-200 dark:border-slate-700">
          <span class="font-bold text-xs text-blue-950 dark:text-white">${report.reportId}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${
            report.status === 'Resolved'
              ? 'bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300'
              : report.status === 'In Progress'
              ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
              : 'bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-300'
          }">${report.status}</span>
        </div>
        ${
          report.photoUrl
            ? `<div class="mb-2 rounded overflow-hidden max-h-24 bg-slate-100 dark:bg-slate-800">
                <img src="${report.photoUrl}" alt="Accident" class="w-full h-24 object-cover" />
              </div>`
            : ''
        }
        <p class="text-xs text-slate-700 dark:text-slate-200 line-clamp-2 mb-1.5 font-medium">${report.emergencyMessage || 'Accident alert'}</p>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mb-2">📍 ${report.address}</p>
        <div class="flex items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-700">
          <button id="view-details-${report.id}" class="flex-1 bg-blue-900 dark:bg-blue-600 hover:bg-blue-800 dark:hover:bg-blue-500 text-white text-[11px] font-semibold py-1 px-2 rounded text-center transition">
            View Details
          </button>
          <a href="${report.googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 p-1 rounded" title="Open in Google Maps">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </a>
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`view-details-${report.id}`);
        if (btn) {
          btn.onclick = () => {
            onSelectReport(report);
          };
        }
      });

      marker.on('click', () => {
        onSelectReport(report);
      });

      markersRef.current[report.id] = marker;
      bounds.extend([report.latitude, report.longitude]);
    });

    if (reports.length > 0) {
      if (selectedReport && markersRef.current[selectedReport.id]) {
        map.setView([selectedReport.latitude, selectedReport.longitude], 15, { animate: true });
        markersRef.current[selectedReport.id].openPopup();
      } else {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 200);
  }, [reports, selectedReport, centerCoordinates, onSelectReport]);

  return (
    <div className="relative w-full h-full min-h-[360px] rounded-2xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800">
      <div ref={mapContainerRef} className="w-full h-full z-0 min-h-[360px]" />

      {/* Floating map controls & stats */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <Navigation className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>{reports.length} Incident Locations</span>
        </div>
      </div>

      {/* Color legend */}
      <div className="absolute bottom-3 left-3 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-xl shadow border border-slate-200 dark:border-slate-700 text-[11px] flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-semibold">
          <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span className="animate-subtle-ping absolute inline-flex h-3 w-3 rounded-full bg-amber-400 opacity-80 pointer-events-none"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          Pending (Pinging)
        </span>
        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span> In Progress
        </span>
        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-green-600"></span> Resolved
        </span>
      </div>
    </div>
  );
};
