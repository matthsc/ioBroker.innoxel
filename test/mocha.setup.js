"use strict";

// Don't silently swallow unhandled rejections
process.on("unhandledRejection", (e) => {
    throw e;
});

// enable the should interface with sinon
// and load sinon-chai by default
import sinonChai from"sinon-chai";
import { should, use } from"chai";

should();
use(sinonChai);
