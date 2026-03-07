// ── MapView: 2D Mapbox map with rental pins ──

import { useRef, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { useAppState } from '../context/AppContext';
import type { Rental } from '../types';
import rentals from '../data/rentals.json';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

// Toronto center
const DEFAULT_CENTER: [number, number] = [-79.3832, 43.6532];
const DEFAULT_ZOOM = 11;

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const { selectRental } = useAppState();

  const handlePinClick = useCallback(
    (rental: Rental) => {
      const map = mapRef.current;
      if (!map) return;

      // Zoom into the rental location
      map.flyTo({
        center: [rental.lng, rental.lat],
        zoom: 17,
        duration: 800,
        essential: true,
      });

      // Wait for zoom, then trigger transition
      setTimeout(() => selectRental(rental), 850);
    },
    [selectRental]
  );

  useEffect(() => {
    if (!mapContainer.current) return;

    if (!MAPBOX_TOKEN) {
      // Show fallback if no token
      mapContainer.current.innerHTML = `
        <div style="
          display: flex; align-items: center; justify-content: center;
          width: 100%; height: 100%;
          background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #0a0a1a 100%);
          color: #64748b; font-family: Inter, sans-serif; text-align: center;
          padding: 2rem;
        ">
          <div>
            <div style="font-size: 3rem; margin-bottom: 1rem;">🗺️</div>
            <h2 style="color: #e2e8f0; font-size: 1.25rem; margin-bottom: 0.5rem;">Mapbox Token Required</h2>
            <p style="font-size: 0.875rem; max-width: 400px;">
              Add <code style="color: #00f5ff;">VITE_MAPBOX_TOKEN</code> to your <code>.env</code> file to enable the map.
              <br/><br/>You can still click any rental card below to see the 3D diorama.
            </p>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin-top: 1.5rem;">
              ${(rentals as Rental[]).map(r => `
                <button 
                  data-rental-id="${r.id}"
                  style="
                    padding: 0.5rem 1rem; border-radius: 8px;
                    background: rgba(0, 245, 255, 0.1); border: 1px solid rgba(0, 245, 255, 0.3);
                    color: #00f5ff; cursor: pointer; font-size: 0.75rem;
                    transition: all 0.2s;
                  "
                  onmouseover="this.style.background='rgba(0, 245, 255, 0.2)'"
                  onmouseout="this.style.background='rgba(0, 245, 255, 0.1)'"
                >
                  ${r.address}
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      // Attach click handlers to fallback buttons
      const buttons = mapContainer.current.querySelectorAll('[data-rental-id]');
      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-rental-id');
          const rental = (rentals as Rental[]).find(r => r.id === id);
          if (rental) selectRental(rental);
        });
      });

      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 0,
      antialias: false,
      preserveDrawingBuffer: false,
      fadeDuration: 0,
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      // Add rental markers
      (rentals as Rental[]).forEach(rental => {
        // Create custom pin element
        const el = document.createElement('div');
        el.className = 'pin-marker';
        el.title = rental.address;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          handlePinClick(rental);
        });

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([rental.lng, rental.lat])
          .setPopup(
            new mapboxgl.Popup({
              offset: 20,
              closeButton: false,
              maxWidth: '250px',
            }).setHTML(`
              <div style="font-family: Inter, sans-serif;">
                <div style="font-weight: 600; font-size: 0.875rem; margin-bottom: 4px; color: #f1f5f9;">
                  ${rental.address}
                </div>
                <div style="display: flex; gap: 8px; font-size: 0.75rem; color: #94a3b8;">
                  <span style="color: #00f5ff; font-weight: 600;">$${rental.price}/mo</span>
                  <span>•</span>
                  <span>${rental.bedrooms} bed</span>
                  <span>•</span>
                  <span>${rental.sqft} sqft</span>
                </div>
                <div style="margin-top: 8px; font-size: 0.7rem; color: #64748b;">
                  Click to explore in 3D →
                </div>
              </div>
            `)
          )
          .addTo(map);

        markersRef.current.push(marker);
      });
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      // Force-release the WebGL context before Three.js needs one
      const canvas = map.getCanvas();
      const gl = canvas?.getContext('webgl') || canvas?.getContext('webgl2');
      if (gl) {
        const ext = gl.getExtension('WEBGL_lose_context');
        ext?.loseContext();
      }
      map.remove();
      mapRef.current = null;
    };
  }, [handlePinClick, selectRental]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Title Overlay */}
      <div className="absolute top-6 left-6 z-10 pointer-events-none">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          <span className="gradient-text">Avenue-X</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1 font-light">
          3D Rental Decision Engine • Toronto & Waterloo
        </p>
      </div>

      {/* Legend */}
      <div className="absolute bottom-6 left-6 z-10 glass-card px-4 py-3 pointer-events-none">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-neon-cyan shadow-[0_0_6px_rgba(0,245,255,0.5)]" />
            <span>Available Rental</span>
          </div>
          <span className="text-slate-600">|</span>
          <span>Click a pin to explore</span>
        </div>
      </div>
    </div>
  );
}
