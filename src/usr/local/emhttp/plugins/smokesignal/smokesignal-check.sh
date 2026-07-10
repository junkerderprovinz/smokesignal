#!/bin/bash
#
# smokesignal-check.sh -- SmokeSignal engine for Unraid
#
# Advisory only. Inspects the live host and reports an overall verdict:
#   GO       -- nothing found that should block a reboot
#   CAUTION  -- non-fatal issues you should know about before rebooting
#   NO-GO    -- conditions likely to make the reboot come back dirty
#
# It NEVER changes the system. Run it before a planned reboot.
#
# Usage:
#   smokesignal-check.sh            human-readable report (English, colour on TTY)
#   smokesignal-check.sh --json     machine-readable JSON (consumed by the WebGUI)
#
# Each JSON finding carries a translation "key" + "args" (the WebGUI localises
# them, falling back to the English "message"). Exit code mirrors the verdict:
# 0 = GO, 1 = CAUTION, 2 = NO-GO.
#
set -u

JSON=0
PROGRESS=0
for _a in "$@"; do
  case "$_a" in
    --json)     JSON=1 ;;
    --progress) PROGRESS=1 ;;
  esac
done

# Emit a progress marker (percent 0..100 + an i18n stage key) -- ONLY in
# --progress mode, so the streaming WebGUI endpoint can drive a real progress
# bar. Never printed in a normal --json run, so that JSON stays clean.
sspush() { [ "$PROGRESS" -eq 1 ] && printf '@@SSP %s %s\n' "$1" "$2"; }

WORST=0          # 0 GO, 1 CAUTION, 2 NO-GO
JSON_ITEMS=""
TXT_CRIT=""
TXT_WARN=""
TXT_INFO=""

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\t'/ }"
  s="${s//$'\r'/}"
  s="${s//$'\n'/ }"
  printf '%s' "$s"
}

# add <tier> <id> <status> <key> <args(pipe-delimited)> <english-message>
add() {
  local tier="$1" id="$2" status="$3" key="$4" args="$5" msg="$6"
  case "$status" in
    fail) [ "$WORST" -lt 2 ] && WORST=2 ;;
    warn) [ "$WORST" -lt 1 ] && WORST=1 ;;
  esac

  local argsjson=""
  if [ -n "$args" ]; then
    local oldifs="$IFS"; IFS='|'; set -f
    local a first=1
    for a in $args; do
      if [ "$first" -eq 1 ]; then argsjson="\"$(json_escape "$a")\""; first=0
      else argsjson="$argsjson,\"$(json_escape "$a")\""; fi
    done
    set +f; IFS="$oldifs"
  fi

  local j="{\"tier\":\"$tier\",\"id\":\"$id\",\"status\":\"$status\",\"key\":\"$key\",\"args\":[$argsjson],\"message\":\"$(json_escape "$msg")\"}"
  if [ -z "$JSON_ITEMS" ]; then JSON_ITEMS="$j"; else JSON_ITEMS="$JSON_ITEMS,$j"; fi

  local mark
  case "$status" in
    pass) mark="[ OK ]" ;;
    warn) mark="[WARN]" ;;
    fail) mark="[FAIL]" ;;
    info) mark="[INFO]" ;;
  esac
  local line="  $mark $msg"$'\n'
  case "$tier" in
    critical) TXT_CRIT="$TXT_CRIT$line" ;;
    warning)  TXT_WARN="$TXT_WARN$line" ;;
    info)     TXT_INFO="$TXT_INFO$line" ;;
  esac
}

have() { command -v "$1" >/dev/null 2>&1; }

# =============================================================================
#  CRITICAL  (a FAIL here means NO-GO)
# =============================================================================

# ---- Array state + every device assignment ----------------------------------
MDCMD=/usr/local/sbin/mdcmd
DISKSINI=/var/local/emhttp/disks.ini

# Collect assigned slots whose status is not OK. Only slots that ACTUALLY have a
# disk assigned (non-empty id) count -- an empty/never-used slot (e.g. an unused
# second parity) reports as not-present and must NOT be flagged. Parity issues are
# split out: a degraded parity is a caution, the array still boots.
sspush 3 p_array
DISKS_READ=0; bad_data=""; bad_parity=""
if [ -r "$DISKSINI" ]; then
  DISKS_READ=1
  bad_devs="$(awk '
    function flush(){ if (name!="" && st!="" && st!="DISK_OK" && st!="DISK_NP" && id!="") printf "%s=%s ", name, st }
    /^\[/      { flush(); name=""; st=""; id="" }
    /^name=/   { v=$0; sub(/^name="?/,"",v);   sub(/"?\r?$/,"",v); name=v }
    /^status=/ { v=$0; sub(/^status="?/,"",v); sub(/"?\r?$/,"",v); st=v }
    /^id=/     { v=$0; sub(/^id="?/,"",v);     sub(/"?\r?$/,"",v); id=v }
    END        { flush() }
  ' "$DISKSINI")"
  for d in $bad_devs; do
    case "$d" in
      parity*) bad_parity="$bad_parity $d" ;;
      *)       bad_data="$bad_data $d" ;;
    esac
  done
  bad_data="${bad_data# }"; bad_parity="${bad_parity# }"
fi

if [ -x "$MDCMD" ]; then
  MDST="$("$MDCMD" status 2>/dev/null)"
  md() { printf '%s\n' "$MDST" | grep -m1 "^$1=" | cut -d= -f2 | tr -d '\r'; }
  mdState="$(md mdState)"
  nDis="$(md mdNumDisabled)"; nInv="$(md mdNumInvalid)"; nMis="$(md mdNumMissing)"
  nDis=${nDis:-0}; nInv=${nInv:-0}; nMis=${nMis:-0}
  if [ "$mdState" != "STARTED" ]; then
    add critical array_state fail array_not_started "${mdState:-unknown}" "Array is not started (state=${mdState:-unknown})."
  elif [ "$DISKS_READ" -eq 1 ]; then
    if [ -n "$bad_data" ]; then
      add critical array_state fail array_bad_devices "$bad_data" "Array not clean -- unhealthy data disk(s): $bad_data"
    else
      add critical array_state pass array_ok "" "Array started and healthy; all data disk assignments OK."
    fi
  elif [ "$nDis" -ne 0 ] || [ "$nInv" -ne 0 ] || [ "$nMis" -ne 0 ]; then
    add critical array_state fail array_counts "${mdState}|$nDis|$nInv|$nMis" "Array not clean: state=${mdState} -- disabled=$nDis invalid=$nInv missing=$nMis"
  else
    add critical array_state pass array_ok "" "Array started and healthy; all device assignments OK."
  fi
  [ -n "$bad_parity" ] && add warning array_parity warn array_parity_degraded "$bad_parity" "Parity disk disabled/missing: $bad_parity -- array still boots, parity protection reduced."

  mdResync="$(md mdResync)"; mdResync=${mdResync:-0}
  mdAction="$(md mdResyncAction)"
  if [ "$mdResync" != "0" ]; then
    add critical array_op fail array_op_running "${mdAction:-sync}" "Array operation in progress (${mdAction:-sync}) -- let it finish before rebooting."
  else
    add critical array_op pass array_op_ok "" "No parity/sync/rebuild/clear in progress."
  fi
elif [ -n "$bad_data" ]; then
  add critical array_state fail array_bad_devices "$bad_data" "Array not clean -- unhealthy data disk(s): $bad_data"
  [ -n "$bad_parity" ] && add warning array_parity warn array_parity_degraded "$bad_parity" "Parity disk disabled/missing: $bad_parity -- array still boots, parity protection reduced."
elif [ -n "$bad_parity" ]; then
  add warning array_parity warn array_parity_degraded "$bad_parity" "Parity disk disabled/missing: $bad_parity -- array still boots, parity protection reduced."
else
  add critical array_state info array_unknown "" "mdcmd not found -- cannot determine array state."
fi

# ---- Mover -------------------------------------------------------------------
sspush 14 p_mover
if pgrep -f '/usr/local/sbin/mover' >/dev/null 2>&1 || pgrep -x move >/dev/null 2>&1; then
  add critical mover fail mover_running "" "Mover is running -- wait for it to finish before rebooting."
else
  add critical mover pass mover_ok "" "Mover is not running."
fi

# ---- Containers mounting a host runtime dir (the libvirt-mount-race class) ---
sspush 20 p_mounts
if have docker && docker info >/dev/null 2>&1; then
  risky=""
  for cid in $(docker ps -q 2>/dev/null); do
    cname="$(docker inspect -f '{{.Name}}' "$cid" 2>/dev/null | sed 's#^/##')"
    while IFS= read -r src; do
      [ -z "$src" ] && continue
      case "$src" in
        /var/run/docker.sock|/run/docker.sock) ;;
        /var/run|/var/run/*|/run|/run/*) risky="$risky $cname:$src" ;;
      esac
    done < <(docker inspect -f '{{range .Mounts}}{{println .Source}}{{end}}' "$cid" 2>/dev/null)
  done
  risky="${risky//|/ }"
  if [ -n "$risky" ]; then
    add critical risky_mount fail risky_mount_found "$risky" "Container(s) mount a host runtime dir (can break libvirt/docker on reboot):$risky"
  else
    add critical risky_mount pass risky_mount_ok "" "No container mounts a host runtime directory (besides docker.sock)."
  fi
else
  add critical risky_mount info risky_mount_skip "" "Docker not available -- skipped container mount scan."
fi

# ---- Stuck docker.img / libvirt.img loops -----------------------------------
sspush 27 p_loops
if have losetup; then
  LOOP="$(losetup -a 2>/dev/null)"
  problem=""
  printf '%s\n' "$LOOP" | grep -q '(deleted)' && problem="$problem; a loop device backs a deleted file"
  if printf '%s\n' "$LOOP" | grep -q 'docker.img'; then
    mountpoint -q /var/lib/docker || problem="$problem; docker.img is attached to a loop but /var/lib/docker is not mounted"
  fi
  if printf '%s\n' "$LOOP" | grep -q 'libvirt.img'; then
    mountpoint -q /etc/libvirt || problem="$problem; libvirt.img is attached to a loop but /etc/libvirt is not mounted"
  fi
  problem="${problem//|/ }"
  if [ -n "$problem" ]; then
    add critical stuck_loop fail stuck_loop_found "$problem" "Stuck image/loop state${problem}."
  else
    add critical stuck_loop pass stuck_loop_ok "" "docker.img / libvirt.img loop state looks clean."
  fi
else
  add critical stuck_loop info stuck_loop_skip "" "losetup not found -- skipped loop-device check."
fi

# ---- Flash (USB boot) -------------------------------------------------------
sspush 32 p_flash
if mountpoint -q /boot; then
  tf="/boot/.smokesignal_write_test.$$"
  if ( : > "$tf" ) 2>/dev/null; then
    rm -f "$tf" 2>/dev/null
    add critical flash pass flash_ok "" "Flash /boot is mounted and writable."
  else
    add critical flash fail flash_ro "" "Flash /boot is mounted but NOT writable (possible FAT corruption) -- config won't persist."
  fi
else
  add critical flash fail flash_unmounted "" "Flash /boot is not mounted."
fi

# =============================================================================
#  WARNING  (a WARN here means CAUTION)
# =============================================================================

# ---- Crashes since last boot ------------------------------------------------
sspush 38 p_crashes
SYSLOG=/var/log/syslog
if [ -r "$SYSLOG" ]; then
  pat='segfault|general protection|traps:|Out of memory|oom-killer|Killed process|Kernel panic|Call Trace|kernel BUG'
  n="$(grep -aiE "$pat" "$SYSLOG" 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${n:-0}" -gt 0 ]; then
    last="$(grep -aiE "$pat" "$SYSLOG" 2>/dev/null | tail -n1 | cut -c1-160)"
    last="${last//|/ }"
    add warning syslog warn syslog_crashes "$n|$last" "$n crash/instability line(s) in syslog since boot. Latest: ${last}"
  else
    add warning syslog pass syslog_ok "" "No crashes/OOM/segfaults in syslog since boot."
  fi

  # disk / I/O hardware errors (failing disk or loose cable)
  iopat='blk_update_request: I/O error|I/O error, dev |ata[0-9]+\.[0-9]+: (failed command|exception)|hard resetting link|medium error|Medium Error|task abort|SCSI error|Buffer I/O error'
  ni="$(grep -aiE "$iopat" "$SYSLOG" 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${ni:-0}" -gt 0 ]; then
    lasti="$(grep -aiE "$iopat" "$SYSLOG" 2>/dev/null | tail -n1 | cut -c1-160)"
    lasti="${lasti//|/ }"
    add warning iodisk warn io_errors "$ni|$lasti" "$ni disk/IO error line(s) in syslog since boot. Latest: ${lasti}"
  else
    add warning iodisk pass io_ok "" "No disk/IO errors in syslog since boot."
  fi
else
  add warning syslog info syslog_skip "" "syslog not readable -- skipped crash scan."
fi

# ---- Free space -------------------------------------------------------------
sspush 48 p_space
chk_space() {
  local path="$1" label="$2" thr="$3" use
  { mountpoint -q "$path" 2>/dev/null || [ -d "$path" ]; } || return 0
  use="$(df -P "$path" 2>/dev/null | awk 'NR==2{gsub("%","",$5);print $5}')"
  [ -z "$use" ] && return 0
  if [ "$use" -ge "$thr" ]; then
    add warning "space_$label" warn space_full "$label|$use|$thr" "$label is ${use}% full (>=${thr}%)."
  else
    add warning "space_$label" pass space_ok "$label|$use" "$label at ${use}% used."
  fi
}
chk_space /                rootfs 90
chk_space /var/log         varlog 75
chk_space /var/lib/docker  docker 85
[ -d /mnt/cache ] && chk_space /mnt/cache cache 90

# ---- VMs running ------------------------------------------------------------
sspush 54 p_vms
if have virsh; then
  running="$(virsh list --state-running --name 2>/dev/null | grep -c .)"
  if [ "${running:-0}" -gt 0 ]; then
    add warning vms warn vms_running "$running" "$running VM(s) running -- shut them down gracefully before rebooting."
  else
    add warning vms pass vms_ok "" "No VMs running."
  fi
fi

# ---- Core services ----------------------------------------------------------
sspush 60 p_services
if mountpoint -q /var/lib/docker; then
  if pgrep -x dockerd >/dev/null 2>&1; then
    add warning svc_docker pass svc_docker_ok "" "dockerd running."
  else
    add warning svc_docker warn svc_docker_down "" "Docker storage mounted but dockerd is not running."
  fi
fi
if mountpoint -q /etc/libvirt; then
  if pgrep -x libvirtd >/dev/null 2>&1; then
    add warning svc_libvirt pass svc_libvirt_ok "" "libvirtd running."
  else
    add warning svc_libvirt warn svc_libvirt_down "" "libvirt enabled but libvirtd is not running."
  fi
fi
if pgrep -x emhttpd >/dev/null 2>&1; then
  add warning svc_emhttp pass svc_emhttp_ok "" "emhttpd (WebGUI) running."
else
  add warning svc_emhttp warn svc_emhttp_down "" "emhttpd (WebGUI) is not running."
fi

# ---- Container bind sources exist ------------------------------------------
sspush 66 p_binds
if have docker && docker info >/dev/null 2>&1; then
  missing=""
  for cid in $(docker ps -q 2>/dev/null); do
    cname="$(docker inspect -f '{{.Name}}' "$cid" 2>/dev/null | sed 's#^/##')"
    while IFS= read -r src; do
      case "$src" in
        /mnt/*) [ -e "$src" ] || missing="$missing $cname:$src" ;;
      esac
    done < <(docker inspect -f '{{range .Mounts}}{{println .Source}}{{end}}' "$cid" 2>/dev/null)
  done
  missing="${missing//|/ }"
  if [ -n "$missing" ]; then
    add warning binds warn binds_missing "$missing" "Container bind source(s) missing (won't start cleanly after reboot):$missing"
  else
    add warning binds pass binds_ok "" "All container bind sources under /mnt exist."
  fi
fi

# ---- SMART health (deep: smartctl -H) --------------------------------------
sspush 72 p_smart
if have smartctl; then
  devs=""
  if [ -r /var/local/emhttp/disks.ini ]; then
    devs="$(grep -a '^device=' /var/local/emhttp/disks.ini 2>/dev/null | cut -d'"' -f2 | sort -u)"
  fi
  if [ -z "$devs" ] && have lsblk; then
    devs="$(lsblk -dno NAME -e7,11 2>/dev/null)"
  fi
  TEMP_MAX=55
  bad=""; attrwarn=""; checked=0
  # SMART is the slow phase (spins disks up); advance the bar per device so it
  # does not sit frozen. Interpolate across the 72..96 band.
  _sstot=$(printf '%s\n' "$devs" | grep -c .); _ssidx=0
  for d in $devs; do
    [ -z "$d" ] && continue
    _ssidx=$((_ssidx+1))
    [ "$PROGRESS" -eq 1 ] && [ "${_sstot:-0}" -gt 0 ] && sspush $((72 + _ssidx*24/_sstot)) p_smart
    dev="/dev/$d"; [ -b "$dev" ] || dev="$d"
    [ -b "$dev" ] || continue
    checked=$((checked+1))
    out="$(smartctl -H "$dev" 2>/dev/null)"
    if printf '%s' "$out" | grep -qiE 'FAILED|FAILING'; then
      bad="$bad $dev"
    fi
    # attribute-level early warning (SATA table; best-effort)
    A="$(smartctl -A "$dev" 2>/dev/null)"
    araw() { printf '%s\n' "$A" | awk -v n="$1" '$2==n{v=$10} END{print v+0}'; }
    re="$(araw Reallocated_Sector_Ct)"; pe="$(araw Current_Pending_Sector)"
    un="$(araw Offline_Uncorrectable)"; cr="$(araw UDMA_CRC_Error_Count)"
    tp="$(araw Temperature_Celsius)"; [ "${tp:-0}" -eq 0 ] 2>/dev/null && tp="$(araw Airflow_Temperature_Cel)"
    iss=""
    [ "${re:-0}" -gt 0 ] 2>/dev/null && iss="${iss}realloc=$re "
    [ "${pe:-0}" -gt 0 ] 2>/dev/null && iss="${iss}pending=$pe "
    [ "${un:-0}" -gt 0 ] 2>/dev/null && iss="${iss}uncorrectable=$un "
    [ "${cr:-0}" -gt 0 ] 2>/dev/null && iss="${iss}crc=$cr "
    [ "${tp:-0}" -gt "$TEMP_MAX" ] 2>/dev/null && iss="${iss}temp=${tp}C "
    [ -n "$iss" ] && attrwarn="$attrwarn ${d}:${iss% }"
  done
  bad="${bad//|/ }"; attrwarn="${attrwarn//|/ }"; attrwarn="${attrwarn# }"
  if [ -n "$bad" ]; then
    add warning smart warn smart_failing "$bad" "SMART health FAILING on:$bad -- investigate before rebooting."
  elif [ "$checked" -gt 0 ]; then
    add warning smart pass smart_ok "$checked" "SMART health PASSED on $checked disk(s)."
  else
    add warning smart info smart_none "" "No disks found for SMART check."
  fi
  [ -n "$attrwarn" ] && add warning smart_attr warn smart_attr "$attrwarn" "SMART attribute warnings: $attrwarn"
else
  add warning smart info smart_skip "" "smartctl not found -- skipped SMART check."
fi

# =============================================================================
#  INFO
# =============================================================================
sspush 97 p_info
up="$(uptime -p 2>/dev/null | sed 's/^up //')"
[ -n "$up" ] && add info uptime info info_uptime "$up" "Uptime: $up"
kr="$(uname -r 2>/dev/null)"
add info kernel info info_kernel "$kr" "Kernel: $kr"
ver="$(cut -d'"' -f2 /etc/unraid-version 2>/dev/null)"
[ -n "$ver" ] && add info unraid info info_unraid "$ver" "Unraid version: $ver"

# =============================================================================
#  Verdict + output
# =============================================================================
case "$WORST" in
  0) VERDICT="GO";      VCOLOR=32 ;;
  1) VERDICT="CAUTION"; VCOLOR=33 ;;
  2) VERDICT="NO-GO";   VCOLOR=31 ;;
esac

sspush 100 p_done
if [ "$JSON" -eq 1 ]; then
  printf '{"verdict":"%s","worst":%s,"generated":"%s","checks":[%s]}\n' \
    "$VERDICT" "$WORST" "$(date '+%Y-%m-%d %H:%M:%S')" "$JSON_ITEMS"
  exit "$WORST"
fi

TTY=0; [ -t 1 ] && TTY=1
banner() {
  if [ "$TTY" -eq 1 ]; then printf '\033[1;%sm%s\033[0m\n' "$VCOLOR" "$1"; else printf '%s\n' "$1"; fi
}

# Brand ASCII banner (the shared "Junker der Provinz" house signature). Human
# report only: the --json branch above returns via `exit`, so the WebGUI/JSON
# output is never touched by this. banner.txt is shipped in the package next to
# this script (see plugin/pkg_build.sh); skip cleanly if it is absent.
_ssdir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$_ssdir/banner.txt" ]; then
  echo
  cat "$_ssdir/banner.txt"
  echo "   SmokeSignal  -  advisory pre-reboot health check for your Unraid box"
fi

echo
banner "  ===== SMOKESIGNAL: $VERDICT ====="
echo
if [ -n "$TXT_CRIT" ]; then echo "  -- Critical (NO-GO if failing) --"; printf '%s\n' "$TXT_CRIT"; fi
if [ -n "$TXT_WARN" ]; then echo "  -- Caution --";                     printf '%s\n' "$TXT_WARN"; fi
if [ -n "$TXT_INFO" ]; then echo "  -- Info --";                        printf '%s\n' "$TXT_INFO"; fi
exit "$WORST"
