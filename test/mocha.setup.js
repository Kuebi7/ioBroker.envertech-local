"use strict";

process.env.TS_NODE_IGNORE_WARNINGS = "TRUE";
process.env.TS_NODE_PROJECT = "tsconfig.json";
process.env.TS_NODE_FILES = "TRUE";

process.on("unhandledRejection", (e) => {
    throw e;
});
