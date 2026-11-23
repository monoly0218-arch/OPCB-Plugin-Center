set -eu
umask 077
work=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/opcb-buzz-network.XXXXXXXX")
trap '/bin/rm -f -- "$work/bridge.gz" "$work/bridge"; /bin/rmdir -- "$work"' EXIT
IFS= read -r payload
print -rn -- "$payload" | /usr/bin/base64 -D > "$work/bridge.gz"
/usr/bin/gzip -dc "$work/bridge.gz" > "$work/bridge"
digest=$(/usr/bin/shasum -a 256 "$work/bridge")
[[ ${digest%% *} == __BRIDGE_SHA256__ ]]
/bin/chmod 700 "$work/bridge"
"$work/bridge"
