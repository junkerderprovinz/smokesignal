/* SmokeSignal -- shared WebGUI helper (Main + Tools pages).
 * Renders a theme-matched, localised report in its own modal, with a live
 * progress bar while the engine runs.
 *
 * Language: follows the configured Unraid UI language for ALL locales. The page
 * (ss_i18n.php, included by SmokeSignal.page / SmokeSignalTools.page) reads
 * $_SESSION['locale', merges lang/en.json + lang/<code>.json, and injects the
 * active dict as window.smokeSignalI18n. The inline English table below is only
 * a last-resort fallback if that injection is ever missing. */
(function(){

  /* ---------------- English fallback (source of lang/en.json) ---------------- */
  var SS_EN = {
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
    goto: 'Go to the source',
    /* progress-bar stage labels (shown while the engine runs) */
    p_array: 'Checking array & disks…',
    p_mover: 'Checking mover…',
    p_mounts: 'Checking container mounts…',
    p_loops: 'Checking image loops…',
    p_flash: 'Checking flash drive…',
    p_crashes: 'Scanning syslog…',
    p_space: 'Checking free space…',
    p_vms: 'Checking VMs…',
    p_services: 'Checking core services…',
    p_binds: 'Checking container binds…',
    p_smart: 'Checking SMART health…',
    p_info: 'Collecting system info…',
    p_done: 'Done',
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
  };

  /* Active-language dict injected by ss_i18n.php (en base + <locale> overlay). */
  var SS_I18N = (window.smokeSignalI18n && typeof window.smokeSignalI18n === 'object') ? window.smokeSignalI18n : {};
  var SS_LANGCODE = String(window.smokeSignalLang || (document.documentElement.getAttribute('lang') || 'en')).slice(0, 2).toLowerCase();
  var SS_RTL = ['ar', 'he', 'fa', 'ur'].indexOf(SS_LANGCODE) >= 0;

  function ssT(key, args){
    var m = SS_I18N[key];
    if (m == null) m = SS_EN[key];
    if (m == null) return null;
    if (typeof m === 'string' && args && args.length) {
      for (var i = 0; i < args.length; i++) m = m.split('{' + i + '}').join(args[i]);
    }
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

  var REPORT_URL = '/plugins/smokesignal/include/SmokeSignalReport.php';
  var STREAM_URL = '/plugins/smokesignal/include/SmokeSignalStream.php';

  /* ---------------- clickable findings -> the relevant Unraid page ----------- */
  // Unraid has NO URL param to jump to a specific syslog line, so syslog/IO
  // findings land on the full syslog viewer (/Tools/Syslog).
  function ssLink(key){
    switch (key) {
      case 'syslog_crashes':
      case 'io_errors':
        return '/Tools/Syslog';
      case 'vms_running':
        return '/VMs';
      case 'svc_docker_down':
        return '/Settings/DockerSettings';
      case 'svc_libvirt_down':
        return '/Settings/VMSettings';
      case 'risky_mount_found':
      case 'binds_missing':
      case 'stuck_loop_found':
        return '/Docker';
      case 'array_not_started':
      case 'array_bad_devices':
      case 'array_counts':
      case 'array_op_running':
      case 'array_parity_degraded':
      case 'mover_running':
      case 'flash_ro':
      case 'flash_unmounted':
      case 'space_full':
      case 'smart_failing':
      case 'smart_attr':
        return '/Main';
      default:
        return null;   // svc_emhttp_down has no page (the WebGUI itself is down)
    }
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
      '#ss-modal .ss-body{overflow:auto}' +
      "#ss-modal .ss-prog{padding:44px 30px;font-family:'Segoe UI',Arial,sans-serif}" +
      '#ss-modal .ss-prog-lab{display:flex;justify-content:space-between;gap:12px;font-size:14px;margin:0 0 14px}' +
      '#ss-modal .ss-prog-pct{opacity:.7;font-variant-numeric:tabular-nums}' +
      '#ss-modal .ss-prog-track{height:10px;border-radius:6px;overflow:hidden;background:rgba(128,128,128,.22)}' +
      '#ss-modal .ss-prog-fill{height:100%;width:0;border-radius:6px;background:linear-gradient(90deg,#e0a72e,#d5851c);transition:width .35s ease}' +
      '#ss-modal .ss-prog-fill.ss-indet{width:38%;transition:none;animation:ss-indet 1.1s ease-in-out infinite}' +
      '@keyframes ss-indet{0%{margin-left:-38%}100%{margin-left:100%}}';
    document.head.appendChild(st);
  }

  function ensureModal(){
    var mod = document.getElementById('ss-modal');
    if (mod) return mod;
    mod = document.createElement('div');
    mod.id = 'ss-modal';
    mod.innerHTML = '<div class="ss-pan"><div class="ss-head"><span class="ss-htitle"><img class="ss-logo" src="/plugins/smokesignal/smokesignal.png?v=4" alt=""><span class="ss-title"></span></span><span class="ss-x" title="Close">&times;</span></div><div class="ss-body"></div></div>';
    document.body.appendChild(mod);
    function close(){ mod.style.display = 'none'; }
    mod.addEventListener('click', function(e){ if (e.target === mod) close(); });
    mod.querySelector('.ss-x').addEventListener('click', close);
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') close(); });
    return mod;
  }

  function renderReport(data){
    var dark = ssDark();
    var c = dark
      ? {bg:'#1c1c1c',panel:'#161616',fg:'#e8e8e8',muted:'#9a9a9a',line:'#2a2a2a'}
      : {bg:'#f4f4f4',panel:'#ffffff',fg:'#1c1c1c',muted:'#5a5a5a',line:'#e2e2e2'};
    var vmap = {GO:'#1a9e4b', CAUTION:'#c98a00', 'NO-GO':'#d23b3f'}, vcol = vmap[data.verdict] || '#888888';
    var scol = {pass:'#1a9e4b', warn:'#c98a00', fail:'#d23b3f', info:'#8a8a8a'};
    var sico = {pass:'✓', warn:'!', fail:'✗', info:'i'};

    var h = '<div style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:14px;background:'+c.bg+';color:'+c.fg+';padding:18px 22px">';
    h += '<div style="display:flex;align-items:center;gap:14px;border-radius:10px;padding:16px 20px;background:'+c.panel+';border-left:8px solid '+vcol+'">';
    h += '<div style="font-size:30px;font-weight:800;letter-spacing:1px;color:'+vcol+'">'+esc(ssT('v_'+data.verdict) || data.verdict)+'</div>';
    h += '<div><div>SmokeSignal &mdash; '+esc(ssT('hc'))+'</div><div style="color:'+c.muted+';font-size:12px">'+esc(ssT('subtitle'))+(data.generated?' &middot; '+esc(data.generated):'')+'</div></div></div>';

    var checks = data.checks || [];
    [['critical','tier_critical'],['warning','tier_warning'],['info','tier_info']].forEach(function(tt){
      var grp = checks.filter(function(x){ return (x.tier||'') === tt[0]; });
      if (!grp.length) return;
      h += '<h3 style="margin:22px 0 8px;color:'+c.muted+';font-size:13px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid '+c.line+';padding-bottom:6px">'+esc(ssT(tt[1]))+'</h3>';
      grp.forEach(function(x){
        var stt = x.status || 'info';
        var msg = ssT(x.key, x.args); if (msg == null) msg = x.message || '';
        // Only problem findings (warn/fail) get a click-through to the relevant page.
        var link = (stt === 'warn' || stt === 'fail') ? ssLink(x.key) : null;
        var cell = link
          ? '<a href="'+esc(link)+'" title="'+esc(ssT('goto'))+'" style="color:inherit;text-decoration:underline;text-decoration-color:'+(scol[stt]||'#888')+';text-underline-offset:2px;cursor:pointer">'+esc(msg)+' <span style="opacity:.65">&#8599;</span></a>'
          : esc(msg);
        h += '<div style="display:flex;gap:10px;padding:7px 4px;border-bottom:1px solid '+c.line+'">';
        h += '<div style="flex:0 0 22px;height:22px;width:22px;border-radius:50%;text-align:center;line-height:22px;font-weight:700;color:#fff;background:'+(scol[stt]||'#888')+'">'+(sico[stt]||'·')+'</div>';
        h += '<div style="flex:1;word-break:break-word">'+cell+'</div></div>';
      });
    });
    h += '<div style="margin-top:18px;color:'+c.muted+';font-size:11px;line-height:1.5">'+esc(ssT('foot'))+'</div></div>';
    return h;
  }

  function errHTML(){
    return '<div style="padding:26px;font-family:\'Segoe UI\',Arial,sans-serif;color:#d23b3f">'+esc(ssT('err'))+'</div>';
  }

  // Stream the engine's progress markers, driving the bar, then hand the final
  // JSON to onResult. On ANY streaming failure, call onFail (which falls back to
  // the plain blocking request), so the report always appears.
  function streamRun(setBar, onResult, onFail){
    var got = false;
    fetch(STREAM_URL, {headers: {'Accept': 'text/event-stream'}, credentials: 'same-origin'}).then(function(resp){
      if (!resp.ok || !resp.body || !resp.body.getReader) throw new Error('no stream');
      var reader = resp.body.getReader(), dec = new TextDecoder(), buf = '';
      function pump(){
        return reader.read().then(function(r){
          if (r.value) buf += dec.decode(r.value, {stream: true});
          var nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            var line = buf.slice(0, nl).replace(/\r$/, ''); buf = buf.slice(nl + 1);
            if (line.indexOf('@@SSP ') === 0) {
              var p = line.slice(6).split(' ');
              setBar(parseFloat(p[0]) || 0, p[1] || '');
            } else if (line.charAt(0) === '{') {
              try { var d = JSON.parse(line); got = true; onResult(d); } catch(e){}
            }
          }
          if (r.done) { if (!got) onFail(); return; }
          return pump();
        });
      }
      return pump();
    }).catch(function(){ if (!got) onFail(); });
  }

  function run(){
    var mod = ensureModal(), dark = ssDark();
    var pan = mod.querySelector('.ss-pan'), head = mod.querySelector('.ss-head'), body = mod.querySelector('.ss-body');
    mod.querySelector('.ss-title').textContent = ssT('title');
    mod.style.background  = dark ? 'rgba(0,0,0,.6)' : 'rgba(0,0,0,.45)';
    pan.style.background  = dark ? '#1c1c1c' : '#ffffff';
    head.style.background = dark ? '#161616' : '#f0f0f0';
    head.style.color      = dark ? '#e8e8e8' : '#1c1c1c';
    head.style.borderBottom = '1px solid ' + (dark ? '#2a2a2a' : '#e2e2e2');
    body.style.background = dark ? '#1c1c1c' : '#ffffff';
    body.style.color      = dark ? '#e8e8e8' : '#1c1c1c';
    body.dir = SS_RTL ? 'rtl' : 'ltr';
    body.innerHTML =
      '<div class="ss-prog"><div class="ss-prog-lab"><span class="ss-prog-txt">'+esc(ssT('running'))+'</span><span class="ss-prog-pct"></span></div>' +
      '<div class="ss-prog-track"><div class="ss-prog-fill"></div></div></div>';
    mod.style.display = 'flex';

    var fill = body.querySelector('.ss-prog-fill');
    var txt  = body.querySelector('.ss-prog-txt');
    var pctEl = body.querySelector('.ss-prog-pct');
    var done = false;

    function setBar(pct, key){
      if (!fill) return;
      fill.classList.remove('ss-indet');
      if (pct < 0) pct = 0; if (pct > 100) pct = 100;
      fill.style.width = pct + '%';
      var lab = key && ssT(key);
      if (lab && txt) txt.textContent = lab;
      if (pctEl) pctEl.textContent = Math.round(pct) + '%';
    }
    function indeterminate(){
      if (fill) { fill.classList.add('ss-indet'); fill.style.width = ''; }
      if (pctEl) pctEl.textContent = '';
      if (txt) txt.textContent = ssT('running');
    }
    function onResult(data){
      if (done) return; done = true;
      body.innerHTML = renderReport(data);
    }
    function onErr(){
      if (done) return; done = true;
      body.innerHTML = errHTML();
    }
    function fallback(){
      if (done) return;
      indeterminate();
      $.getJSON(REPORT_URL, onResult).fail(onErr);
    }

    if (window.fetch && window.ReadableStream && window.TextDecoder) {
      streamRun(setBar, onResult, fallback);
    } else {
      fallback();
    }
  }
  window.smokesignalRun = run;

  function fillTools(){
    var el = document.getElementById('ss-tools');
    if (!el) return;
    if (SS_RTL) el.dir = 'rtl';
    var li = ssT('tools_li'); if (!li || !li.length) li = SS_EN.tools_li;
    var h = '<p style="margin:6px 0 14px">'+esc(ssT('tools_lead'))+'</p>';
    h += '<p>'+esc(ssT('tools_intro'))+'</p><ul style="margin:6px 0 16px 18px">';
    li.forEach(function(x){ h += '<li>'+esc(x)+'</li>'; });
    h += '</ul><input type="button" style="cursor:pointer" value="'+esc(ssT('tools_btn'))+'">';
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
