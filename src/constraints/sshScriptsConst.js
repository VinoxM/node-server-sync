export const SSH_CMD_RETRY_EPISODE_RESOLVE = `sudo -u qbittorrent-nox -H bash -c '
set +H;
source_file="$1";
target_path="xminio$2";

/usr/local/bin/mc mv "$source_file" "$target_path"
exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo "Transfer Success"
    exit 1
else
    echo "Transfer Failed with code $exit_code" >&2
    exit 2
fi' --`;