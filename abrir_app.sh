#!/usr/bin/env bash
xdg-open "$(dirname "$0")/index.html" 2>/dev/null || open "$(dirname "$0")/index.html"
