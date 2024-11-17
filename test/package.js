import { tests } from "@iobroker/testing";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));


// Validate the package files
tests.packageFiles(join(__dirname, ".."));
