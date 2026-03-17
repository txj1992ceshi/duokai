/**
 * font-injector.js
 * 
 * Overrides font enumeration to mimic a specific OS font set.
 * Prevents "font fingerprinting" by returning a controlled list of fonts.
 */

function buildFontInjectionScript(seed) {
  return `
(function() {
  const fontList = [
    'Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia', 
    'Trebuchet MS', 'Impact', 'Comic Sans MS', 'Palatino', 'Garamond',
    'Bookman', 'Avant Garde', 'Helvetica', 'Segoe UI', 'Roboto', 'Open Sans'
  ];

  // Shuffle or filter based on seed if needed
  const availableFonts = fontList.slice(0, 10 + (${seed} % 5));

  // Override document.fonts.check
  const originalCheck = document.fonts.check.bind(document.fonts);
  document.fonts.check = function(font) {
    if (availableFonts.some(f => font.includes(f))) return true;
    return originalCheck(font);
  };

  // Mocking popular font detection techniques (measuring width)
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth').get;
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    get: function() {
      const width = originalOffsetWidth.call(this);
      if (this.style.fontFamily && !availableFonts.some(f => this.style.fontFamily.includes(f))) {
        // Return a consistent but "slightly off" width for non-allowed fonts to break detection
        return width + (Math.sin(${seed}) > 0 ? 1 : -1);
      }
      return width;
    }
  });

  console.debug('[Stealth] Font injection complete.');
})();
  `;
}

module.exports = { buildFontInjectionScript };
