// Visual Studio 2019's older Node.js project system starts this .js file, then hands off to the shared launcher.
import("./start-local.mjs").catch((error) => {
  console.error("[SP-API] Visual Studio 2019 startup failed:", error);
  process.exit(1);
});
