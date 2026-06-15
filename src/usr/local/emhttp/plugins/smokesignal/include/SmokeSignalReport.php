<?php
/* SmokeSignal -- pre-reboot check report, shown in an Unraid openBox modal.
 * Runs the engine (fixed path, no user input) and prints a styled report that
 * follows the configured Unraid light/dark theme. Styles are scoped to the
 * .ss-report wrapper so it looks right whether openBox iframes or injects it. */

$ENGINE = '/usr/local/emhttp/plugins/smokesignal/smokesignal-check.sh';
$raw    = shell_exec('bash ' . escapeshellarg($ENGINE) . ' --json 2>/dev/null');
$data   = json_decode((string)$raw, true);

$verdict = is_array($data) ? ($data['verdict'] ?? 'UNKNOWN') : 'UNKNOWN';
$checks  = (is_array($data) && isset($data['checks']) && is_array($data['checks'])) ? $data['checks'] : [];
$gen     = is_array($data) ? ($data['generated'] ?? '') : '';

/* Follow the configured Unraid theme (black/gray = dark, white/azure = light) */
$theme = 'white';
$cfg = @file_get_contents('/boot/config/plugins/dynamix/dynamix.cfg');
if ($cfg !== false && preg_match('/^\s*theme\s*=\s*"?([a-z0-9]+)"?/mi', $cfg, $m)) {
  $theme = strtolower($m[1]);
}
$dark = in_array($theme, ['black', 'gray', 'grey'], true);

$c = $dark
  ? ['bg'=>'#1c1c1c','panel'=>'#161616','fg'=>'#e8e8e8','muted'=>'#9a9a9a','line'=>'#2a2a2a','code'=>'#262626']
  : ['bg'=>'#f4f4f4','panel'=>'#ffffff','fg'=>'#1c1c1c','muted'=>'#5a5a5a','line'=>'#e2e2e2','code'=>'#ececec'];

$vmap = ['GO' => '#1a9e4b', 'CAUTION' => '#c98a00', 'NO-GO' => '#d23b3f', 'UNKNOWN' => '#888888'];
$vcol = $vmap[$verdict] ?? '#888888';

function ss_icon($s){ $m = ['pass'=>'&#10003;', 'warn'=>'!', 'fail'=>'&#10007;', 'info'=>'i']; return $m[$s] ?? '&middot;'; }
function ss_col($s){  $m = ['pass'=>'#1a9e4b', 'warn'=>'#c98a00', 'fail'=>'#d23b3f', 'info'=>'#8a8a8a']; return $m[$s] ?? '#888888'; }

$tiers = ['critical' => 'Critical', 'warning' => 'Caution', 'info' => 'Info'];
?>
<style>
 .ss-report{box-sizing:border-box;min-height:100%;margin:0;padding:18px 22px;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;background:<?= $c['bg'] ?>;color:<?= $c['fg'] ?>}
 .ss-report *{box-sizing:border-box}
 .ss-report .verdict{display:flex;align-items:center;gap:14px;border-radius:10px;padding:16px 20px;background:<?= $c['panel'] ?>;border-left:8px solid <?= $vcol ?>}
 .ss-report .verdict .v{font-size:30px;font-weight:800;letter-spacing:1px;color:<?= $vcol ?>}
 .ss-report .verdict .sub{color:<?= $c['muted'] ?>;font-size:12px}
 .ss-report h3{margin:22px 0 8px;color:<?= $c['muted'] ?>;font-size:13px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid <?= $c['line'] ?>;padding-bottom:6px}
 .ss-report .row{display:flex;gap:10px;padding:7px 4px;border-bottom:1px solid <?= $c['line'] ?>}
 .ss-report .badge{flex:0 0 22px;height:22px;width:22px;border-radius:50%;text-align:center;line-height:22px;font-weight:700;color:#fff}
 .ss-report .msg{flex:1;word-break:break-word}
 .ss-report .foot{margin-top:18px;color:<?= $c['muted'] ?>;font-size:11px;line-height:1.5}
 .ss-report code{background:<?= $c['code'] ?>;padding:1px 5px;border-radius:4px}
</style>

<div class="ss-report">
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
  <?php foreach ($group as $chk): $st = $chk['status'] ?? 'info'; ?>
  <div class="row">
    <div class="badge" style="background:<?= ss_col($st) ?>"><?= ss_icon($st) ?></div>
    <div class="msg"><?= htmlspecialchars($chk['message'] ?? '') ?></div>
  </div>
  <?php endforeach; ?>
<?php endforeach; endif; ?>

  <div class="foot">SmokeSignal reads the current state and predicts the common reboot landmines (pinned mounts, stuck loops, unclean array, in-flight operations, a crash-looping box). It is an early warning, not a guarantee &mdash; genuine hardware, BIOS or timing failures during boot cannot be seen from a running system.</div>
</div>
