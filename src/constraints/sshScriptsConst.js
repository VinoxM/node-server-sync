export const SSH_CMD_MINIO_COPY_SCRIPT = `sudo -u qbittorrent-nox -H bash -c '
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

export const SSH_CMD_MINIO_DOWNLOAD_SCRIPT = `sudo -u qbittorrent-nox -H bash -c '
set +H;
url_source="$1";
target_path="xminio$2";

curl -fsSL "$url_source" | /usr/local/bin/mc cp - "$target_path"
exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo "Transfer Success"
    exit 1
else
    echo "Transfer Failed with code $exit_code" >&2
    exit 2
fi' --`;