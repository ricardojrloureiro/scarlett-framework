const path = require("path");
const packageName = require("../package.json").shortName;
const relativeOutputPath = "build/dist";
const finalPackageName = packageName + ".min.js";

const loaderSetup = {
  loader: "babel-loader",
  options: {
    plugins: ["lodash"],
    presets: ["flow"],
    retainLines: true
  }
};

module.exports = {
  // TODO: check if targeting electron with webpack is better in some way
  devtool: "",
  // devtool is already set with -d (debug) and removed with -p (production) flags from webpack and webpack dev server
  // devtool: 'source-map',

  // Output the bundled JS to dist/app.js
  output: {
    filename: finalPackageName,
    path: path.resolve(relativeOutputPath),
    // webpack dev server hot reload path
    publicPath: relativeOutputPath
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        // Skip any files outside of `src` directory
        include: /src/,
        exclude: /node_modules/,
        // loaders depending on target (ES6 or ES5)
        use: loaderSetup
      }
    ]
  }
};