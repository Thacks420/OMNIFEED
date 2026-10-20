"""Conservatively compare settings that influence the APK before reusing a CI artifact."""
import pathlib, re, sys
patterns = re.compile(r'node-version:|java-version:|EXPO_PUBLIC_API_URL:|OMNIFEED_LOCAL_HTTP:|runs-on:|npx expo prebuild|./gradlew assembleRelease')
def settings(filename):
    return [line.strip() for line in pathlib.Path(filename).read_text().splitlines() if patterns.search(line)]
if settings(sys.argv[1]) == settings(sys.argv[2]):
    print('identical=true')
