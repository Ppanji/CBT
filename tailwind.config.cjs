module.exports = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: { extend: {} },
  plugins: [
    require('@tailwindcss/forms'), // opsional
    require('daisyui')             // opsional
  ],
  daisyui: { themes: ['light'] }
};
