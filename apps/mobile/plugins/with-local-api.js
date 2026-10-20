const { withAndroidManifest } = require('expo/config-plugins');
module.exports = config => withAndroidManifest(config, mod => {
  if (process.env.OMNIFEED_LOCAL_HTTP === '1') {
    for (const app of mod.modResults.manifest.application ?? []) {
      app.$['android:usesCleartextTraffic'] = 'true';
    }
  }
  return mod;
});
