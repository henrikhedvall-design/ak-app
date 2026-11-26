// Exempeldata när adminsidan inte är kopplad till servern (config.js tom). Samma form som serverfunktionen admin.
(function () {
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const today = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const track = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    track.push([63.4285 + (63.3995 - 63.4285) * t, 13.0905 + (13.079 - 13.0905) * t - Math.sin(t * Math.PI * 4) * 0.0015]);
  }

  const rows = [
    { type: "record", key: "e/1", case_no: 1042, user_id: "u1", name: "Oskar Berg", value: "1,84 s", category: "jump", board: "Lufttid", signal: "Ny 1:a i Åre den här veckan", place: "Åre", time: today(18, 2), status: "under_review", since: ago(12) },
    { type: "record", key: "e/2", case_no: 1041, user_id: "u2", name: "Leo Sund", value: "142,4 km/h", category: "speed", board: "Fart", signal: "Fuskkontrollen misstänker bil: över 120 km/h", place: "Sälen", time: today(17, 47), status: "stopped", since: ago(25) },
    { type: "report", key: "r/media/m3", case_no: 1040, user_id: "u3", name: "Maja Ek", value: "Video", category: "rotation", board: "Rotation", signal: "3 rapporter: olämpligt innehåll", place: "Åre", time: today(17, 30), status: "hidden", since: ago(42) },
    { type: "report", key: "r/media/m4", case_no: 1039, user_id: "u4", name: "Ida Norén", value: "Foto", category: "jump", board: "Lufttid", signal: "Bildfiltret: möjlig nakenhet, 82 %", place: "Vemdalen", time: today(17, 5), status: "hidden", since: ago(60) },
    { type: "record", key: "e/5", case_no: 1038, user_id: "u5", name: "Elsa Holm", value: "1080°", category: "rotation", board: "Rotation", signal: "PB +360° på en dag", place: "Åre", time: today(16, 51), status: "under_review", since: ago(70) },
    { type: "record", key: "e/6", case_no: 1037, user_id: "u5", name: "Elsa Holm", value: "94,8 km/h", category: "speed", board: "Fart", signal: "Ny 1:a i Åre den här veckan", place: "Åre", time: today(16, 20), status: "under_review", since: ago(120) },
    { type: "report", key: "r/avatar/u7", case_no: 1036, user_id: "u7", name: "Kalle Persson", value: "Profilbild", category: null, board: null, signal: "1 rapport: stötande bild", place: "Sälen", time: today(15, 58), status: "visible", since: ago(130) },
    { type: "record", key: "e/8", case_no: 1035, user_id: "u8", name: "Nils Åberg", value: "6,26 s", category: "jump", board: "Lufttid", signal: "Fuskkontrollen: lufttid utan höjdskillnad", place: "Hemavan", time: today(15, 12), status: "stopped", since: ago(180) },
  ];

  const users = [
    ["u1", "Oskar Berg", "oskar.b@icloud.com", "apple", 16, 12, ago(20), null],
    ["u5", "Elsa Holm", "elsa.holm@gmail.com", "apple", 24, 31, ago(90), null],
    ["u3", "Maja Ek", "maja.ek@icloud.com", "apple", 19, 8, ago(60), null],
    ["u2", "Leo Sund", "leo.sund@gmail.com", "google", 17, 5, ago(2 * 1440), new Date(Date.now() + 20 * 86400000).toISOString()],
    ["u4", "Ida Norén", "ida.noren@hotmail.com", "google", 28, 14, ago(1440), null],
    ["u8", "Nils Åberg", "nils.a@icloud.com", "apple", 15, 3, ago(5 * 1440), new Date(Date.now() + 4 * 86400000).toISOString()],
    ["u7", "Kalle Persson", "kalle.p@gmail.com", "google", 21, 9, ago(1440), null],
  ].map(([id, name, email, provider, age, days, last, susp]) => ({ id, name, email, provider, age, days, last_active_at: last, suspended_until: susp, avatar: null }));

  function caseFor(key) {
    const row = rows.find((r) => r.key === key) || rows[0];
    const isReport = row.type === "report";
    const shown = isReport ? { jump: "1,26 s", speed: "84,8 km/h", rotation: "540°" }[row.category] : row.value;
    const event = row.category ? {
      id: "e-" + row.case_no, case_no: row.case_no, category: row.category, board: row.board,
      title: { jump: "Lufttid", speed: "Fart", rotation: "Rotation" }[row.category] + " " + shown,
      value_text: shown, value: parseFloat(shown.replace(",", ".")), airtime: row.category === "jump" ? 1.8 : 1.1,
      jump_drop: 3.2, takeoff_speed_kmh: 38, lat: track[12][0], lon: track[12][1], time: row.time, created_at: row.since,
      status: isReport ? "approved" : row.status, signal: row.signal,
      checks: [
        { name: "Rimligt värde", ok: true, text: "Värdet är rimligt" },
        { name: "Under inspelningen", ok: true, text: "Hände under en inspelning" },
        { name: "Plats", ok: true, text: "I Åre" },
        { name: "Sensordata", ok: row.status !== "stopped", text: row.status === "stopped" ? row.signal.replace("Fuskkontrollen: ", "").replace("Fuskkontrollen ", "") : "Stämmer med sensordatan" },
        { name: "Personbästa", ok: false, text: "PB +64 %" },
      ],
      checks_summary: row.status === "stopped" ? "Fuskkontroll: 3 av 5 ok." : "Fuskkontroll: 4 av 5 ok.",
      resort_name: row.place, track,
      previous_first: { name: "Ebba Lund", value_text: "1,68 s" }, previous_pb: "1,13 s",
    } : null;
    return {
      report: isReport ? { kind: row.key.split("/")[1], target: row.key.split("/")[2], case_no: row.case_no, user_id: row.user_id,
        items: [{ reason: "Olämpligt innehåll", created_at: ago(50), by: "Wilma Sjö" }, { reason: "Olämpligt innehåll", created_at: ago(45), by: "Hugo Lind" }] } : null,
      event,
      media: row.category ? [{ id: "m1", kind: row.value === "Foto" ? "photo" : "video", url: null, poster: null, duration: 14, created_at: ago(10), filter_status: row.value === "Foto" ? "flagged" : "ok", filter_label: "möjlig nakenhet", filter_score: 0.82, hidden: false }] : [],
      user: { id: row.user_id, name: row.name, age: 16, created_at: "2026-11-03T10:00:00Z", avatar: null, suspended_until: null, runs: 42, days: 12, records: 3, rejected: 1 },
    };
  }

  function user(id) {
    const u = users.find((x) => x.id === id) || users[0];
    const d = (n, h) => { const x = new Date(Date.now() - n * 86400000); x.setHours(h || 10); return x.toISOString(); };
    return {
      ...u, home_town: "Åre", created_at: "2026-11-03T10:00:00Z", suspended_reason: null,
      bests: {
        speed: { id: "s1", value: 92, value_text: "92,4 km/h", status: "approved", resort_name: "Åre", time: d(2) },
        jump: { id: "j1", value: 1.8, value_text: "1,84 s", status: "under_review", airtime: 1.8, jump_drop: 3.2, resort_name: "Åre", time: d(2) },
        rotation: { id: "r1", value: 720, value_text: "volt + 180", status: "approved", resort_name: "Åre", time: d(2) },
      },
      days: [
        { id: "d1", date: d(2), resort_name: "Åre", speed: { id: "s1", text: "92,4 km/h", status: "approved" }, jump: { id: "j1", text: "1,84 s", status: "under_review" }, rotation: { id: "r1", text: "720°", status: "approved" }, media: 3, status: "under_review" },
        { id: "d2", date: d(3), resort_name: "Åre", speed: { id: "s2", text: "79,3 km/h", status: "approved" }, jump: { id: "j2", text: "0,97 s", status: "approved" }, rotation: { id: "r2", text: "360°", status: "approved" }, media: 1, status: "approved" },
        { id: "d3", date: d(5), resort_name: "Storulvån", speed: { id: "s3", text: "64,8 km/h", status: "approved" }, jump: { id: "j3", text: "1,13 s", status: "approved" }, rotation: null, media: 0, status: "approved" },
        { id: "d4", date: d(12), resort_name: "Åre", speed: { id: "s4", text: "131,7 km/h", status: "rejected" }, jump: null, rotation: null, media: 0, status: "rejected" },
      ],
      moderation: { rejected: 1, reports_against: 2, reports_made: 1 },
      history: [
        { kind: "decision", text: "Avvisad: Fart 131,7 km/h. Fart i liften, inte i backen. Av Henrik H.", at: d(12) },
        { kind: "report", text: "Rapport från Maja Ek om lufttid 1,8 s. Ligger i granskningskön.", at: d(2) },
      ],
    };
  }

  window.AK_DEMO = async function (action, body) {
    await new Promise((r) => setTimeout(r, 120));
    switch (action) {
      case "me": return { email: "admin@exempel.se", name: "Henrik H", queue: rows.length };
      case "queue": return { rows };
      case "case": return caseFor(body.key);
      case "users": return { users };
      case "user": return user(body.user_id);
      default: return { ok: true };
    }
  };
})();
