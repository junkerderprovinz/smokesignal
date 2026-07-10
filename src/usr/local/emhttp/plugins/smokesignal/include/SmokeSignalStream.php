<?php
/* SmokeSignal -- streams the engine's progress markers, then the final JSON, so
 * the WebGUI can show a real progress bar. Each line is one of:
 *   @@SSP <pct> <stagekey>     progress marker (0..100 + i18n label key)
 *   {...}                      the final report JSON (last line)
 * The frontend (smokesignal.js) reads this incrementally; if streaming is not
 * available it falls back to SmokeSignalReport.php. Fixed engine path, no input. */
@ini_set('zlib.output_compression', '0');
header('Content-Type: text/event-stream; charset=utf-8'); // hint nginx: do not gzip/buffer
header('Cache-Control: no-cache, no-store, must-revalidate');
header('X-Accel-Buffering: no');                           // nginx: forward chunks immediately
while (ob_get_level() > 0) { @ob_end_flush(); }
@ob_implicit_flush(true);

$ENGINE = '/usr/local/emhttp/plugins/smokesignal/smokesignal-check.sh';
// stdbuf -oL forces line buffering so progress markers flush as they are printed
// (absent stdbuf, the engine still runs -- the bar just fills in fewer steps).
$sb     = trim((string) @shell_exec('command -v stdbuf'));
$prefix = ($sb !== '') ? 'stdbuf -oL ' : '';
$cmd    = $prefix . 'bash ' . escapeshellarg($ENGINE) . ' --json --progress 2>/dev/null';

$h = @popen($cmd, 'r');
if ($h === false || $h === null) {
  echo '{"verdict":"UNKNOWN","worst":0,"checks":[]}' . "\n";
  exit;
}
while (($line = fgets($h)) !== false) {
  echo $line;
  @flush();
}
pclose($h);
