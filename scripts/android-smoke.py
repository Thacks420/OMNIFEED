"""Run on an adb-connected emulator against the fixture API; capture evidence."""
import pathlib, re, subprocess, time, xml.etree.ElementTree as ET

out = pathlib.Path('android-evidence')
out.mkdir(exist_ok=True)
def adb(*args):
    return subprocess.check_output(['adb', *args], text=True)
def snapshot():
    adb('shell', 'uiautomator', 'dump', '/sdcard/omnifeed.xml')
    xml = adb('shell', 'cat', '/sdcard/omnifeed.xml')
    (out / 'latest.xml').write_text(xml)
    return ET.fromstring(xml)
def text(root):
    return ' '.join((n.get('text', '') + ' ' + n.get('content-desc', '')) for n in root.iter())
def wait_for(expected, attempts=40):
    for _ in range(attempts):
        root = snapshot()
        if expected in text(root): return root
        time.sleep(1)
    raise AssertionError(f'Missing {expected}: {text(root)}')
def tap(label):
    root = snapshot()
    for node in root.iter():
        if node.get('text') == label or node.get('content-desc') == label:
            numbers = list(map(int, re.findall(r'\d+', node.get('bounds', ''))))
            if len(numbers) == 4:
                x1, y1, x2, y2 = numbers
                adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
                return
    raise AssertionError(f'No control: {label}')

apk = next(pathlib.Path('apps/mobile/android/app/build/outputs/apk/release').glob('*.apk'))
adb('install', '-r', str(apk))
adb('logcat', '-c')
adb('shell', 'am', 'start', '-n', 'app.omnifeed.mobile/.MainActivity')
wait_for('Fixture')
tap('YouTube')
wait_for('Fixture youtube')
tap('Reddit')
wait_for('Fixture reddit')
# Scroll through the first page, request the next, and confirm the next upstream window.
for _ in range(40):
    root = snapshot()
    if 'Load more' in text(root):
        tap('Load more')
        break
    adb('shell', 'input', 'swipe', '500', '1600', '500', '500', '150')
else:
    raise AssertionError('Load more control was not reachable')
for _ in range(25):
    root = snapshot()
    if 'Fixture reddit 25' in text(root): break
    adb('shell', 'input', 'swipe', '500', '1600', '500', '500', '150')
else:
    raise AssertionError('Second page was not displayed')
tap('All')
wait_for('Fixture')
with (out / 'screen.png').open('wb') as image:
    subprocess.run(['adb', 'exec-out', 'screencap', '-p'], stdout=image, check=True)
logs = adb('logcat', '-d')
(out / 'logcat.txt').write_text(logs)
assert 'FATAL EXCEPTION' not in logs, 'Native crash detected; inspect logcat'
print('Android launch, platform tabs, and load-more smoke checks passed')
