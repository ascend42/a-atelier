#!/bin/sh
# Paradigm Cursor PostWrite Hook
# Fires after file edits to remind agents about .purpose files.
# Installed by: paradigm hooks install --cursor
#
# Hook type: afterFileEdit
# Exit 0 always (never blocks — advisory only)
# Prints reminder if the edited file's directory has no .purpose file

# Read JSON from stdin (hook input)
INPUT=$(cat)

# Extract file path from Cursor's afterFileEdit input
if command -v jq >/dev/null 2>&1; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.file // .filePath // empty' 2>/dev/null)
else
  FILE_PATH=$(echo "$INPUT" | grep -o '"file"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')
  if [ -z "$FILE_PATH" ]; then
    FILE_PATH=$(echo "$INPUT" | grep -o '"filePath"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"filePath"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')
  fi
fi

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Skip non-source files
case "$FILE_PATH" in
  *.purpose|portal.yaml|*.md|*.lock|*.log|*.json|*.yaml|*.yml|.gitignore|.env*) exit 0 ;;
esac

# Skip .paradigm directory
case "$FILE_PATH" in
  */.paradigm/*|.paradigm/*) exit 0 ;;
esac

# Not a paradigm project — pass
if [ ! -d ".paradigm" ]; then
  exit 0
fi

# Walk up from the file's directory to find a .purpose file
dir=$(dirname "$FILE_PATH")
found_purpose=false

while [ "$dir" != "." ] && [ "$dir" != "/" ] && [ "$dir" != "" ]; do
  if [ -f "$dir/.purpose" ]; then
    found_purpose=true
    break
  fi
  dir=$(dirname "$dir")
done

# Check root .purpose
if [ "$found_purpose" = false ] && [ -f ".purpose" ]; then
  found_purpose=true
fi

if [ "$found_purpose" = false ]; then
  file_dir=$(dirname "$FILE_PATH")
  echo "[paradigm] No .purpose file covers $file_dir — consider creating one with paradigm_purpose_init." >&2
fi

exit 0
