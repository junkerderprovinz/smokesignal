<?php
/* SmokeSignal -- inject the active Unraid UI language into the page, so
 * smokesignal.js renders in the user's configured language for ALL locales.
 * Reads $_SESSION['locale'] (Unraid's configured language), loads lang/en.json
 * as the base and merges lang/<code>.json over it, then exposes the result as
 * window.smokeSignalI18n. Included by SmokeSignal.page + SmokeSignalTools.page.
 * Emits nothing but a <script>; defines no functions (safe on any Unraid page). */
if (!defined('SS_I18N_EMITTED')) {
  define('SS_I18N_EMITTED', 1);
  $ssLang = strtolower(substr((string) (isset($_SESSION['locale']) ? $_SESSION['locale'] : ''), 0, 2));
  $ssDir  = '/usr/local/emhttp/plugins/smokesignal/lang';
  $ssAll  = json_decode(@file_get_contents("$ssDir/en.json"), true);
  if (!is_array($ssAll)) $ssAll = array();
  if ($ssLang !== '' && $ssLang !== 'en' && is_file("$ssDir/$ssLang.json")) {
    $ssTr = json_decode(@file_get_contents("$ssDir/$ssLang.json"), true);
    if (is_array($ssTr)) $ssAll = array_merge($ssAll, $ssTr);
  }
  echo '<script>window.smokeSignalLang=' . json_encode($ssLang !== '' ? $ssLang : 'en')
     . ';window.smokeSignalI18n=' . json_encode($ssAll, JSON_UNESCAPED_UNICODE) . ';</script>';
}
