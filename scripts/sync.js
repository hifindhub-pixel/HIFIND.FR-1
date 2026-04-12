<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="ie=edge" />
    <meta name="description" content="HiFlight — Comparez les prix de vols de centaines de compagnies aériennes en un clic." />
    <link rel="icon" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABvElEQVR4nO2bPY7CMBSEx9E2lPxInIITAIISQZtbwHHILehTAkK5DpSUoYiyG+V3vUl2HPt9EkWMMTOT5xcREQUN4uMx1pnPQgWB+vXcpglDMV1FUxhe3ZtDNw80eyhNxwbjZZRVQ6ECbDUPlHvzmibYRt5jbQ9wge8AXDj7KVmvXn7AFVLPsgXYAtgoF8s/i/MVIAGwBbCRANgC2DgfwBdbQCNKAZsNsF4D4zHwegGPB3C/A3H7K7j5Aex2wOHwczyfA74PjEZAGLZe3vwtsFzqjWtifgCq4pZe1bgm3W2B87k4drsBl0u7z0URsN8X50SRrsJSzO8BYQi838BqBUwmwPOZmL9eO1ne/ADiODHbkeE85veAnjG/Anwf2G6L46dTJ8s7XwESAFsAm357wGIBzGa9fkVb+g1gOk1eBuP8FpAA2ALY9NsD/vpj6B9xvgIkALYANhIAWwAbCYAtgI3zAcgfJNgC2EgAbAFsJAC2ADYSAFsAGwlA5wEj21BBoKQC2ALYeIDec3a2kHr28gMukPUqWyB74EIV5D0WKsDmEMq81Zq15WZJ3Umt7QE2VEOTBy2DQ6kInRP3ASwdcURDRIiGAAAAAElFTkSuQmCC" type="image/png">
    <link rel="apple-touch-icon" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABvElEQVR4nO2bPY7CMBSEx9E2lPxInIITAIISQZtbwHHILehTAkK5DpSUoYiyG+V3vUl2HPt9EkWMMTOT5xcREQUN4uMx1pnPQgWB+vXcpglDMV1FUxhe3ZtDNw80eyhNxwbjZZRVQ6ECbDUPlHvzmibYRt5jbQ9wge8AXDj7KVmvXn7AFVLPsgXYAtgoF8s/i/MVIAGwBbCRANgC2DgfwBdbQCNKAZsNsF4D4zHwegGPB3C/A3H7K7j5Aex2wOHwczyfA74PjEZAGLZe3vwtsFzqjWtifgCq4pZe1bgm3W2B87k4drsBl0u7z0URsN8X50SRrsJSzO8BYQi838BqBUwmwPOZmL9eO1ne/ADiODHbkeE85veAnjG/Anwf2G6L46dTJ8s7XwESAFsAm357wGIBzGa9fkVb+g1gOk1eBuP8FpAA2ALY9NsD/vpj6B9xvgIkALYANhIAWwAbCYAtgI3zAcgfJNgC2EgAbAFsJAC2ADYSAFsAGwlA5wEj21BBoKQC2ALYeIDec3a2kHr28gMukPUqWyB74EIV5D0WKsDmEMq81Zq15WZJ3Umt7QE2VEOTBy2DQ6kInRP3ASwdcURDRIiGAAAAAElFTkSuQmCC">

    <meta property="og:title" content="HiFlight — Comparateur de Vols" />
    <meta property="og:description" content="Comparez les prix de vols de centaines de compagnies aériennes. 100% gratuit." />
    <meta content="fr_FR" property="og:locale">
    <meta content="product.item" property="og:type">
    <meta content="[:og_image:]" property="og:image">
    <meta content="HiFlight — Comparateur de Vols" name="twitter:title">
    <meta content="summary_large_image" name="twitter:card">
    <title>HiFlight — Comparateur de Vols[:route_info:]</title>

    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;800;900&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">

    <style>
      /* ── VARIABLES ── */
      :root {
        --coral: #FF6B6B;
        --coral-h: #FF5252;
        --bg: #f8fafc;
        --bg2: #ffffff;
        --text: #0f172a;
        --sub: #64748b;
        --border: rgba(0,0,0,0.08);
        --tpwl-main-text: #0f172a;
        --tpwl-headline-text: #0f172a;
        --tpwl-links: #FF6B6B;
        --tpwl-search-form-background: #ffffff;
        --tpwl-search-result-background: #f8fafc;
        --tpwl-font-family: 'Inter';
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; }

      /* ── CACHER powered by ── */
      [class*="powered"], [class*="tpwl-logo__"] { display: none !important; }

      /* ── NAVBAR ── */
      .hf-nav {
        background: rgba(255,255,255,0.97);
        backdrop-filter: blur(20px);
        border-bottom: 1px solid var(--border);
        position: sticky; top: 0; z-index: 9999;
        height: 64px; display: flex; align-items: center; padding: 0 2rem;
      }
      .hf-nav-inner {
        max-width: 1280px; width: 100%; margin: 0 auto;
        display: flex; align-items: center; justify-content: space-between;
      }
      .hf-brand {
        font-family: 'Outfit', sans-serif; font-size: 1.7rem; font-weight: 900;
        color: var(--coral); cursor: pointer; text-decoration: none;
      }
      .hf-brand span { color: var(--text); }
      .hf-nav-right { display: flex; align-items: center; gap: 1rem; }
      .hf-nav-link {
        font-size: .82rem; color: var(--sub); cursor: pointer;
        background: none; border: none; font-family: 'Inter', sans-serif; transition: color .15s;
      }
      .hf-nav-link:hover { color: var(--text); }
      .hf-nav-btn {
        padding: .4rem 1.1rem; border-radius: 100px;
        border: 1.5px solid rgba(255,107,107,.5);
        background: transparent; color: var(--coral);
        font-size: .82rem; font-weight: 600; cursor: pointer;
        transition: all .2s; font-family: 'Inter', sans-serif;
      }
      .hf-nav-btn:hover { background: var(--coral); color: #fff; }
      .hf-nav-heart {
        width: 36px; height: 36px; border-radius: 50%; border: none;
        background: transparent; color: var(--sub); cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Inter', sans-serif; transition: color .2s;
      }
      .hf-nav-heart:hover { color: var(--coral); }

      /* ── HERO ── */
      .hf-hero {
        background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%);
        padding: 7rem 2rem 6rem; text-align: center; position: relative; overflow: hidden;
        min-height: 60vh; display: flex; align-items: center; justify-content: center;
      }
      .hf-hero::before {
        content: ''; position: absolute; width: 500px; height: 500px;
        top: -150px; right: -80px; border-radius: 50%;
        background: radial-gradient(circle, rgba(255,107,107,.12) 0%, transparent 70%);
      }
      .hf-hero-inner { position: relative; z-index: 1; max-width: 860px; margin: 0 auto; }
      .hf-hero h1 {
        font-family: 'Outfit', sans-serif; font-size: clamp(2.8rem, 7vw, 5.5rem);
        font-weight: 900; line-height: 1.05; letter-spacing: -.03em; margin-bottom: 1.2rem;
      }
      .hf-hero h1 .ac { color: var(--coral); }
      .hf-hero-sub { color: var(--sub); font-size: 1.15rem; max-width: 560px; margin: 0 auto; line-height: 1.65; }

      /* ── TRUST BAR ── */
      .hf-trust {
        background: var(--bg2); border-bottom: 1px solid var(--border);
        padding: .6rem 2rem; display: flex; align-items: center;
        justify-content: center; gap: 2.5rem; flex-wrap: wrap;
        font-size: .79rem; color: var(--sub);
      }
      .hf-trust b { font-family: 'Outfit', sans-serif; color: var(--coral); font-size: .92rem; }

      /* ── BARRE DE RECHERCHE ── */
      .tpwl-logo-header { display: none !important; }
      .tpwl-search-header {
        background: var(--bg2) !important;
        border-bottom: 1px solid var(--border) !important;
        padding: 1rem 2rem !important;
        position: static !important;
      }
      #tpwl-search {
        background: #fff;
        border-radius: 14px;
        border: 2px solid rgba(255,107,107,.2);
        box-shadow: 0 2px 16px rgba(0,0,0,.05);
        padding: .25rem;
        transition: border-color .2s, box-shadow .2s;
      }
      #tpwl-search:focus-within {
        border-color: rgba(255,107,107,.5);
        box-shadow: 0 4px 20px rgba(255,107,107,.12);
      }


      /* ── OVERRIDE LARGEUR TRAVELPAYOUTS ── */
      .tpwl-search-header,
      .tpwl-logo-header { padding-left: 2rem !important; padding-right: 2rem !important; }
      .tpwl__content { max-width: 1440px !important; min-width: unset !important; width: 100% !important; }
      .tpwl-search__wrapper { padding: 0 !important; }
      .tpwl-tickets__wrapper { padding: 1.5rem 2rem !important; }
      /* Override les paddings 100px de TP */
      [class*="tpwl"] [style*="padding"] { padding-left: 2rem !important; padding-right: 2rem !important; }

      /* ── LARGEUR PLEINE PAGE ── */
      .tpwl__content {
        max-width: 1280px !important;
        min-width: unset !important;
        width: 100% !important;
        flex: 1 1 auto !important;
      }
      .tpwl-search__wrapper,
      .tpwl-tickets__wrapper,
      .tpwl-widgets__wrapper {
        max-width: 100% !important;
        width: 100% !important;
      }
      .tpwl-search__wrapper > .tpwl__content,
      .tpwl-tickets__wrapper > .tpwl__content {
        max-width: 1280px !important;
        margin: 0 auto !important;
      }

      /* ── SIDEBAR — aide le JS pour Trier par ── */
      /* Si la sidebar est un flex container, on peut utiliser order */
      .tpwl-tickets__wrapper [class*="filters"],
      .tpwl-tickets__wrapper [class*="sidebar"],
      .tpwl-tickets__wrapper [class*="filter-list"] {
        display: flex !important;
        flex-direction: column !important;
      }
      .tpwl-main { background: var(--bg) !important; }
      .tpwl-tickets__wrapper { padding: 1.5rem 2rem !important; }
      /* Espace avant les destinations pour qu'elles apparaissent en scrollant */
      .tpwl-widgets__wrapper { margin-top: 2rem !important; }

      /* ── DESTINATIONS POPULAIRES TP ── */
      .tpwl-widgets__wrapper {
        background: var(--bg2) !important;
        border-top: 1px solid var(--border) !important;
        padding: 2.5rem 2rem !important;
      }
      .tpwl-widgets__wrapper h3 {
        font-family: 'Outfit', sans-serif !important;
        font-size: 1.4rem !important; font-weight: 700 !important;
        color: var(--text) !important; text-align: center !important;
        margin-bottom: 1.5rem !important;
      }
      /* Grid 3 colonnes comme le site de base TP */
      .tpwl-widget-weedles {
        display: grid !important;
        grid-template-columns: 1fr 1fr 1fr !important;
        gap: 20px !important;
        max-width: 1240px !important;
        margin: 0 auto !important;
      }
      .tpwl-widget-weedle {
        display: flex !important;
        justify-content: center !important;
        width: 100% !important;
      }
      /* Force les widgets enfants à prendre toute la largeur de leur cellule */
      .tpwl-widget-weedle > * {
        width: 100% !important;
        max-width: 100% !important;
      }
      @media (max-width: 900px) {
        .tpwl-widget-weedles { grid-template-columns: 1fr !important; }
      }

      /* ── FAQ ── */
      .hf-faq { padding: 3.5rem 2rem; background: var(--bg); }
      .hf-faq-inner { max-width: 820px; margin: 0 auto; }
      .hf-faq h2 {
        font-family: 'Outfit', sans-serif; font-size: 1.7rem; font-weight: 800;
        text-align: center; margin-bottom: .3rem;
      }
      .hf-faq-sub { text-align: center; color: var(--sub); font-size: .85rem; margin-bottom: 2rem; }
      .hf-faq-item {
        border: 1px solid var(--border); border-radius: 12px;
        margin-bottom: .6rem; overflow: hidden;
      }
      .hf-faq-q {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1rem 1.3rem; cursor: pointer; font-weight: 600; font-size: .92rem;
        background: var(--bg2); user-select: none;
      }
      .hf-faq-q:hover { background: #f8fafc; }
      .hf-faq-chevron { color: var(--coral); transition: transform .25s; font-size: 1rem; }
      .hf-faq-item.open .hf-faq-chevron { transform: rotate(180deg); }
      .hf-faq-a {
        max-height: 0; overflow: hidden; padding: 0 1.3rem;
        transition: max-height .3s ease, padding .3s;
        font-size: .85rem; color: var(--sub); line-height: 1.7; background: var(--bg2);
      }
      .hf-faq-item.open .hf-faq-a { max-height: 200px; padding: .9rem 1.3rem 1.1rem; }

      /* ── FOOTER ── */
      .hf-footer {
        background: var(--bg2); border-top: 1px solid var(--border);
        padding: 2rem; text-align: center;
      }
      .hf-footer-brand { font-family: 'Outfit', sans-serif; font-size: 1.3rem; font-weight: 900; color: var(--coral); margin-bottom: .4rem; }
      .hf-footer-brand span { color: var(--text); }
      .hf-footer-links { display: flex; justify-content: center; gap: 1.5rem; flex-wrap: wrap; margin-bottom: .6rem; }
      .hf-footer-links button {
        font-size: .76rem; color: var(--sub); background: none; border: none;
        cursor: pointer; font-family: 'Inter', sans-serif; transition: color .15s;
      }
      .hf-footer-links button:hover { color: var(--coral); }
      .hf-footer-copy { font-size: .71rem; color: #94a3b8; }

      /* ── MODALES LÉGALES ── */
      .hf-legal-overlay {
        display: none; position: fixed; inset: 0;
        background: rgba(0,0,0,.6); z-index: 9999;
        align-items: center; justify-content: center; padding: 2rem;
      }
      .hf-legal-overlay.open { display: flex; }
      .hf-legal-panel {
        background: #fff; border-radius: 18px; width: 100%; max-width: 700px;
        max-height: 85vh; overflow-y: auto;
      }
      .hf-legal-head {
        padding: 1.1rem 1.4rem; display: flex; align-items: center;
        justify-content: space-between; border-bottom: 1px solid var(--border);
        position: sticky; top: 0; background: #fff; z-index: 1;
      }
      .hf-legal-title { font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 700; }
      .hf-legal-close {
        width: 30px; height: 30px; border-radius: 50%; border: none;
        background: transparent; color: var(--sub); font-size: 1rem; cursor: pointer;
      }
      .hf-legal-body { padding: 1.3rem; font-size: .83rem; color: var(--sub); line-height: 1.8; }
      .hf-legal-body h3 { font-size: .95rem; font-weight: 700; color: var(--text); margin: 1rem 0 .3rem; }
      .hf-legal-body p { margin-bottom: .7rem; }
      .hf-legal-body ul { margin: .4rem 0 .7rem 1rem; }
      /* ── ONGLETS VOLS / HÔTELS ── */
      .hf-tabs-bar {
        background: var(--bg2);
        border-bottom: 1px solid var(--border);
        padding: .6rem 2rem 0;
      }
      .hf-tabs-inner { max-width: 1280px; margin: 0 auto; display: flex; gap: .25rem; }
      .hf-tab {
        padding: .55rem 1.4rem; border-radius: 10px 10px 0 0;
        border: 1px solid transparent; border-bottom: none;
        background: transparent; color: var(--sub);
        font-size: .88rem; font-weight: 600; cursor: pointer;
        font-family: 'Inter', sans-serif; transition: all .2s;
      }
      .hf-tab:hover { color: var(--text); background: var(--bg3); }
      .hf-tab.active {
        background: var(--bg2); color: var(--coral);
        border-color: var(--border); border-bottom-color: var(--bg2);
        margin-bottom: -1px; position: relative; z-index: 1;
      }
      .hf-panel { padding: 1rem 2rem; background: var(--bg2); }

      /* ── RECHERCHE HÔTELS ── */
      .hf-hotel-search { max-width: 1280px; margin: 0 auto; }
      .hf-hotel-bar {
        display: flex; align-items: flex-end; gap: .6rem;
        background: #fff; border-radius: 14px;
        border: 2px solid rgba(255,107,107,.2);
        padding: .6rem .6rem .6rem 1rem;
        box-shadow: 0 2px 16px rgba(0,0,0,.05);
      }
      .hf-hotel-field { display: flex; flex-direction: column; flex: 1; min-width: 0; position: relative; }
      .hf-hotel-dest-wrap { flex: 2; }
      .hf-hotel-label { font-size: .7rem; font-weight: 700; color: var(--sub); text-transform: uppercase; letter-spacing: .05em; margin-bottom: .25rem; }
      .hf-hotel-input {
        border: none; outline: none; font-size: .92rem; color: var(--text);
        font-family: 'Inter', sans-serif; background: transparent; padding: .25rem 0;
        width: 100%;
      }
      input.hf-hotel-input[type="date"] { color: var(--text); }
      .hf-hotel-guests-display {
        cursor: pointer; display: flex; align-items: center; justify-content: space-between;
        padding: .25rem 0; font-size: .92rem;
      }
      /* Séparateurs entre champs */
      .hf-hotel-field + .hf-hotel-field { border-left: 1px solid var(--border); padding-left: .8rem; }

      /* Dropdown autocomplete */
      .hf-hotel-dropdown {
        position: absolute; top: calc(100% + 8px); left: 0; width: 100%;
        background: #fff; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.12);
        border: 1px solid var(--border); z-index: 999; overflow: hidden; display: none;
      }
      .hf-hotel-dropdown.open { display: block; }
      .hf-hotel-drop-item {
        padding: .75rem 1rem; cursor: pointer; font-size: .88rem;
        display: flex; align-items: center; gap: .6rem; transition: background .15s;
      }
      .hf-hotel-drop-item:hover { background: var(--bg); }
      .hf-hotel-drop-icon { font-size: 1rem; }
      .hf-hotel-drop-name { font-weight: 600; color: var(--text); }
      .hf-hotel-drop-country { font-size: .75rem; color: var(--sub); }

      /* Panel voyageurs */
      .hf-guests-panel {
        position: absolute; top: calc(100% + 8px); right: 0;
        background: #fff; border-radius: 14px; box-shadow: 0 8px 24px rgba(0,0,0,.12);
        border: 1px solid var(--border); padding: 1rem; z-index: 999; min-width: 260px;
      }
      .hf-guests-row { display: flex; align-items: center; justify-content: space-between; padding: .5rem 0; }
      .hf-guests-row + .hf-guests-row { border-top: 1px solid var(--border); }
      .hf-guests-ctrl { display: flex; align-items: center; gap: .8rem; }
      .hf-guests-ctrl button {
        width: 30px; height: 30px; border-radius: 50%; border: 1.5px solid var(--border);
        background: #fff; font-size: 1.1rem; cursor: pointer; display: flex;
        align-items: center; justify-content: center; color: var(--coral); transition: all .2s;
      }
      .hf-guests-ctrl button:hover { background: var(--coral); color: #fff; border-color: var(--coral); }
      .hf-guests-ctrl span { font-weight: 700; min-width: 16px; text-align: center; }
      .hf-guests-ok {
        width: 100%; margin-top: .8rem; padding: .6rem; border-radius: 8px;
        background: var(--coral); color: #fff; border: none; font-weight: 700;
        cursor: pointer; font-family: 'Inter', sans-serif;
      }

      .hf-hotel-btn {
        flex-shrink: 0; padding: .75rem 1.5rem; border-radius: 10px; border: none;
        background: var(--coral); color: #fff; font-size: .9rem;
        font-weight: 700; cursor: pointer; white-space: nowrap;
        font-family: 'Inter', sans-serif; transition: background .2s; height: 44px;
      }
      .hf-hotel-btn:hover { background: var(--coral-h); }
      .hf-hotel-shortcuts {
        display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; margin-top: .9rem;
      }
      .hf-hotel-shortcut-label { font-size: .78rem; color: var(--sub); }
      .hf-hotel-shortcuts button {
        padding: .3rem .8rem; border-radius: 100px; border: 1px solid var(--border);
        background: var(--bg); color: var(--text); font-size: .78rem;
        cursor: pointer; font-family: 'Inter', sans-serif; transition: all .2s;
      }
      .hf-hotel-shortcuts button:hover { border-color: var(--coral); color: var(--coral); }
      @media (max-width: 768px) {
        .hf-hotel-bar { flex-direction: column; align-items: stretch; padding: .8rem; }
        .hf-hotel-field + .hf-hotel-field { border-left: none; border-top: 1px solid var(--border); padding-left: 0; padding-top: .5rem; }
      }

      /* ── STAY22 HÔTELS ── */
      /* Cacher la barre de recherche native et le badge Stay22 */
      #hf-hotel-iframe + * [class*="search"],
      [class*="powered"], [class*="stay22-brand"],
      [class*="propulsé"], [class*="powered-by"] { display: none !important; }
      /* Via CSS injecté dans l'iframe — on cache via le paramètre URL */
      .hf-stay22-section {
        background: var(--bg2);
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
        padding: 2.5rem 2rem;
        display: none; /* caché par défaut, affiché quand résultats présents */
      }
      .hf-stay22-section.visible { display: block; }
      .hf-stay22-inner { max-width: 1280px; margin: 0 auto; }
      .hf-stay22-header {
        display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;
      }
      .hf-stay22-icon { font-size: 1.8rem; }
      .hf-stay22-title {
        font-family: 'Outfit', sans-serif; font-size: 1.4rem;
        font-weight: 800; color: var(--text); margin-bottom: .2rem;
      }
      .hf-stay22-sub { font-size: .82rem; color: var(--sub); }

      /* ── RESPONSIVE ── */
      @media (max-width: 900px) {
        .tpwl-widget-weedles { grid-template-columns: 1fr !important; }
        .hf-trust { gap: 1rem; padding: .5rem 1rem; }
        .hf-hero { padding: 2.5rem 1rem 2rem; }
        .hf-faq { padding: 2.5rem 1rem; }
        .hf-footer { padding: 1.5rem 1rem; }
      }
    </style>

    [:embed_script:]
    [:cookie_policy_script:]

    <!-- Stay22 LMA — hôtels suggérés après une recherche de vol -->
    <script>
      window._stay22AID = '69d6ef5b5c2381056c6872bc';
      (function(s,t,a,y,twenty,two){
        s.Stay22 = s.Stay22 || {};
        s.Stay22.params = { lmaID: window._stay22AID };
        twenty = t.createElement(a);
        two = t.getElementsByTagName(a)[0];
        twenty.async = 1;
        twenty.src = y;
        two.parentNode.insertBefore(twenty, two);
      })(window, document, 'script', 'https://scripts.stay22.com/letmeallez.js');
    </script>
  </head>

  <body>

    <!-- NAVBAR -->
    <nav class="hf-nav">
      <div class="hf-nav-inner">
        <a class="hf-brand" href="/">Hi<span>Flight</span></a>
        <div class="hf-nav-right">
          <button class="hf-nav-link hf-monde-btn" onclick="document.querySelector('.tpwl-widgets__wrapper').scrollIntoView({behavior:'smooth'})">🌍 Monde entier</button>
        </div>
      </div>
    </nav>

    <!-- HERO -->
    <header class="tpwl-logo-header" style="display:none!important;">
      <div class="tpwl-logo__wrapper"></div>
      <div class="tpwl-search__wrapper"><div class="tpwl__content"><h1>HiFlight</h1></div></div>
    </header>

    <div class="hf-hero">
      <div class="hf-hero-inner">
        <h1>Des millions de vols.<br><span class="ac">Un seul endroit.</span></h1>
        <p class="hf-hero-sub">Comparez des centaines de compagnies aériennes en temps réel. Gratuit, sans inscription.</p>
      </div>
    </div>

    <!-- TRUST BAR -->
    <div class="hf-trust">
      <span><b>728</b> compagnies</span>
      <span><b>100%</b> gratuit</span>
    </div>

    <!-- ONGLETS VOLS / HÔTELS + MOTEUR DE RECHERCHE -->
    <header class="tpwl-search-header">

      <!-- Onglets -->
      <div class="hf-tabs-bar">
        <div class="hf-tabs-inner">
          <button class="hf-tab active" id="hf-tab-vols" onclick="switchTab('vols')">✈️ Vols</button>
          <button class="hf-tab" id="hf-tab-hotels" onclick="switchTab('hotels')">🏨 Hôtels</button>
        </div>
      </div>

      <!-- Panneau Vols (Travelpayouts) -->
      <div id="hf-panel-vols" class="hf-panel">
        <div class="tpwl-search__wrapper">
          <div class="tpwl__content">
            <div id="tpwl-search"></div>
          </div>
        </div>
      </div>

      <!-- Panneau Hôtels (Stay22 MAP) -->
      <div id="hf-panel-hotels" class="hf-panel" style="display:none;">
        <div class="hf-hotel-search">

          <!-- Barre de recherche complète -->
          <div class="hf-hotel-bar">

            <!-- Destination avec autocomplete -->
            <div class="hf-hotel-field hf-hotel-dest-wrap">
              <label class="hf-hotel-label">Destination</label>
              <input type="text" id="hf-hotel-city" class="hf-hotel-input"
                placeholder="Ville, région ou hôtel..." autocomplete="off"
                oninput="hotelAutocomplete(this.value)" />
              <div class="hf-hotel-dropdown" id="hf-hotel-dropdown"></div>
            </div>

            <!-- Date arrivée -->
            <div class="hf-hotel-field">
              <label class="hf-hotel-label">Arrivée</label>
              <input type="date" id="hf-hotel-checkin" class="hf-hotel-input" />
            </div>

            <!-- Date départ -->
            <div class="hf-hotel-field">
              <label class="hf-hotel-label">Départ</label>
              <input type="date" id="hf-hotel-checkout" class="hf-hotel-input" />
            </div>

            <!-- Voyageurs -->
            <div class="hf-hotel-field hf-hotel-guests-wrap" style="position:relative;">
              <label class="hf-hotel-label">Voyageurs</label>
              <div class="hf-hotel-input hf-hotel-guests-display" id="hf-guests-display" onclick="toggleGuests()">
                <span id="hf-guests-text">2 adultes</span> <span style="color:var(--sub);font-size:.8rem;">▾</span>
              </div>
              <div class="hf-guests-panel" id="hf-guests-panel" style="display:none;">
                <div class="hf-guests-row">
                  <span>Adultes</span>
                  <div class="hf-guests-ctrl">
                    <button onclick="changeGuests('adults',-1)">−</button>
                    <span id="hf-adults-count">2</span>
                    <button onclick="changeGuests('adults',1)">+</button>
                  </div>
                </div>
                <div class="hf-guests-row">
                  <span>Enfants</span>
                  <div class="hf-guests-ctrl">
                    <button onclick="changeGuests('children',-1)">−</button>
                    <span id="hf-children-count">0</span>
                    <button onclick="changeGuests('children',1)">+</button>
                  </div>
                </div>
                <div class="hf-guests-row">
                  <span>Chambres</span>
                  <div class="hf-guests-ctrl">
                    <button onclick="changeGuests('rooms',-1)">−</button>
                    <span id="hf-rooms-count">1</span>
                    <button onclick="changeGuests('rooms',1)">+</button>
                  </div>
                </div>
                <button class="hf-guests-ok" onclick="toggleGuests()">Confirmer</button>
              </div>
            </div>

            <!-- Bouton recherche -->
            <button class="hf-hotel-btn" onclick="searchHotels()">Rechercher</button>
          </div>

          <!-- Raccourcis -->
          <div id="hf-hotel-shortcuts" class="hf-hotel-shortcuts">
            <span class="hf-hotel-shortcut-label">Populaires :</span>
            <button onclick="setHotelCity('Barcelone',41.3874,2.1686)">🇪🇸 Barcelone</button>
            <button onclick="setHotelCity('Paris',48.8566,2.3522)">🇫🇷 Paris</button>
            <button onclick="setHotelCity('Rome',41.9028,12.4964)">🇮🇹 Rome</button>
            <button onclick="setHotelCity('Londres',51.5074,-0.1278)">🇬🇧 Londres</button>
            <button onclick="setHotelCity('Marrakech',31.6295,-7.9811)">🇲🇦 Marrakech</button>
            <button onclick="setHotelCity('Dubaï',25.2048,55.2708)">🇦🇪 Dubaï</button>
            <button onclick="setHotelCity('Lisbonne',38.7169,-9.1395)">🇵🇹 Lisbonne</button>
            <button onclick="setHotelCity('Bangkok',13.7563,100.5018)">🇹🇭 Bangkok</button>
          </div>

          <!-- Carte Stay22 — barre de recherche native masquée par clip -->
          <div id="hf-hotel-map" style="display:none; margin-top:1rem;">
            <div style="overflow:hidden; border-radius:14px; border:1px solid rgba(0,0,0,0.08); height:500px; position:relative;">
              <iframe id="hf-hotel-iframe" src="" width="100%" height="570" frameborder="0"
                style="margin-top:-70px; display:block;"></iframe>
            </div>
          </div>

        </div>
      </div>

    </header>

    <!-- RÉSULTATS + DESTINATIONS (Travelpayouts gère tout nativement) -->
    <main class="tpwl-main">
      <div class="tpwl-tickets__wrapper">
        <div class="tpwl__content">
          <div id="tpwl-tickets"></div>
        </div>
      </div>

      <!-- STAY22 — HÔTELS -->
      <div class="hf-stay22-section" id="hf-stay22-section">
        <div class="hf-stay22-inner">
          <div class="hf-stay22-header">
            <span class="hf-stay22-icon">🏨</span>
            <div>
              <h2 class="hf-stay22-title">Trouvez votre hôtel</h2>
              <p class="hf-stay22-sub">Les meilleures offres d'hébergement pour votre destination</p>
            </div>
          </div>
          <div id="hf-stay22-widget">
            <!-- Widget Stay22 MAP — injecté dynamiquement après une recherche -->
          </div>
        </div>
      </div>

      <div class="tpwl-widgets__wrapper">
        <div class="tpwl__content" style="max-width:1240px;width:100%;margin:0 auto;">
          <h3>Destinations populaires depuis la France</h3>
          <div id="tpwl-widget-weedles" class="tpwl-widget-weedles">
            <div class="tpwl-widget-weedle" data-destination="BCN" is="weedle"></div>
            <div class="tpwl-widget-weedle" data-destination="RAK" is="weedle"></div>
            <div class="tpwl-widget-weedle" data-destination="FCO" is="weedle"></div>
            <div class="tpwl-widget-weedle" data-destination="DXB" is="weedle"></div>
            <div class="tpwl-widget-weedle" data-destination="BKK" is="weedle"></div>
            <div class="tpwl-widget-weedle" data-destination="KUL" is="weedle"></div>
            <div class="tpwl-widget-weedle" data-destination="JFK" is="weedle"></div>
            <div class="tpwl-widget-weedle" data-destination="CUN" is="weedle"></div>
            <div class="tpwl-widget-weedle" data-destination="TIA" is="weedle"></div>
            <div class="tpwl-widget-weedle" data-destination="REK" is="weedle"></div>
            <div class="tpwl-widget-weedle" data-destination="MAD" is="weedle"></div>
            <div class="tpwl-widget-weedle" data-destination="LIS" is="weedle"></div>
          </div>
        </div>
        </div>
      </div>
    </main>

    <!-- FAQ -->
    <section class="hf-faq">
      <div class="hf-faq-inner">
        <h2>Questions fréquentes</h2>
        <p class="hf-faq-sub">Tout ce que vous devez savoir avant de réserver</p>
        <div class="hf-faq-item" onclick="toggleFaq(this)">
          <div class="hf-faq-q">Comment HiFlight trouve-t-il les meilleurs prix ? <span class="hf-faq-chevron">▾</span></div>
          <div class="hf-faq-a">HiFlight compare en temps réel les tarifs de plus de 700 compagnies aériennes. Notre moteur analyse des millions de combinaisons pour vous présenter les meilleures offres en quelques secondes.</div>
        </div>
        <div class="hf-faq-item" onclick="toggleFaq(this)">
          <div class="hf-faq-q">HiFlight est-il vraiment gratuit ? <span class="hf-faq-chevron">▾</span></div>
          <div class="hf-faq-a">Oui, entièrement gratuit. Nous nous rémunérons via des commissions d'affiliation versées par les agences et compagnies partenaires — sans aucun surcoût pour vous.</div>
        </div>
        <div class="hf-faq-item" onclick="toggleFaq(this)">
          <div class="hf-faq-q">Puis-je réserver directement sur HiFlight ? <span class="hf-faq-chevron">▾</span></div>
          <div class="hf-faq-a">HiFlight est un comparateur — nous vous montrons les meilleures offres et vous redirigeons vers le site de la compagnie ou de l'agence pour finaliser la réservation.</div>
        </div>
        <div class="hf-faq-item" onclick="toggleFaq(this)">
          <div class="hf-faq-q">Pourquoi les prix changent-ils aussi vite ? <span class="hf-faq-chevron">▾</span></div>
          <div class="hf-faq-a">Les prix des vols varient en fonction de la demande, du délai avant le départ et de la saison. En général, réserver 6 à 8 semaines à l'avance offre les meilleurs tarifs.</div>
        </div>
        <div class="hf-faq-item" onclick="toggleFaq(this)">
          <div class="hf-faq-q">Comment HiFlight protège-t-il mes données ? <span class="hf-faq-chevron">▾</span></div>
          <div class="hf-faq-a">HiFlight respecte le RGPD. Nous ne vendons aucune donnée personnelle à des tiers. Consultez notre Politique de confidentialité pour plus de détails.</div>
        </div>
      </div>
    </section>

    <!-- FOOTER -->
    <footer class="hf-footer">
      <div class="hf-footer-brand">Hi<span>Flight</span></div>
      <div class="hf-footer-links">
        <button onclick="openLegal('cgu')">Conditions d'utilisation</button>
        <button onclick="openLegal('privacy')">Politique de confidentialité</button>
        <button onclick="openLegal('rgpd')">RGPD &amp; Cookies</button>
      </div>
      <p class="hf-footer-copy">© [:current_year:] HiFlight · Comparateur de vols · Certains liens sont des liens d'affiliation</p>
    </footer>

    <!-- MODAL LÉGAL -->
    <div class="hf-legal-overlay" id="hf-legal-overlay" onclick="if(event.target===this)this.classList.remove('open')">
      <div class="hf-legal-panel">
        <div class="hf-legal-head">
          <div class="hf-legal-title" id="hf-legal-title"></div>
          <button class="hf-legal-close" onclick="document.getElementById('hf-legal-overlay').classList.remove('open')">✕</button>
        </div>
        <div class="hf-legal-body" id="hf-legal-body"></div>
      </div>
    </div>

  </body>

  <script>
    // ── ONGLETS VOLS / HÔTELS ──
    var _hotelCoords = null;
    var _adults = 2, _children = 0, _rooms = 1;
    var _autocompleteTimer = null;

    // Dates par défaut (aujourd'hui + 7j)
    (function() {
      var today = new Date();
      var next = new Date(today); next.setDate(next.getDate() + 7);
      var fmt = function(d) { return d.toISOString().split('T')[0]; };
      var ci = document.getElementById('hf-hotel-checkin');
      var co = document.getElementById('hf-hotel-checkout');
      if (ci) ci.value = fmt(today);
      if (co) co.value = fmt(next);
      // Min dates
      if (ci) ci.min = fmt(today);
      if (co) co.min = fmt(next);
      if (ci) ci.addEventListener('change', function() {
        var d = new Date(this.value); d.setDate(d.getDate()+1);
        if (co) { co.min = d.toISOString().split('T')[0]; if (co.value <= this.value) co.value = d.toISOString().split('T')[0]; }
      });
    })();

    window.switchTab = function(tab) {
      var panelVols = document.getElementById('hf-panel-vols');
      var panelHotels = document.getElementById('hf-panel-hotels');
      var tabVols = document.getElementById('hf-tab-vols');
      var tabHotels = document.getElementById('hf-tab-hotels');
      var main = document.querySelector('.tpwl-main');
      if (tab === 'vols') {
        panelVols.style.display = '';
        panelHotels.style.display = 'none';
        tabVols.classList.add('active');
        tabHotels.classList.remove('active');
        if (main) main.style.display = '';
      } else {
        panelVols.style.display = 'none';
        panelHotels.style.display = '';
        tabVols.classList.remove('active');
        tabHotels.classList.add('active');
        if (main) main.style.display = 'none';
      }
    };

    // Autocomplete via Nominatim (OpenStreetMap)
    window.hotelAutocomplete = function(val) {
      clearTimeout(_autocompleteTimer);
      var dd = document.getElementById('hf-hotel-dropdown');
      if (!val || val.length < 2) { dd.classList.remove('open'); return; }
      _autocompleteTimer = setTimeout(function() {
        fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(val) +
          '&format=json&limit=6&accept-language=fr&featuretype=city,country')
          .then(function(r){ return r.json(); })
          .then(function(results) {
            if (!results.length) { dd.classList.remove('open'); return; }
            dd.innerHTML = results.map(function(r) {
              var parts = (r.display_name || '').split(',');
              var city = parts[0].trim();
              var country = parts[parts.length-1].trim();
              return '<div class="hf-hotel-drop-item" onclick="selectCity(\'' +
                city.replace(/'/g,"\\'") + '\',' + r.lat + ',' + r.lon + ')">' +
                '<span class="hf-hotel-drop-icon">📍</span>' +
                '<div><div class="hf-hotel-drop-name">' + city + '</div>' +
                '<div class="hf-hotel-drop-country">' + country + '</div></div></div>';
            }).join('');
            dd.classList.add('open');
          }).catch(function(){});
      }, 300);
    };

    window.selectCity = function(city, lat, lng) {
      document.getElementById('hf-hotel-city').value = city;
      _hotelCoords = {lat: parseFloat(lat), lng: parseFloat(lng)};
      document.getElementById('hf-hotel-dropdown').classList.remove('open');
    };

    // Clic raccourci
    window.setHotelCity = function(city, lat, lng) {
      document.getElementById('hf-hotel-city').value = city;
      _hotelCoords = {lat: lat, lng: lng};
      searchHotels();
    };

    // Voyageurs
    window.toggleGuests = function() {
      var p = document.getElementById('hf-guests-panel');
      p.style.display = p.style.display === 'none' ? 'block' : 'none';
    };
    window.changeGuests = function(type, delta) {
      if (type === 'adults') { _adults = Math.max(1, _adults + delta); document.getElementById('hf-adults-count').textContent = _adults; }
      if (type === 'children') { _children = Math.max(0, _children + delta); document.getElementById('hf-children-count').textContent = _children; }
      if (type === 'rooms') { _rooms = Math.max(1, _rooms + delta); document.getElementById('hf-rooms-count').textContent = _rooms; }
      var txt = _adults + ' adulte' + (_adults>1?'s':'');
      if (_children) txt += ', ' + _children + ' enfant' + (_children>1?'s':'');
      txt += ' · ' + _rooms + ' chambre' + (_rooms>1?'s':'');
      document.getElementById('hf-guests-text').textContent = txt;
    };

    // Fermer dropdown et guests au clic extérieur
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.hf-hotel-dest-wrap')) {
        var dd = document.getElementById('hf-hotel-dropdown');
        if (dd) dd.classList.remove('open');
      }
      if (!e.target.closest('.hf-hotel-guests-wrap')) {
        var gp = document.getElementById('hf-guests-panel');
        if (gp) gp.style.display = 'none';
      }
    });

    // Recherche hôtels
    window.searchHotels = function() {
      var city = (document.getElementById('hf-hotel-city').value || '').trim();
      if (!city) { document.getElementById('hf-hotel-city').focus(); return; }

      var aid = window._stay22AID || '69d6ef5b5c2381056c6872bc';
      var checkin = document.getElementById('hf-hotel-checkin').value;
      var checkout = document.getElementById('hf-hotel-checkout').value;

      function showMap(lat, lng) {
        var url = 'https://www.stay22.com/embed/gm?aid=' + aid +
          '&lat=' + lat + '&lng=' + lng + '&z=13&currency=EUR&lang=fr' +
          '&checkin=' + checkin + '&checkout=' + checkout +
          '&guests=' + _adults +
          '&powered_by=false' +
          '&hidesearch=true';
        document.getElementById('hf-hotel-iframe').src = url;
        document.getElementById('hf-hotel-map').style.display = 'block';
        document.getElementById('hf-hotel-shortcuts').style.display = 'none';
      }

      if (_hotelCoords) {
        showMap(_hotelCoords.lat, _hotelCoords.lng);
      } else {
        // Geocoding si pas de coords sélectionnées
        fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(city) +
          '&format=json&limit=1&accept-language=fr')
          .then(function(r){ return r.json(); })
          .then(function(res) {
            if (res && res[0]) {
              _hotelCoords = {lat: parseFloat(res[0].lat), lng: parseFloat(res[0].lon)};
              showMap(_hotelCoords.lat, _hotelCoords.lng);
            }
          });
      }
    };

    // Entrée dans le champ destination
    document.getElementById('hf-hotel-city').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { document.getElementById('hf-hotel-dropdown').classList.remove('open'); searchHotels(); }
    });

    // Réinitialiser coords si l'utilisateur retape
    document.getElementById('hf-hotel-city').addEventListener('input', function() {
      _hotelCoords = null;
    });

    // ── FAQ ──
    function toggleFaq(item) {
      var open = item.classList.contains('open');
      document.querySelectorAll('.hf-faq-item').forEach(function(i){ i.classList.remove('open'); });
      if (!open) item.classList.add('open');
    }

    // ── LÉGAL ──
    var LEGAL = {
      cgu: {
        title: "Conditions Générales d'Utilisation",
        body: '<h3>1. Objet</h3><p>Les présentes CGU régissent l\'utilisation du site HiFlight (www.hiflight.fr).</p><h3>2. Description du service</h3><p>HiFlight est un comparateur de prix de vols. La réservation s\'effectue sur le site du partenaire sélectionné. HiFlight ne vend pas de billets directement.</p><h3>3. Prix</h3><p>Les prix sont fournis par nos partenaires et peuvent changer. Vérifiez le prix final sur le site du partenaire avant de réserver.</p><h3>4. Affiliation</h3><p>Certains liens sont des liens d\'affiliation. HiFlight perçoit une commission sans surcoût pour l\'utilisateur.</p><h3>5. Responsabilité</h3><p>HiFlight ne saurait être tenu responsable des erreurs d\'information fournies par les partenaires.</p><h3>6. Droit applicable</h3><p>Droit français. Tribunaux français compétents en cas de litige.</p><h3>7. Contact</h3><p>contact@hiflight.fr</p>'
      },
      privacy: {
        title: "Politique de Confidentialité",
        body: '<h3>1. Responsable du traitement</h3><p>HiFlight, www.hiflight.fr</p><h3>2. Données collectées</h3><ul><li>Données de navigation anonymisées</li><li>Préférences de recherche</li><li>Email (uniquement pour les alertes prix)</li></ul><h3>3. Finalités</h3><ul><li>Améliorer l\'expérience utilisateur</li><li>Statistiques anonymes</li></ul><h3>4. Partage</h3><p>Nous ne vendons jamais vos données. Partage possible avec nos partenaires techniques uniquement.</p><h3>5. Conservation</h3><p>13 mois maximum.</p><h3>6. Vos droits</h3><p>Accès, rectification, effacement, portabilité, opposition. Contact : contact@hiflight.fr</p>'
      },
      rgpd: {
        title: "RGPD & Politique de Cookies",
        body: '<h3>1. Conformité RGPD</h3><p>HiFlight respecte le Règlement Général sur la Protection des Données (UE 2016/679).</p><h3>2. Cookies utilisés</h3><p><strong>Essentiels</strong> : mémorisation des recherches, préférences langue/devise.</p><p><strong>Analytiques</strong> : Google Analytics anonymisé.</p><p><strong>Affiliation</strong> : cookies partenaires (30 à 180 jours).</p><h3>3. Gestion</h3><p>Vous pouvez refuser les cookies non essentiels. Paramètres disponibles dans votre navigateur.</p><h3>4. Contact</h3><p>contact@hiflight.fr — Réponse sous 30 jours.</p>'
      }
    };

    function openLegal(type) {
      var c = LEGAL[type];
      if (!c) return;
      document.getElementById('hf-legal-title').textContent = c.title;
      document.getElementById('hf-legal-body').innerHTML = c.body;
      document.getElementById('hf-legal-overlay').classList.add('open');
    }

    // ── WIDGETS DESTINATIONS ──
    (function() {
      var container = document.getElementById('tpwl-widget-weedles');
      if (!container) return;
      var weedleElements = container.querySelectorAll('div[is="weedle"]');
      weedleElements.forEach(function(element) {
        if (typeof TPWL_EXTRA === 'undefined' || !TPWL_EXTRA) return;
        var destination = element.getAttribute('data-destination');
        var scriptElement = document.createElement('script');
        scriptElement.async = 1;
        scriptElement.src = 'https://[:widget_domain:]/content?currency=' + String(TPWL_EXTRA.currency).toLowerCase() + '&trs=' + TPWL_EXTRA.trs + '&shmarker=714763&destination=' + destination + '&target_host=' + TPWL_EXTRA.domain + '&locale=' + TPWL_EXTRA.locale + '&limit=6&powered_by=false&primary=%23FF6B6B&promo_id=4044&campaign_id=100';
        element.appendChild(scriptElement);
      });
    })();
  // ── FILTRES SIDEBAR ──
  (function() {

    var HIDE_TEXTS = ['aéroports des correspondances','aéroports','prix','agences','aircraft types','alliances et compagnies aériennes'];
    var SORT_TEXTS = ['trier par','sort by'];

    function getText(el) {
      var lines = (el.innerText || el.textContent || '').trim().split('\n');
      return lines[0].trim().toLowerCase();
    }

    function findSidebar() {
      // Cherche dans tout le body — pas seulement #tpwl-tickets
      var all = document.querySelectorAll('div, aside, section');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var childCount = el.children.length;
        if (childCount < 4 || childCount > 35) continue;
        var txt = (el.innerText || '').toLowerCase();
        if (txt.includes('trier par') && (txt.includes('escale') || txt.includes('bagage')) && txt.includes('filtres')) {
          return el;
        }
      }
      // Fallback : trouve juste l'élément "Trier par" et remonte
      var allEls = document.querySelectorAll('*');
      for (var j = 0; j < allEls.length; j++) {
        var el2 = allEls[j];
        if (el2.children.length > 0) continue; // veut un nœud feuille
        var t = (el2.innerText || el2.textContent || '').trim().toLowerCase();
        if (t === 'trier par' || t === 'sort by') {
          // Remonte jusqu'au bon parent
          var p = el2.parentElement;
          for (var k = 0; k < 6; k++) {
            if (!p) break;
            if (p.children.length >= 4) {
              var ptxt = (p.innerText || '').toLowerCase();
              if (ptxt.includes('escale') || ptxt.includes('bagage')) return p;
            }
            p = p.parentElement;
          }
        }
      }
      return null;
    }

    function applyFilters() {
      var sidebar = findSidebar();
      if (!sidebar) return;

      var kids = Array.prototype.slice.call(sidebar.children);
      var sortEl = null;

      kids.forEach(function(child) {
        var t = getText(child);
        if (SORT_TEXTS.indexOf(t) !== -1) {
          sortEl = child;
          return;
        }
        var shouldHide = HIDE_TEXTS.some(function(h) {
          return t === h || t.indexOf(h) === 0;
        });
        if (shouldHide) {
          child.style.cssText = 'display:none!important;height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:none!important;';
        }
      });

      if (sortEl && sidebar.firstElementChild !== sortEl) {
        sidebar.insertBefore(sortEl, sidebar.firstElementChild);
      }
    }

    var _timer = null;
    var _attempts = 0;
    function scheduleApply() {
      clearTimeout(_timer);
      _attempts = 0;
      function attempt() {
        applyFilters();
        _attempts++;
        if (_attempts < 8) {
          _timer = setTimeout(attempt, _attempts * 500);
        }
      }
      _timer = setTimeout(attempt, 300);
    }

    new MutationObserver(function(mutations) {
      var hasNew = mutations.some(function(m) { return m.addedNodes.length > 0; });
      if (hasNew) scheduleApply();
    }).observe(document.body, {childList: true, subtree: true});

  })();



    // ── STAY22 MAP — widget hôtels ──
    // Affiche une carte d'hôtels Stay22 basée sur la destination de la recherche TP
    (function() {
      var section = document.getElementById('hf-stay22-section');
      var widgetDiv = document.getElementById('hf-stay22-widget');
      var stay22Loaded = false;

      // Coordonnées par défaut des destinations populaires
      var DEST_COORDS = {
        'BCN': {lat: 41.3874, lng: 2.1686, name: 'Barcelone'},
        'LON': {lat: 51.5074, lng: -0.1278, name: 'Londres'},
        'LHR': {lat: 51.5074, lng: -0.1278, name: 'Londres'},
        'FCO': {lat: 41.9028, lng: 12.4964, name: 'Rome'},
        'LIS': {lat: 38.7169, lng: -9.1395, name: 'Lisbonne'},
        'AMS': {lat: 52.3676, lng: 4.9041, name: 'Amsterdam'},
        'MAD': {lat: 40.4168, lng: -3.7038, name: 'Madrid'},
        'PAR': {lat: 48.8566, lng: 2.3522, name: 'Paris'},
        'CDG': {lat: 48.8566, lng: 2.3522, name: 'Paris'},
        'MRS': {lat: 43.2965, lng: 5.3698, name: 'Marseille'},
        'NCE': {lat: 43.7102, lng: 7.2620, name: 'Nice'},
        'DXB': {lat: 25.2048, lng: 55.2708, name: 'Dubaï'},
        'NYC': {lat: 40.7128, lng: -74.0060, name: 'New York'},
        'JFK': {lat: 40.7128, lng: -74.0060, name: 'New York'},
        'IST': {lat: 41.0082, lng: 28.9784, name: 'Istanbul'},
        'ATH': {lat: 37.9838, lng: 23.7275, name: 'Athènes'},
        'PRG': {lat: 50.0755, lng: 14.4378, name: 'Prague'},
        'VIE': {lat: 48.2082, lng: 16.3738, name: 'Vienne'},
        'BER': {lat: 52.5200, lng: 13.4050, name: 'Berlin'},
      };

      function loadStay22(lat, lng, city) {
        if (stay22Loaded) {
          // Met à jour l'iframe existant
          var iframe = widgetDiv.querySelector('iframe');
          if (iframe) {
            iframe.src = 'https://www.stay22.com/embed/gm?aid=' + window._stay22AID + '&lat=' + lat + '&lng=' + lng + '&z=13&currency=EUR&lang=fr';
          }
          return;
        }
        stay22Loaded = true;
        section.classList.add('visible');

        // Met à jour le sous-titre avec la destination
        var sub = section.querySelector('.hf-stay22-sub');
        if (sub && city) sub.textContent = 'Hôtels disponibles à ' + city;

        // Crée l'iframe Stay22 MAP
        var iframe = document.createElement('iframe');
        iframe.src = 'https://www.stay22.com/embed/gm?aid=' + window._stay22AID + '&lat=' + lat + '&lng=' + lng + '&z=13&currency=EUR&lang=fr';
        iframe.id = 'stay22-widget';
        iframe.width = '100%';
        iframe.height = '500';
        iframe.frameBorder = '0';
        iframe.style.cssText = 'border-radius:12px;border:1px solid rgba(0,0,0,0.08);margin-top:.5rem;';
        widgetDiv.innerHTML = '';
        widgetDiv.appendChild(iframe);
      }

      function detectDestination() {
        // Cherche le code IATA dans l'URL
        var url = window.location.href;
        var iataMatch = url.match(/[A-Z]{3}/g);

        // Cherche dans le texte des résultats
        var ticketsTxt = (document.getElementById('tpwl-tickets') || {}).innerText || '';

        // Cherche un code IATA connu
        for (var code in DEST_COORDS) {
          if (ticketsTxt.includes(code) || url.includes(code)) {
            var d = DEST_COORDS[code];
            loadStay22(d.lat, d.lng, d.name);
            return;
          }
        }
        // Fallback : Paris
        loadStay22(48.8566, 2.3522, 'votre destination');
      }

      // Observer les résultats Travelpayouts
      var obs = new MutationObserver(function() {
        var tickets = document.getElementById('tpwl-tickets');
        if (!tickets) return;
        var hasResults = tickets.children.length > 0 && (tickets.innerText||'').trim().length > 20;
        if (hasResults) {
          setTimeout(detectDestination, 800);
        } else {
          section.classList.remove('visible');
          stay22Loaded = false;
        }
      });
      obs.observe(document.body, {childList: true, subtree: true});
    })();

  </script>

</html>
