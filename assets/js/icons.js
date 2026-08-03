/* ==========================================================================
   Jeu d'icônes vectorielles (aucune image externe, aucun CDN).
   Chaque icône est le contenu d'un <svg viewBox="0 0 24 24"> en mode trait.
   ========================================================================== */

window.MN_ICONS = {
  /* ---- Pièces / prestations ------------------------------------------- */
  "i-headlight": '<path d="M3 8a3 3 0 0 1 3-3h5.5A6.5 6.5 0 0 1 18 11.5v1A6.5 6.5 0 0 1 11.5 19H6a3 3 0 0 1-3-3z"/><path d="M7 9.5h4M7 12.5h5M7 15.5h3"/><path d="M20.5 8.5 22 7M20.5 12H23M20.5 15.5 22 17"/>',
  "i-seat": '<path d="M10.2 2.8h3.6v3.2h-3.6z"/><path d="M9 6h5.6a2 2 0 0 1 2 2.2l-.6 5.3H9.6a2 2 0 0 1-2-1.8l-.5-3.5A2 2 0 0 1 9 6z"/><path d="M7.3 13.5h9.9a2.6 2.6 0 0 1 2.6 2.6v1.4H10a2.6 2.6 0 0 1-2.6-2.6z"/><path d="M10 17.5V21M17.6 17.5V21"/>',
  "i-bumper": '<path d="M2.6 9.6c0-1 .7-1.8 1.7-2l3.3-.5a27 27 0 0 1 8.8 0l3.3.5c1 .2 1.7 1 1.7 2v3.8c0 1-.7 1.8-1.7 2l-3.3.5a27 27 0 0 1-8.8 0l-3.3-.5c-1-.2-1.7-1-1.7-2z"/><path d="M8.2 11h7.6"/><path d="M4.8 13.6h1.8M17.4 13.6h1.8"/>',
  "i-spray": '<path d="M3 7h8v4H3z"/><path d="M5.5 11v3h3v-3"/><path d="M6.5 14 5 20h4l-1.5-6"/><path d="M11 9h3"/><circle cx="17" cy="6" r=".9"/><circle cx="20.5" cy="8.5" r=".9"/><circle cx="17.5" cy="11" r=".9"/>',
  "i-tire-smoke": '<circle cx="10.5" cy="13.5" r="6.5"/><circle cx="10.5" cy="13.5" r="2.6"/><path d="M10.5 7v2.4M10.5 17.6V20M4 13.5h2.4M14.6 13.5H17"/><path d="M15.5 5.5c.8-1.4 2.6-1.6 3.7-.4M18 2.8c.9-.9 2.4-.8 3.2.2"/>',
  "i-tire-offroad": '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/><path d="M12 4v2.4M12 17.6V20M4 12h2.4M17.6 12H20"/><path d="m6.3 6.3 1.7 1.7M16 16l1.7 1.7M17.7 6.3 16 8M8 16l-1.7 1.7"/>',
  "i-wheels-moto": '<circle cx="7.5" cy="12" r="5"/><circle cx="7.5" cy="12" r="1.6"/><circle cx="16.5" cy="12" r="5"/><circle cx="16.5" cy="12" r="1.6"/>',
  "i-wheels-car": '<ellipse cx="12" cy="7" rx="7" ry="2.8"/><path d="M5 7v3.6c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8V7"/><path d="M5 10.6v3.6c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8v-3.6"/><ellipse cx="12" cy="7" rx="2.4" ry="1"/>',
  "i-wheels-truck": '<ellipse cx="12" cy="5.6" rx="8" ry="2.6"/><path d="M4 5.6v3.2c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6V5.6"/><path d="M4 8.8V12c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6V8.8"/><path d="M4 12v3.2c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6V12"/>',
  "i-engine": '<path d="M4 10h3V8h4v2h2.5l2.5 3h4v6h-4l-2 2H6a2 2 0 0 1-2-2z"/><path d="M8.5 5.5h4"/><path d="M10.5 8v2"/>',
  "i-turbo": '<path d="M13 21a8.5 8.5 0 1 0-8.5-8.5"/><path d="M4.5 12.5h6.2a2.4 2.4 0 1 0-2.4-2.4"/><path d="M13 21h7.5"/>',
  "i-suspension": '<path d="M8 3.5h8M8 20.5h8"/><path d="M8.5 6.5h7l-7 3h7l-7 3h7l-7 3h7"/><path d="M12 3.5v2M12 18.5v2"/>',
  "i-brake": '<circle cx="10.5" cy="12" r="7"/><circle cx="10.5" cy="12" r="2.4"/><path d="M17.5 8.5h1A2.5 2.5 0 0 1 21 11v2a2.5 2.5 0 0 1-2.5 2.5h-1z"/><path d="M10.5 5.4v1.5M10.5 17.1v1.5M3.9 12h1.5"/>',
  "i-gearbox": '<circle cx="12" cy="12" r="3.4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><path d="m5.2 5.2 2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/>',
  "i-nitro": '<path d="M10 3.5h4V6l1.2 2.4V19a2.5 2.5 0 0 1-2.5 2.5h-1.4A2.5 2.5 0 0 1 8.8 19V8.4L10 6z"/><path d="M8.8 12.5h6.4"/><path d="M18 6c1.6 1.4 1.8 3.4.6 4.8"/>',
  "i-window": '<path d="m3 16.5 3.2-9.5h11.6l3.2 9.5z"/><path d="M12 7v9.5"/><path d="M6.5 12h11"/>',
  "i-armor": '<path d="m12 3 8 2.8v5.9c0 4.8-3.3 7.8-8 9.3-4.7-1.5-8-4.5-8-9.3V5.8z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  "i-light": '<path d="M5 7.5h14l2.2 5.5H2.8z"/><path d="M6.5 16.5h11M8.5 20h7"/>',
  "i-sticker": '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8l-6 6H6a2 2 0 0 1-2-2z"/><path d="M20 14h-4a2 2 0 0 0-2 2v4"/>',
  "i-key": '<circle cx="7.5" cy="15.5" r="3.5"/><path d="m10 13 8-8 3 3-2 2-2-2-1.5 1.5 2 2-2.5 2.5"/>',
  "i-wrench": '<path d="M15.5 3.5a5.5 5.5 0 0 0-5 7.7L3.8 17.9a2 2 0 0 0 2.8 2.8l6.7-6.7A5.5 5.5 0 1 0 15.5 3.5z"/><path d="m15 3.8 3.2 3.2-2.4 2.4-3.2-3.2z"/>',
  "i-box": '<path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2z"/><path d="M4 7.2 12 11.5l8-4.3M12 11.5V21"/>',

  /* ---- Grades ---------------------------------------------------------- */
  "i-crown": '<path d="m3 17 1.4-9.4 4.3 3.6L12 5.2l3.3 6 4.3-3.6L21 17z"/><path d="M3.6 20h16.8"/>',
  "i-star": '<path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"/>',
  "i-badge": '<path d="M12 2.6 5.5 5v6.4c0 4 2.7 6.9 6.5 8.4 3.8-1.5 6.5-4.4 6.5-8.4V5z"/><path d="m9.4 11.4 1.9 1.9 3.4-3.6"/>',
  "i-helmet": '<path d="M3.6 15.5a8.4 8.4 0 0 1 16.8 0z"/><path d="M9.5 15.5V6.4a1.6 1.6 0 0 1 1.6-1.6h1.8a1.6 1.6 0 0 1 1.6 1.6v9.1"/><path d="M2.6 18.4h18.8"/>',
  "i-stripes": '<path d="m5 8 7 3.4L19 8"/><path d="m5 12.5 7 3.4 7-3.4"/><path d="m5 17 7 3.4 7-3.4"/>',
  "i-clipboard": '<rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 4.5V3.4a1.4 1.4 0 0 1 1.4-1.4h3.2A1.4 1.4 0 0 1 15 3.4v1.1z"/><path d="M8.8 11h6.4M8.8 15h4.4"/>',

  /* ---- Ressources ------------------------------------------------------ */
  "r-plastic": '<rect x="4" y="4.5" width="16" height="15" rx="2"/><path d="m7 9 4 4M13 9l4 4M7 16l3-3"/>',
  "r-coal": '<path d="m4 14.5 3.2-7.4L12.5 5l6 4 2 5.8-4 4.2H8z"/><path d="m9.5 9 3 4.2-2 5"/>',
  "r-metal": '<path d="m3 16.5 3.2-5.2h11.6L21 16.5z"/><path d="M6.2 11.3 7.8 8h8.4l1.6 3.3"/>',
  "r-rubber": '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/>',
  "r-glass": '<path d="M5 4h14v9.5A6.5 6.5 0 0 1 12.5 20H5z"/><path d="m9 8 4 4-3 4"/>',
  "r-chip": '<rect x="7" y="7" width="10" height="10" rx="1.2"/><path d="M10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5"/>',
  "r-fuel": '<path d="M5 6.5h10v14H5z"/><path d="M15 9.5h2.5A1.5 1.5 0 0 1 19 11v5.5"/><path d="M8 3.5h4v3H8z"/><path d="M7.5 10h5"/>',
  "r-cloth": '<path d="m4 6.5 4-2.5 4 2 4-2 4 2.5v4l-3 1v9H7v-9l-3-1z"/>',
  "r-screw": '<path d="M12 3v13"/><path d="M9 16h6l-3 5z"/><path d="M9.5 6h5M9.5 9h5M9.5 12h5"/>',
  "r-paint": '<path d="m5.5 7.5 1.4 12h10.2l1.4-12z"/><path d="M5.5 7.5c0-1.4 2.9-2.5 6.5-2.5s6.5 1.1 6.5 2.5"/><path d="M9 11.5h6"/>',
  "r-wood": '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 8v8M11 8v8M15 8v8"/>',
  "r-gold": '<path d="m3 17 2.6-4.5h12.8L21 17z"/><path d="M6.4 12.5 8 8.5h8l1.6 4"/><path d="M11 10.5h2"/>'
};

/* Regroupement pour le sélecteur d'icônes du panneau admin. */
window.MN_ICON_GROUPS = {
  "Grades": [
    "i-crown", "i-star", "i-badge", "i-helmet", "i-stripes",
    "i-clipboard", "i-key", "i-wrench", "i-armor"
  ],
  "Pièces & prestations": [
    "i-headlight", "i-seat", "i-bumper", "i-spray", "i-tire-smoke", "i-tire-offroad",
    "i-wheels-moto", "i-wheels-car", "i-wheels-truck", "i-engine", "i-turbo",
    "i-suspension", "i-brake", "i-gearbox", "i-nitro", "i-window", "i-armor",
    "i-light", "i-sticker", "i-key", "i-wrench", "i-box"
  ],
  "Ressources": [
    "r-plastic", "r-coal", "r-metal", "r-rubber", "r-glass", "r-chip",
    "r-fuel", "r-cloth", "r-screw", "r-paint", "r-wood", "r-gold"
  ]
};

/* Rendu d'une icône.
   `id` accepte :  un identifiant du jeu ci-dessus  |  une URL d'image  |  un emoji. */
window.mnIcon = function (id, cls) {
  const klass = cls ? ' class="' + cls + '"' : "";
  const open = '<svg' + klass + ' viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
    ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

  if (!id) return open + window.MN_ICONS["i-box"] + "</svg>";
  if (window.MN_ICONS[id]) return open + window.MN_ICONS[id] + "</svg>";

  if (/^(https?:\/\/|\.{0,2}\/|data:image)/i.test(id) || /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(id)) {
    const safe = String(id).replace(/"/g, "&quot;").replace(/</g, "&lt;");
    return '<img' + klass + ' src="' + safe + '" alt="" loading="lazy" decoding="async">';
  }

  const txt = String(id).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  return '<span' + (cls ? ' class="' + cls + ' mn-emoji"' : ' class="mn-emoji"') + '>' + txt + "</span>";
};
