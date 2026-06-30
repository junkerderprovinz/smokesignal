/* SmokeSignal -- shared WebGUI helper (Main + Tools pages).
 * Detects the configured Unraid language, fetches the engine JSON, and renders
 * a theme-matched, localised report in its own modal. Falls back to English for
 * any language or key we don't have. Adds the Main-tab button (next to Reboot). */
(function(){

  /* ---------------- translations (extend by adding a language object) -------- */
  var SS_LANG = {
    en: {
      title: 'SmokeSignal — Pre-Reboot Check',
      hc: 'pre-reboot health check',
      running: 'Running checks…',
      subtitle: 'Advisory only · nothing was changed',
      v_GO: 'GO', v_CAUTION: 'CAUTION', 'v_NO-GO': 'NO-GO',
      tier_critical: 'Critical', tier_warning: 'Caution', tier_info: 'Info',
      err: 'Could not run the check engine.',
      foot: 'SmokeSignal reads the current state and predicts the common reboot landmines (pinned mounts, stuck loops, unclean array, in-flight operations, a crash-looping box). It is an early warning, not a guarantee — genuine hardware, BIOS or timing failures during boot cannot be seen from a running system.',
      tools_lead: 'SmokeSignal checks whether your server will come back up clean before you reboot, and gives one verdict — GO / CAUTION / NO-GO — with the exact findings. It is advisory only: it reads the host and reports, it never changes anything.',
      tools_intro: 'It looks for the reboot landmines that are detectable from the running system:',
      tools_li: [
        'Array started & clean — every device assignment OK (no disabled/invalid/missing disk)',
        'No parity/sync/rebuild/clear or mover in progress',
        'No container mounting a host runtime dir, no stuck docker.img/libvirt.img loop',
        'Flash writable, free space, recent crashes, running VMs, services, SMART health'
      ],
      tools_btn: 'Run pre-reboot check',
      array_ok: 'Array started and healthy; all device assignments OK.',
      array_bad_devices: 'Array not clean — unhealthy data disk(s): {0}',
      array_counts: 'Array not clean: state={0} — disabled={1} invalid={2} missing={3}',
      array_not_started: 'Array is not started (state={0}).',
      array_parity_degraded: 'Parity disk disabled/missing: {0} — the array still boots, but parity protection is reduced.',
      array_op_running: 'Array operation in progress ({0}) — let it finish before rebooting.',
      array_op_ok: 'No parity/sync/rebuild/clear in progress.',
      array_unknown: 'mdcmd not found — cannot determine array state.',
      mover_running: 'Mover is running — wait for it to finish before rebooting.',
      mover_ok: 'Mover is not running.',
      risky_mount_found: 'Container(s) mount a host runtime dir (can break libvirt/docker on reboot):{0}',
      risky_mount_ok: 'No container mounts a host runtime directory (besides docker.sock).',
      risky_mount_skip: 'Docker not available — skipped container mount scan.',
      stuck_loop_found: 'Stuck image/loop state{0}.',
      stuck_loop_ok: 'docker.img / libvirt.img loop state looks clean.',
      stuck_loop_skip: 'losetup not found — skipped loop-device check.',
      flash_ok: 'Flash /boot is mounted and writable.',
      flash_ro: 'Flash /boot is mounted but NOT writable (possible FAT corruption) — config won’t persist.',
      flash_unmounted: 'Flash /boot is not mounted.',
      syslog_crashes: '{0} crash/instability line(s) in syslog since boot. Latest: {1}',
      syslog_ok: 'No crashes/OOM/segfaults in syslog since boot.',
      syslog_skip: 'syslog not readable — skipped crash scan.',
      io_errors: '{0} disk/IO error line(s) in syslog since boot. Latest: {1}',
      io_ok: 'No disk/IO errors in syslog since boot.',
      space_full: '{0} is {1}% full (>={2}%).',
      space_ok: '{0} at {1}% used.',
      vms_running: '{0} VM(s) running — shut them down gracefully before rebooting.',
      vms_ok: 'No VMs running.',
      svc_docker_ok: 'dockerd running.',
      svc_docker_down: 'Docker storage mounted but dockerd is not running.',
      svc_libvirt_ok: 'libvirtd running.',
      svc_libvirt_down: 'libvirt enabled but libvirtd is not running.',
      svc_emhttp_ok: 'emhttpd (WebGUI) running.',
      svc_emhttp_down: 'emhttpd (WebGUI) is not running.',
      binds_missing: 'Container bind source(s) missing (won’t start cleanly after reboot):{0}',
      binds_ok: 'All container bind sources under /mnt exist.',
      smart_failing: 'SMART health FAILING on:{0} — investigate before rebooting.',
      smart_ok: 'SMART health PASSED on {0} disk(s).',
      smart_none: 'No disks found for SMART check.',
      smart_skip: 'smartctl not found — skipped SMART check.',
      smart_attr: 'SMART attribute warnings:{0}',
      info_uptime: 'Uptime: {0}', info_kernel: 'Kernel: {0}', info_unraid: 'Unraid version: {0}'
    },
    de: {
      title: 'SmokeSignal — Pre-Reboot-Check',
      hc: 'Pre-Reboot-Gesundheitscheck',
      running: 'Prüfe…',
      subtitle: 'Nur Hinweis · es wurde nichts verändert',
      v_GO: 'GO', v_CAUTION: 'VORSICHT', 'v_NO-GO': 'NO-GO',
      tier_critical: 'Kritisch', tier_warning: 'Achtung', tier_info: 'Info',
      err: 'Die Prüf-Engine konnte nicht ausgeführt werden.',
      foot: 'SmokeSignal liest den aktuellen Zustand und erkennt die häufigen Neustart-Stolperfallen (gepinnte Mounts, hängende Loops, unsauberes Array, laufende Operationen, eine abstürzende Box). Es ist eine Frühwarnung, keine Garantie — echte Hardware-, BIOS- oder Timing-Fehler beim Booten sind vom laufenden System nicht sichtbar.',
      tools_lead: 'SmokeSignal prüft vor dem Neustart, ob der Server sauber wieder hochkommt, und gibt ein einziges Urteil — GO / CAUTION / NO-GO — mit den konkreten Funden. Nur Hinweis: es liest den Host und meldet, es verändert nie etwas.',
      tools_intro: 'Es sucht nach den Neustart-Stolperfallen, die vom laufenden System erkennbar sind:',
      tools_li: [
        'Array gestartet & sauber — jede Gerätezuweisung OK (keine deaktivierte/ungültige/fehlende Disk)',
        'Keine Parity/Sync/Rebuild/Clear- oder Mover-Operation aktiv',
        'Kein Container mountet ein Host-Runtime-Verzeichnis, kein hängender docker.img/libvirt.img-Loop',
        'Flash beschreibbar, freier Platz, jüngste Crashes, laufende VMs, Dienste, SMART-Status'
      ],
      tools_btn: 'Pre-Reboot-Check ausführen',
      array_ok: 'Array gestartet und gesund; alle Gerätezuweisungen OK.',
      array_bad_devices: 'Array nicht sauber — ungesunde Daten-Disk(s): {0}',
      array_counts: 'Array nicht sauber: Zustand={0} — deaktiviert={1} ungültig={2} fehlend={3}',
      array_not_started: 'Array ist nicht gestartet (Zustand={0}).',
      array_parity_degraded: 'Parity-Disk deaktiviert/fehlt: {0} — das Array bootet weiterhin, aber der Parity-Schutz ist reduziert.',
      array_op_running: 'Array-Operation läuft ({0}) — vor dem Neustart abwarten.',
      array_op_ok: 'Keine Parity/Sync/Rebuild/Clear-Operation aktiv.',
      array_unknown: 'mdcmd nicht gefunden — Array-Zustand nicht ermittelbar.',
      mover_running: 'Mover läuft — vor dem Neustart abwarten.',
      mover_ok: 'Mover läuft nicht.',
      risky_mount_found: 'Container mountet ein Host-Runtime-Verzeichnis (kann libvirt/docker beim Neustart zerlegen):{0}',
      risky_mount_ok: 'Kein Container mountet ein Host-Runtime-Verzeichnis (außer docker.sock).',
      risky_mount_skip: 'Docker nicht verfügbar — Container-Mount-Prüfung übersprungen.',
      stuck_loop_found: 'Hängender Image-/Loop-Zustand{0}.',
      stuck_loop_ok: 'docker.img / libvirt.img Loop-Zustand sieht sauber aus.',
      stuck_loop_skip: 'losetup nicht gefunden — Loop-Prüfung übersprungen.',
      flash_ok: 'Flash /boot ist gemountet und beschreibbar.',
      flash_ro: 'Flash /boot ist gemountet, aber NICHT beschreibbar (evtl. FAT-Korruption) — Konfig wird nicht gespeichert.',
      flash_unmounted: 'Flash /boot ist nicht gemountet.',
      syslog_crashes: '{0} Crash-/Instabilitäts-Zeile(n) im syslog seit dem Boot. Zuletzt: {1}',
      syslog_ok: 'Keine Crashes/OOM/Segfaults im syslog seit dem Boot.',
      syslog_skip: 'syslog nicht lesbar — Crash-Scan übersprungen.',
      io_errors: '{0} Disk-/IO-Fehler-Zeile(n) im syslog seit dem Boot. Zuletzt: {1}',
      io_ok: 'Keine Disk-/IO-Fehler im syslog seit dem Boot.',
      space_full: '{0} ist zu {1}% belegt (>={2}%).',
      space_ok: '{0} bei {1}% belegt.',
      vms_running: '{0} VM(s) laufen — vor dem Neustart sauber herunterfahren.',
      vms_ok: 'Keine VMs laufen.',
      svc_docker_ok: 'dockerd läuft.',
      svc_docker_down: 'Docker-Speicher gemountet, aber dockerd läuft nicht.',
      svc_libvirt_ok: 'libvirtd läuft.',
      svc_libvirt_down: 'libvirt aktiviert, aber libvirtd läuft nicht.',
      svc_emhttp_ok: 'emhttpd (WebGUI) läuft.',
      svc_emhttp_down: 'emhttpd (WebGUI) läuft nicht.',
      binds_missing: 'Container-Bind-Quelle(n) fehlen (starten nach dem Neustart nicht sauber):{0}',
      binds_ok: 'Alle Container-Bind-Quellen unter /mnt vorhanden.',
      smart_failing: 'SMART-Status FEHLERHAFT auf:{0} — vor dem Neustart prüfen.',
      smart_ok: 'SMART-Status OK auf {0} Datenträger(n).',
      smart_none: 'Keine Datenträger für SMART-Prüfung gefunden.',
      smart_skip: 'smartctl nicht gefunden — SMART-Prüfung übersprungen.',
      smart_attr: 'SMART-Attribut-Warnungen:{0}',
      info_uptime: 'Laufzeit: {0}', info_kernel: 'Kernel: {0}', info_unraid: 'Unraid-Version: {0}'
    }
  };

  function ssLocale(){
    var l = (document.documentElement.getAttribute('lang') || navigator.language || 'en').toLowerCase();
    if (l.indexOf('de') === 0) return 'de';
    return 'en';
  }
  function ssT(loc, key, args){
    var m = (SS_LANG[loc] && SS_LANG[loc][key]);
    if (m == null) m = SS_LANG.en[key];
    if (m == null) return null;
    if (args && args.length) for (var i = 0; i < args.length; i++) m = m.split('{' + i + '}').join(args[i]);
    return m;
  }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch];
    });
  }
  function ssDark(){
    try {
      var m = (getComputedStyle(document.body).backgroundColor || '').match(/\d+/g);
      if (!m) return true;
      return (0.299*+m[0] + 0.587*+m[1] + 0.114*+m[2]) < 128;
    } catch(e){ return true; }
  }

  /* ---------------- modal ---------------------------------------------------- */
  if (!document.getElementById('ss-modal-css')) {
    var st = document.createElement('style');
    st.id = 'ss-modal-css';
    st.textContent =
      '#ss-modal{position:fixed;inset:0;z-index:99999;display:none;align-items:flex-start;justify-content:center}' +
      "#ss-modal .ss-pan{margin-top:4vh;width:min(800px,94vw);max-height:88vh;display:flex;flex-direction:column;border-radius:10px;overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,.55)}" +
      "#ss-modal .ss-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;font-weight:700;font-family:'Segoe UI',Arial,sans-serif}" +
      '#ss-modal .ss-htitle{display:flex;align-items:center;gap:10px}' +
      '#ss-modal .ss-logo{height:26px;width:26px;flex:0 0 auto}' +
      '#ss-modal .ss-x{cursor:pointer;font-size:22px;line-height:1;opacity:.75}#ss-modal .ss-x:hover{opacity:1}' +
      '#ss-modal .ss-body{overflow:auto}';
    document.head.appendChild(st);
  }

  function ensureModal(){
    var mod = document.getElementById('ss-modal');
    if (mod) return mod;
    mod = document.createElement('div');
    mod.id = 'ss-modal';
    mod.innerHTML = '<div class="ss-pan"><div class="ss-head"><span class="ss-htitle"><img class="ss-logo" src="/plugins/smokesignal/smokesignal.png?v=3" alt=""><span class="ss-title"></span></span><span class="ss-x" title="Close">&times;</span></div><div class="ss-body"></div></div>';
    document.body.appendChild(mod);
    function close(){ mod.style.display = 'none'; }
    mod.addEventListener('click', function(e){ if (e.target === mod) close(); });
    mod.querySelector('.ss-x').addEventListener('click', close);
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') close(); });
    return mod;
  }

  function renderReport(data){
    var loc = ssLocale(), dark = ssDark();
    var c = dark
      ? {bg:'#1c1c1c',panel:'#161616',fg:'#e8e8e8',muted:'#9a9a9a',line:'#2a2a2a'}
      : {bg:'#f4f4f4',panel:'#ffffff',fg:'#1c1c1c',muted:'#5a5a5a',line:'#e2e2e2'};
    var vmap = {GO:'#1a9e4b', CAUTION:'#c98a00', 'NO-GO':'#d23b3f'}, vcol = vmap[data.verdict] || '#888888';
    var scol = {pass:'#1a9e4b', warn:'#c98a00', fail:'#d23b3f', info:'#8a8a8a'};
    var sico = {pass:'✓', warn:'!', fail:'✗', info:'i'};

    var h = '<div style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:14px;background:'+c.bg+';color:'+c.fg+';padding:18px 22px">';
    h += '<div style="display:flex;align-items:center;gap:14px;border-radius:10px;padding:16px 20px;background:'+c.panel+';border-left:8px solid '+vcol+'">';
    h += '<div style="font-size:30px;font-weight:800;letter-spacing:1px;color:'+vcol+'">'+esc(ssT(loc,'v_'+data.verdict) || data.verdict)+'</div>';
    h += '<div><div>SmokeSignal &mdash; '+esc(ssT(loc,'hc'))+'</div><div style="color:'+c.muted+';font-size:12px">'+esc(ssT(loc,'subtitle'))+(data.generated?' &middot; '+esc(data.generated):'')+'</div></div></div>';

    var checks = data.checks || [];
    [['critical','tier_critical'],['warning','tier_warning'],['info','tier_info']].forEach(function(tt){
      var grp = checks.filter(function(x){ return (x.tier||'') === tt[0]; });
      if (!grp.length) return;
      h += '<h3 style="margin:22px 0 8px;color:'+c.muted+';font-size:13px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid '+c.line+';padding-bottom:6px">'+esc(ssT(loc,tt[1]))+'</h3>';
      grp.forEach(function(x){
        var stt = x.status || 'info';
        var msg = ssT(loc, x.key, x.args); if (msg == null) msg = x.message || '';
        h += '<div style="display:flex;gap:10px;padding:7px 4px;border-bottom:1px solid '+c.line+'">';
        h += '<div style="flex:0 0 22px;height:22px;width:22px;border-radius:50%;text-align:center;line-height:22px;font-weight:700;color:#fff;background:'+(scol[stt]||'#888')+'">'+(sico[stt]||'·')+'</div>';
        h += '<div style="flex:1;word-break:break-word">'+esc(msg)+'</div></div>';
      });
    });
    h += '<div style="margin-top:18px;color:'+c.muted+';font-size:11px;line-height:1.5">'+esc(ssT(loc,'foot'))+'</div></div>';
    return h;
  }

  function run(){
    var loc = ssLocale(), mod = ensureModal(), dark = ssDark();
    var pan = mod.querySelector('.ss-pan'), head = mod.querySelector('.ss-head'), body = mod.querySelector('.ss-body');
    mod.querySelector('.ss-title').textContent = ssT(loc, 'title');
    mod.style.background  = dark ? 'rgba(0,0,0,.6)' : 'rgba(0,0,0,.45)';
    pan.style.background  = dark ? '#1c1c1c' : '#ffffff';
    head.style.background = dark ? '#161616' : '#f0f0f0';
    head.style.color      = dark ? '#e8e8e8' : '#1c1c1c';
    head.style.borderBottom = '1px solid ' + (dark ? '#2a2a2a' : '#e2e2e2');
    body.style.background = dark ? '#1c1c1c' : '#ffffff';
    body.innerHTML = '<div style="padding:26px;font-family:\'Segoe UI\',Arial,sans-serif;color:'+(dark?'#9a9a9a':'#666')+'">'+esc(ssT(loc,'running'))+'</div>';
    mod.style.display = 'flex';
    $.getJSON('/plugins/smokesignal/include/SmokeSignalReport.php', function(data){
      body.innerHTML = renderReport(data);
    }).fail(function(){
      body.innerHTML = '<div style="padding:26px;font-family:\'Segoe UI\',Arial,sans-serif;color:#d23b3f">'+esc(ssT(loc,'err'))+'</div>';
    });
  }
  window.smokesignalRun = run;

  function fillTools(){
    var el = document.getElementById('ss-tools');
    if (!el) return;
    var loc = ssLocale();
    var li = (SS_LANG[loc] && SS_LANG[loc].tools_li) || SS_LANG.en.tools_li;
    var h = '<p style="margin:6px 0 14px">'+esc(ssT(loc,'tools_lead'))+'</p>';
    h += '<p>'+esc(ssT(loc,'tools_intro'))+'</p><ul style="margin:6px 0 16px 18px">';
    li.forEach(function(x){ h += '<li>'+esc(x)+'</li>'; });
    h += '</ul><input type="button" style="cursor:pointer" value="'+esc(ssT(loc,'tools_btn'))+'">';
    el.innerHTML = h;
    var btn = el.querySelector('input[type=button]');
    if (btn) btn.addEventListener('click', run);
  }

  $(function(){
    // Tools page: render the localised description + button
    try { fillTools(); } catch(e) {}

    // Main tab: compact SmokeSignal button next to Reboot
    try {
      var reboot = $('input[type=button], button, a').filter(function(){
        var v  = ($(this).val() || $(this).text() || '').trim().toLowerCase();
        var oc = ($(this).attr('onclick') || '').toLowerCase();
        return v === 'neu starten' || v === 'reboot'
            || oc.indexOf('reboot(') > -1 || oc.indexOf("'reboot'") > -1 || oc.indexOf('"reboot"') > -1;
      }).first();
      if (reboot.length && !$('#ss-reboot-btn').length) {
        var b = $('<input type="button" id="ss-reboot-btn" value="SmokeSignal" style="margin-left:8px;cursor:pointer">');
        b.on('click', run);
        reboot.after(b);
      }
    } catch(e) {}

    // Main tab: remove our own (otherwise empty) page section
    try {
      var frag = document.getElementById('ss-frag');
      if (frag) {
        var p = frag.previousElementSibling, hops = 0;
        while (p && hops < 3) {
          var prev = p.previousElementSibling, txt = (p.textContent || '').trim();
          if (/smokesignal/i.test(txt) && txt.length < 40 && !p.querySelector('input,button,select,textarea,a[onclick]')) p.remove();
          p = prev; hops++;
        }
        frag.remove();
      }
    } catch(e) {}
  });
})();
