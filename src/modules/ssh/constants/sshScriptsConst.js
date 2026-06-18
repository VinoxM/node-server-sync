export const SSH_CMD_MINIO_MOVE_SCRIPT = `bash -c '
set +H;
source_file="$1";
target_path="$2";

/usr/local/bin/mc --quiet mv "$source_file" "$target_path"
exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo "Transfer Success"
    exit 0
else
    echo "Transfer Failed with code $exit_code" >&2
    exit 1
fi' --`;

export const SSH_CMD_MINIO_COPY_SCRIPT = `bash -c '
set +H;
source_file="$1";
target_path="$2";

/usr/local/bin/mc --quiet cp "$source_file" "$target_path"
exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo "Transfer Success"
    exit 0
else
    echo "Transfer Failed with code $exit_code" >&2
    exit 1
fi' --`;

export const SSH_CMD_MINIO_DOWNLOAD_SCRIPT = `bash -c '
set +H;
set -o pipefail;

cd /tmp || { echo "Failed to change directory to /tmp" >&2; exit 2; };

url_source="$1";
target_path="$2";

curl -fsSL "$url_source" | /usr/local/bin/mc --quiet pipe "$target_path"
exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo "Transfer Success"
    exit 0
else
    echo "Transfer Failed with code $exit_code. Cleaning up..." >&2
    /usr/local/bin/mc rm "$target_path" > /dev/null 2>&1    
    exit 1
fi' --`;

export const SSH_CMD_BATCH_DELETE_SIMPLE = `bash -c '
set +H;
ERR_FLAG=0;
for path in "$@"; do
    rm -f "$path" "\${path}.aria2" || ERR_FLAG=1;
done;
exit $ERR_FLAG;
' --`;

export const SSH_CMD_FFMPEG_CONVERT_MKV_TO_MP4 = `bash -c '
set +H
IN="$1"; OUT="$2"
if ffmpeg -y -loglevel error -i "$IN" -c:v copy -c:a aac -b:a 320k -movflags +faststart "$OUT"; then
    echo "Convert Success"
    exit 0
else
    echo "Convert Failed"
    rm -f "$OUT"
    exit 1
fi
' --`;

export const SSH_CMD_FFMPEG_CONVERT_FLV_TO_MP4 = `bash -c '
set +H
IN="$1"; OUT="$2"
if ffmpeg -y -loglevel error -i "$IN" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$OUT"; then
    echo "Convert Success"
    exit 0
else
    echo "Convert Failed"
    rm -f "$OUT"
    exit 1
fi
' --`;