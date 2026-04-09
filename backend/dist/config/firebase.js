"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.firestore = exports.firebaseApp = exports.default = void 0;
var firebaseAdmin_1 = require("./firebaseAdmin");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return __importDefault(firebaseAdmin_1).default; } });
Object.defineProperty(exports, "firebaseApp", { enumerable: true, get: function () { return firebaseAdmin_1.firebaseApp; } });
Object.defineProperty(exports, "firestore", { enumerable: true, get: function () { return firebaseAdmin_1.firestore; } });
