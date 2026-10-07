const { withAndroidStyles, withAndroidColors } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to apply Luma brand XML theme and colors
 * to Android native res/values/styles.xml and res/values/colors.xml
 */
const withAndroidTheme = (config) => {
  // Apply colors to res/values/colors.xml
  config = withAndroidColors(config, (modConfig) => {
    const colors = modConfig.modResults;
    const lumaColors = [
      { $: { name: 'luma_cream' }, _: '#FAF8F5' },
      { $: { name: 'luma_ink' }, _: '#0F172A' },
      { $: { name: 'luma_green' }, _: '#059669' },
      { $: { name: 'luma_green_dark' }, _: '#047857' },
      { $: { name: 'luma_lime' }, _: '#10B981' },
      { $: { name: 'luma_coral' }, _: '#FF5A36' },
      { $: { name: 'luma_violet' }, _: '#7C3AED' },
      { $: { name: 'luma_white' }, _: '#FFFFFF' },
      { $: { name: 'luma_line' }, _: '#E2E8F0' },
    ];

    if (!colors.resources) colors.resources = {};
    if (!colors.resources.color) colors.resources.color = [];

    lumaColors.forEach((lc) => {
      const existing = colors.resources.color.find((c) => c.$?.name === lc.$.name);
      if (!existing) {
        colors.resources.color.push(lc);
      }
    });

    return modConfig;
  });

  // Apply theme styles to res/values/styles.xml
  config = withAndroidStyles(config, (modConfig) => {
    const styles = modConfig.modResults;
    if (!styles.resources) styles.resources = {};
    if (!styles.resources.style) styles.resources.style = [];

    const appTheme = styles.resources.style.find(
      (s) => s.$?.name === 'AppTheme' || s.$?.name === 'Theme.App.SplashScreen'
    );

    if (appTheme && appTheme.item) {
      // Ensure windowBackground and navigation bar match Luma theme
      const bgItem = appTheme.item.find((i) => i.$?.name === 'android:windowBackground');
      if (bgItem) {
        bgItem._ = '@color/luma_cream';
      }
    }

    return modConfig;
  });

  return config;
};

module.exports = withAndroidTheme;
