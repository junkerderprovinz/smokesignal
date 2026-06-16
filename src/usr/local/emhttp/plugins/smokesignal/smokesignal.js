/* SmokeSignal -- shared WebGUI helper (loaded by the Main and Tools pages).
 * Builds a theme-matched modal and runs the report; on the Main page it also
 * drops a compact button next to Reboot and removes its own page section.     */
(function(){
  // modal structural CSS (colours are applied per-theme at open time)
  if (!document.getElementById('ss-modal-css')) {
    var st = document.createElement('style');
    st.id = 'ss-modal-css';
    st.textContent =
      '#ss-modal{position:fixed;inset:0;z-index:99999;display:none;align-items:flex-start;justify-content:center}' +
      "#ss-modal .ss-pan{margin-top:4vh;width:min(800px,94vw);max-height:88vh;display:flex;flex-direction:column;border-radius:10px;overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,.55)}" +
      "#ss-modal .ss-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;font-weight:700;font-family:'Segoe UI',Arial,sans-serif}" +
      '#ss-modal .ss-x{cursor:pointer;font-size:22px;line-height:1;opacity:.75}#ss-modal .ss-x:hover{opacity:1}' +
      '#ss-modal .ss-body{overflow:auto}';
    document.head.appendChild(st);
  }

  function ssDark(){
    try {
      var m = (getComputedStyle(document.body).backgroundColor || '').match(/\d+/g);
      if (!m) return true;
      return (0.299*+m[0] + 0.587*+m[1] + 0.114*+m[2]) < 128;
    } catch(e){ return true; }
  }

  function ensureModal(){
    var mod = document.getElementById('ss-modal');
    if (mod) return mod;
    mod = document.createElement('div');
    mod.id = 'ss-modal';
    mod.innerHTML = '<div class="ss-pan"><div class="ss-head"><span>SmokeSignal &mdash; Pre-Reboot Check</span><span class="ss-x" title="Close">&times;</span></div><div class="ss-body"></div></div>';
    document.body.appendChild(mod);
    function close(){ mod.style.display = 'none'; }
    mod.addEventListener('click', function(e){ if (e.target === mod) close(); });
    mod.querySelector('.ss-x').addEventListener('click', close);
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') close(); });
    return mod;
  }

  function run(){
    var mod = ensureModal(), dark = ssDark();
    var pan = mod.querySelector('.ss-pan'), head = mod.querySelector('.ss-head'), body = mod.querySelector('.ss-body');
    mod.style.background  = dark ? 'rgba(0,0,0,.6)' : 'rgba(0,0,0,.45)';
    pan.style.background  = dark ? '#1c1c1c' : '#ffffff';
    head.style.background = dark ? '#161616' : '#f0f0f0';
    head.style.color      = dark ? '#e8e8e8' : '#1c1c1c';
    head.style.borderBottom = '1px solid ' + (dark ? '#2a2a2a' : '#e2e2e2');
    body.style.background = dark ? '#1c1c1c' : '#ffffff';
    body.innerHTML = '<div style="padding:26px;font-family:\'Segoe UI\',Arial,sans-serif;color:' + (dark ? '#9a9a9a' : '#666') + '">Running checks&hellip;</div>';
    mod.style.display = 'flex';
    $.get('/plugins/smokesignal/include/SmokeSignalReport.php', function(html){
      body.innerHTML = html;
    }).fail(function(){
      body.innerHTML = '<div style="padding:26px;font-family:\'Segoe UI\',Arial,sans-serif;color:#d23b3f">Could not run the check engine.</div>';
    });
  }
  window.smokesignalRun = run;

  $(function(){
    // Main tab only: drop a compact SmokeSignal button right next to Reboot
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

    // Main tab only: remove our own page section (only the reboot-adjacent button should remain)
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

    // Dashboard only: add a SmokeSignal icon to the server tile's control row,
    // right next to the Reboot icon (matches the native power-icon styling).
    try {
      $('.tile-ctrl').each(function(){
        var row = $(this);
        if (row.find('.ss-dash-icon').length) return;
        var icon = $('<i class="fa fa-fw fa-fire hand ss-dash-icon" title="SmokeSignal — Pre-Reboot Check"></i>');
        icon.on('click', run);
        var reboot = row.find('[onclick*="Reboot"]').first();
        if (reboot.length) icon.insertBefore(reboot); else row.prepend(icon);
      });
    } catch(e) {}

    // Dashboard only: hide our own (otherwise empty) dashboard tile.
    try {
      var dfrag = document.getElementById('ss-dash-frag');
      if (dfrag) {
        var node = dfrag, hidden = false, h = 0;
        while (node && node.parentElement && h < 6) {
          var par = node.parentElement, t = (par.textContent || '').trim();
          if (/^smokesignal$/i.test(t) && !par.querySelector('input,button,select,a[onclick]')) {
            par.style.display = 'none'; hidden = true; break;
          }
          node = par; h++;
        }
        if (!hidden) dfrag.style.display = 'none';
      }
    } catch(e) {}
  });
})();
