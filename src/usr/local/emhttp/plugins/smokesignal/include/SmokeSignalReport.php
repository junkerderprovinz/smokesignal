<?php
/* SmokeSignal -- pre-reboot check report, rendered inside an Unraid openBox iframe.
 * Runs the engine (fixed path, no user input) and prints a styled report.        */

$ENGINE = '/usr/local/emhttp/plugins/smokesignal/smokesignal-check.sh';
$raw    = shell_exec('bash ' . escapeshellarg($ENGINE) . ' --json 2>/dev/null');
$data   = json_decode((string)$raw, true);

$verdict = is_array($data) ? ($data['verdict'] ?? 'UNKNOWN') : 'UNKNOWN';
$checks  = (is_array($data) && isset($data['checks']) && is_array($data['checks'])) ? $data['checks'] : [];
$gen     = is_array($data) ? ($data['generated'] ?? '') : '';

$vmap = ['GO' => '#23a559', 'CAUTION' => '#e0a106', 'NO-GO' => '#e5484d', 'UNKNOWN' => '#888888'];
$vcol = $vmap[$verdict] ?? '#888888';

function ss_icon($s){ $m = ['pass'=>'&#10003;', 'warn'=>'!', 'fail'=>'&#10007;', 'info'=>'i']; return $m[$s] ?? '&middot;'; }
function ss_col($s){  $m = ['pass'=>'#23a559', 'warn'=>'#e0a106', 'fail'=>'#e5484d', 'info'=>'#8a8a8a']; return $m[$s] ?? '#888888'; }

$tiers = ['critical' => 'Critical', 'warning' => 'Caution', 'info' => 'Info'];
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>SmokeSignal</title>
<style>
 body{margin:0;font-family:'Segoe UI',Arial,sans-serif;background:#1c1c1c;color:#e8e8e8;font-size:14px}
 .wrap{padding:18px 22px}
 .verdict{display:flex;align-items:center;gap:14px;border-radius:10px;padding:16px 20px;background:#161616;border-left:8px solid <?= $vcol ?>}
 .verdict .v{font-size:30px;font-weight:800;letter-spacing:1px;color:<?= $vcol ?>}
 .verdict .sub{color:#9a9a9a;font-size:12px}
 h3{margin:22px 0 8px;color:#bdbdbd;font-size:13px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #2c2c2c;padding-bottom:6px}
 .row{display:flex;gap:10px;padding:7px 4px;border-bottom:1px solid #232323}
 .badge{flex:0 0 22px;height:22px;width:22px;border-radius:50%;text-align:center;line-height:22px;font-weight:700;color:#111}
 .msg{flex:1;word-break:break-word}
 .foot{margin-top:18px;color:#777;font-size:11px;line-height:1.5}
 code{background:#262626;padding:1px 5px;border-radius:4px}
</style>
</head>
<body>
<div class="wrap">
  <div class="verdict">
    <div class="v"><?= htmlspecialchars($verdict) ?></div>
    <div>
      <div>SmokeSignal &mdash; pre-reboot health check</div>
      <div class="sub">Advisory only &middot; nothing was changed<?= $gen ? ' &middot; ' . htmlspecialchars($gen) : '' ?></div>
    </div>
  </div>

<?php if (!$checks): ?>
  <h3>Error</h3>
  <div class="row"><div class="msg">Could not run the check engine. Is <code><?= htmlspecialchars($ENGINE) ?></code> present and executable?</div></div>
<?php else: foreach ($tiers as $tk => $tl):
    $group = array_filter($checks, fn($c) => ($c['tier'] ?? '') === $tk);
    if (!$group) continue; ?>
  <h3><?= $tl ?></h3>
  <?php foreach ($group as $c): $st = $c['status'] ?? 'info'; ?>
  <div class="row">
    <div class="badge" style="background:<?= ss_col($st) ?>"><?= ss_icon($st) ?></div>
    <div class="msg"><?= htmlspecialchars($c['message'] ?? '') ?></div>
  </div>
  <?php endforeach; ?>
<?php endforeach; endif; ?>

  <div class="foot">SmokeSignal reads the current state and predicts the common reboot landmines (pinned mounts, stuck loops, unclean array, in-flight operations, a crash-looping box). It is an early warning, not a guarantee &mdash; genuine hardware, BIOS or timing failures during boot cannot be seen from a running system.</div>
</div>
</body>
</html>
