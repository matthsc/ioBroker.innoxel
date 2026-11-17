"use strict";

// Don't silently swallow unhandled rejections
process.on("unhandledRejection", (e) => {
    throw e;
});

// enable the should interface with sinon
// and load sinon-chai by default
import { registerHooks } from "node:module";
import sinonChai from "sinon-chai";
import { should, use } from "chai";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "@iobroker/adapter-core") {
            return { shortCircuit: true, url: "mock:adapter-core" };
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url === "mock:adapter-core") {
            return {
                shortCircuit: true,
                format: "module",
                source: "export class Adapter {}",
            };
        }
        return nextLoad(url, context);
    },
});

should();
use(sinonChai);
