const path = require("path");

let tailwindPostcss;
try {
  tailwindPostcss = require.resolve("@tailwindcss/postcss");
} catch {
  tailwindPostcss = path.resolve(__dirname, "node_modules/@tailwindcss/postcss");
}

module.exports = {
  plugins: {
    [tailwindPostcss]: {},
  },
};

