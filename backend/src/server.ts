import "./config/env";
import app from "./app";
//import { startProductRankingScheduler } from "./services/productRankingScheduler.service";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
    //startProductRankingScheduler();
});
