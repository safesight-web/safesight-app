import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// ─── CONTROL / ADMIN ACCOUNTS (still local — these aren't homeowners) ─────────
const STAFF_USERS = {
  "control@safesight.com": { password: "test", role: "control" },
  "admin@safesight.com":   { password: "test", role: "admin"   },
};

// ─── DATA HOOKS ───────────────────────────────────────────────────────────────

// Fetch all customers with their emergency contacts, incidents and device status
function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // customers + emergency_contacts (nested)
      const { data: custs } = await supabase
        .from("customers")
        .select("*, emergency_contacts(*)")
        .order("created_at", { ascending: false });

      // all incidents
      const { data: incs } = await supabase
        .from("incidents")
        .select("*")
        .order("created_at", { ascending: false });

      // all devices (for last_seen / status)
      const { data: devs } = await supabase
        .from("devices")
        .select("*");

      const incMap = {};
      (incs || []).forEach(i => {
        if (!incMap[i.customer_id]) incMap[i.customer_id] = [];
        incMap[i.customer_id].push({
          id:               i.id,
          time:             new Date(i.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }),
          status:           i.acknowledged ? "resolved" : "active",
          ack:              i.acknowledged,
          clip_url:         i.clip_url,
          face_snapshot_url: i.face_snapshot_url || null,
        });
      });

      const devMap = {};
      (devs || []).forEach(d => { devMap[d.customer_id] = d; });

      const merged = (custs || []).map(c => {
        const dev        = devMap[c.id];
        const lastSeen   = dev ? new Date(dev.last_seen) : null;
        const minsAgo    = lastSeen ? (Date.now() - lastSeen) / 60000 : Infinity;
        const hasOpenInc = (incMap[c.id] || []).some(i => !i.ack);
        const status     = hasOpenInc ? "triggered" : minsAgo < 2 ? "online" : "offline";
        return {
          ...c,
          status,
          telegram_linked: !!c.telegram_chat_id,
          device_id:       c.device_id || (dev ? dev.id : "—"),
          joined:          c.created_at ? c.created_at.slice(0, 10) : "—",
          emergency_contacts: c.emergency_contacts || [],
          incidents:       incMap[c.id] || [],
        };
      });

      setCustomers(merged);
    } catch (e) {
      console.error("useCustomers error:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll every 15 seconds so the control room updates automatically
  useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return { customers, loading, reload: load };
}

// Fetch known faces for a specific customer
function useKnownFaces(customerId) {
  const [faces, setFaces]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!customerId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("known_faces")
        .select("*")
        .eq("customer_id", customerId)
        .order("name");
      setFaces(data || []);
    } catch (e) {
      console.error("useKnownFaces error:", e);
    }
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);
  return { faces, loading, reload: load };
}

async function deleteKnownFace(faceId) {
  await supabase.from("known_faces").delete().eq("id", faceId);
}
async function acknowledgeIncident(incidentId) {
  await supabase
    .from("incidents")
    .update({ acknowledged: true })
    .eq("id", incidentId);
}

// Save emergency contacts for a customer (replace all)
async function saveEmergencyContacts(customerId, contacts) {
  await supabase.from("emergency_contacts").delete().eq("customer_id", customerId);
  if (contacts.length > 0) {
    await supabase.from("emergency_contacts").insert(
      contacts.map(c => ({ ...c, customer_id: customerId }))
    );
  }
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const S = {
  ink: "#0a0b0f", paper: "#f4f2ed", mist: "#e8e5de", steel: "#9a9588",
  accent: "#d4421a", safe: "#1a6e3c", warn: "#c47b00", surface: "#ffffff", border: "#dddad2",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans',sans-serif;background:${S.paper};color:${S.ink}}

  /* AUTH */
  .auth-wrap{min-height:100vh;display:grid;grid-template-columns:1fr 1fr;background:${S.ink}}
  @media(max-width:680px){.auth-wrap{grid-template-columns:1fr}.auth-panel{display:none!important}}
  .auth-panel{background:${S.ink};display:flex;flex-direction:column;justify-content:space-between;padding:48px;position:relative;overflow:hidden}
  .auth-panel::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 30% 60%,#d4421a22,transparent 60%),radial-gradient(ellipse at 80% 20%,#1a6e3c18,transparent 50%)}
  .auth-logo{font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:#fff;z-index:1}
  .auth-logo span{color:${S.accent}}
  .auth-tagline{font-family:'Syne',sans-serif;font-size:44px;font-weight:800;color:#fff;line-height:1.08;z-index:1}
  .auth-tagline em{color:${S.accent};font-style:normal}
  .auth-sub{font-size:15px;color:#777;margin-top:14px;max-width:320px;line-height:1.65;z-index:1}
  .auth-form-side{background:${S.paper};display:flex;align-items:center;justify-content:center;padding:48px 40px}
  .auth-form-box{width:100%;max-width:400px}
  .auth-form-box h2{font-family:'Syne',sans-serif;font-size:28px;font-weight:700;margin-bottom:6px}
  .auth-form-box>p{color:${S.steel};font-size:14px;margin-bottom:28px}
  .auth-switch{text-align:center;margin-top:18px;font-size:14px;color:${S.steel}}
  .auth-switch button{background:none;border:none;color:${S.accent};cursor:pointer;font-weight:500;font-size:14px}

  /* FORMS */
  .field{margin-bottom:16px}
  .field label{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.09em;color:${S.steel};margin-bottom:5px}
  .field input,.field select{width:100%;padding:11px 13px;background:${S.surface};border:1.5px solid ${S.border};border-radius:9px;font-family:'DM Sans',sans-serif;font-size:15px;color:${S.ink};outline:none;transition:border-color .15s}
  .field input:focus,.field select:focus{border-color:${S.accent}}
  .form-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  @media(max-width:480px){.form-row{grid-template-columns:1fr}}

  /* BUTTONS */
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 20px;border-radius:9px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;border:none;transition:all .15s;white-space:nowrap}
  .btn-primary{background:${S.accent};color:#fff}.btn-primary:hover{background:#b83614}
  .btn-secondary{background:${S.mist};color:${S.ink}}.btn-secondary:hover{background:${S.border}}
  .btn-ghost{background:transparent;color:${S.ink};border:1.5px solid ${S.border}}.btn-ghost:hover{background:${S.mist}}
  .btn-safe{background:#e4f2ea;color:${S.safe}}
  .btn-danger{background:#fde8e4;color:${S.accent}}
  .btn-full{width:100%}.btn-sm{padding:6px 13px;font-size:13px}

  /* NAV */
  .nav{background:${S.ink};color:#fff;padding:0 28px;display:flex;align-items:center;justify-content:space-between;height:58px;position:sticky;top:0;z-index:100;border-bottom:1px solid #1e2028}
  .nav-logo{font-family:'Syne',sans-serif;font-weight:800;font-size:20px}
  .nav-logo span{color:${S.accent}}
  .nav-right{display:flex;align-items:center;gap:14px}
  .nav-user{font-size:13px;color:#888}
  .nav-role{font-size:11px;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.1em;padding:3px 8px;border-radius:4px;background:#1e2028;color:${S.steel}}

  /* LAYOUT */
  .layout{display:flex;flex:1}
  .sidebar{width:210px;min-height:calc(100vh - 58px);background:${S.surface};border-right:1px solid ${S.border};padding:20px 0;flex-shrink:0}
  .sidebar-item{display:flex;align-items:center;gap:9px;padding:10px 18px;font-size:14px;cursor:pointer;color:${S.steel};transition:all .1s;border-left:3px solid transparent}
  .sidebar-item:hover{background:${S.mist};color:${S.ink}}
  .sidebar-item.active{color:${S.accent};background:#fde8e4;border-left-color:${S.accent};font-weight:500}
  .sidebar-section{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:${S.steel};padding:14px 18px 5px;font-weight:600}
  .main{flex:1;padding:28px 32px;min-width:0}

  /* CARDS */
  .card{background:${S.surface};border:1px solid ${S.border};border-radius:12px;padding:22px}
  .card-grid{display:grid;gap:14px}
  .card-grid-2{grid-template-columns:1fr 1fr}
  @media(max-width:860px){.card-grid-2{grid-template-columns:1fr}}

  /* STATS */
  .stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:22px}
  @media(max-width:760px){.stat-grid{grid-template-columns:repeat(2,1fr)}}
  .stat-card{background:${S.surface};border:1px solid ${S.border};border-radius:12px;padding:18px 20px}
  .stat-val{font-family:'Syne',sans-serif;font-size:34px;font-weight:800;line-height:1}
  .stat-label{font-size:12px;color:${S.steel};margin-top:3px}

  /* BADGES */
  .badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-family:'DM Mono',monospace;padding:3px 9px;border-radius:20px;font-weight:500}
  .badge::before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor;flex-shrink:0}
  .badge-triggered{background:#fde8e4;color:${S.accent}}
  .badge-online{background:#e4f2ea;color:${S.safe}}
  .badge-offline{background:${S.mist};color:${S.steel}}
  .badge-warn{background:#fff3dc;color:${S.warn}}

  /* TABLE */
  .table-wrap{overflow-x:auto;border-radius:12px;border:1px solid ${S.border}}
  table{width:100%;border-collapse:collapse;background:${S.surface}}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${S.steel};font-weight:600;padding:11px 15px;text-align:left;border-bottom:1px solid ${S.border};background:${S.mist}}
  td{padding:12px 15px;font-size:14px;border-bottom:1px solid ${S.border};vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#fafaf8}

  /* ALERT ROWS */
  .alert-row{display:flex;align-items:center;gap:11px;padding:13px 0;border-bottom:1px solid ${S.border}}
  .alert-row:last-child{border-bottom:none}
  .alert-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
  .alert-dot.active{background:${S.accent};box-shadow:0 0 0 3px #d4421a33;animation:pulse 2s infinite}
  .alert-dot.resolved{background:${S.border}}
  @keyframes pulse{0%,100%{box-shadow:0 0 0 3px #d4421a33}50%{box-shadow:0 0 0 6px #d4421a18}}
  .alert-info{flex:1;min-width:0}
  .alert-title{font-size:14px;font-weight:500}
  .alert-meta{font-size:12px;color:${S.steel};margin-top:1px;font-family:'DM Mono',monospace}

  /* PAGE HEADERS */
  .page-header{margin-bottom:24px}
  .page-header h1{font-family:'Syne',sans-serif;font-size:26px;font-weight:800}
  .page-header p{color:${S.steel};font-size:14px;margin-top:3px}
  .page-header-row{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:24px}

  /* DETAIL VIEW */
  .detail-header{display:flex;align-items:center;gap:14px;margin-bottom:22px;flex-wrap:wrap}
  .avatar{border-radius:50%;background:${S.accent};display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;color:#fff;flex-shrink:0}
  .detail-name{font-family:'Syne',sans-serif;font-size:21px;font-weight:700}
  .detail-sub{font-size:12px;color:${S.steel};font-family:'DM Mono',monospace;margin-top:2px}
  .info-row{padding:11px 0;border-bottom:1px solid ${S.border}}
  .info-row:last-child{border-bottom:none}
  .info-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${S.steel};font-weight:600}
  .info-val{font-size:14px;margin-top:3px}
  .section-title{font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin-bottom:13px}
  .divider{height:1px;background:${S.border};margin:18px 0}
  .empty{text-align:center;padding:40px;color:${S.steel};font-size:14px}
  .back-btn{display:inline-flex;align-items:center;gap:6px;font-size:14px;color:${S.steel};cursor:pointer;margin-bottom:18px;background:none;border:none;padding:0;font-family:'DM Sans',sans-serif}
  .back-btn:hover{color:${S.ink}}
  .chip{display:inline-flex;align-items:center;padding:3px 9px;background:${S.mist};border-radius:20px;font-size:12px;font-family:'DM Mono',monospace}

  /* REGISTRATION STEPS */
  .steps{display:flex;align-items:center;margin-bottom:32px}
  .step-num{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}
  .step-num.done{background:${S.safe};color:#fff}
  .step-num.active{background:${S.accent};color:#fff}
  .step-num.pending{background:${S.mist};color:${S.steel}}
  .step-label{font-size:12px;color:${S.steel};white-space:nowrap}
  .step-label.active{color:${S.ink};font-weight:500}
  .step-line{flex:1;height:1px;background:${S.border};min-width:16px}

  /* TELEGRAM STEPS */
  .tg-step{display:flex;align-items:flex-start;gap:12px;padding:14px;background:${S.mist};border-radius:9px;margin-bottom:10px}
  .tg-num{width:26px;height:26px;border-radius:50%;background:${S.ink};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:1px}
  .tg-text{font-size:14px;line-height:1.55}
  .tg-code{font-family:'DM Mono',monospace;background:${S.ink};color:#7dd3b8;padding:8px 14px;border-radius:7px;font-size:14px;letter-spacing:.08em;display:inline-block;margin:6px 0}

  /* MODAL */
  .modal-bg{position:fixed;inset:0;background:#0008;z-index:200;display:flex;align-items:center;justify-content:center;padding:14px}
  .modal{background:${S.surface};border-radius:14px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto}
  .modal-head{padding:22px 22px 0;display:flex;align-items:center;justify-content:space-between}
  .modal-head h3{font-family:'Syne',sans-serif;font-size:19px;font-weight:700}
  .modal-close{background:${S.mist};border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:17px;display:flex;align-items:center;justify-content:center}
  .modal-body{padding:18px 22px 22px}

  /* SYSTEM STATUS BANNER */
  .system-status{border-radius:12px;padding:18px 22px;display:flex;align-items:center;gap:14px;margin-bottom:22px}
  .system-status.ok{background:linear-gradient(135deg,#e4f2ea,#d0ebd9);border:1px solid #b8d9c4}
  .system-status.alert{background:linear-gradient(135deg,#fde8e4,#fad5ce);border:1px solid #f0b8ac;animation:pulse-bg 2s infinite}
  @keyframes pulse-bg{0%,100%{opacity:1}50%{opacity:.88}}

  /* INCIDENT / CLIP ITEMS */
  .incident-item{padding:13px 0;border-bottom:1px solid ${S.border};display:flex;align-items:center;gap:11px}
  .incident-item:last-child{border-bottom:none}
  .ec-card{border:1px solid ${S.border};border-radius:9px;padding:13px 15px;margin-bottom:10px}

  /* CLIP PLAYER */
  .clip-player{background:#000;border-radius:10px;overflow:hidden;margin-top:12px}
  .clip-player video{width:100%;display:block;max-height:320px}
  .clip-unavailable{background:#0d0d0d;border-radius:10px;padding:32px;text-align:center;color:#555;font-size:13px;font-family:'DM Mono',monospace;margin-top:12px}

  /* QR BOX */
  .qr-box{border:2px dashed ${S.border};border-radius:14px;padding:28px;text-align:center;background:${S.mist}}
`;

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Icon = ({ n, s = 15 }) => {
  const paths = {
    home:     <><rect x="3" y="9" width="18" height="13" rx="2"/><path d="M3 9L12 2l9 7"/></>,
    shield:   <><path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7L12 2z"/></>,
    users:    <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    bell:     <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    video:    <><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></>,
    camera:   <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    phone:    <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></>,
    logout:   <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    plus:     <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    play:     <><polygon points="5 3 19 12 5 21 5 3"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    check:    <><polyline points="20 6 9 17 4 12"/></>,
    x:        <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[n]}
    </svg>
  );
};

// ─── QR CODE MOCK ─────────────────────────────────────────────────────────────
const QRMock = ({ deviceId }) => {
  const pat = [1,1,1,1,1,1,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1,1,0,0,0,0,0,1,0,0,1,0,1,0,0,1,0,0,0,0,0,1,1,0,1,1,1,0,1,0,1,1,0,0,1,0,1,0,1,1,1,0,1,1,0,1,1,1,0,1,0,0,0,1,1,0,0,1,0,1,1,1,0,1,1,0,1,1,1,0,1,0,1,0,1,0,1,0,1,0,1,1,1,0,1,1,0,0,0,0,0,1,0,0,1,1,0,0,0,1,0,0,0,0,0,1,1,1,1,1,1,1,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1];
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ display: "inline-block", background: "#fff", padding: 10, borderRadius: 9, boxShadow: "0 2px 10px #0002" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(21,1fr)", gap: 1.5, width: 126 }}>
          {pat.map((v, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: 1, background: v ? S.ink : "transparent" }} />)}
        </div>
      </div>
      <div style={{ marginTop: 9, fontFamily: "'DM Mono',monospace", fontSize: 12, color: S.steel }}>{deviceId}</div>
    </div>
  );
};

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
const StatusBadge = ({ s }) => (
  <span className={`badge badge-${s}`}>
    {s === "triggered" ? "⚠ TRIGGERED" : s.toUpperCase()}
  </span>
);

// ─── CLIP MODAL ───────────────────────────────────────────────────────────────
const ClipModal = ({ incident, onClose }) => (
  <div className="modal-bg" onClick={onClose}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-head">
        <h3>Incident Clip</h3>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>
      <div className="modal-body">
        <div style={{ fontSize: 13, color: S.steel, fontFamily: "'DM Mono',monospace", marginBottom: 12 }}>
          {incident.time}
        </div>
        {incident.clip_url ? (
          <>
            <div className="clip-player">
              <video controls autoPlay>
                <source src={incident.clip_url} type="video/mp4" />
                Your browser does not support video playback.
              </video>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <a href={incident.clip_url} download className="btn btn-ghost btn-sm" style={{ gap: 5 }}>
                <Icon n="download" s={13} /> Download clip
              </a>
            </div>
          </>
        ) : (
          <div className="clip-unavailable">
            📷 Clip still processing or unavailable
          </div>
        )}
      </div>
    </div>
  </div>
);

// ─── FACES PAGE ───────────────────────────────────────────────────────────────
const FacesPage = ({ customerId, customerName, deviceId }) => {
  const { faces, loading, reload } = useKnownFaces(customerId);
  const [deleting, setDeleting]   = useState(null);
  const [adding, setAdding]       = useState(false);
  const [newName, setNewName]     = useState("");
  const [captureStatus, setCaptureStatus] = useState(null);
  const [captureError, setCaptureError]   = useState(null);
  const requestIdRef = useRef(null);
  const pollRef      = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const startPolling = (id) => {
    stopPolling();
    requestIdRef.current = id;
    pollRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from("capture_requests")
          .select("status")
          .eq("id", requestIdRef.current)
          .single();
        if (error) throw error;
        if (data) {
          setCaptureStatus(data.status);
          if (data.status === "done") {
            stopPolling();
            setAdding(false);
            setNewName("");
            setCaptureStatus(null);
            reload();
          } else if (data.status.startsWith("failed")) {
            stopPolling();
            setCaptureError("Capture failed — no face detected. Stand in front of the camera and try again.");
            setCaptureStatus(null);
          }
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
    }, 2000);
  };

  useEffect(() => () => stopPolling(), []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    if (!deviceId || deviceId === "—") {
      alert("No device linked to this account. Link a device first in Account Settings.");
      return;
    }
    setCaptureError(null);
    try {
      const { data, error } = await supabase
        .from("capture_requests")
        .insert({ device_id: deviceId, person_name: newName.trim(), status: "pending" })
        .select()
        .single();
      if (error) throw error;
      setCaptureStatus("pending");
      startPolling(data.id);
    } catch (e) {
      setCaptureError("Failed to send capture request. Check your connection.");
    }
  };

  const handleDelete = async (face) => {
    if (!window.confirm(`Remove ${face.name} from known faces?`)) return;
    setDeleting(face.id);
    await deleteKnownFace(face.id);
    await reload();
    setDeleting(null);
  };

  const statusLabel = {
    pending:   { text: "⏳  Waiting for Pi to respond…",              color: S.warn  },
    capturing: { text: "📸  Capturing photos — stand in front of the camera!", color: S.accent },
    training:  { text: "🧠  Training the model — almost done…",       color: "#0072C6" },
    done:      { text: "✅  Done! Face added successfully.",           color: S.safe  },
  }[captureStatus] || (captureStatus?.startsWith("failed")
    ? { text: "❌  " + captureStatus, color: S.accent }
    : null);

  return (
    <>
      <div className="page-header">
        <h1>Known Faces</h1>
        <p>People recognised by {customerName ? `${customerName}'s` : "the"} SafeSight system</p>
      </div>

      {/* Add Person UI */}
      {!adding && !requestId && (
        <button className="btn btn-primary" style={{ marginBottom: 20, gap: 7 }}
          onClick={() => { setAdding(true); setCaptureStatus(null); }}>
          <Icon n="plus" s={14} /> Add Person
        </button>
      )}

      {(adding || requestId) && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-title">Add a Known Person</div>
          {!requestId ? (
            <>
              <p style={{ fontSize: 13, color: S.steel, marginBottom: 14, lineHeight: 1.6 }}>
                Type the person's name below, then click <strong>Start Capture</strong>.
                The Pi camera will automatically take 20 photos — ask the person to
                stand in front of the camera and look at it while it captures.
              </p>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  className="field"
                  style={{ flex: 1, minWidth: 200, padding: "10px 13px", border: `1.5px solid ${S.border}`, borderRadius: 9, fontSize: 15, fontFamily: "'DM Sans',sans-serif" }}
                  placeholder="e.g. John Smith"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAdd()}
                />
                <button className="btn btn-primary" onClick={handleAdd} disabled={!newName.trim()}>
                  📸 Start Capture
                </button>
                <button className="btn btn-ghost" onClick={() => { setAdding(false); setNewName(""); }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div style={{ padding: "8px 0" }}>
              {statusLabel && (
                <div style={{ fontSize: 15, fontWeight: 500, color: statusLabel.color, marginBottom: 10 }}>
                  {statusLabel.text}
                </div>
              )}
              {captureStatus === "capturing" && (
                <p style={{ fontSize: 13, color: S.steel, lineHeight: 1.6 }}>
                  Make sure <strong>{newName}</strong> is standing directly in front of the camera,
                  facing it, in good lighting. The Pi will take 20 photos automatically.
                </p>
              )}
              {captureStatus !== "done" && !captureStatus?.startsWith("failed") && (
                <div style={{ marginTop: 10, height: 6, background: S.mist, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 3, background: S.accent,
                    width: captureStatus === "pending" ? "15%" : captureStatus === "capturing" ? "50%" : "85%",
                    transition: "width 0.5s ease",
                  }} />
                </div>
              )}
              {captureError && (
                <div style={{ fontSize: 13, color: S.accent, marginTop: 8 }}>{captureError}</div>
              )}
              {captureStatus?.startsWith("failed") && (
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}
                  onClick={() => { setCaptureStatus(null); setCaptureError(null); }}>
                  Try Again
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {loading
        ? <div className="empty">Loading faces…</div>
        : faces.length === 0
          ? <div className="empty" style={{ padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>No known faces yet</div>
              <div style={{ fontSize: 13 }}>Click Add Person above to get started.</div>
            </div>
          : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
              {faces.map(face => (
                <div key={face.id} className="card" style={{ padding: 0, overflow: "hidden", textAlign: "center" }}>
                  {face.photo_url
                    ? <img src={face.photo_url} alt={face.name}
                           style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                    : <div style={{ width: "100%", height: 160, background: S.mist, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>👤</div>
                  }
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600, fontSize: 14, fontFamily: "'Syne',sans-serif" }}>{face.name}</div>
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ marginTop: 8, width: "100%", fontSize: 12 }}
                      disabled={deleting === face.id}
                      onClick={() => handleDelete(face)}
                    >
                      {deleting === face.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
      }
    </>
  );
};

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
const Auth = ({ onLogin }) => {
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", address: "", e1n: "", e1p: "", e1r: "", e2n: "", e2p: "", e2r: "" });
  const f = k => v => setForm(x => ({ ...x, [k]: v }));

  const [loading, setLoading] = useState(false);

  const login = async () => {
    setErr("");
    setLoading(true);

    // Staff accounts (control room / admin) — local check
    const staff = STAFF_USERS[email.toLowerCase()];
    if (staff) {
      if (staff.password !== pass) { setErr("Invalid email or password."); setLoading(false); return; }
      onLogin({ email, role: staff.role, customer: null });
      setLoading(false);
      return;
    }

    // Homeowner — authenticate via Supabase
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) { setErr("Invalid email or password."); setLoading(false); return; }

    // Load their customer record
    const { data: cust } = await supabase
      .from("customers")
      .select("*, emergency_contacts(*)")
      .eq("email", email)
      .single();

    onLogin({ email, role: "homeowner", supabaseUser: data.user, customerId: cust?.id || null });
    setLoading(false);
  };

  const register = async () => {
    setErr("");
    setLoading(true);
    try {
      // 1. Create Supabase auth user
      const { data, error } = await supabase.auth.signUp({ email, password: pass });
      if (error) { setErr(error.message); setLoading(false); return; }

      // 2. Insert customer row
      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .insert({ email, full_name: form.name, phone: form.phone, address: form.address })
        .select()
        .single();
      if (custErr) { setErr("Account created but profile save failed. Please contact support."); setLoading(false); return; }

      // 3. Insert emergency contacts
      const contacts = [
        form.e1n && { customer_id: cust.id, name: form.e1n, phone: form.e1p, relation: form.e1r },
        form.e2n && { customer_id: cust.id, name: form.e2n, phone: form.e2p, relation: form.e2r },
      ].filter(Boolean);
      if (contacts.length > 0) {
        await supabase.from("emergency_contacts").insert(contacts);
      }

      // 4. Done — go to login
      setMode("login");
      setErr("");
      setStep(1);
    } catch (e) {
      setErr("Registration failed. Please try again.");
    }
    setLoading(false);
  };

  if (mode === "register") return (
    <div className="auth-wrap">
      <style>{css}</style>
      <div className="auth-panel">
        <div className="auth-logo">Safe<span>Sight</span></div>
        <div>
          <div className="auth-tagline">Protect<br />what <em>matters</em><br />most.</div>
          <p className="auth-sub">Professional CCTV monitoring with AI facial recognition — always watching, so you don't have to.</p>
        </div>
        <div style={{ fontSize: 13, color: "#444" }}>© 2026 SafeSight Ltd.</div>
      </div>
      <div className="auth-form-side">
        <div className="auth-form-box">
          <div className="steps">
            {["Your Details", "Emergency Contacts", "Connect Device"].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", flex: i < 2 ? 1 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div className={`step-num ${step > i + 1 ? "done" : step === i + 1 ? "active" : "pending"}`}>
                    {step > i + 1 ? "✓" : i + 1}
                  </div>
                  <span className={`step-label ${step === i + 1 ? "active" : ""}`}>{s}</span>
                </div>
                {i < 2 && <div className="step-line" />}
              </div>
            ))}
          </div>

          {step === 1 && <>
            <h2>Create your account</h2>
            <p>Your details as the property owner</p>
            <div className="form-row">
              <div className="field"><label>Full Name</label><input value={form.name} onChange={e => f("name")(e.target.value)} placeholder="Marcus Reid" /></div>
              <div className="field"><label>Phone</label><input value={form.phone} onChange={e => f("phone")(e.target.value)} placeholder="07700 900123" /></div>
            </div>
            <div className="field"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="marcus@email.com" /></div>
            <div className="field"><label>Password</label><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" /></div>
            <div className="field"><label>Home Address</label><input value={form.address} onChange={e => f("address")(e.target.value)} placeholder="14 Birchwood Lane, Manchester, M14 6PR" /></div>
            <button className="btn btn-primary btn-full" style={{ marginTop: 6 }} onClick={() => setStep(2)}>Continue →</button>
          </>}

          {step === 2 && <>
            <h2>Emergency Contacts</h2>
            <p>Who should we contact in an emergency?</p>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: S.steel, textTransform: "uppercase", letterSpacing: ".07em" }}>Contact 1</div>
            <div className="form-row">
              <div className="field"><label>Name</label><input value={form.e1n} onChange={e => f("e1n")(e.target.value)} placeholder="Sandra Reid" /></div>
              <div className="field"><label>Relation</label><input value={form.e1r} onChange={e => f("e1r")(e.target.value)} placeholder="Spouse" /></div>
            </div>
            <div className="field"><label>Phone</label><input value={form.e1p} onChange={e => f("e1p")(e.target.value)} placeholder="07700 900456" /></div>
            <div className="divider" />
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: S.steel, textTransform: "uppercase", letterSpacing: ".07em" }}>
              Contact 2 <span style={{ fontWeight: 400 }}>(optional)</span>
            </div>
            <div className="form-row">
              <div className="field"><label>Name</label><input value={form.e2n} onChange={e => f("e2n")(e.target.value)} placeholder="Tom Reid" /></div>
              <div className="field"><label>Relation</label><input value={form.e2r} onChange={e => f("e2r")(e.target.value)} placeholder="Son" /></div>
            </div>
            <div className="field"><label>Phone</label><input value={form.e2p} onChange={e => f("e2p")(e.target.value)} placeholder="07700 900789" /></div>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(3)}>Continue →</button>
            </div>
          </>}

          {step === 3 && <>
            <h2>Connect your device</h2>
            <p>Link your SafeSight Pi and Telegram alerts</p>
            <div className="qr-box" style={{ marginBottom: 18 }}>
              <QRMock deviceId="SS-PI-NEW" />
              <p style={{ fontSize: 14, color: S.steel, marginTop: 11, lineHeight: 1.5 }}>
                Scan the QR code on your SafeSight unit<br />to link it to your account instantly
              </p>
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }}>📷 Scan QR Code</button>
            </div>
            <div className="divider" />
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Syne',sans-serif", marginBottom: 12 }}>Connect Telegram Alerts</div>
            <div className="tg-step"><div className="tg-num">1</div><div className="tg-text">Open Telegram and search for <strong>@SafeSightBot</strong></div></div>
            <div className="tg-step"><div className="tg-num">2</div><div className="tg-text">Send this command:<br /><span className="tg-code">/activate SS-NEW-ACCT</span></div></div>
            <div className="tg-step"><div className="tg-num">3</div><div className="tg-text">Your account links automatically — alerts and clips arrive directly to your Telegram</div></div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={register} disabled={loading}>
                {loading ? "Creating account…" : "Finish Setup ✓"}
              </button>
            </div>
          </>}

          <div className="auth-switch">Already have an account? <button onClick={() => setMode("login")}>Sign in</button></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="auth-wrap">
      <style>{css}</style>
      <div className="auth-panel">
        <div className="auth-logo">Safe<span>Sight</span></div>
        <div>
          <div className="auth-tagline">Always<br /><em>watching.</em><br />Always safe.</div>
          <p className="auth-sub">AI-powered CCTV with instant Telegram alerts and cloud clip storage — 24/7 professional monitoring.</p>
        </div>
        <div style={{ fontSize: 13, color: "#444" }}>© 2026 SafeSight Ltd.</div>
      </div>
      <div className="auth-form-side">
        <div className="auth-form-box">
          <h2>Welcome back</h2>
          <p>Sign in to your SafeSight account</p>
          {err && <div style={{ background: "#fde8e4", color: S.accent, padding: "9px 13px", borderRadius: 8, fontSize: 14, marginBottom: 14 }}>{err}</div>}
          <div className="field"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={e => e.key === "Enter" && login()} /></div>
          <div className="field"><label>Password</label><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && login()} /></div>
          <button className="btn btn-primary btn-full" style={{ marginTop: 2 }} onClick={login} disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
          <div className="auth-switch">New customer? <button onClick={() => setMode("register")}>Create account</button></div>
        </div>
      </div>
    </div>
  );
};

// ─── NAV ──────────────────────────────────────────────────────────────────────
const Nav = ({ user, onLogout }) => (
  <nav className="nav">
    <div className="nav-logo">Safe<span>Sight</span></div>
    <div className="nav-right">
      <span className="nav-user">{user.email}</span>
      <span className="nav-role">{user.role}</span>
      <button className="btn btn-ghost btn-sm" onClick={onLogout} style={{ color: "#aaa", borderColor: "#2a2d38", gap: 6 }}>
        <Icon n="logout" /> Sign out
      </button>
    </div>
  </nav>
);

// ─── HOMEOWNER DASHBOARD ──────────────────────────────────────────────────────
const HomeownerDash = ({ user }) => {
  const [tab, setTab] = useState("overview");
  const [showTg, setShowTg] = useState(false);
  const [playingClip, setPlayingClip] = useState(null);
  const [c, setC] = useState(null);
  const [loadingData, setLoadingData] = useState(true);

  const loadCustomer = useCallback(async () => {
    if (!user.customerId) { setLoadingData(false); return; }
    const { data: cust } = await supabase
      .from("customers")
      .select("*, emergency_contacts(*)")
      .eq("id", user.customerId)
      .single();
    const { data: incs } = await supabase
      .from("incidents")
      .select("*")
      .eq("customer_id", user.customerId)
      .order("created_at", { ascending: false });
    const { data: dev } = await supabase
      .from("devices")
      .select("*")
      .eq("customer_id", user.customerId)
      .single();

    const incidents = (incs || []).map(i => ({
      id:               i.id,
      time:             new Date(i.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }),
      status:           i.acknowledged ? "resolved" : "active",
      ack:              i.acknowledged,
      clip_url:         i.clip_url,
      face_snapshot_url: i.face_snapshot_url || null,
    }));

    const lastSeen = dev?.last_seen ? new Date(dev.last_seen) : null;
    const minsAgo  = lastSeen ? (Date.now() - lastSeen) / 60000 : Infinity;
    const hasOpen  = incidents.some(i => !i.ack);
    const status   = hasOpen ? "triggered" : minsAgo < 2 ? "online" : "offline";

    setC({
      ...cust,
      status,
      telegram_linked:    !!cust.telegram_chat_id,
      device_id:          cust.device_id || (dev ? dev.id : "—"),
      joined:             cust.created_at?.slice(0, 10) || "—",
      emergency_contacts: cust.emergency_contacts || [],
      incidents,
    });
    setLoadingData(false);
  }, [user.customerId]);

  useEffect(() => { loadCustomer(); }, [loadCustomer]);
  useEffect(() => {
    const t = setInterval(loadCustomer, 15000);
    return () => clearInterval(t);
  }, [loadCustomer]);

  if (loadingData) return <div style={{ padding: 40, textAlign: "center", color: S.steel }}>Loading your account…</div>;
  if (!c) return <div style={{ padding: 40, textAlign: "center", color: S.steel }}>Account not found. Contact support.</div>;

  const tabs = [
    { id: "overview",  n: "home",     l: "Overview" },
    { id: "incidents", n: "video",    l: "Clip History" },
    { id: "contacts",  n: "phone",    l: "Contacts" },
    { id: "faces",     n: "users",    l: "Known Faces" },
    { id: "account",   n: "settings", l: "Account" },
  ];

  return (
    <div className="layout">
      <div className="sidebar">
        {tabs.map(t => (
          <div key={t.id} className={`sidebar-item ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            <Icon n={t.n} /> {t.l}
            {t.id === "incidents" && c.incidents.filter(i => !i.ack).length > 0 && (
              <span style={{ marginLeft: "auto", background: S.accent, color: "#fff", borderRadius: 10, fontSize: 11, padding: "1px 6px", fontFamily: "'DM Mono',monospace" }}>
                {c.incidents.filter(i => !i.ack).length}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="main">

        {tab === "overview" && <>
          <div className="page-header">
            <h1>Good evening, {(c.name || "there").split(" ")[0]} 👋</h1>
            <p>Your home security overview</p>
          </div>

          <div className={`system-status ${c.status === "triggered" ? "alert" : "ok"}`}>
            <div style={{ fontSize: 30 }}>{c.status === "triggered" ? "🚨" : "🛡️"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 17 }}>
                {c.status === "triggered" ? "Alert Active — Unknown Person Detected" : "System Active — All Clear"}
              </div>
              <div style={{ fontSize: 13, opacity: .7, marginTop: 2 }}>
                {c.status === "triggered"
                  ? "Control room notified. A 15-second clip is being recorded and sent to your Telegram."
                  : "Your SafeSight system is active. No alerts currently open."}
              </div>
            </div>
            {c.status === "triggered" && (
              <button className="btn btn-danger btn-sm" onClick={() => setTab("incidents")}>View Clips →</button>
            )}
          </div>

          <div className="stat-grid">
            <div className="stat-card"><div className="stat-val">{c.incidents.length}</div><div className="stat-label">Total incidents</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: S.accent }}>{c.incidents.filter(i => !i.ack).length}</div><div className="stat-label">Unreviewed</div></div>
            <div className="stat-card">
              <div className="stat-val">{c.telegram_linked ? "✓" : "✗"}</div>
              <div className="stat-label" style={{ color: c.telegram_linked ? S.safe : S.accent }}>Telegram</div>
            </div>
            <div className="stat-card">
              <div style={{ marginTop: 6 }}><StatusBadge s={c.status} /></div>
              <div className="stat-label" style={{ marginTop: 8 }}>System status</div>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Recent Incidents</div>
            {c.incidents.length === 0
              ? <div className="empty">No incidents yet</div>
              : c.incidents.slice(0, 3).map(inc => (
                <div key={inc.id} className="alert-row">
                  <div className={`alert-dot ${inc.status}`} />
                  <div className="alert-info">
                    <div className="alert-title">Unknown person detected</div>
                    <div className="alert-meta">{inc.time}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className={`badge ${inc.ack ? "badge-online" : "badge-triggered"}`}>{inc.ack ? "Reviewed" : "New"}</span>
                    {inc.clip_url && (
                      <button className="btn btn-ghost btn-sm" style={{ gap: 5 }} onClick={() => setPlayingClip(inc)}>
                        <Icon n="play" s={12} /> Play
                      </button>
                    )}
                  </div>
                </div>
              ))
            }
          </div>

          {!c.telegram_linked && (
            <div style={{ marginTop: 14, padding: "14px 18px", background: "#fff3dc", border: "1px solid #f0c060", borderRadius: 10, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Telegram not connected</div>
                <div style={{ fontSize: 13, color: S.steel }}>You won't receive alert notifications or clips until Telegram is linked.</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowTg(true)}>Connect</button>
            </div>
          )}
        </>}

        {tab === "incidents" && <>
          <div className="page-header">
            <h1>Clip History</h1>
            <p>All recorded incident clips from your device</p>
          </div>
          <div className="card">
            {c.incidents.length === 0
              ? <div className="empty">No incidents recorded yet</div>
              : c.incidents.map(inc => (
                <div key={inc.id} style={{ padding: "14px 0", borderBottom: `1px solid ${S.border}`, display: "flex", alignItems: "center", gap: 11 }} className="incident-item">
                  {inc.face_snapshot_url
                    ? <img src={inc.face_snapshot_url} alt="Unknown face" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: `2px solid ${S.border}` }} />
                    : <div className={`alert-dot ${inc.status}`} />
                  }
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>Unknown person detected</div>
                    <div style={{ fontSize: 12, color: S.steel, fontFamily: "'DM Mono',monospace", marginTop: 2 }}>{inc.time}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className={`badge ${inc.ack ? "badge-online" : "badge-triggered"}`}>{inc.ack ? "Reviewed" : "New"}</span>
                    {inc.clip_url ? (
                      <button className="btn btn-ghost btn-sm" style={{ gap: 5 }} onClick={() => setPlayingClip(inc)}>
                        <Icon n="play" s={12} /> Play clip
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: S.steel }}>Processing…</span>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        </>}

        {tab === "contacts" && <>
          <div className="page-header-row">
            <div className="page-header" style={{ marginBottom: 0 }}>
              <h1>Emergency Contacts</h1>
              <p>Notified automatically during incidents</p>
            </div>
            <button className="btn btn-primary" style={{ gap: 6 }}><Icon n="plus" s={13} /> Add Contact</button>
          </div>
          <div className="card-grid card-grid-2" style={{ marginTop: 0 }}>
            {c.emergency_contacts.map((ec, i) => (
              <div key={i} className="card">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div className="avatar" style={{ width: 38, height: 38, fontSize: 14 }}>{(ec.name || "?")[0]}</div>
                  <div>
                    <div style={{ fontWeight: 500 }}>{ec.name}</div>
                    <div style={{ fontSize: 12, color: S.steel, fontFamily: "'DM Mono',monospace" }}>{ec.relation}</div>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm btn-full" style={{ gap: 5 }}>
                  <Icon n="phone" s={12} />{ec.phone}
                </button>
              </div>
            ))}
            {c.emergency_contacts.length === 0 && (
              <div className="empty" style={{ gridColumn: "1/-1" }}>No emergency contacts added</div>
            )}
          </div>
        </>}

        {tab === "faces" && <FacesPage customerId={c.id} customerName={c.name} deviceId={c.device_id} />}

        {tab === "account" && <>
          <div className="page-header"><h1>Account Settings</h1><p>Manage your personal information</p></div>
          <div className="card">
            <div className="section-title">Personal Information</div>
            <div className="form-row">
              <div className="field"><label>Full Name</label><input defaultValue={c.name} /></div>
              <div className="field"><label>Phone</label><input defaultValue={c.phone} /></div>
            </div>
            <div className="field"><label>Email</label><input defaultValue={user.email} /></div>
            <div className="field"><label>Home Address</label><input defaultValue={c.address} /></div>
            <button className="btn btn-primary" style={{ marginTop: 6 }}>Save Changes</button>
          </div>
          <div style={{ height: 14 }} />
          <div className="card">
            <div className="section-title">Telegram Alerts</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>{c.telegram_linked ? "✅" : "⚠️"}</span>
              <div>
                <div style={{ fontWeight: 500, color: c.telegram_linked ? S.safe : S.accent }}>
                  {c.telegram_linked ? "Connected" : "Not connected"}
                </div>
                <div style={{ fontSize: 13, color: S.steel }}>
                  {c.telegram_linked ? "Clips and alerts go directly to your Telegram" : "Link Telegram to receive incident clips and alerts"}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => setShowTg(true)}>
                {c.telegram_linked ? "Re-link" : "Connect"}
              </button>
            </div>
          </div>
          <div style={{ height: 14 }} />
          <div className="card">
            <div className="section-title">My Device</div>
            {[["Device ID", c.device_id], ["Status", c.status], ["Registered", c.joined]].map(([l, v]) => (
              <div key={l} className="info-row">
                <div className="info-label">{l}</div>
                <div className="info-val">{l === "Status" ? <StatusBadge s={v} /> : v}</div>
              </div>
            ))}
          </div>
          <div style={{ height: 14 }} />
          <div className="card">
            <div className="section-title" style={{ color: S.accent }}>Danger Zone</div>
            <button className="btn btn-danger">Delete Account</button>
          </div>
        </>}

      </div>

      {showTg && (
        <div className="modal-bg" onClick={() => setShowTg(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>Connect Telegram</h3><button className="modal-close" onClick={() => setShowTg(false)}>×</button></div>
            <div className="modal-body">
              <div className="tg-step"><div className="tg-num">1</div><div className="tg-text">Open Telegram and search for <strong>@SafeSightBot</strong></div></div>
              <div className="tg-step"><div className="tg-num">2</div><div className="tg-text">Send this command:<br /><span className="tg-code">/activate {c.device_id}</span></div></div>
              <div className="tg-step"><div className="tg-num">3</div><div className="tg-text">Your account links within 30 seconds. All future clips and alerts arrive directly to your Telegram.</div></div>
              <button className="btn btn-primary btn-full" style={{ marginTop: 6 }} onClick={() => setShowTg(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {playingClip && <ClipModal incident={playingClip} onClose={() => setPlayingClip(null)} />}
    </div>
  );
};

// ─── CONTROL ROOM DASHBOARD ───────────────────────────────────────────────────
const ControlDash = () => {
  const [tab, setTab] = useState("alerts");
  const [sel, setSel] = useState(null);
  const [playingClip, setPlayingClip] = useState(null);
  const { customers: custs, reload } = useCustomers();

  const triggered = custs.filter(c => c.status === "triggered");

  const ack = async (cid, iid) => {
    await acknowledgeIncident(iid);
    reload();
  };

  const tabs = [
    { id: "alerts",    n: "bell",     l: "Live Alerts" },
    { id: "customers", n: "users",    l: "All Customers" },
    { id: "faces",     n: "camera",   l: "Known Faces" },
    { id: "activity",  n: "activity", l: "Clip Log" },
  ];

  if (sel) {
    const c = custs.find(x => x.id === sel.id) || sel;
    return (
      <div className="layout">
        <div className="sidebar">
          {tabs.map(t => (
            <div key={t.id} className={`sidebar-item ${tab === t.id ? "active" : ""}`} onClick={() => { setTab(t.id); setSel(null); }}>
              <Icon n={t.n} /> {t.l}
            </div>
          ))}
        </div>
        <div className="main">
          <button className="back-btn" onClick={() => setSel(null)}>← Back to customers</button>
          <div className="detail-header">
            <div className="avatar" style={{ width: 48, height: 48, fontSize: 18 }}>{(c.name || "?")[0]}</div>
            <div>
              <div className="detail-name">{c.name}</div>
              <div className="detail-sub">{c.device_id} · {c.address}</div>
            </div>
            <StatusBadge s={c.status} />
          </div>

          <div className="card-grid card-grid-2" style={{ marginBottom: 14 }}>
            <div className="card">
              <div className="section-title">Contact Information</div>
              {[["Phone", c.phone], ["Address", c.address], ["Member since", c.joined]].map(([l, v]) => (
                <div key={l} className="info-row"><div className="info-label">{l}</div><div className="info-val">{v}</div></div>
              ))}
            </div>
            <div className="card">
              <div className="section-title">Emergency Contacts</div>
              {c.emergency_contacts.length === 0
                ? <div className="empty" style={{ padding: 20 }}>None added</div>
                : c.emergency_contacts.map((ec, i) => (
                  <div key={i} className="ec-card">
                    <div style={{ fontWeight: 500 }}>{ec.name} <span style={{ color: S.steel, fontWeight: 400, fontSize: 13 }}>({ec.relation})</span></div>
                    <div style={{ fontSize: 13, color: S.steel, fontFamily: "'DM Mono',monospace", marginTop: 3 }}>{ec.phone}</div>
                  </div>
                ))
              }
            </div>
          </div>

          <div className="card">
            <div className="section-title">Incident Clips</div>
            {c.incidents.length === 0
              ? <div className="empty">No incidents recorded</div>
              : c.incidents.map(inc => (
                <div key={inc.id} className="alert-row">
                  {inc.face_snapshot_url
                    ? <img src={inc.face_snapshot_url} alt="Unknown face" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: `2px solid ${S.border}` }} />
                    : <div className={`alert-dot ${inc.status}`} />
                  }
                  <div className="alert-info">
                    <div className="alert-title">Unknown person detected</div>
                    <div className="alert-meta">{inc.time}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {inc.clip_url ? (
                      <button className="btn btn-ghost btn-sm" style={{ gap: 5 }} onClick={() => setPlayingClip(inc)}>
                        <Icon n="play" s={12} /> Play clip
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: S.steel }}>Processing…</span>
                    )}
                    {!inc.ack && (
                      <button className="btn btn-safe btn-sm" onClick={() => ack(c.id, inc.id)}>
                        <Icon n="check" s={12} /> Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
        {playingClip && <ClipModal incident={playingClip} onClose={() => setPlayingClip(null)} />}
      </div>
    );
  }

  return (
    <div className="layout">
      <div className="sidebar">
        {tabs.map(t => (
          <div key={t.id} className={`sidebar-item ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            <Icon n={t.n} /> {t.l}
            {t.id === "alerts" && triggered.length > 0 && (
              <span style={{ marginLeft: "auto", background: S.accent, color: "#fff", borderRadius: 10, fontSize: 11, padding: "1px 6px", fontFamily: "'DM Mono',monospace" }}>
                {triggered.length}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="main">

        {tab === "alerts" && <>
          <div className="page-header"><h1>Live Alerts</h1><p>Real-time incidents across all customers</p></div>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-val" style={{ color: S.accent }}>{triggered.length}</div><div className="stat-label">Active alerts</div></div>
            <div className="stat-card"><div className="stat-val">{custs.filter(c => c.status === "online").length}</div><div className="stat-label">Online</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: S.steel }}>{custs.filter(c => c.status === "offline").length}</div><div className="stat-label">Offline</div></div>
            <div className="stat-card"><div className="stat-val">{custs.length}</div><div className="stat-label">Total customers</div></div>
          </div>

          {triggered.length > 0 ? (
            <div className="card" style={{ borderColor: S.accent, marginBottom: 16 }}>
              <div className="section-title" style={{ color: S.accent }}>⚠ Active Incidents</div>
              {triggered.map(c => (
                <div key={c.id} className="alert-row" style={{ cursor: "pointer" }} onClick={() => setSel(c)}>
                  <div className="alert-dot active" />
                  <div className="alert-info">
                    <div className="alert-title">{c.name}</div>
                    <div className="alert-meta">{c.address} · {c.incidents.find(i => !i.ack)?.time}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" style={{ gap: 5 }} onClick={e => { e.stopPropagation(); setSel(c); }}>
                      <Icon n="video" s={12} /> View clips
                    </button>
                    <button className="btn btn-safe btn-sm" onClick={e => { e.stopPropagation(); ack(c.id, c.incidents.find(i => !i.ack)?.id); }}>
                      <Icon n="check" s={12} /> Ack
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card">
              <div className="empty" style={{ padding: 44 }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>✅</div>
                All clear — no active alerts
              </div>
            </div>
          )}
        </>}

        {tab === "customers" && <>
          <div className="page-header"><h1>All Customers</h1><p>{custs.length} registered accounts</p></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th><th>Address</th><th>Status</th><th>Telegram</th><th>Device</th><th>Incidents</th><th></th>
                </tr>
              </thead>
              <tbody>
                {custs.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{(c.name || "?")[0]}</div>
                        <div>
                          <div style={{ fontWeight: 500 }}>{c.name}</div>
                          <div style={{ fontSize: 12, color: S.steel, fontFamily: "'DM Mono',monospace" }}>{c.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: S.steel }}>{c.address}</td>
                    <td><StatusBadge s={c.status} /></td>
                    <td><span className={`badge ${c.telegram_linked ? "badge-online" : "badge-offline"}`}>{c.telegram_linked ? "Linked" : "Not linked"}</span></td>
                    <td><span className="chip">{c.device_id}</span></td>
                    <td style={{ fontSize: 13 }}>{c.incidents.length}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSel(c)}>View →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}

        {tab === "faces" && <>
          <div className="page-header"><h1>Known Faces</h1><p>All recognised people across all customers</p></div>
          {custs.length === 0
            ? <div className="empty">No customers yet</div>
            : custs.map(c => (
                <div key={c.id} style={{ marginBottom: 28 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{(c.name || "?")[0]}</div>
                    {c.name || "Unknown Customer"}
                    <span className="chip" style={{ fontSize: 11 }}>{c.device_id}</span>
                  </div>
                  <FacesPage customerId={c.id} customerName={c.name} deviceId={c.device_id} />
                </div>
              ))
          }
        </>}

        {tab === "activity" && <>
          <div className="page-header"><h1>Clip Log</h1><p>All incidents across all customers</p></div>
          <div className="card">
            {custs.flatMap(c => (c.incidents || []).map(i => ({ ...i, cname: c.name || "Unknown", addr: c.address, cid: c.id })))
              .sort((a, b) => b.time.localeCompare(a.time))
              .map(ev => (
                <div key={ev.id} className="alert-row">
                  <div className={`alert-dot ${ev.status}`} />
                  <div className="alert-info">
                    <div className="alert-title">{ev.cname} — Unknown person detected</div>
                    <div className="alert-meta">{ev.addr} · {ev.time}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className={`badge ${ev.ack ? "badge-online" : "badge-triggered"}`}>{ev.ack ? "Resolved" : "Active"}</span>
                    {ev.clip_url && (
                      <button className="btn btn-ghost btn-sm" style={{ gap: 5 }} onClick={() => setPlayingClip(ev)}>
                        <Icon n="play" s={12} /> Play
                      </button>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        </>}

      </div>
      {playingClip && <ClipModal incident={playingClip} onClose={() => setPlayingClip(null)} />}
    </div>
  );
};

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
const AdminDash = () => {
  const [tab, setTab] = useState("overview");
  const { customers: MOCK_CUSTOMERS } = useCustomers();
  const tabs = [
    { id: "overview",  n: "shield",   l: "Overview" },
    { id: "customers", n: "users",    l: "Customers" },
    { id: "devices",   n: "camera",   l: "Devices" },
    { id: "settings",  n: "settings", l: "System Config" },
  ];

  return (
    <div className="layout">
      <div className="sidebar">
        <div className="sidebar-section">SafeSight Admin</div>
        {tabs.map(t => (
          <div key={t.id} className={`sidebar-item ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            <Icon n={t.n} /> {t.l}
          </div>
        ))}
      </div>

      <div className="main">

        {tab === "overview" && <>
          <div className="page-header"><h1>Admin Overview</h1><p>Platform health at a glance</p></div>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-val">{MOCK_CUSTOMERS.length}</div><div className="stat-label">Total customers</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: S.safe }}>{MOCK_CUSTOMERS.filter(c => c.status !== "offline").length}</div><div className="stat-label">Active systems</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: S.accent }}>{MOCK_CUSTOMERS.filter(c => c.status === "triggered").length}</div><div className="stat-label">Live alerts</div></div>
            <div className="stat-card"><div className="stat-val" style={{ color: S.warn }}>{MOCK_CUSTOMERS.filter(c => !c.telegram_linked).length}</div><div className="stat-label">Unlinked Telegram</div></div>
          </div>
          <div className="card-grid card-grid-2">
            <div className="card">
              <div className="section-title">Service Status</div>
              {[["Supabase Database", "Operational"], ["Supabase Storage", "Operational"], ["Telegram Bot", "Operational"], ["Alert Pipeline", "Operational"]].map(([s, v]) => (
                <div key={s} className="info-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14 }}>{s}</span>
                  <span className="badge badge-online">{v}</span>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="section-title">Needs Attention</div>
              {MOCK_CUSTOMERS.filter(c => !c.telegram_linked || c.status === "offline").map(c => (
                <div key={c.id} className="alert-row">
                  <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{(c.name || "?")[0]}</div>
                  <div className="alert-info">
                    <div className="alert-title" style={{ fontSize: 13 }}>{c.name}</div>
                    <div className="alert-meta">
                      {[!c.telegram_linked && "Telegram not linked", c.status === "offline" && "System offline"].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
              ))}
              {MOCK_CUSTOMERS.filter(c => !c.telegram_linked || c.status === "offline").length === 0 && (
                <div className="empty" style={{ padding: 20 }}>All systems healthy</div>
              )}
            </div>
          </div>
        </>}

        {tab === "customers" && <>
          <div className="page-header-row">
            <div className="page-header" style={{ marginBottom: 0 }}><h1>Customers</h1><p>All registered homeowners</p></div>
            <button className="btn btn-primary" style={{ gap: 6 }}><Icon n="plus" s={13} /> Add Customer</button>
          </div>
          <div style={{ height: 16 }} />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Address</th><th>Joined</th><th>Status</th><th>Telegram</th><th>Incidents</th></tr></thead>
              <tbody>
                {MOCK_CUSTOMERS.map(c => (
                  <tr key={c.id}>
                    <td><div style={{ fontWeight: 500 }}>{c.name}</div><div style={{ fontSize: 12, color: S.steel }}>{c.phone}</div></td>
                    <td style={{ fontSize: 13, color: S.steel }}>{c.address}</td>
                    <td style={{ fontSize: 13, fontFamily: "'DM Mono',monospace" }}>{c.joined}</td>
                    <td><StatusBadge s={c.status} /></td>
                    <td><span className={`badge ${c.telegram_linked ? "badge-online" : "badge-warn"}`}>{c.telegram_linked ? "Linked" : "Not linked"}</span></td>
                    <td>{c.incidents.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}

        {tab === "devices" && <>
          <div className="page-header"><h1>Devices</h1><p>All registered SafeSight Pi units</p></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Device ID</th><th>Customer</th><th>Status</th><th>Telegram</th><th>Total Clips</th></tr></thead>
              <tbody>
                {MOCK_CUSTOMERS.map(c => (
                  <tr key={c.id}>
                    <td><span className="chip">{c.device_id}</span></td>
                    <td style={{ fontSize: 14 }}>{c.name}</td>
                    <td><StatusBadge s={c.status} /></td>
                    <td><span className={`badge ${c.telegram_linked ? "badge-online" : "badge-warn"}`}>{c.telegram_linked ? "Linked" : "Not linked"}</span></td>
                    <td style={{ fontSize: 13 }}>{c.incidents.filter(i => i.clip_url).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}

        {tab === "settings" && <>
          <div className="page-header"><h1>System Configuration</h1></div>
          <div className="card">
            <div className="section-title">Telegram Bot</div>
            <div className="field"><label>Bot Token</label><input type="password" defaultValue="8521060596:AAG9kD1Or8qqdIDrCT6nvUDX466vqhHvDaM" /></div>
            <div className="field"><label>Control Room Chat ID</label><input defaultValue="7787048588" /></div>
            <button className="btn btn-primary">Save</button>
          </div>
          <div style={{ height: 14 }} />
          <div className="card">
            <div className="section-title">Supabase</div>
            <div className="field"><label>Project URL</label><input placeholder="https://yourproject.supabase.co" /></div>
            <div className="field"><label>Anon Key</label><input type="password" placeholder="eyJhbGciOiJI..." /></div>
            <button className="btn btn-primary">Save</button>
          </div>
          <div style={{ height: 14 }} />
          <div className="card">
            <div className="section-title">Detection Thresholds</div>
            <div className="form-row">
              <div className="field"><label>Alert hold (seconds)</label><input defaultValue="20" /></div>
              <div className="field"><label>Grace period (seconds)</label><input defaultValue="10" /></div>
            </div>
            <div className="form-row">
              <div className="field"><label>Clip duration (seconds)</label><input defaultValue="15" /></div>
              <div className="field"><label>Known face cooldown (seconds)</label><input defaultValue="60" /></div>
            </div>
            <button className="btn btn-primary">Save</button>
          </div>
        </>}

      </div>
    </div>
  );
};

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  if (!user) return <Auth onLogin={setUser} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <style>{css}</style>
      <Nav user={user} onLogout={() => setUser(null)} />
      {user.role === "homeowner" && <HomeownerDash user={user} />}
      {user.role === "control"   && <ControlDash />}
      {user.role === "admin"     && <AdminDash />}
    </div>
  );
}
