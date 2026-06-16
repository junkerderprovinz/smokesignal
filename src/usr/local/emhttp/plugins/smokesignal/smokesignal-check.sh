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
[ "${1:-}" = "--json" ] && JSON=1

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

bad_devs=""
if [ -r "$DISKSINI" ]; then
  bad_devs="$(awk '
    function flush(){ if (name!="" && st!="" && st!="DISK_OK" && st!="DISK_NP") printf "%s=%s ", name, st }
    /^\[/      { flush(); name=""; st="" }
    /^name=/   { v=$0; sub(/^name="?/,"",v);   sub(/"?\r?$/,"",v); name=v }
    /^status=/ { v=$0; sub(/^status="?/,"",v); sub(/"?\r?$/,"",v); st=v }
    END        { flush() }
  ' "$DISKSINI")"
  bad_devs="${bad_devs% }"
fi

if [ -x "$MDCMD" ]; then
  MDST="$("$MDCMD" status 2>/dev/null)"
  md() { printf '%s\n' "$MDST" | grep -m1 "^$1=" | cut -d= -f2 | tr -d '\r'; }
  mdState="$(md mdState)"
  nDis="$(md mdNumDisabled)"; nInv="$(md mdNumInvalid)"; nMis="$(md mdNumMissing)"
  nDis=${nDis:-0}; nInv=${nInv:-0}; nMis=${nMis:-0}
  if [ "$mdState" = "STARTED" ] && [ "$nDis" -eq 0 ] && [ "$nInv" -eq 0 ] && [ "$nMis" -eq 0 ] && [ -z "$bad_devs" ]; then
    add critical array_state pass array_ok "" "Array started and healthy; all device assignments OK."
  elif [ -n "$bad_devs" ]; then
    add critical array_state fail array_bad_devices "${mdState:-unknown}|$bad_devs" "Array not clean: state=${mdState:-unknown} -- $bad_devs"
  else
    add critical array_state fail array_counts "${mdState:-unknown}|$nDis|$nInv|$nMis" "Array not clean: state=${mdState:-unknown} -- disabled=$nDis invalid=$nInv missing=$nMis"
  fi
  mdResync="$(md mdResync)"; mdResync=${mdResync:-0}
  mdAction="$(md mdResyncAction)"
  if [ "$mdResync" != "0" ]; then
    add critical array_op fail array_op_running "${mdAction:-sync}" "Array operation in progress (${mdAction:-sync}) -- let it finish before rebooting."
  else
    add critical array_op pass array_op_ok "" "No parity/sync/rebuild/clear in progress."
  fi
elif [ -n "$bad_devs" ]; then
  add critical array_state fail array_bad_devices_only "$bad_devs" "Unhealthy device assignment(s): $bad_devs"
else
  add critical array_state info array_unknown "" "mdcmd not found -- cannot determine array state."
fi

# ---- Mover -------------------------------------------------------------------
if pgrep -f '/usr/local/sbin/mover' >/dev/null 2>&1 || pgrep -x move >/dev/null 2>&1; then
  add critical mover fail mover_running "" "Mover is running -- wait for it to finish before rebooting."
else
  add critical mover pass mover_ok "" "Mover is not running."
fi

# ---- Containers mounting a host runtime dir (the libvirt-mount-race class) ---
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
else
  add warning syslog info syslog_skip "" "syslog not readable -- skipped crash scan."
fi

# ---- Free space -------------------------------------------------------------
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
if have virsh; then
  running="$(virsh list --state-running --name 2>/dev/null | grep -c .)"
  if [ "${running:-0}" -gt 0 ]; then
    add warning vms warn vms_running "$running" "$running VM(s) running -- shut them down gracefully before rebooting."
  else
    add warning vms pass vms_ok "" "No VMs running."
  fi
fi

# ---- Core services ----------------------------------------------------------
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
if have smartctl; then
  devs=""
  if [ -r /var/local/emhttp/disks.ini ]; then
    devs="$(grep -a '^device=' /var/local/emhttp/disks.ini 2>/dev/null | cut -d'"' -f2 | sort -u)"
  fi
  if [ -z "$devs" ] && have lsblk; then
    devs="$(lsblk -dno NAME -e7,11 2>/dev/null)"
  fi
  bad=""; checked=0
  for d in $devs; do
    [ -z "$d" ] && continue
    dev="/dev/$d"; [ -b "$dev" ] || dev="$d"
    [ -b "$dev" ] || continue
    checked=$((checked+1))
    out="$(smartctl -H "$dev" 2>/dev/null)"
    if printf '%s' "$out" | grep -qiE 'PASSED|: OK'; then
      :
    elif printf '%s' "$out" | grep -qiE 'FAILED|FAILING'; then
      bad="$bad $dev"
    fi
  done
  bad="${bad//|/ }"
  if [ -n "$bad" ]; then
    add warning smart warn smart_failing "$bad" "SMART health FAILING on:$bad -- investigate before rebooting."
  elif [ "$checked" -gt 0 ]; then
    add warning smart pass smart_ok "$checked" "SMART health PASSED on $checked disk(s)."
  else
    add warning smart info smart_none "" "No disks found for SMART check."
  fi
else
  add warning smart info smart_skip "" "smartctl not found -- skipped SMART check."
fi

# =============================================================================
#  INFO
# =============================================================================
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

if [ "$JSON" -eq 1 ]; then
  printf '{"verdict":"%s","worst":%s,"generated":"%s","checks":[%s]}\n' \
    "$VERDICT" "$WORST" "$(date '+%Y-%m-%d %H:%M:%S')" "$JSON_ITEMS"
  exit "$WORST"
fi

TTY=0; [ -t 1 ] && TTY=1
banner() {
  if [ "$TTY" -eq 1 ]; then printf '\033[1;%sm%s\033[0m\n' "$VCOLOR" "$1"; else printf '%s\n' "$1"; fi
}

echo
banner "  ===== SMOKESIGNAL: $VERDICT ====="
echo
if [ -n "$TXT_CRIT" ]; then echo "  -- Critical (NO-GO if failing) --"; printf '%s\n' "$TXT_CRIT"; fi
if [ -n "$TXT_WARN" ]; then echo "  -- Caution --";                     printf '%s\n' "$TXT_WARN"; fi
if [ -n "$TXT_INFO" ]; then echo "  -- Info --";                        printf '%s\n' "$TXT_INFO"; fi
exit "$WORST"
