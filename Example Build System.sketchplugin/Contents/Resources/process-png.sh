#!/usr/bin/env bash
BASE=${0%/*}

# $1 is the file to be compressed
# $2 is the output directory (may be an .xcassets folder)

IN_FILE="$1"
IN_BASENAME=`basename "$1"`
OUT_FILE=`find -L "$2" -name "$IN_BASENAME" -print -quit`

if [ -z "$OUT_FILE" ]; then
    OUT_FILE="$2"/"$IN_BASENAME"
fi

OLD_OHSH=`"$BASE"/pngohsh read "$OUT_FILE"`
NEW_OHSH=`"$BASE"/pngohsh compute "$1"`

if [ "$OLD_OHSH" == "$NEW_OHSH" ]; then
   exit 0
fi

"$BASE"/pngcrush -ow -reduce -blacken -bail -rem alla "$IN_FILE" "$IN_BASENAME".tmp
"$BASE"/optipng -o7 "$IN_FILE"
"$BASE"/zopflipng -m -y "$IN_FILE" "$IN_FILE"
"$BASE"/pngohsh write "$IN_FILE" $NEW_OHSH

cp "$IN_FILE" "$OUT_FILE"
