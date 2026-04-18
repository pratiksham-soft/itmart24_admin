"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./config/env");
const app_1 = __importDefault(require("./app"));
const productRankingScheduler_service_1 = require("./services/productRankingScheduler.service");
const PORT = process.env.PORT || 5000;
app_1.default.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
    (0, productRankingScheduler_service_1.startProductRankingScheduler)();
});
