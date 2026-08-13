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

export const SSH_CMD_FFMPEG_EXTRACT_MKV_SUBTITLES = `bash -c '
set +H
INPUT_FILE="$1"

if [ -z "$INPUT_FILE" ] || [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file does not exist or invalid."
    exit 1
fi

FILE_DIR=$(dirname "$INPUT_FILE")
FILE_NAME=$(basename "$INPUT_FILE")

SUBTITLE_DIR="\${FILE_DIR}/\${FILE_NAME}.subtitle"
mkdir -p "\${SUBTITLE_DIR}"

mapfile -t TRACK_ROWS < <(ffprobe -v error -select_streams s -show_entries stream=index,codec_name:stream_tags=language,title -of csv "$INPUT_FILE")
TRACK_COUNT=\${#TRACK_ROWS[@]}

if [ "$TRACK_COUNT" -eq 0 ]; then
    echo "No subtitle tracks found in $INPUT_FILE"
    exit 100
fi

echo "Found $TRACK_COUNT subtitle track(s). Extracting..."

SUCCESS_COUNT=0

for row in "\${TRACK_ROWS[@]}"; do
    row=$(echo "$row" | tr -d "\\r")
    IFS="," read -r TYPE INDEX CODEC LANG TITLE <<< "$row"

    if [[ ! "$INDEX" =~ ^[0-9]+$ ]]; then
        continue
    fi

    [ -z "$LANG" ] && LANG="unk"

    case "$CODEC" in
        ass|ssa)
            EXT="ass"
            ;;
        subrip)
            EXT="srt"
            ;;
        webvtt)
            EXT="vtt"
            ;;
        *)
            echo "Skipping non-text subtitle Stream #0:\${INDEX} (Codec: \${CODEC})"
            continue
            ;;
    esac

    SAFE_TITLE=""
    if [ -n "$TITLE" ]; then
        CLEANED_TITLE=$(echo "$TITLE" | tr "/\\\\:*?\\"<>| " "_" | sed "s/__*/_/g" | sed "s/^_//;s/_$//")
        if [ -n "$CLEANED_TITLE" ]; then
            SAFE_TITLE=".\${CLEANED_TITLE}"
        fi
    fi

    SUB_FILENAME="track\${INDEX}.\${LANG}\${SAFE_TITLE}.\${EXT}"
    OUTPUT_FILE="\${SUBTITLE_DIR}/\${SUB_FILENAME}"

    echo "Extracting Stream #0:\${INDEX} (\${CODEC}, \${LANG}) -> \${SUB_FILENAME}"

    if ffmpeg -v error -y -i "$INPUT_FILE" -map "0:\${INDEX}" -c copy "$OUTPUT_FILE"; then
        echo "  └─ [Success] Saved to \${OUTPUT_FILE}"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo "  └─ [Failed] Stream #0:\${INDEX} failed"
    fi
done

EXIT_CODE=$((SUCCESS_COUNT + 100))
echo "All done. Extracted $SUCCESS_COUNT subtitle(s). Returning exit code $EXIT_CODE."

exit $EXIT_CODE
' --`;

export const SSH_CMD_SCAN_SUBTITLES_JSON = `bash -c '
set +H
TARGET_DIR="$1"

if [ -z "$TARGET_DIR" ] || [ ! -d "$TARGET_DIR" ]; then
    echo "[]"
    exit 0
fi

mapfile -t FILES < <(find "$TARGET_DIR" -maxdepth 1 -type f \\( -name "*.ass" -o -name "*.vtt" -o -name "*.srt" \\) -printf "%f\\n" | sort -u)

if [ \${#FILES[@]} -eq 0 ]; then
    echo "[]"
    exit 0
fi

JSON_OUTPUT=""
for file in "\${FILES[@]}"; do
    SAFE_PATH=$(echo "$file" | sed "s/\\\\\\\\/\\\\\\\\\\\\\\\\/g" | sed "s/\\"/\\\\\\"/g")
    
    if [ -n "$JSON_OUTPUT" ]; then
        JSON_OUTPUT="\${JSON_OUTPUT},"
    fi
    JSON_OUTPUT="\${JSON_OUTPUT}\\"\${SAFE_PATH}\\""
done

echo "[\${JSON_OUTPUT}]"
' --`;