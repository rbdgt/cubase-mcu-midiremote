import * as dotenv from "dotenv";
import { defineConfig } from "tsup";
import prependFile from "prepend-file";
import { readFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

dotenv.config();

// Define the Cubase destination path
const CUBASE_DRIVER_PATH = "C:\\Users\\robin\\Documents\\Steinberg\\Cubase\\MIDI Remote\\Driver Scripts\\Local\\icon\\qcon-pro-x";

// Read the configuration block from src/config.ts
const configFileContents = readFileSync("src/config.ts", { encoding: "utf-8" });
const scriptConfig = configFileContents.split("// BEGIN JS")[1];

export default defineConfig({
  entry: { icon_qcon_pro_x: "src/index.ts" }, 
  outDir: "dist/icon/qcon_pro_x",
  clean: true,
  external: ["midiremote_api_v1"],
  onSuccess: async () => {
    const builtFile = `dist/icon/qcon_pro_x/icon_qcon_pro_x.js`;
    
    // 1. Prepend the JS configuration block so the script can run in Cubase
    await prependFile(builtFile, scriptConfig);
    
    // 2. Copy the file to the Cubase local driver folder
    try {
      // Ensure the directory exists
      mkdirSync(CUBASE_DRIVER_PATH, { recursive: true });
      
      // Copy the built file to the destination
      const destinationFile = join(CUBASE_DRIVER_PATH, "icon_qcon-pro-x.js");
      copyFileSync(builtFile, destinationFile);
      
      console.log(`Build successful! Script copied to: ${destinationFile}`);
    } catch (err) {
      console.error("Failed to copy script to Cubase folder:", err);
    }
  },
  define: {
    SCRIPT_VERSION: `"1.11.0"`,
    DEVICE_NAME: `"QCon Pro X"`,
    VENDOR_NAME: `"iCON"`,
  },
  target: "es5",
  minify: false,
  noExternal: [/^((?!midiremote_api_v1).)*$/],
});