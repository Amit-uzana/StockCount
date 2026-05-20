#!/bin/bash
# StockCount deploy — bumps patch version, builds release APK, uploads to server
# Users on the device see "⬆ עדכון" in the title bar on next launch and can install via the Package Installer.
set -e

SSH_KEY="$HOME/.ssh/id_ed25519"
SERVER="root@api.mgmstock.com"
REMOTE_DIR="/home/deploy/app/downloads"
APK="android/app/build/outputs/apk/release/app-release.apk"
PACKAGE_JSON="package.json"
VERSION_SOURCE="src/screens/CountsListScreen.tsx"

# Current version
CURRENT_VERSION=$(node -e "console.log(require('./$PACKAGE_JSON').version)")
echo "📱 גרסה נוכחית: $CURRENT_VERSION"

# Bump patch
IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
NEW_VERSION="$major.$minor.$((patch + 1))"
echo "🆕 גרסה חדשה: $NEW_VERSION"

# Update package.json
sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" $PACKAGE_JSON

# Update APP_VERSION inside the screen
sed -i "s/export const APP_VERSION = '$CURRENT_VERSION'/export const APP_VERSION = '$NEW_VERSION'/" $VERSION_SOURCE

echo "🔨 בונה Release APK..."
cd android && ./gradlew assembleRelease && cd ..

echo "📤 מעלה APK..."
scp -i "$SSH_KEY" "$APK" "$SERVER:$REMOTE_DIR/stockcount.apk"

echo "📝 מעדכן version manifest..."
ssh -i "$SSH_KEY" "$SERVER" "echo '{\"version\":\"$NEW_VERSION\"}' > $REMOTE_DIR/stockcount-version.json"

echo ""
echo "✅ דפלוי הושלם!"
echo "   גרסה: $NEW_VERSION"
echo "   APK:  https://api.mgmstock.com/downloads/stockcount.apk"
echo "   המכשירים יראו עדכון בפתיחה הבאה"
